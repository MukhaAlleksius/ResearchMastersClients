from decimal import Decimal
import logging
from sqlite3 import IntegrityError
from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.notifications_crud import (
    ESTIMATE_UPDATED_NOTIFICATION_TYPE,
    SCHEDULE_UPDATED_NOTIFICATION_TYPE,
    notify_order_event,
)
from models.works_materials_models import Work, WorkMasterMyself
from models.estimate_graphic_works_models import (
    GraphicWork,
    MaterialEstimate,
    WorkEstimate,
)
from schemas.estimate_graphic_works_schemas import (
    GraphicWorksSchema,
    MaterialEstimateSchema,
    WorkEstimateSchema,
)

logger = logging.getLogger(__name__)


async def _notify_estimate_updated(
    db: AsyncSession, order_id: int, user_id: int
) -> None:
    try:
        await notify_order_event(
            db,
            order_id=order_id,
            actor_user_id=user_id,
            notification_type=ESTIMATE_UPDATED_NOTIFICATION_TYPE,
        )
    except Exception as error:
        logger.warning("notify estimate_updated failed: %s", error)


async def _notify_schedule_updated(
    db: AsyncSession, order_id: int, user_id: int
) -> None:
    try:
        await notify_order_event(
            db,
            order_id=order_id,
            actor_user_id=user_id,
            notification_type=SCHEDULE_UPDATED_NOTIFICATION_TYPE,
        )
    except Exception as error:
        logger.warning("notify schedule_updated failed: %s", error)


# добавить работу в смету для заказа пользователем
async def add_work_into_estimate(
    db: AsyncSession, work_estimate_schema: WorkEstimateSchema
) -> WorkEstimate:
    try:
        # ✅ Проверяем существующую работу
        result = await db.execute(
            select(WorkEstimate).where(
                and_(
                    WorkEstimate.user_id == work_estimate_schema.user_id,
                    WorkEstimate.order_id == work_estimate_schema.order_id,
                    WorkEstimate.name_work == work_estimate_schema.name_work,
                )
            )
        )
        existing_work = result.scalar_one_or_none()

        if existing_work:
            # ✅ Обновляем существующую (добавляем количество)
            existing_work.quantity += work_estimate_schema.quantity
            existing_work.cost_unit = work_estimate_schema.cost_unit
            existing_work.currency = work_estimate_schema.currency
            await _notify_estimate_updated(
                db,
                work_estimate_schema.order_id,
                work_estimate_schema.user_id,
            )
            await db.commit()
            await db.refresh(existing_work)
            logger.info(
                f"Обновлена работа: {existing_work.name_work}, id={existing_work.id}"
            )
            return existing_work

        # ✅ Создаём новую работу
        new_work = WorkEstimate(
            user_id=work_estimate_schema.user_id,
            order_id=work_estimate_schema.order_id,
            name_work=work_estimate_schema.name_work,
            unit_measurement=work_estimate_schema.unit_measurement,
            quantity=work_estimate_schema.quantity,
            cost_unit=work_estimate_schema.cost_unit,
            currency=work_estimate_schema.currency,
        )
        db.add(new_work)
        await _notify_estimate_updated(
            db,
            work_estimate_schema.order_id,
            work_estimate_schema.user_id,
        )
        await db.commit()
        await db.refresh(new_work)
        logger.info(f"Создана новая работа: {new_work.name_work}, id={new_work.id}")
        return new_work

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail="Работа с таким именем уже существует"
        )
    except Exception as e:
        logger.error(f"add_work_into_estimate error: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=400, detail=f"Ошибка добавления работы: {str(e)}"
        )


# добавить материал в смету для работы заказа пользователем
async def add_material_for_work_into_estimate(
    db: AsyncSession, material_estimate_schema: MaterialEstimateSchema
):
    try:
        result_existing_material_estimate = await db.execute(
            select(MaterialEstimate).where(
                and_(
                    MaterialEstimate.work_estimate_id
                    == material_estimate_schema.work_estimate_id,
                    MaterialEstimate.name_material
                    == material_estimate_schema.name_material,
                    MaterialEstimate.quantity == material_estimate_schema.quantity,
                )
            )
        )
        existing_material_estimate = (
            result_existing_material_estimate.scalar_one_or_none()
        )

        if existing_material_estimate:
            existing_material_estimate.quantity += material_estimate_schema.quantity
            existing_material_estimate.cost_unit = material_estimate_schema.cost_unit
            existing_material_estimate.currency = material_estimate_schema.currency
            work_estimate_result = await db.execute(
                select(WorkEstimate).where(
                    WorkEstimate.id == material_estimate_schema.work_estimate_id
                )
            )
            work_estimate = work_estimate_result.scalar_one_or_none()
            if work_estimate:
                await _notify_estimate_updated(
                    db,
                    work_estimate.order_id,
                    work_estimate.user_id,
                )
            await db.commit()
            await db.refresh(existing_material_estimate)
            return existing_material_estimate

        material_estimate = MaterialEstimate(
            work_estimate_id=material_estimate_schema.work_estimate_id,
            name_material=material_estimate_schema.name_material,
            unit_measurement=material_estimate_schema.unit_measurement,
            quantity=material_estimate_schema.quantity,
            cost_unit=material_estimate_schema.cost_unit,
            currency=material_estimate_schema.currency,
        )
        db.add(material_estimate)
        work_estimate_result = await db.execute(
            select(WorkEstimate).where(
                WorkEstimate.id == material_estimate_schema.work_estimate_id
            )
        )
        work_estimate = work_estimate_result.scalar_one_or_none()
        if work_estimate:
            await _notify_estimate_updated(
                db,
                work_estimate.order_id,
                work_estimate.user_id,
            )
        await db.commit()
        await db.refresh(material_estimate)
        return material_estimate

    except Exception as e:
        logger.error(f"add_work_into_estimate error: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=400, detail=f"Ошибка добавления работы: {str(e)}"
        )

    # добавить работу в график работ для заказа пользователя


async def add_work_into_graphic_works(
    db: AsyncSession, work_graphic_works_schema: GraphicWorksSchema
) -> GraphicWork:
    try:
        # ✅ ПРАВИЛЬНОЕ ПРЕОБРАЗОВАНИЕ ДАТЫ
        # Pydantic (с валидатором) превращает строку в объект datetime.date
        target_date = work_graphic_works_schema.work_date

        # ✅ 1. ИЩЕМ запись на КОНКРЕТНУЮ ДАТУ
        graphic_result = await db.execute(
            select(GraphicWork).where(
                and_(
                    GraphicWork.user_id == work_graphic_works_schema.user_id,
                    GraphicWork.order_id == work_graphic_works_schema.order_id,
                    GraphicWork.name_work == work_graphic_works_schema.name_work,
                    GraphicWork.work_date == target_date,
                )
            )
        )
        existing_graphic_work = graphic_result.scalar_one_or_none()

        # ✅ 2. ПРИВОДИМ КОЛИЧЕСТВО К DECIMAL
        # Избегаем ошибки TypeError: unsupported operand type(s) for +=: 'Decimal' and 'float'
        today_qty = Decimal(str(work_graphic_works_schema.quantity))

        if existing_graphic_work:
            # СУММИРУЕМ
            existing_graphic_work.quantity += today_qty
            total_graphic_qty = existing_graphic_work.quantity
            logger.info(
                f"📅 ДАТА {target_date}: {existing_graphic_work.name_work} += {today_qty} (итого {total_graphic_qty})"
            )
        else:
            # СОЗДАЕМ НОВУЮ ЗАПИСЬ
            new_graphic_work = GraphicWork(
                user_id=work_graphic_works_schema.user_id,
                order_id=work_graphic_works_schema.order_id,
                name_work=work_graphic_works_schema.name_work,
                unit_measurement=work_graphic_works_schema.unit_measurement,
                quantity=today_qty,
                work_date=target_date,
            )
            db.add(new_graphic_work)
            total_graphic_qty = today_qty
            logger.info(
                f"📅 ДАТА {target_date}: новая {new_graphic_work.name_work} = {total_graphic_qty}"
            )

        estimate_result = await db.execute(
            select(WorkEstimate).where(
                and_(
                    WorkEstimate.user_id == work_graphic_works_schema.user_id,
                    WorkEstimate.order_id == work_graphic_works_schema.order_id,
                    WorkEstimate.name_work == work_graphic_works_schema.name_work,
                )
            )
        )
        existing_estimate_work = estimate_result.scalar_one_or_none()

        total_work_qty_result = await db.execute(
            select(func.sum(GraphicWork.quantity)).where(
                and_(
                    GraphicWork.user_id == work_graphic_works_schema.user_id,
                    GraphicWork.order_id == work_graphic_works_schema.order_id,
                    GraphicWork.name_work == work_graphic_works_schema.name_work,
                )
            )
        )
        # Сумма из БД приводим к Decimal для корректного сравнения
        total_work_qty = Decimal(str(total_work_qty_result.scalar() or 0))

        if existing_estimate_work:
            if total_work_qty > existing_estimate_work.quantity:
                old_estimate_qty = existing_estimate_work.quantity
                existing_estimate_work.quantity = total_work_qty
                logger.info(
                    f"💰 СМЕТА ↑: '{existing_estimate_work.name_work}' {old_estimate_qty} → {total_work_qty}"
                )
            if work_graphic_works_schema.cost_unit is not None:
                existing_estimate_work.cost_unit = Decimal(
                    str(work_graphic_works_schema.cost_unit)
                )
        else:
            if work_graphic_works_schema.cost_unit is not None:
                cost_work_unit = work_graphic_works_schema.cost_unit
            else:
                cost_work_unit = 0
                work_result = await db.execute(
                    select(Work).where(
                        Work.name_work == work_graphic_works_schema.name_work
                    )
                )
                existing_work = work_result.scalar_one_or_none()
                work_myself_result = await db.execute(
                    select(WorkMasterMyself).where(
                        WorkMasterMyself.name_work
                        == work_graphic_works_schema.name_work
                    )
                )
                existing_work_myself = work_myself_result.scalar_one_or_none()
                if existing_work:
                    cost_work_unit = existing_work.cost
                elif existing_work_myself:
                    cost_work_unit = existing_work_myself.cost

            new_estimate_work = WorkEstimate(
                user_id=work_graphic_works_schema.user_id,
                order_id=work_graphic_works_schema.order_id,
                name_work=work_graphic_works_schema.name_work,
                unit_measurement=work_graphic_works_schema.unit_measurement,
                quantity=total_work_qty,
                cost_unit=cost_work_unit,
                currency="BYN",
            )
            db.add(new_estimate_work)
            logger.info(f"💰 Новая смета: {total_work_qty}")

        await _notify_schedule_updated(
            db,
            work_graphic_works_schema.order_id,
            work_graphic_works_schema.user_id,
        )
        await db.commit()

        result_work = existing_graphic_work or new_graphic_work
        if result_work:
            await db.refresh(result_work)

        logger.info(f"✅ СОХРАНЕНО: {result_work.name_work} на {target_date}")
        return result_work

    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Ошибка: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")

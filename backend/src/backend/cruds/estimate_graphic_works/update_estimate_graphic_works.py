from decimal import Decimal
import logging
from fastapi import HTTPException
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.notifications_crud import (
    ESTIMATE_UPDATED_NOTIFICATION_TYPE,
    SCHEDULE_UPDATED_NOTIFICATION_TYPE,
    notify_order_event,
)
from models.estimate_graphic_works_models import (
    GraphicWork,
    MaterialEstimate,
    WorkEstimate,
)
from schemas.estimate_graphic_works_schemas import (
    GraphicWorksReadSchema,
    GraphicWorksSchema,
    MaterialEstimateSchema,
    WorkEstimateReadSchema,
    WorkEstimateSchema,
    WorkEstimateUpdateSchema,
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


# ==================== ОБНОВЛЕНИЕ РАБОТЫ В СМЕТЕ ====================
from sqlalchemy import select, update, func


async def update_work_into_estimate_for_order(
    db: AsyncSession,
    work_estimate_id: int,
    user_id: int,
    order_id: int,
    work_estimate_schema: WorkEstimateUpdateSchema,
):
    try:
        result_graphic_works = await db.execute(
            select(func.coalesce(func.sum(GraphicWork.quantity), 0)).where(
                GraphicWork.name_work == work_estimate_schema.name_work,
                GraphicWork.user_id == user_id,
                GraphicWork.order_id == order_id,
            )
        )

        quantity_work = result_graphic_works.scalar_one()

        if work_estimate_schema.quantity < quantity_work:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Нельзя установить количество меньше, чем уже в графике: "
                    f"{quantity_work}"
                ),
            )

        result = await db.execute(
            update(WorkEstimate)
            .where(
                WorkEstimate.id == work_estimate_id,
                WorkEstimate.user_id == user_id,
                WorkEstimate.order_id == order_id,
            )
            .values(
                name_work=work_estimate_schema.name_work,
                unit_measurement=work_estimate_schema.unit_measurement,
                quantity=work_estimate_schema.quantity,
                cost_unit=work_estimate_schema.cost_unit,
                currency=work_estimate_schema.currency,
            )
        )

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Запись не найдена")

        await _notify_estimate_updated(db, order_id, user_id)
        await db.commit()
        return {"detail": "Работа успешно обновлена"}

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка обновления работы: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")


# ==================== ОБНОВЛЕНИЕ МАТЕРИАЛА ====================
async def update_material_into_estimate_for_order(
    db: AsyncSession,
    material_estimate_id: int,  # ← Лучше передавать id материала
    material_estimate_schema: MaterialEstimateSchema,
):
    try:
        result = await db.execute(
            update(MaterialEstimate)
            .where(MaterialEstimate.id == material_estimate_id)
            .values(
                name_material=material_estimate_schema.name_material,  # ← Исправил
                unit_measurement=material_estimate_schema.unit_measurement,
                quantity=material_estimate_schema.quantity,
                cost_unit=material_estimate_schema.cost_unit,
                currency=material_estimate_schema.currency,
            )
        )

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Материал не найден")

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

        updated_result = await db.execute(
            select(MaterialEstimate).where(MaterialEstimate.id == material_estimate_id)
        )
        updated_material = updated_result.scalar_one()
        return updated_material

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка обновления материала: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")


# ==================== ОБНОВЛЕНИЕ ГРАФИКА РАБОТ ====================
async def update_graphic_works(
    db: AsyncSession,
    user_id: int,
    order_id: int,
    graphic_work_id: int,  # ← Добавили!
    graphic_works: GraphicWorksSchema,
):
    try:
        result = await db.execute(
            update(GraphicWork)
            .where(
                GraphicWork.id == graphic_work_id,
                GraphicWork.user_id == user_id,
                GraphicWork.order_id == order_id,
            )
            .values(
                name_work=graphic_works.name_work,
                unit_measurement=graphic_works.unit_measurement,
                quantity=graphic_works.quantity,
            )
        )

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Запись не найдена")

        # Use function args `user_id`/`order_id` to find the related WorkEstimate
        estimate_result = await db.execute(
            select(WorkEstimate).where(
                and_(
                    WorkEstimate.user_id == user_id,
                    WorkEstimate.order_id == order_id,
                    WorkEstimate.name_work == graphic_works.name_work,
                )
            )
        )
        existing_estimate_work = estimate_result.scalar_one_or_none()

        total_work_qty_result = await db.execute(
            select(func.sum(GraphicWork.quantity)).where(
                and_(
                    GraphicWork.user_id == user_id,
                    GraphicWork.order_id == order_id,
                    GraphicWork.name_work == graphic_works.name_work,
                )
            )
        )

        # Сумма из БД приводим к Decimal для корректного сравнения
        total_work_qty = Decimal(str(total_work_qty_result.scalar() or 0))

        if existing_estimate_work:
            if total_work_qty > existing_estimate_work.quantity:
                old_estimate_qty = existing_estimate_work.quantity
                # Persist the updated quantity to the WorkEstimate row in the DB
                update_estimate_result = await db.execute(
                    update(WorkEstimate)
                    .where(WorkEstimate.id == existing_estimate_work.id)
                    .values(quantity=total_work_qty)
                )
                if update_estimate_result.rowcount == 0:
                    logger.warning(
                        "Не удалось обновить количество в смете для '%s'",
                        existing_estimate_work.name_work,
                    )
                else:
                    logger.info(
                        f"💰 СМЕТА ↑: '{existing_estimate_work.name_work}' {old_estimate_qty} → {total_work_qty}"
                    )
            if graphic_works.cost_unit is not None:
                await db.execute(
                    update(WorkEstimate)
                    .where(WorkEstimate.id == existing_estimate_work.id)
                    .values(cost_unit=Decimal(str(graphic_works.cost_unit)))
                )
        elif graphic_works.cost_unit is not None:
            new_estimate_work = WorkEstimate(
                user_id=user_id,
                order_id=order_id,
                name_work=graphic_works.name_work,
                unit_measurement=graphic_works.unit_measurement,
                quantity=total_work_qty,
                cost_unit=Decimal(str(graphic_works.cost_unit)),
                currency="BYN",
            )
            db.add(new_estimate_work)

        result_graphic_works = await db.execute(
            select(GraphicWork).where(
                GraphicWork.id == graphic_work_id,
                GraphicWork.user_id == user_id,
                GraphicWork.order_id == order_id,
            )
        )

        graphic_works_data = result_graphic_works.scalar_one_or_none()

        if graphic_works_data is None:
            raise HTTPException(
                status_code=404, detail="Запись не найдена после обновления"
            )

        await _notify_schedule_updated(db, order_id, user_id)
        await db.commit()

        return GraphicWorksReadSchema(
            id=graphic_works_data.id,
            name_work=graphic_works_data.name_work,
            quantity=graphic_works_data.quantity,
            unit_measurement=graphic_works_data.unit_measurement,
            work_date=graphic_works_data.work_date,
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка обновления графика: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

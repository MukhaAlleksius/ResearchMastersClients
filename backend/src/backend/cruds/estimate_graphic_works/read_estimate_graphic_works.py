from datetime import date
from decimal import Decimal
import logging
from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.estimate_graphic_works_models import (
    GraphicWork,
    MaterialEstimate,
    WorkEstimate,
)
from schemas.estimate_graphic_works_schemas import (
    DateGraphicWorkSchema,
    EstimateTotals,
    FullEstimateResponse,
    GraphicWorksReadSchema,
    MaterialEstimateReadSchema,
    WorkEstimateFullReadSchema,
    WorkEstimateReadSchema,
    WorkEstimateSchema,
    WorkFromGraphicWorksSchema,
)

logger = logging.getLogger(__name__)


# получить работы из сметы для заказа определенного пользователя
# этот метод рпименяется для отображения информации о смете пользователя
# для заказа во вкладке "смета"
async def get_full_estimate_for_order(
    db: AsyncSession, user_id: int, order_id: int
) -> FullEstimateResponse:
    try:
        # ✅ 1. Загружаем РАБОТЫ из БД одним запросом (N+1 проблема решена)
        # Ищем все работы по конкретному пользователю и заказу
        works_result = await db.execute(
            select(
                WorkEstimate,
                func.coalesce(func.sum(GraphicWork.quantity), 0).label(
                    "graphic_quantity_sum"
                ),
            )
            .outerjoin(
                GraphicWork,
                and_(
                    WorkEstimate.name_work == GraphicWork.name_work,
                    WorkEstimate.user_id == GraphicWork.user_id,
                    WorkEstimate.order_id == GraphicWork.order_id,
                ),
            )
            .where(
                WorkEstimate.user_id == user_id,
                WorkEstimate.order_id == order_id,
            )
            .group_by(
                WorkEstimate.id,
                WorkEstimate.user_id,
                WorkEstimate.order_id,
                WorkEstimate.name_work,
                WorkEstimate.quantity,
                WorkEstimate.unit_measurement,
                WorkEstimate.cost_unit,
                WorkEstimate.currency,
            )
        )

        works = works_result.all()  # Получаем список пар (work, graphic_quantity_sum)

        # ✅ Инициализируем переменные для подсчета ИТОГОВ
        works_with_materials = []  # Сюда попадут полные работы с материалами
        works_total = Decimal("0")  # Общая сумма работ
        materials_total = Decimal("0")  # Общая сумма материалов

        # ✅ 2. Если работ нет -> возвращаем пустую смету
        work_ids = [
            work.id for work, graphic_quantity_sum in works
        ]  # Собираем ID всех работ
        if not work_ids:
            return FullEstimateResponse(
                works=[],  # Пустой список работ
                totals=EstimateTotals(
                    works_total=0.0, materials_total=0.0, grand_total=0.0
                ),
            )

        # ✅ 3. ОДИН запрос для ВСЕХ материалов (вместо N+1 запросов по одной работе)
        # Загружаем материалы для ВСЕХ работ сразу
        materials_result = await db.execute(
            select(MaterialEstimate).where(
                MaterialEstimate.work_estimate_id.in_(
                    work_ids
                )  # WHERE id IN (1,2,3...)
            )
        )
        all_materials = materials_result.scalars().all()  # Все материалы сразу

        # ✅ 4. Группируем материалы по работам (создаем словарь {work_id: [материалы]})
        materials_by_work = {}
        for mat in all_materials:
            if mat.work_estimate_id not in materials_by_work:
                materials_by_work[mat.work_estimate_id] = (
                    []
                )  # Создаем список для этой работы
            materials_by_work[mat.work_estimate_id].append(mat)  # Добавляем материал

        # ✅ 5. Основной цикл: для КАЖДОЙ работы собираем полную информацию
        for work, graphic_quantity_sum in works:
            # Получаем материалы для текущей работы (или пустой список)
            materials = materials_by_work.get(work.id, [])

            # ✅ Конвертируем SQLAlchemy модели материалов в Pydantic
            materials_dicts = []
            for mat in materials:
                materials_dicts.append(
                    MaterialEstimateReadSchema(
                        id=mat.id,
                        work_estimate_id=mat.work_estimate_id,
                        name_material=mat.name_material,
                        quantity=mat.quantity,
                        unit_measurement=mat.unit_measurement,
                        cost_unit=mat.cost_unit,
                        currency=mat.currency,
                    )
                )  # Теперь это чистые Pydantic модели для JSON

            # ✅ Создаем ПОЛНУЮ модель работы с материалами
            work_full = WorkEstimateFullReadSchema(
                id=work.id,
                user_id=work.user_id,
                order_id=work.order_id,
                name_work=work.name_work,
                quantity=work.quantity,
                done_quantity=graphic_quantity_sum,
                unit_measurement=work.unit_measurement,
                cost_unit=work.cost_unit,
                currency=work.currency,
                materials=materials_dicts,  # Список Pydantic материалов
            )

            # ✅ Подсчитываем стоимости с точной Decimal арифметикой
            works_total += work.quantity * work.cost_unit  # Стоимость работы
            materials_work_total = sum(
                m.quantity * m.cost_unit
                for m in materials_dicts  # Сумма материалов работы
            )
            materials_total += (
                materials_work_total  # Добавляем к общей сумме материалов
            )

            works_with_materials.append(
                work_full
            )  # Добавляем полную работу в результат

        # ✅ 6. Возвращаем готовую смету с итоговыми суммами
        return FullEstimateResponse(
            works=works_with_materials,  # Список полных работ с материалами
            totals=EstimateTotals(
                works_total=float(works_total),  # Сумма работ
                materials_total=float(materials_total),  # Сумма материалов
                grand_total=float(works_total + materials_total),  # Итоговая сумма
            ),
        )

    except Exception as e:
        # ✅ Обработка ошибок
        logger.error(f"💥 Ошибка полной сметы {user_id}/{order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка формирования сметы")


# получить материалы из сметы для работы заказа определенного пользователя
async def get_materials_estimates_for_order(
    db: AsyncSession, user_id: int, order_id: int
) -> list[WorkEstimateSchema]:
    try:
        result = await db.execute(
            select(WorkEstimate).where(
                WorkEstimate.user_id == user_id, WorkEstimate.order_id == order_id
            )
        )
        works_estimates = result.scalars().all()
        return [
            WorkEstimateSchema(
                user_id=work_estimate.user_id,
                order_id=work_estimate.order_id,
                name_work=work_estimate.name_work,
                quantity=work_estimate.quantity,
                unit_measurement=work_estimate.unit_measurement,
                cost_unit=work_estimate.cost_unit,
                currency=work_estimate.currency,
            )
            for work_estimate in works_estimates
        ]
    except Exception as e:
        logger.error(f"get_countries error: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )


# получить работы, выполненные пользователем для конкретного заказа при отображении работ
# во вкладке "график работ" там, где "отчет о работе"
async def get_works_from_graphic_works_for_order(
    db: AsyncSession, user_id: int, order_id: int
) -> list[GraphicWorksReadSchema]:
    try:
        result = await db.execute(
            select(GraphicWork).where(
                GraphicWork.user_id == user_id, GraphicWork.order_id == order_id
            )
        )
        works_from_graphic_works = result.scalars().all()
        return [
            GraphicWorksReadSchema(
                id=work_from_graphic_works.id,
                user_id=work_from_graphic_works.user_id,
                order_id=work_from_graphic_works.order_id,
                name_work=work_from_graphic_works.name_work,
                quantity=work_from_graphic_works.quantity,
                unit_measurement=work_from_graphic_works.unit_measurement,
                work_date=work_from_graphic_works.work_date,
            )
            for work_from_graphic_works in works_from_graphic_works
        ]
    except Exception as e:
        logger.error(f"get_countries error: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )


# получить работы из сметы для заказа определенного пользователя для отображения
# работ во вкладке "график работ" в выпадающем списке с работами
async def get_works_estimate_for_order(
    db: AsyncSession, user_id: int, order_id: int
) -> list[WorkEstimateReadSchema]:
    try:
        result = await db.execute(
            select(WorkEstimate).where(
                WorkEstimate.user_id == user_id, WorkEstimate.order_id == order_id
            )
        )
        works_estimates = result.scalars().all()
        return [
            WorkEstimateReadSchema(
                id=work_estimate.id,
                user_id=work_estimate.user_id,
                order_id=work_estimate.order_id,
                name_work=work_estimate.name_work,
                quantity=work_estimate.quantity,
                unit_measurement=work_estimate.unit_measurement,
                cost_unit=work_estimate.cost_unit,
                currency=work_estimate.currency,
            )
            for work_estimate in works_estimates
        ]
    except Exception as e:
        logger.error(
            f"get_works_estimate_for_order error {user_id}/{order_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )


# async def get_dates_graphic_works_for_order(
#     db: AsyncSession, user_id: int, order_id: int
# ):
#     try:
#         result = await db.execute(
#             select(GraphicWork).where(
#                 GraphicWork.user_id == user_id,
#                 GraphicWork.order_id == order_id,
#             )
#         )

#         graphic_works = result.scalars().all()

#         grouped = {}
#         for item in graphic_works:
#             key = item.work_date
#             if key not in grouped:
#                 grouped[key] = []

#             grouped[key].append(
#                 WorkFromGraphicWorksSchema(
#                     name_work=item.name_work,
#                     quantity=float(item.quantity),
#                     unit_measurement=item.unit_measurement,
#                 )
#             )

#         return [
#             DateGraphicWorkSchema(work_date=work_date, works=works)
#             for work_date, works in grouped.items()
#         ]

#     except Exception as e:
#         logger.error(f"💥 Ошибка полной сметы {user_id}/{order_id}: {str(e)}")
#         raise HTTPException(status_code=500, detail="Ошибка формирования сметы")


# async def get_works_from_graphic_works_for_date(
#     db: AsyncSession, user_id: int, order_id: int, date: date
# ):
#     try:
#         result = await db.execute(
#             select(GraphicWork).where(
#                 GraphicWork.user_id == user_id,
#                 GraphicWork.order_id == order_id,
#                 GraphicWork.work_date == date,
#             )
#         )

#         works = result.scalars().all()

#         return [
#             WorkFromGraphicWorksSchema(
#                 name_work=work.name_work,
#                 quantity=float(work.quantity),
#                 unit_measurement=work.unit_measurement,
#             )
#             for work in works
#         ]

#     except Exception as e:
#         logger.error(f"💥 Ошибка полной сметы {user_id}/{order_id}: {str(e)}")
#         raise HTTPException(status_code=500, detail="Ошибка формирования сметы")

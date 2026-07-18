import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


from cruds.estimate_graphic_works.create_estimate_graphic_works import (
    add_material_for_work_into_estimate,
    add_work_into_estimate,
    add_work_into_graphic_works,
)
from cruds.estimate_graphic_works.delete_estimate_graphic_works import (
    delete_work_from_estimate_for_order,
    delete_work_from_graphic_works_for_order,
)
from cruds.estimate_graphic_works.read_estimate_graphic_works import (
    get_full_estimate_for_order,
    get_works_estimate_for_order,
    get_works_from_graphic_works_for_order,
)
from cruds.estimate_graphic_works.update_estimate_graphic_works import (
    update_graphic_works,
    update_material_into_estimate_for_order,
    update_work_into_estimate_for_order,
)

from cruds.orders.read_orders import _resolve_assigned_executor_id
from models.estimate_graphic_works_models import GraphicWork, WorkEstimate
from models.orders_models import Order
from schemas.estimate_graphic_works_schemas import (
    FullEstimateResponse,
    GraphicWorksReadSchema,
    GraphicWorksSchema,
    MaterialEstimateReadSchema,
    MaterialEstimateSchema,
    WorkEstimateReadSchema,
    WorkEstimateSchema,
    WorkEstimateUpdateSchema,
)
from core.config import get_db
from core.auth import ensure_same_user, get_current_user
from schemas.users_schemas import UserCommonSchema

logger = logging.getLogger(__name__)


router = APIRouter(prefix="", tags=["geography"])


async def ensure_can_read_order_estimate(
    db: AsyncSession,
    current_user: UserCommonSchema,
    *,
    executor_user_id: int,
    order_id: int,
) -> None:
    """Исполнитель читает свою смету; заказчик — смету назначенного исполнителя по заказу."""
    if current_user.user_id == executor_user_id:
        return

    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order.customer_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    assigned_executor_id = await _resolve_assigned_executor_id(db, order_id)
    if assigned_executor_id == executor_user_id:
        return

    estimate_exists = await db.execute(
        select(WorkEstimate.id)
        .where(
            WorkEstimate.user_id == executor_user_id,
            WorkEstimate.order_id == order_id,
        )
        .limit(1)
    )
    if estimate_exists.scalar_one_or_none():
        return

    raise HTTPException(status_code=403, detail="Access denied")


@router.post("/add_work_into_estimate", response_model=WorkEstimateReadSchema)
async def add_work_into_estimate_api(
    work_estimate_schema: WorkEstimateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, work_estimate_schema.user_id)
    try:
        work_estimate = await add_work_into_estimate(
            db=db, work_estimate_schema=work_estimate_schema
        )
        return work_estimate
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post(
    "/add_material_for_work_into_estimate", response_model=MaterialEstimateSchema
)
async def add_material_for_work_into_estimate_api(
    material_estimate_schema: MaterialEstimateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        material_estimate = await add_material_for_work_into_estimate(
            db=db, material_estimate_schema=material_estimate_schema
        )
        return material_estimate
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get(
    "/works_estimate_full/{user_id}/{order_id}", response_model=FullEstimateResponse
)
async def get_full_estimate_api(
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    await ensure_can_read_order_estimate(
        db,
        current_user,
        executor_user_id=user_id,
        order_id=order_id,
    )
    try:
        result = await get_full_estimate_for_order(db, user_id, order_id)
        return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(f"Ошибка получения полной сметы {user_id}/{order_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail="Ошибка получения полной сметы с материалами"
        )


@router.post("/add_work_into_graphic_works", response_model=GraphicWorksSchema)
async def add_work_into_graphic_works_api(
    work_graphic_works_schema: GraphicWorksSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    if work_graphic_works_schema.user_id is not None:
        ensure_same_user(current_user, work_graphic_works_schema.user_id)
    else:
        work_graphic_works_schema.user_id = current_user.user_id
    try:
        work_graphic_works = await add_work_into_graphic_works(
            db=db, work_graphic_works_schema=work_graphic_works_schema
        )
        return work_graphic_works
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get(
    "/works_from_graphic_works/{user_id}/{order_id}",
    response_model=list[GraphicWorksReadSchema],
)
async def get_works_from_graphic_works_api(
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    await ensure_can_read_order_estimate(
        db,
        current_user,
        executor_user_id=user_id,
        order_id=order_id,
    )
    try:
        result = await get_works_from_graphic_works_for_order(db, user_id, order_id)
        return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(f"Ошибка получения графика работ {user_id}/{order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения графика работ")


@router.get(
    "/works_from_estimate_works/{user_id}/{order_id}",
    response_model=list[WorkEstimateReadSchema],
)
async def get_works_from_estimate_works_api(
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    await ensure_can_read_order_estimate(
        db,
        current_user,
        executor_user_id=user_id,
        order_id=order_id,
    )
    try:
        result = await get_works_estimate_for_order(db, user_id, order_id)
        return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(
            f"Ошибка получения работ из сметы для заказа пользователя {user_id}/{order_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail="Ошибка получения работ из сметы"
        )


@router.put(
    "/update_work_into_estimate/{work_estimate_id}/{user_id}/{order_id}",
)
async def update_work_into_estimate_for_order_api(
    work_estimate_id: int,
    user_id: int,
    order_id: int,
    work_estimate_schema: WorkEstimateUpdateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    try:

        await update_work_into_estimate_for_order(
            db,
            work_estimate_id=work_estimate_id,
            user_id=current_user.user_id,
            order_id=order_id,
            work_estimate_schema=work_estimate_schema,
        )
        # return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(f"Ошибка получения работы сметы: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения работы сметы")


@router.put(
    "/update_material_into_estimate/{material_estimate_id}",
    response_model=MaterialEstimateReadSchema,
)
async def update_material_into_estimate_for_order_api(
    material_estimate_id: int,
    material_estimate_schema: MaterialEstimateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        result = await update_material_into_estimate_for_order(
            db,
            material_estimate_id,
            material_estimate_schema=material_estimate_schema,
        )
        return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(
            f"Ошибка обновления материала сметы {material_estimate_id}: {str(e)}"
        )
        raise HTTPException(status_code=500, detail="Ошибка обновления материала сметы")


@router.put(
    "/update_work_into_graphic_works/{user_id}/{order_id}/{graphic_work_id}",
    response_model=GraphicWorksReadSchema,
)
async def update_work_into_graphic_works_for_order_api(
    user_id: int,
    order_id: int,
    graphic_work_id: int,
    graphic_works: GraphicWorksSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    try:
        result = await update_graphic_works(
            db,
            user_id=current_user.user_id,
            order_id=order_id,
            graphic_work_id=graphic_work_id,
            graphic_works=graphic_works,
        )
        return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(f"Ошибка получения работы сметы {user_id}/{order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения работы сметы")


# удаление работы из сметы пользователя для заказа
@router.delete("/delete_work_from_estimate/{user_id}/{order_id}/{work_estimate_id}")
async def delete_work_from_estimate_for_order_api(
    user_id: int,
    order_id: int,
    work_estimate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    try:
        result = await delete_work_from_estimate_for_order(
            db, current_user.user_id, order_id, work_estimate_id
        )
        return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(f"Ошибка удаления работы сметы {user_id}/{order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка удаления работы сметы")


# удаление работы из графика работ пользователя для заказа
@router.delete("/delete_work_from_graphic_works/{user_id}/{order_id}/{graphic_work_id}")
async def delete_work_from_graphic_works_for_order_api(
    user_id: int,
    order_id: int,
    graphic_work_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    try:
        result = await delete_work_from_graphic_works_for_order(
            db, current_user.user_id, order_id, graphic_work_id
        )
        return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:
        logger.error(
            f"Ошибка удаления работы графика работ {user_id}/{order_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail="Ошибка удаления работы графика работ"
        )


# @router.get(
#     "/dates_graphic_work/{user_id}/{order_id}",
#     response_model=list[DateGraphicWorkSchema],
# )
# async def get_dates_graphic_works_for_order_api(
#     user_id: int, order_id: int, db: AsyncSession = Depends(get_db)
# ):
#     try:
#         result = await get_dates_graphic_works_for_order(db, user_id, order_id)
#         return result
#     except HTTPException:
#         raise  # Пробрасываем как есть
#     except Exception as e:
#         logger.error(
#             f"Ошибка получения дат из графика работ {user_id}/{order_id}: {str(e)}"
#         )
#         raise HTTPException(
#             status_code=500, detail="Ошибка получения дат из графика работ"
#         )


# @router.get(
#     "/works_from_graphic_works_for_date/{user_id}/{order_id}/{date}",
#     response_model=WorkFromGraphicWorksSchema,
# )
# async def get_works_from_graphic_works_for_date_api(
#     user_id: int, order_id: int,date:int, db: AsyncSession = Depends(get_db)
# ):
#     try:
#         result = await get_works_from_graphic_works_for_date(
#             db,
#             user_id,
#             order_id,
#             date,
#         )
#         return result
#     except HTTPException:
#         raise  # Пробрасываем как есть
#     except Exception as e:
#         logger.error(
#             f"Ошибка получения дат из графика работ {user_id}/{order_id}: {str(e)}"
#         )
#         raise HTTPException(
#             status_code=500, detail="Ошибка получения дат из графика работ"
#         )

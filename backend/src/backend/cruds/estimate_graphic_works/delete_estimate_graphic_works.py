from fastapi import HTTPException
from cruds.notifications_crud import (
    ESTIMATE_UPDATED_NOTIFICATION_TYPE,
    SCHEDULE_UPDATED_NOTIFICATION_TYPE,
    notify_order_event_safe,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.estimate_graphic_works_models import GraphicWork, WorkEstimate
from models.orders_models import GraphicOrderMaster


async def clear_estimate_and_graphic_for_order(
    db: AsyncSession,
    user_id: int,
    order_id: int,
) -> None:
    """Удаляет все работы/материалы сметы и график работ для заказа (один пользователь)."""
    await db.execute(
        delete(WorkEstimate).where(
            WorkEstimate.user_id == user_id,
            WorkEstimate.order_id == order_id,
        )
    )
    await db.execute(
        delete(GraphicWork).where(
            GraphicWork.user_id == user_id,
            GraphicWork.order_id == order_id,
        )
    )
    await db.execute(
        delete(GraphicOrderMaster).where(
            GraphicOrderMaster.user_id == user_id,
            GraphicOrderMaster.order_id == order_id,
        )
    )


async def clear_all_order_estimate_data(
    db: AsyncSession,
    order_id: int,
) -> None:
    """Удаляет смету и материалы по заказу для всех участников."""
    await db.execute(
        delete(WorkEstimate).where(WorkEstimate.order_id == order_id)
    )


async def clear_all_order_estimate_and_graphic_data(
    db: AsyncSession,
    order_id: int,
) -> None:
    """Удаляет смету, материалы и график работ по заказу для всех участников."""
    await clear_all_order_estimate_data(db, order_id)
    await db.execute(delete(GraphicWork).where(GraphicWork.order_id == order_id))
    await db.execute(
        delete(GraphicOrderMaster).where(GraphicOrderMaster.order_id == order_id)
    )


# удаление работы из сметы пользователя для заказа
async def delete_work_from_estimate_for_order(
    db: AsyncSession, user_id: int, order_id: int, work_estimate_id: int
):
    try:
        result = await db.execute(
            delete(WorkEstimate)
            .where(
                WorkEstimate.user_id == user_id,
                WorkEstimate.order_id == order_id,
                WorkEstimate.id == work_estimate_id,
            )
            .returning(WorkEstimate.id)
        )
        deleted_work_estimate = result.scalar_one_or_none()

        if deleted_work_estimate is None:
            raise HTTPException(status_code=404, detail="Запись не найдена")

        await notify_order_event_safe(
            db,
            order_id=order_id,
            actor_user_id=user_id,
            notification_type=ESTIMATE_UPDATED_NOTIFICATION_TYPE,
        )
        await db.commit()

        return {"detail": "Работа успешно удалена"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# удаление работы из графика работ для заказа
async def delete_work_from_graphic_works_for_order(
    db: AsyncSession,
    user_id: int,
    order_id: int,
    graphic_work_id: int,
):
    try:
        result = await db.execute(
            delete(GraphicWork)
            .where(
                GraphicWork.user_id == user_id,
                GraphicWork.order_id == order_id,
                GraphicWork.id == graphic_work_id,
            )
            .returning(GraphicWork.id)
        )
        deleted_work = result.scalar_one_or_none()

        if deleted_work is None:
            raise HTTPException(status_code=404, detail="Запись не найдена")

        await notify_order_event_safe(
            db,
            order_id=order_id,
            actor_user_id=user_id,
            notification_type=SCHEDULE_UPDATED_NOTIFICATION_TYPE,
        )
        await db.commit()

        return {"detail": "Работа успешно удалена"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

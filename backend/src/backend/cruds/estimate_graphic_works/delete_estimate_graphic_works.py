from fastapi import HTTPException  # HTTP-ошибки
from cruds.notifications_crud import (  # Уведомления об изменении сметы/графика
    ESTIMATE_UPDATED_NOTIFICATION_TYPE,
    SCHEDULE_UPDATED_NOTIFICATION_TYPE,
    notify_order_event_safe,
)
from sqlalchemy import delete, select  # DELETE и SELECT
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from models.estimate_graphic_works_models import GraphicWork, WorkEstimate  # Смета и график
from models.orders_models import GraphicOrderMaster  # Мастер-запись графика заказа
from cruds.orders.sync_order_budget import sync_order_budget_from_deal
import logging

logger = logging.getLogger(__name__)


async def _sync_budget_after_estimate(db: AsyncSession, order_id: int) -> None:
    try:
        await sync_order_budget_from_deal(db, order_id)
    except Exception as error:
        logger.warning("sync order budget after estimate failed: %s", error)


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
    )  # Смета пользователя
    await db.execute(
        delete(GraphicWork).where(
            GraphicWork.user_id == user_id,
            GraphicWork.order_id == order_id,
        )
    )  # График работ
    await db.execute(
        delete(GraphicOrderMaster).where(
            GraphicOrderMaster.user_id == user_id,
            GraphicOrderMaster.order_id == order_id,
        )
    )  # Мастер-запись графика


async def clear_all_order_estimate_data(
    db: AsyncSession,
    order_id: int,
) -> None:
    """Удаляет смету и материалы по заказу для всех участников."""
    await db.execute(
        delete(WorkEstimate).where(WorkEstimate.order_id == order_id)
    )  # CASCADE материалов через FK


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
            .returning(WorkEstimate.id)  # Проверка, что строка удалена
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
        await _sync_budget_after_estimate(db, order_id)
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

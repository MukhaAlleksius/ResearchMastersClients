import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.estimate_graphic_works.delete_estimate_graphic_works import (
    clear_all_order_estimate_and_graphic_data,
    clear_estimate_and_graphic_for_order,
)
from cruds.orders.order_constants import HIDDEN_CUSTOMER_EXECUTOR_MARKER
from cruds.notifications_crud import clear_cancel_notifications_for_order
from models.users_models import User
from models.contracts_models import Contract
from models.conversations_models import (
    ComplaintConversation,
    ComplaintMessage,
    ComplaintModerationAction,
    Conversation,
)
from models.estimate_graphic_works_models import GraphicWork, WorkEstimate
from models.payments_models import Payment
from models.orders_models import (
    CustomerOrderCancellation,
    ExecutorOrder,
    ExecutorOrderCancellation,
    GraphicOrderMaster,
    InformationAboutCustomer,
    InformationAboutExecutor,
    Notification,
    Order,
    OrderResponseExecutor,
    StatusOrderCustomer,
    StatusOrderExecutor,
)

logger = logging.getLogger(__name__)

SEARCH_EXECUTOR_STATUS = "В поиске исполнителя"
REFUSED_BY_CUSTOMER_STATUS = "Отказано заказчиком"
REFUSED_BY_ORDER_STATUS = "Отказ от заказа"

CUSTOMER_DELETABLE_STATUSES = {
    "Не предложенные исполнителям",
    "Самостоятельное выполнение",
    "В поиске исполнителя",
    "Ожидают выполнения",
}


async def delete_executor_response_for_order(
    db: AsyncSession,
    order_id: int,
    executor_id: int,
) -> int:
    """Удаляет отклик исполнителя по заказу (orders_responses_executors)."""
    result = await db.execute(
        delete(OrderResponseExecutor).where(
            OrderResponseExecutor.order_id == order_id,
            OrderResponseExecutor.executor_id == executor_id,
        )
    )
    deleted = result.rowcount or 0
    if deleted:
        logger.info(
            "Deleted executor response: order_id=%s executor_id=%s",
            order_id,
            executor_id,
        )
    await db.flush()
    return deleted


async def clear_order_refusal_collateral(
    db: AsyncSession,
    order_id: int,
    *,
    customer_id: Optional[int] = None,
    executor_id: Optional[int] = None,
    preserve_cancellations: bool = False,
) -> None:
    """Удаляет чат, жалобы администратору, записи отказов и отклик исполнителя по заказу."""
    complaint_ids = select(ComplaintConversation.id).where(
        ComplaintConversation.order_id == order_id
    )

    await db.execute(
        delete(ComplaintModerationAction).where(
            ComplaintModerationAction.complaint_id.in_(complaint_ids)
        )
    )
    await db.execute(
        delete(ComplaintMessage).where(
            ComplaintMessage.complaint_conversation_id.in_(complaint_ids)
        )
    )
    await db.execute(
        delete(ComplaintConversation).where(
            ComplaintConversation.order_id == order_id
        )
    )

    conversation_conditions = [Conversation.order_id == order_id]
    if customer_id is not None:
        conversation_conditions.append(Conversation.customer_id == customer_id)
    if executor_id is not None:
        conversation_conditions.append(Conversation.executor_id == executor_id)
    await db.execute(delete(Conversation).where(*conversation_conditions))

    customer_cancel_conditions = [CustomerOrderCancellation.order_id == order_id]
    executor_cancel_conditions = [ExecutorOrderCancellation.order_id == order_id]
    if customer_id is not None:
        customer_cancel_conditions.append(
            CustomerOrderCancellation.customer_id == customer_id
        )
        executor_cancel_conditions.append(
            ExecutorOrderCancellation.customer_id == customer_id
        )
    if executor_id is not None:
        customer_cancel_conditions.append(
            CustomerOrderCancellation.executor_id == executor_id
        )
        executor_cancel_conditions.append(
            ExecutorOrderCancellation.executor_id == executor_id
        )

    if not preserve_cancellations:
        await db.execute(
            delete(CustomerOrderCancellation).where(*customer_cancel_conditions)
        )
        await db.execute(
            delete(ExecutorOrderCancellation).where(*executor_cancel_conditions)
        )

    if executor_id is not None:
        await delete_executor_response_for_order(db, order_id, executor_id)

    await db.flush()


async def delete_all_order_related_data(db: AsyncSession, order_id: int) -> None:
    """
    Удаляет данные заказа, доступные на ранних этапах:
    смета, чат, договор, отклики, отказы, статусы и незавершённые платежи.
    Записи information_about_executors не связаны с заказом — сохраняются.
    """
    await clear_order_refusal_collateral(db, order_id)

    await db.execute(delete(Contract).where(Contract.order_id == order_id))

    await clear_all_order_estimate_and_graphic_data(db, order_id)

    await db.execute(delete(Payment).where(Payment.order_id == order_id))

    await db.execute(
        delete(OrderResponseExecutor).where(
            OrderResponseExecutor.order_id == order_id
        )
    )
    await db.execute(
        delete(ExecutorOrder).where(ExecutorOrder.order_id == order_id)
    )
    await db.execute(
        delete(StatusOrderExecutor).where(StatusOrderExecutor.order_id == order_id)
    )
    await db.execute(
        delete(StatusOrderCustomer).where(StatusOrderCustomer.order_id == order_id)
    )


def _is_refused_executor_service_status(status: Optional[str]) -> bool:
    normalized = status or ""
    return REFUSED_BY_CUSTOMER_STATUS in normalized or REFUSED_BY_ORDER_STATUS in normalized


async def _get_executor_ids_to_notify_on_customer_delete(
    db: AsyncSession,
    order_id: int,
) -> set[int]:
    response_rows = await db.execute(
        select(OrderResponseExecutor.executor_id).where(
            OrderResponseExecutor.order_id == order_id
        )
    )
    assigned_rows = await db.execute(
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    executor_status_rows = await db.execute(
        select(StatusOrderExecutor.executor_id).where(
            StatusOrderExecutor.order_id == order_id
        )
    )

    executor_ids: set[int] = set()
    executor_ids.update(row[0] for row in response_rows.all() if row[0])
    executor_ids.update(row[0] for row in assigned_rows.all() if row[0])
    executor_ids.update(row[0] for row in executor_status_rows.all() if row[0])
    return executor_ids


async def delete_order_by_customer(
    db: AsyncSession,
    order_id: int,
    customer_id: int,
) -> dict:
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order.customer_id != customer_id:
        raise HTTPException(status_code=403, detail="Нет прав на удаление заказа")

    status_result = await db.execute(
        select(StatusOrderCustomer)
        .where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
        .order_by(StatusOrderCustomer.id.desc())
    )
    status_row = status_result.scalars().first()
    current_status = status_row.status if status_row else None

    if not current_status or current_status not in CUSTOMER_DELETABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Заказ нельзя удалить в текущем статусе",
        )

    executor_ids = await _get_executor_ids_to_notify_on_customer_delete(db, order_id)

    order_title = order.title or f"№ {order_id}"
    notification_message = (
        f"Заказчик удалил заказ «{order_title}». "
        "Смета, отклики, переписка и договор по заказу удалены."
    )

    for executor_id in executor_ids:
        db.add(
            Notification(
                user_id=executor_id,
                title="Заказ удалён заказчиком",
                message=notification_message,
                notification_type="order_deleted_by_customer",
                order_id=order_id,
                order_title=order_title,
                is_read=False,
            )
        )

    await delete_all_order_related_data(db, order_id)
    await db.execute(delete(Order).where(Order.id == order_id))
    await db.flush()

    logger.info(
        "Order %s deleted by customer %s, notified %s executors",
        order_id,
        customer_id,
        len(executor_ids),
    )

    return {
        "order_id": order_id,
        "deleted": True,
        "notified_executors": len(executor_ids),
    }


async def _has_assignment_data_to_clear(db: AsyncSession, order_id: int) -> bool:
    checks = (
        select(OrderResponseExecutor.id).where(
            OrderResponseExecutor.order_id == order_id
        ),
        select(WorkEstimate.id).where(WorkEstimate.order_id == order_id),
        select(GraphicWork.id).where(GraphicWork.order_id == order_id),
        select(GraphicOrderMaster.id).where(GraphicOrderMaster.order_id == order_id),
        select(Contract.id).where(Contract.order_id == order_id),
        select(Conversation.id).where(Conversation.order_id == order_id),
        select(ComplaintConversation.id).where(
            ComplaintConversation.order_id == order_id
        ),
        select(CustomerOrderCancellation.id).where(
            CustomerOrderCancellation.order_id == order_id
        ),
        select(ExecutorOrderCancellation.id).where(
            ExecutorOrderCancellation.order_id == order_id
        ),
    )
    for query in checks:
        result = await db.execute(query.limit(1))
        if result.scalar_one_or_none() is not None:
            return True
    return False


async def can_clear_order_after_executor_refusal(
    db: AsyncSession,
    order_id: int,
    customer_id: int,
) -> bool:
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order or order.customer_id != customer_id:
        return False

    status_result = await db.execute(
        select(StatusOrderCustomer.status)
        .where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
        .order_by(StatusOrderCustomer.id.desc())
        .limit(1)
    )
    current_status = status_result.scalar_one_or_none()
    if not current_status or SEARCH_EXECUTOR_STATUS not in current_status:
        return False

    return await _has_assignment_data_to_clear(db, order_id)


async def clear_order_data_after_executor_refusal(
    db: AsyncSession,
    order_id: int,
    customer_id: int,
) -> dict:
    if not await can_clear_order_after_executor_refusal(db, order_id, customer_id):
        raise HTTPException(
            status_code=400,
            detail="Очистка данных недоступна для этого заказа",
        )

    await clear_all_order_estimate_and_graphic_data(db, order_id)

    await db.execute(delete(Contract).where(Contract.order_id == order_id))
    await clear_order_refusal_collateral(db, order_id)

    response_result = await db.execute(
        delete(OrderResponseExecutor).where(
            OrderResponseExecutor.order_id == order_id
        )
    )
    deleted_responses = response_result.rowcount or 0

    await db.flush()

    logger.info(
        "Order %s assignment data cleared by customer %s, responses=%s",
        order_id,
        customer_id,
        deleted_responses,
    )

    return {
        "order_id": order_id,
        "cleared": True,
        "deleted_responses": deleted_responses,
    }


async def _get_executor_service_status(
    db: AsyncSession,
    order_id: int,
    executor_id: int,
) -> Optional[str]:
    result = await db.execute(
        select(StatusOrderExecutor.status)
        .where(
            StatusOrderExecutor.order_id == order_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
        .order_by(StatusOrderExecutor.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def can_executor_delete_service(
    db: AsyncSession,
    order_id: int,
    executor_id: int,
) -> bool:
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    if order_result.scalar_one_or_none() is None:
        return False

    status = await _get_executor_service_status(db, order_id, executor_id)
    return _is_refused_executor_service_status(status)


async def delete_executor_service(
    db: AsyncSession,
    order_id: int,
    executor_id: int,
) -> dict:
    if not await can_executor_delete_service(db, order_id, executor_id):
        raise HTTPException(
            status_code=400,
            detail="Услугу нельзя удалить в текущем статусе",
        )

    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    customer_id = order.customer_id if order else None

    await clear_estimate_and_graphic_for_order(
        db=db,
        user_id=executor_id,
        order_id=order_id,
    )

    await db.execute(
        delete(Contract).where(
            Contract.order_id == order_id,
            Contract.executor_id == executor_id,
        )
    )

    if customer_id is not None:
        await clear_order_refusal_collateral(
            db,
            order_id,
            customer_id=customer_id,
            executor_id=executor_id,
        )
    else:
        await delete_executor_response_for_order(db, order_id, executor_id)

    await db.execute(
        delete(StatusOrderExecutor).where(
            StatusOrderExecutor.order_id == order_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
    )
    await db.flush()

    logger.info(
        "Executor service removed: order_id=%s executor_id=%s",
        order_id,
        executor_id,
    )

    return {
        "order_id": order_id,
        "deleted": True,
    }


async def remove_customer_executor_from_list(
    db: AsyncSession,
    customer_id: int,
    executor_id: int,
) -> dict:
    """Убирает исполнителя из списка «Мои исполнители» у заказчика."""
    user_result = await db.execute(select(User).where(User.id == executor_id))
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Исполнитель не найден")

    result = await db.execute(
        select(InformationAboutExecutor).where(
            InformationAboutExecutor.customer_id == customer_id,
            InformationAboutExecutor.executor_id == executor_id,
        )
    )
    saved_info = result.scalar_one_or_none()

    if saved_info:
        saved_info.phone = HIDDEN_CUSTOMER_EXECUTOR_MARKER
        saved_info.notification = None
    else:
        db.add(
            InformationAboutExecutor(
                customer_id=customer_id,
                executor_id=executor_id,
                phone=HIDDEN_CUSTOMER_EXECUTOR_MARKER,
                notification=None,
            )
        )

    await db.flush()

    logger.info(
        "Executor hidden from customer list: customer_id=%s executor_id=%s",
        customer_id,
        executor_id,
    )

    return {
        "executor_id": executor_id,
        "removed": True,
    }


async def remove_executor_customer_from_list(
    db: AsyncSession,
    executor_id: int,
    customer_id: int,
) -> dict:
    """Убирает заказчика из списка «Заказчики» у исполнителя."""
    user_result = await db.execute(select(User).where(User.id == customer_id))
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Заказчик не найден")

    result = await db.execute(
        select(InformationAboutCustomer).where(
            InformationAboutCustomer.executor_id == executor_id,
            InformationAboutCustomer.customer_id == customer_id,
        )
    )
    saved_info = result.scalar_one_or_none()

    if saved_info:
        saved_info.phone = HIDDEN_CUSTOMER_EXECUTOR_MARKER
        saved_info.notification = None
    else:
        db.add(
            InformationAboutCustomer(
                executor_id=executor_id,
                customer_id=customer_id,
                phone=HIDDEN_CUSTOMER_EXECUTOR_MARKER,
                notification=None,
            )
        )

    await db.flush()

    logger.info(
        "Customer hidden from executor list: executor_id=%s customer_id=%s",
        executor_id,
        customer_id,
    )

    return {
        "customer_id": customer_id,
        "removed": True,
    }


CUSTOMER_CANCEL_PENDING_STATUS = "pending_executor"
EXECUTOR_CANCEL_PENDING_STATUS = "pending_customer"


async def withdraw_customer_order_cancel(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> dict:
    result = await db.execute(
        select(CustomerOrderCancellation).where(
            CustomerOrderCancellation.order_id == order_id,
            CustomerOrderCancellation.customer_id == customer_id,
            CustomerOrderCancellation.executor_id == executor_id,
        )
    )
    cancellation = result.scalar_one_or_none()
    if not cancellation:
        raise HTTPException(status_code=404, detail="Заявка на отказ не найдена")
    if cancellation.status != CUSTOMER_CANCEL_PENDING_STATUS:
        raise HTTPException(
            status_code=409,
            detail="Отменить можно только заявку, ожидающую ответа исполнителя",
        )

    await db.delete(cancellation)
    await clear_cancel_notifications_for_order(
        db,
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
    )
    await db.flush()

    logger.info(
        "Customer cancel withdrawn: order_id=%s customer_id=%s executor_id=%s",
        order_id,
        customer_id,
        executor_id,
    )
    return {"order_id": order_id, "withdrawn": True}


async def withdraw_executor_order_cancel(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> dict:
    result = await db.execute(
        select(ExecutorOrderCancellation).where(
            ExecutorOrderCancellation.order_id == order_id,
            ExecutorOrderCancellation.customer_id == customer_id,
            ExecutorOrderCancellation.executor_id == executor_id,
        )
    )
    cancellation = result.scalar_one_or_none()
    if not cancellation:
        raise HTTPException(status_code=404, detail="Заявка на отказ не найдена")
    if cancellation.status != EXECUTOR_CANCEL_PENDING_STATUS:
        raise HTTPException(
            status_code=409,
            detail="Отменить можно только заявку, ожидающую ответа заказчика",
        )

    await db.delete(cancellation)
    await clear_cancel_notifications_for_order(
        db,
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
    )
    await db.flush()

    logger.info(
        "Executor cancel withdrawn: order_id=%s customer_id=%s executor_id=%s",
        order_id,
        customer_id,
        executor_id,
    )
    return {"order_id": order_id, "withdrawn": True}

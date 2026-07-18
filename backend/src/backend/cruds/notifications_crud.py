import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.orders_models import (
    ExecutorOrder,
    Notification,
    Order,
    StatusOrderCustomer,
    StatusOrderExecutor,
)
from models.users_models import User

logger = logging.getLogger(__name__)

ALLOWED_REACTIONS = {
    "understood",
    "find_other_orders",
    "view_offer",
    "view_wait_execute",
    "open_order",
}

CUSTOMER_OFFER_STATUS = "Предложения заказчиков"
WAIT_EXECUTE_STATUS = "Ожидают выполнения"
CONSIDERATION_STATUS = "На рассмотрении заказчика"

CUSTOMER_OFFER_NOTIFICATION_TYPE = "customer_order_offer"
PROPOSAL_ACCEPTED_NOTIFICATION_TYPE = "customer_accepted_proposal"
ORDER_DELETED_NOTIFICATION_TYPE = "order_deleted_by_customer"
ESTIMATE_UPDATED_NOTIFICATION_TYPE = "estimate_updated"
SCHEDULE_UPDATED_NOTIFICATION_TYPE = "schedule_updated"
NEW_MESSAGE_NOTIFICATION_TYPE = "new_message"
EXECUTOR_RESPONSE_NOTIFICATION_TYPE = "executor_response"
EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE = "executor_response_updated"
ORDER_UPDATED_NOTIFICATION_TYPE = "order_updated"
CONTRACT_UPDATED_NOTIFICATION_TYPE = "contract_updated"
CONTRACT_SIGNED_NOTIFICATION_TYPE = "contract_signed"
CANCEL_REQUESTED_NOTIFICATION_TYPE = "cancel_requested"
CANCEL_DECISION_NOTIFICATION_TYPE = "cancel_decision"
ORDER_REFUSED_NOTIFICATION_TYPE = "order_refused"
EXECUTOR_ASSIGNED_NOTIFICATION_TYPE = "executor_assigned"
CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE = "customer_status_changed"
EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE = "executor_status_changed"
WORK_STARTED_NOTIFICATION_TYPE = "work_started"
START_DATE_UPDATED_NOTIFICATION_TYPE = "start_date_updated"
COUNTERPARTY_INFO_UPDATED_NOTIFICATION_TYPE = "counterparty_info_updated"
COMPLAINT_MESSAGE_NOTIFICATION_TYPE = "complaint_message"
PAYMENT_UPDATED_NOTIFICATION_TYPE = "payment_updated"

_NOTIFICATION_COPY = {
    ESTIMATE_UPDATED_NOTIFICATION_TYPE: {
        "title": "Обновление сметы",
        "actor_executor": "Исполнитель {actor} обновил смету по заказу «{order}».",
        "actor_customer": "Заказчик {actor} обновил смету по заказу «{order}».",
    },
    SCHEDULE_UPDATED_NOTIFICATION_TYPE: {
        "title": "Обновление графика работ",
        "actor_executor": "Исполнитель {actor} обновил график работ по заказу «{order}».",
        "actor_customer": "Заказчик {actor} обновил график работ по заказу «{order}».",
    },
    NEW_MESSAGE_NOTIFICATION_TYPE: {
        "title": "Новое сообщение",
        "actor_executor": "Исполнитель {actor} отправил сообщение в чате заказа «{order}».",
        "actor_customer": "Заказчик {actor} отправил сообщение в чате заказа «{order}».",
    },
    EXECUTOR_RESPONSE_NOTIFICATION_TYPE: {
        "title": "Новое предложение от исполнителя",
        "actor_executor": (
            "Исполнитель {actor} отправил предложение по заказу «{order}». "
            "Откройте заказ, чтобы рассмотреть ответ."
        ),
        "actor_customer": (
            "Исполнитель {actor} отправил предложение по заказу «{order}». "
            "Откройте заказ, чтобы рассмотреть ответ."
        ),
    },
    EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE: {
        "title": "Исполнитель обновил предложение",
        "actor_executor": (
            "Исполнитель {actor} обновил предложение по заказу «{order}». "
            "Откройте заказ, чтобы посмотреть изменения."
        ),
        "actor_customer": (
            "Исполнитель {actor} обновил предложение по заказу «{order}». "
            "Откройте заказ, чтобы посмотреть изменения."
        ),
    },
    ORDER_UPDATED_NOTIFICATION_TYPE: {
        "title": "Изменение заказа",
        "actor_executor": "Исполнитель {actor} изменил данные заказа «{order}».",
        "actor_customer": "Заказчик {actor} изменил данные заказа «{order}».",
    },
    CONTRACT_UPDATED_NOTIFICATION_TYPE: {
        "title": "Обновление договора",
        "actor_executor": "Исполнитель {actor} обновил договор по заказу «{order}».",
        "actor_customer": "Заказчик {actor} обновил договор по заказу «{order}».",
    },
    CONTRACT_SIGNED_NOTIFICATION_TYPE: {
        "title": "Подписание договора",
        "actor_executor": "Исполнитель {actor} подписал договор по заказу «{order}».",
        "actor_customer": "Заказчик {actor} подписал договор по заказу «{order}».",
    },
    CANCEL_REQUESTED_NOTIFICATION_TYPE: {
        "title": "Отказ от заказа",
        "actor_executor": "Исполнитель {actor} отказался от заказа «{order}».",
        "actor_customer": "Заказчик {actor} отказался от заказа «{order}».",
    },
    CANCEL_DECISION_NOTIFICATION_TYPE: {
        "title": "Ответ по отмене заказа",
        "actor_executor": (
            "Исполнитель {actor} {detail} на отказ от заказа «{order}»."
        ),
        "actor_customer": (
            "Заказчик {actor} {detail} на отказ от заказа «{order}»."
        ),
    },
    ORDER_REFUSED_NOTIFICATION_TYPE: {
        "title": "Отказ от заказа",
        "actor_executor": "Исполнитель {actor} отказался от заказа «{order}».",
        "actor_customer": "Заказчик {actor} отказался от заказа «{order}».",
    },
    EXECUTOR_ASSIGNED_NOTIFICATION_TYPE: {
        "title": "Вас назначили исполнителем",
        "actor_executor": "Заказчик {actor} назначил вас исполнителем заказа «{order}».",
        "actor_customer": "Заказчик {actor} назначил исполнителя на заказ «{order}».",
    },
    CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE: {
        "title": "Изменение статуса заказа",
        "actor_executor": "Исполнитель {actor} изменил статус заказа «{order}» на «{status}».",
        "actor_customer": (
            "Заказчик {actor} изменил статус заказа «{order}» на «{status}»."
        ),
    },
    EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE: {
        "title": "Изменение статуса услуги",
        "actor_executor": (
            "Исполнитель {actor} изменил статус услуги по заказу «{order}» на «{status}»."
        ),
        "actor_customer": (
            "Исполнитель {actor} изменил статус услуги по заказу «{order}» на «{status}»."
        ),
    },
    WORK_STARTED_NOTIFICATION_TYPE: {
        "title": "Исполнитель приступил к работе",
        "actor_executor": (
            "Исполнитель {actor} приступил к выполнению заказа «{order}»."
        ),
        "actor_customer": (
            "Исполнитель {actor} приступил к выполнению заказа «{order}»."
        ),
    },
    START_DATE_UPDATED_NOTIFICATION_TYPE: {
        "title": "Дата начала работ",
        "actor_executor": (
            "Исполнитель {actor} указал дату начала работ по заказу «{order}»: {detail}."
        ),
        "actor_customer": (
            "Заказчик {actor} указал дату начала работ по заказу «{order}»: {detail}."
        ),
    },
    COUNTERPARTY_INFO_UPDATED_NOTIFICATION_TYPE: {
        "title": "Обновление контактов",
        "actor_executor": (
            "Исполнитель {actor} обновил контактную информацию по заказу «{order}»."
        ),
        "actor_customer": (
            "Заказчик {actor} обновил контактную информацию по заказу «{order}»."
        ),
    },
    COMPLAINT_MESSAGE_NOTIFICATION_TYPE: {
        "title": "Сообщение в споре",
        "actor_executor": (
            "Исполнитель {actor} отправил сообщение в споре по заказу «{order}»."
        ),
        "actor_customer": (
            "Заказчик {actor} отправил сообщение в споре по заказу «{order}»."
        ),
    },
    PAYMENT_UPDATED_NOTIFICATION_TYPE: {
        "title": "Изменение оплаты",
        "actor_executor": (
            "По заказу «{order}» обновлена оплата: {detail}."
        ),
        "actor_customer": (
            "По заказу «{order}» обновлена оплата: {detail}."
        ),
    },
}


def _append_tab_to_path(path: str, tab: Optional[str]) -> str:
    if not tab:
        return path
    separator = "&" if "?" in path else "?"
    return f"{path}{separator}tab={tab}"


def _resolve_notification_tab(
    notification_type: str,
    *,
    recipient_is_customer: bool,
) -> Optional[str]:
    if notification_type in (
        CANCEL_REQUESTED_NOTIFICATION_TYPE,
        CANCEL_DECISION_NOTIFICATION_TYPE,
        ORDER_REFUSED_NOTIFICATION_TYPE,
    ):
        return "customerCancelOrder" if recipient_is_customer else "executorCancelOrder"

    if notification_type == COUNTERPARTY_INFO_UPDATED_NOTIFICATION_TYPE:
        return "executorInfo" if recipient_is_customer else "customerInfo"

    static_tabs = {
        ESTIMATE_UPDATED_NOTIFICATION_TYPE: "estimateWorks",
        SCHEDULE_UPDATED_NOTIFICATION_TYPE: "schedule",
        NEW_MESSAGE_NOTIFICATION_TYPE: "chat",
        EXECUTOR_RESPONSE_NOTIFICATION_TYPE: "orderResponesExecutors",
        EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE: "orderResponesExecutors",
        ORDER_UPDATED_NOTIFICATION_TYPE: "orderInfo",
        CONTRACT_UPDATED_NOTIFICATION_TYPE: "customerExecutorContract",
        CONTRACT_SIGNED_NOTIFICATION_TYPE: "customerExecutorContract",
        COMPLAINT_MESSAGE_NOTIFICATION_TYPE: "complaints",
        PAYMENT_UPDATED_NOTIFICATION_TYPE: "payment",
        WORK_STARTED_NOTIFICATION_TYPE: "schedule",
        START_DATE_UPDATED_NOTIFICATION_TYPE: "orderInfo",
        EXECUTOR_ASSIGNED_NOTIFICATION_TYPE: "orderInfo",
        CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE: "orderInfo",
        EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE: "orderInfo",
        CUSTOMER_OFFER_NOTIFICATION_TYPE: "orderInfo",
        PROPOSAL_ACCEPTED_NOTIFICATION_TYPE: "orderInfo",
    }
    return static_tabs.get(notification_type)


async def get_user_notifications(
    db: AsyncSession,
    user_id: int,
    *,
    unread_only: bool = False,
    limit: int = 50,
) -> tuple[list[Notification], int]:
    filters = [Notification.user_id == user_id]
    if unread_only:
        filters.append(Notification.is_read.is_(False))

    unread_count_result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
    )
    unread_count = unread_count_result.scalar_one()

    result = await db.execute(
        select(Notification)
        .where(*filters)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all()), unread_count


async def mark_notification_read(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification:
    notification = await _get_notification_for_user(db, notification_id, user_id)
    if not notification.is_read:
        notification.is_read = True
        await db.flush()
    return notification


async def acknowledge_notification(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
    reaction: str,
) -> int:
    if reaction not in ALLOWED_REACTIONS:
        raise HTTPException(
            status_code=400,
            detail="Недопустимая реакция. Допустимо: understood, find_other_orders, view_offer, view_wait_execute, open_order",
        )

    await _get_notification_for_user(db, notification_id, user_id)
    result = await db.execute(
        delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    await db.flush()
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return notification_id


async def mark_all_notifications_read(
    db: AsyncSession,
    user_id: int,
) -> int:
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.flush()
    return result.rowcount or 0


def _format_user_name(user: User) -> str:
    return (
        " ".join(part for part in (user.first_name, user.last_name) if part).strip()
        or "Пользователь"
    )


def format_cancel_decision_detail(
    status: Optional[str],
    comment: Optional[str] = None,
) -> str:
    normalized = (status or "").strip().lower()
    if normalized == "agree":
        return "согласен"
    if normalized == "disagree":
        return "не согласен"
    if comment and comment.strip():
        return comment.strip()
    return "ответил"


def _is_customer_offer_status(status: Optional[str]) -> bool:
    return CUSTOMER_OFFER_STATUS in (status or "")


def _is_wait_execute_status(status: Optional[str]) -> bool:
    return WAIT_EXECUTE_STATUS in (status or "")


async def is_order_in_wait_execute(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> bool:
    customer_result = await db.execute(
        select(StatusOrderCustomer.status).where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
    )
    executor_result = await db.execute(
        select(StatusOrderExecutor.status).where(
            StatusOrderExecutor.order_id == order_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
    )
    customer_status = customer_result.scalar_one_or_none()
    executor_status = executor_result.scalar_one_or_none()
    return _is_wait_execute_status(customer_status) or _is_wait_execute_status(
        executor_status
    )


def _is_consideration_status(status: Optional[str]) -> bool:
    return CONSIDERATION_STATUS in (status or "")


def is_in_progress_status(status: Optional[str]) -> bool:
    return "В процессе" in (status or "")


def _is_in_progress_status(status: Optional[str]) -> bool:
    return is_in_progress_status(status)


def _is_cancel_refusal_executor_status(status: Optional[str]) -> bool:
    normalized = status or ""
    return "Отказано заказчиком" in normalized or "Отказ от заказа" in normalized


async def _get_executor_service_route(
    db: AsyncSession,
    executor_id: int,
    order_id: int,
) -> str:
    result = await db.execute(
        select(StatusOrderExecutor.status)
        .where(
            StatusOrderExecutor.order_id == order_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
        .order_by(StatusOrderExecutor.id.desc())
        .limit(1)
    )
    status = result.scalar_one_or_none() or ""
    if "Предложения" in status:
        return "offer"
    if "На рассмотрении" in status:
        return "consideration_customer"
    if "Ожидают" in status:
        return "wait_execute_work"
    if "В процессе" in status:
        return "continue_execute_work"
    if "Выполнен" in status:
        return "execute_work"
    if "Отказано заказчиком" in status:
        return "refused_by_customer"
    if "Отказ от заказа" in status:
        return "refused_by_order"
    return "wait_execute_work"


async def _build_action_path(
    db: AsyncSession,
    *,
    recipient_id: int,
    order_id: int,
    customer_id: int,
    tab: Optional[str] = None,
) -> str:
    if recipient_id == customer_id:
        path = f"/profile/orders/{order_id}"
    else:
        route = await _get_executor_service_route(db, recipient_id, order_id)
        path = f"/profile/services/{route}/{order_id}"
    return _append_tab_to_path(path, tab)


async def _resolve_counterparty_user_id(
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
) -> Optional[int]:
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        return None

    if actor_user_id == order.customer_id:
        executor_id = await _resolve_executor_id_for_order(db, order_id)
        if executor_id and executor_id != actor_user_id:
            return executor_id
        return None

    if order.customer_id and order.customer_id != actor_user_id:
        return order.customer_id

    return None


async def _resolve_executor_id_for_order(
    db: AsyncSession,
    order_id: int,
    *,
    preferred_executor_id: Optional[int] = None,
) -> Optional[int]:
    if preferred_executor_id:
        return preferred_executor_id

    executor_result = await db.execute(
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    executor_id = executor_result.scalar_one_or_none()
    if executor_id:
        return executor_id

    status_result = await db.execute(
        select(StatusOrderExecutor.executor_id)
        .where(StatusOrderExecutor.order_id == order_id)
        .order_by(StatusOrderExecutor.id.desc())
        .limit(1)
    )
    return status_result.scalar_one_or_none()


async def _replace_unread_notification(
    db: AsyncSession,
    *,
    user_id: int,
    order_id: int,
    notification_type: str,
) -> None:
    await db.execute(
        delete(Notification).where(
            Notification.user_id == user_id,
            Notification.order_id == order_id,
            Notification.notification_type == notification_type,
            Notification.is_read.is_(False),
        )
    )


async def clear_cancel_notifications_for_order(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> None:
    cancel_types = (
        CANCEL_REQUESTED_NOTIFICATION_TYPE,
        CANCEL_DECISION_NOTIFICATION_TYPE,
        ORDER_REFUSED_NOTIFICATION_TYPE,
    )
    await db.execute(
        delete(Notification).where(
            Notification.order_id == order_id,
            Notification.user_id.in_([customer_id, executor_id]),
            Notification.notification_type.in_(cancel_types),
        )
    )
    await db.flush()


async def _create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    order_id: int,
    order_title: str,
    notification_type: str,
    title: str,
    message: str,
    action_path: Optional[str],
    replace_unread: bool = True,
) -> None:
    if replace_unread:
        await _replace_unread_notification(
            db,
            user_id=user_id,
            order_id=order_id,
            notification_type=notification_type,
        )

    db.add(
        Notification(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            order_id=order_id,
            order_title=order_title,
            action_path=action_path,
            is_read=False,
        )
    )
    await db.flush()


async def clear_cancel_notifications_for_order(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> None:
    cancel_types = (
        CANCEL_REQUESTED_NOTIFICATION_TYPE,
        CANCEL_DECISION_NOTIFICATION_TYPE,
        ORDER_REFUSED_NOTIFICATION_TYPE,
    )
    await db.execute(
        delete(Notification).where(
            Notification.order_id == order_id,
            Notification.user_id.in_([customer_id, executor_id]),
            Notification.notification_type.in_(cancel_types),
        )
    )
    await db.flush()


async def notify_order_event(
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
    notification_type: str,
    extra_format: Optional[dict] = None,
    recipient_id: Optional[int] = None,
    action_path: Optional[str] = None,
    replace_unread: bool = True,
) -> None:
    if notification_type not in _NOTIFICATION_COPY:
        return

    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        return

    if recipient_id is None:
        recipient_id = await _resolve_counterparty_user_id(
            db,
            order_id=order_id,
            actor_user_id=actor_user_id,
        )
    if not recipient_id or recipient_id == actor_user_id:
        return

    actor_result = await db.execute(select(User).where(User.id == actor_user_id))
    actor = actor_result.scalar_one_or_none()
    if not actor:
        return

    order_title = order.title or f"№ {order_id}"
    actor_name = _format_user_name(actor)
    copy = _NOTIFICATION_COPY[notification_type]
    message_key = (
        "actor_customer"
        if actor_user_id == order.customer_id
        else "actor_executor"
    )
    format_args = {
        "actor": actor_name,
        "order": order_title,
        "status": "",
        "detail": "",
    }
    if extra_format:
        format_args.update(extra_format)

    resolved_action_path = action_path
    tab = _resolve_notification_tab(
        notification_type,
        recipient_is_customer=recipient_id == order.customer_id,
    )
    if resolved_action_path is None:
        resolved_action_path = await _build_action_path(
            db,
            recipient_id=recipient_id,
            order_id=order_id,
            customer_id=order.customer_id,
            tab=tab,
        )
    elif tab and "tab=" not in resolved_action_path:
        resolved_action_path = _append_tab_to_path(resolved_action_path, tab)

    await _create_notification(
        db,
        user_id=recipient_id,
        order_id=order_id,
        order_title=order_title,
        notification_type=notification_type,
        title=copy["title"],
        message=copy[message_key].format(**format_args),
        action_path=resolved_action_path,
        replace_unread=replace_unread,
    )


async def notify_order_event_safe(
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
    notification_type: str,
    **kwargs,
) -> None:
    try:
        await notify_order_event(
            db,
            order_id=order_id,
            actor_user_id=actor_user_id,
            notification_type=notification_type,
            **kwargs,
        )
    except Exception as error:
        logger.warning(
            "notify %s failed order_id=%s actor=%s: %s",
            notification_type,
            order_id,
            actor_user_id,
            error,
        )


async def notify_executor_customer_offer(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    order_result = await db.execute(
        select(Order, User)
        .join(User, User.id == Order.customer_id)
        .where(Order.id == order_id)
    )
    row = order_result.first()
    if not row:
        return

    order, customer = row
    order_title = order.title or f"№ {order_id}"
    customer_name = _format_user_name(customer)
    action_path = _append_tab_to_path(f"/profile/services/offer/{order_id}", "orderInfo")

    await _create_notification(
        db,
        user_id=executor_id,
        order_id=order_id,
        order_title=order_title,
        notification_type=CUSTOMER_OFFER_NOTIFICATION_TYPE,
        title="Новое предложение от заказчика",
        message=(
            f"Заказчик {customer_name} предложил вам заказ «{order_title}». "
            "Откройте предложение, чтобы посмотреть детали и ответить."
        ),
        action_path=action_path,
    )


async def notify_customer_executor_response(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    is_update: bool = False,
) -> None:
    notification_type = (
        EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE
        if is_update
        else EXECUTOR_RESPONSE_NOTIFICATION_TYPE
    )
    await notify_order_event(
        db,
        order_id=order_id,
        actor_user_id=executor_id,
        notification_type=notification_type,
        action_path=_append_tab_to_path(
            f"/profile/orders/{order_id}", "orderResponesExecutors"
        ),
    )


async def notify_executor_on_status_change(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:
        return

    if _is_customer_offer_status(new_status) and not _is_customer_offer_status(
        previous_status
    ):
        await notify_executor_customer_offer(
            db=db,
            executor_id=executor_id,
            order_id=order_id,
        )
        return

    if _is_wait_execute_status(new_status) and not _is_wait_execute_status(
        previous_status
    ):
        await notify_executor_proposal_accepted(
            db=db,
            executor_id=executor_id,
            order_id=order_id,
        )
        return

    if _is_in_progress_status(new_status) and not _is_in_progress_status(
        previous_status
    ):
        await notify_order_event_safe(
            db,
            order_id=order_id,
            actor_user_id=executor_id,
            notification_type=WORK_STARTED_NOTIFICATION_TYPE,
        )
        await _clear_executor_spurious_work_start_notifications(
            db,
            executor_id=executor_id,
            order_id=order_id,
        )
        return

    await notify_customer_on_executor_status_change(
        db=db,
        executor_id=executor_id,
        order_id=order_id,
        previous_status=previous_status,
        new_status=new_status,
    )


async def notify_customer_on_executor_status_change(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:
        return

    if _is_customer_offer_status(new_status) or _is_wait_execute_status(new_status):
        return

    if _is_consideration_status(new_status):
        return

    if _is_cancel_refusal_executor_status(new_status):
        return

    await notify_order_event_safe(
        db,
        order_id=order_id,
        actor_user_id=executor_id,
        notification_type=EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,
        extra_format={"status": new_status},
    )


async def _get_executor_order_status(
    db: AsyncSession,
    *,
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


async def notify_customer_on_customer_status_change(
    db: AsyncSession,
    *,
    customer_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:
        return

    if _is_wait_execute_status(new_status):
        return

    executor_id = await _resolve_executor_id_for_order(db, order_id)

    if _is_in_progress_status(new_status):
        if executor_id:
            await _clear_executor_spurious_work_start_notifications(
                db,
                executor_id=executor_id,
                order_id=order_id,
            )
        return

    if executor_id:
        executor_status = await _get_executor_order_status(
            db,
            order_id=order_id,
            executor_id=executor_id,
        )
        if _is_in_progress_status(executor_status):
            await _clear_executor_spurious_work_start_notifications(
                db,
                executor_id=executor_id,
                order_id=order_id,
            )
            return

    if not executor_id:
        return


async def _clear_executor_spurious_work_start_notifications(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    await db.execute(
        delete(Notification).where(
            Notification.user_id == executor_id,
            Notification.order_id == order_id,
            Notification.notification_type.in_(
                (
                    CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE,
                    EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,
                    WORK_STARTED_NOTIFICATION_TYPE,
                )
            ),
        )
    )
    await db.flush()


async def _clear_executor_acceptance_duplicates(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    duplicate_types = (
        CUSTOMER_OFFER_NOTIFICATION_TYPE,
        CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE,
        EXECUTOR_ASSIGNED_NOTIFICATION_TYPE,
        EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,
    )
    await db.execute(
        delete(Notification).where(
            Notification.user_id == executor_id,
            Notification.order_id == order_id,
            Notification.notification_type.in_(duplicate_types),
        )
    )
    await db.flush()


async def notify_executor_proposal_accepted(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    order_result = await db.execute(
        select(Order, User)
        .join(User, User.id == Order.customer_id)
        .where(Order.id == order_id)
    )
    row = order_result.first()
    if not row:
        return

    order, customer = row
    order_title = order.title or f"№ {order_id}"
    customer_name = _format_user_name(customer)
    action_path = _append_tab_to_path(
        f"/profile/services/wait_execute_work/{order_id}", "orderInfo"
    )

    await _clear_executor_acceptance_duplicates(
        db=db,
        executor_id=executor_id,
        order_id=order_id,
    )

    await _create_notification(
        db,
        user_id=executor_id,
        order_id=order_id,
        order_title=order_title,
        notification_type=PROPOSAL_ACCEPTED_NOTIFICATION_TYPE,
        title="Заказчик принял ваше предложение",
        message=(
            f"Заказчик {customer_name} принял ваше предложение по заказу "
            f"«{order_title}». Заказ переведён в статус «Ожидают выполнения»."
        ),
        action_path=action_path,
        replace_unread=False,
    )


async def notify_complaint_message(
    db: AsyncSession,
    *,
    order_id: int,
    sender_user_id: int,
    sender_type: str,
) -> None:
    if sender_type == "admin":
        return

    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        return

    executor_id = await _resolve_executor_id_for_order(db, order_id)
    recipients: list[int] = []
    if order.customer_id and order.customer_id != sender_user_id:
        recipients.append(order.customer_id)
    if executor_id and executor_id != sender_user_id:
        recipients.append(executor_id)

    for recipient_id in recipients:
        await notify_order_event_safe(
            db,
            order_id=order_id,
            actor_user_id=sender_user_id,
            notification_type=COMPLAINT_MESSAGE_NOTIFICATION_TYPE,
            recipient_id=recipient_id,
        )


async def notify_payment_event(
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
    detail: str,
    recipient_id: Optional[int] = None,
) -> None:
    await notify_order_event_safe(
        db,
        order_id=order_id,
        actor_user_id=actor_user_id,
        notification_type=PAYMENT_UPDATED_NOTIFICATION_TYPE,
        extra_format={"detail": detail},
        recipient_id=recipient_id,
    )


async def resolve_order_id_for_parties(
    db: AsyncSession,
    *,
    customer_id: int,
    executor_id: int,
) -> Optional[int]:
    result = await db.execute(
        select(Order.id)
        .join(ExecutorOrder, ExecutorOrder.order_id == Order.id)
        .where(
            Order.customer_id == customer_id,
            ExecutorOrder.executor_id == executor_id,
        )
        .order_by(Order.updated_at.desc(), Order.id.desc())
        .limit(1)
    )
    order_id = result.scalar_one_or_none()
    if order_id:
        return order_id

    status_result = await db.execute(
        select(StatusOrderExecutor.order_id)
        .join(Order, Order.id == StatusOrderExecutor.order_id)
        .where(
            Order.customer_id == customer_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
        .order_by(StatusOrderExecutor.id.desc())
        .limit(1)
    )
    return status_result.scalar_one_or_none()


async def notify_counterparty_info_updated(
    db: AsyncSession,
    *,
    customer_id: int,
    executor_id: int,
    actor_user_id: int,
) -> None:
    order_id = await resolve_order_id_for_parties(
        db,
        customer_id=customer_id,
        executor_id=executor_id,
    )
    if not order_id:
        return

    recipient_id = executor_id if actor_user_id == customer_id else customer_id
    if recipient_id == actor_user_id:
        return

    await notify_order_event_safe(
        db,
        order_id=order_id,
        actor_user_id=actor_user_id,
        notification_type=COUNTERPARTY_INFO_UPDATED_NOTIFICATION_TYPE,
        recipient_id=recipient_id,
    )


async def _get_notification_for_user(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return notification

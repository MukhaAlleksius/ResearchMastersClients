import html  # Экранирование текста писем
import logging  # Логирование ошибок уведомлений
from typing import Optional  # Опциональные параметры

from fastapi import HTTPException  # HTTP-ошибки API
from sqlalchemy import delete, func, select, update  # SQL DML/SELECT
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.email import build_app_link, send_email  # Письма контрагенту

from models.orders_models import (  # Заказы, статусы, Notification
    ExecutorOrder,  # назначение исполнителя на заказ
    Notification,  # ORM уведомления
    Order,  # ORM заказа
    StatusOrderCustomer,  # статус заказчика
    StatusOrderExecutor,  # статус исполнителя
)
from models.users_models import User  # ORM User

logger = logging.getLogger(__name__)  # Логгер модуля notifications_crud

ALLOWED_REACTIONS = {  # Допустимые реакции на уведомление
    "understood",  # понял
    "find_other_orders",  # искать другие заказы
    "view_offer",  # открыть предложение
    "view_wait_execute",  # перейти к ожиданию выполнения
    "open_order",  # открыть заказ
}

CUSTOMER_OFFER_STATUS = "Предложения заказчиков"  # Статус: предложение от заказчика
WAIT_EXECUTE_STATUS = "Ожидают выполнения"  # Статус: ожидание выполнения
CONSIDERATION_STATUS = "На рассмотрении заказчика"  # Статус: на рассмотрении

CUSTOMER_OFFER_NOTIFICATION_TYPE = "customer_order_offer"  # Тип: предложение заказчика
PROPOSAL_ACCEPTED_NOTIFICATION_TYPE = (
    "customer_accepted_proposal"  # Тип: принято предложение
)
ORDER_DELETED_NOTIFICATION_TYPE = "order_deleted_by_customer"  # Тип: заказ удалён
ESTIMATE_UPDATED_NOTIFICATION_TYPE = "estimate_updated"  # Тип: обновлена смета
SCHEDULE_UPDATED_NOTIFICATION_TYPE = "schedule_updated"  # Тип: обновлён график
NEW_MESSAGE_NOTIFICATION_TYPE = "new_message"  # Тип: новое сообщение в чате
EXECUTOR_RESPONSE_NOTIFICATION_TYPE = "executor_response"  # Тип: ответ исполнителя
EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE = (
    "executor_response_updated"  # Тип: обновлён ответ
)
ORDER_UPDATED_NOTIFICATION_TYPE = "order_updated"  # Тип: изменён заказ
CONTRACT_UPDATED_NOTIFICATION_TYPE = "contract_updated"  # Тип: обновлён договор
CONTRACT_SIGNED_NOTIFICATION_TYPE = "contract_signed"  # Тип: подписан договор
CANCEL_REQUESTED_NOTIFICATION_TYPE = "cancel_requested"  # Тип: запрос отмены
CANCEL_DECISION_NOTIFICATION_TYPE = "cancel_decision"  # Тип: решение по отмене
ORDER_REFUSED_NOTIFICATION_TYPE = "order_refused"  # Тип: отказ от заказа
EXECUTOR_ASSIGNED_NOTIFICATION_TYPE = "executor_assigned"  # Тип: назначен исполнитель
CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE = (
    "customer_status_changed"  # Тип: статус заказчика
)
EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE = (
    "executor_status_changed"  # Тип: статус исполнителя
)
WORK_STARTED_NOTIFICATION_TYPE = "work_started"  # Тип: работа начата
ORDER_COMPLETED_NOTIFICATION_TYPE = "order_completed"  # Тип: заказ выполнен
START_DATE_UPDATED_NOTIFICATION_TYPE = "start_date_updated"  # Тип: дата начала
COMPLAINT_MESSAGE_NOTIFICATION_TYPE = "complaint_message"  # Тип: сообщение в споре
PAYMENT_UPDATED_NOTIFICATION_TYPE = "payment_updated"  # Тип: изменена оплата

# Важные события — дублируем in-app уведомление письмом второй стороне.
EMAIL_NOTIFICATION_TYPES = frozenset(
    {
        CANCEL_REQUESTED_NOTIFICATION_TYPE,
        CANCEL_DECISION_NOTIFICATION_TYPE,
        ORDER_REFUSED_NOTIFICATION_TYPE,
        ORDER_DELETED_NOTIFICATION_TYPE,
        PROPOSAL_ACCEPTED_NOTIFICATION_TYPE,
    }
)

# Фрагмент статуса исполнителя → сегмент URL услуги
_EXECUTOR_SERVICE_ROUTES = (
    ("Предложения", "offer"),
    ("На рассмотрении", "consideration_customer"),
    ("Ожидают", "wait_execute_work"),
    ("В процессе", "continue_execute_work"),
    ("Выполнен", "execute_work"),
    ("Отказано заказчиком", "refused_by_customer"),
    ("Отказ от заказа", "refused_by_order"),
)


def _copy(title: str, executor: str, customer: Optional[str] = None) -> dict:
    """Шаблон заголовка и текстов: исполнитель / заказчик (если customer не задан — один текст)."""
    return {
        "title": title,
        "actor_executor": executor,
        "actor_customer": customer if customer is not None else executor,
    }


_NOTIFICATION_COPY = {  # Шаблоны заголовков и текстов по типам уведомлений
    ESTIMATE_UPDATED_NOTIFICATION_TYPE: _copy(
        "Обновление сметы",
        "Исполнитель {actor} обновил смету по заказу «{order}».",
        "Заказчик {actor} обновил смету по заказу «{order}».",
    ),
    SCHEDULE_UPDATED_NOTIFICATION_TYPE: _copy(
        "Обновление выполненных работ",
        "Исполнитель {actor} обновил выполненные работы по заказу «{order}».",
        "Заказчик {actor} обновил выполненные работы по заказу «{order}».",
    ),
    NEW_MESSAGE_NOTIFICATION_TYPE: _copy(
        "Новое сообщение",
        "Исполнитель {actor} отправил сообщение в чате заказа «{order}».",
        "Заказчик {actor} отправил сообщение в чате заказа «{order}».",
    ),
    EXECUTOR_RESPONSE_NOTIFICATION_TYPE: _copy(
        "Новое предложение от исполнителя",
        "Исполнитель {actor} отправил предложение по заказу «{order}». "
        "Откройте заказ, чтобы рассмотреть ответ.",
    ),
    EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE: _copy(
        "Исполнитель обновил предложение",
        "Исполнитель {actor} обновил предложение по заказу «{order}». "
        "Откройте заказ, чтобы посмотреть изменения.",
    ),
    ORDER_UPDATED_NOTIFICATION_TYPE: _copy(
        "Изменение заказа",
        "Исполнитель {actor} изменил данные заказа «{order}».",
        "Заказчик {actor} изменил данные заказа «{order}».",
    ),
    CONTRACT_UPDATED_NOTIFICATION_TYPE: _copy(
        "Обновление договора",
        "Исполнитель {actor} обновил договор по заказу «{order}».",
        "Заказчик {actor} обновил договор по заказу «{order}».",
    ),
    CONTRACT_SIGNED_NOTIFICATION_TYPE: _copy(
        "Подписание договора",
        "Исполнитель {actor} подписал договор по заказу «{order}».",
        "Заказчик {actor} подписал договор по заказу «{order}».",
    ),
    CANCEL_REQUESTED_NOTIFICATION_TYPE: _copy(
        "Отказ от заказа",
        "Исполнитель {actor} отказался от заказа «{order}».",
        "Заказчик {actor} отказался от заказа «{order}».",
    ),
    CANCEL_DECISION_NOTIFICATION_TYPE: _copy(
        "Ответ по отмене заказа",
        "Исполнитель {actor} {detail} на отказ от заказа «{order}».",
        "Заказчик {actor} {detail} на отказ от заказа «{order}».",
    ),
    ORDER_REFUSED_NOTIFICATION_TYPE: _copy(
        "Отказ от заказа",
        "Исполнитель {actor} отказался от заказа «{order}».",
        "Заказчик {actor} отказался от заказа «{order}».",
    ),
    EXECUTOR_ASSIGNED_NOTIFICATION_TYPE: _copy(
        "Вас назначили исполнителем",
        "Заказчик {actor} назначил вас исполнителем заказа «{order}».",
        "Заказчик {actor} назначил исполнителя на заказ «{order}».",
    ),
    CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE: _copy(
        "Изменение статуса заказа",
        "Исполнитель {actor} изменил статус заказа «{order}» на «{status}».",
        "Заказчик {actor} изменил статус заказа «{order}» на «{status}».",
    ),
    EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE: _copy(
        "Изменение статуса услуги",
        "Исполнитель {actor} изменил статус услуги по заказу «{order}» на «{status}».",
    ),
    WORK_STARTED_NOTIFICATION_TYPE: _copy(
        "Исполнитель приступил к работе",
        "Исполнитель {actor} приступил к выполнению заказа «{order}».",
    ),
    ORDER_COMPLETED_NOTIFICATION_TYPE: _copy(
        "Заказ выполнен",
        "Исполнитель {actor} отметил заказ «{order}» выполненным.",
        "Заказчик {actor} отметил заказ «{order}» выполненным.",
    ),
    START_DATE_UPDATED_NOTIFICATION_TYPE: _copy(
        "Дата начала работ",
        "Исполнитель {actor} указал дату начала работ по заказу «{order}»: {detail}.",
        "Заказчик {actor} указал дату начала работ по заказу «{order}»: {detail}.",
    ),
    COMPLAINT_MESSAGE_NOTIFICATION_TYPE: _copy(
        "Сообщение в споре",
        "Исполнитель {actor} отправил сообщение в споре по заказу «{order}».",
        "Заказчик {actor} отправил сообщение в споре по заказу «{order}».",
    ),
    PAYMENT_UPDATED_NOTIFICATION_TYPE: _copy(
        "Изменение оплаты",
        "По заказу «{order}» обновлена оплата: {detail}.",
    ),
}


def _append_tab_to_path(
    path: str, tab: Optional[str]
) -> str:  # Добавить query-параметр tab к URL
    if not tab:
        return path
    separator = "&" if "?" in path else "?"
    return f"{path}{separator}tab={tab}"


def _resolve_notification_tab(  # Вкладка UI для типа уведомления
    notification_type: str,
    *,
    recipient_is_customer: bool,
) -> Optional[str]:
    from core.notification_tabs import resolve_notification_tab

    return resolve_notification_tab(
        notification_type,
        recipient_is_customer=recipient_is_customer,
    )


def _format_user_name(user: User) -> str:  # «Имя Фамилия» или «Пользователь»
    name = " ".join(part for part in (user.first_name, user.last_name) if part).strip()
    return name or "Пользователь"


def _status_has(
    status: Optional[str], fragment: str
) -> bool:  # Есть ли фрагмент в статусе
    return fragment in (status or "")


def format_cancel_decision_detail(  # Текст решения по отмене для шаблона
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


def is_in_progress_status(status: Optional[str]) -> bool:  # Статус «В процессе»
    return _status_has(status, "В процессе")


def _is_completed_status(status: Optional[str]) -> bool:  # Статус «Выполнен»
    return _status_has(status, "Выполнен")


def _is_cancel_refusal_executor_status(
    status: Optional[str],
) -> bool:  # Отказ / отказано заказчиком
    return _status_has(status, "Отказано заказчиком") or _status_has(
        status, "Отказ от заказа"
    )


async def _get_notification_for_user(  # Уведомление с проверкой владельца
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


async def get_user_notifications(  # Список уведомлений пользователя + счётчик непрочитанных
    db: AsyncSession,
    user_id: int,
    *,
    unread_only: bool = False,
    limit: int = 50,
) -> tuple[list[Notification], int]:
    filters = [Notification.user_id == user_id]
    if unread_only:
        filters.append(Notification.is_read.is_(False))

    unread_count = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
        )
    ).scalar_one()

    result = await db.execute(
        select(Notification)
        .where(*filters)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all()), unread_count


async def mark_notification_read(  # Пометить одно уведомление прочитанным
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification:
    notification = await _get_notification_for_user(db, notification_id, user_id)
    if not notification.is_read:
        notification.is_read = True
        await db.flush()
    return notification


async def acknowledge_notification(  # Реакция на уведомление → удаление записи
    db: AsyncSession,
    notification_id: int,
    user_id: int,
    reaction: str,
) -> int:
    if reaction not in ALLOWED_REACTIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Недопустимая реакция. Допустимо: understood, find_other_orders, "
                "view_offer, view_wait_execute, open_order"
            ),
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
    db: AsyncSession, user_id: int
) -> int:  # Прочитать все уведомления пользователя
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


async def _latest_executor_status(  # Последний статус исполнителя по заказу
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


async def is_order_in_wait_execute(  # Заказ в статусе «ожидают выполнения» у стороны
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> bool:
    customer_status = (
        await db.execute(
            select(StatusOrderCustomer.status).where(
                StatusOrderCustomer.order_id == order_id,
                StatusOrderCustomer.customer_id == customer_id,
            )
        )
    ).scalar_one_or_none()
    executor_status = (
        await db.execute(
            select(StatusOrderExecutor.status).where(
                StatusOrderExecutor.order_id == order_id,
                StatusOrderExecutor.executor_id == executor_id,
            )
        )
    ).scalar_one_or_none()
    return _status_has(customer_status, WAIT_EXECUTE_STATUS) or _status_has(
        executor_status, WAIT_EXECUTE_STATUS
    )


async def _get_executor_service_route(  # Сегмент URL услуги исполнителя по статусу
    db: AsyncSession,
    executor_id: int,
    order_id: int,
) -> str:
    status = await _latest_executor_status(db, order_id, executor_id) or ""
    for fragment, route in _EXECUTOR_SERVICE_ROUTES:
        if fragment in status:
            return route
    return "wait_execute_work"


async def _build_action_path(  # URL перехода из уведомления
    db: AsyncSession,
    *,
    recipient_id: int,
    order_id: int,
    customer_id: int,
    tab: Optional[str] = None,
) -> str:
    if recipient_id == customer_id:  # получатель — заказчик
        path = f"/profile/orders/{order_id}"
    else:  # исполнитель
        route = await _get_executor_service_route(db, recipient_id, order_id)
        path = f"/profile/services/{route}/{order_id}"
    return _append_tab_to_path(path, tab)


async def _resolve_executor_id_for_order(  # id исполнителя по заказу
    db: AsyncSession,
    order_id: int,
    *,
    preferred_executor_id: Optional[int] = None,
) -> Optional[int]:
    if preferred_executor_id:  # явно передан
        return preferred_executor_id

    executor_id = (
        await db.execute(
            select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
        )
    ).scalar_one_or_none()
    if executor_id:
        return executor_id

    result = await db.execute(
        select(StatusOrderExecutor.executor_id)
        .where(StatusOrderExecutor.order_id == order_id)
        .order_by(StatusOrderExecutor.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _resolve_counterparty_user_id(  # id второй стороны заказа
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
) -> Optional[int]:
    order = (
        await db.execute(select(Order).where(Order.id == order_id))
    ).scalar_one_or_none()
    if not order:
        return None

    if actor_user_id == order.customer_id:  # актор — заказчик → исполнитель
        executor_id = await _resolve_executor_id_for_order(db, order_id)
        if executor_id and executor_id != actor_user_id:
            return executor_id
        return None

    if (
        order.customer_id and order.customer_id != actor_user_id
    ):  # актор — исполнитель → заказчик
        return order.customer_id
    return None


async def _delete_user_order_notifications(  # Удалить уведомления пользователя по заказу и типам
    db: AsyncSession,
    *,
    user_id: int,
    order_id: int,
    notification_types: tuple[str, ...],
    unread_only: bool = False,
) -> None:
    filters = [
        Notification.user_id == user_id,
        Notification.order_id == order_id,
        Notification.notification_type.in_(notification_types),
    ]
    if unread_only:
        filters.append(Notification.is_read.is_(False))
    await db.execute(delete(Notification).where(*filters))


async def _replace_unread_notification(  # Удалить непрочитанное того же типа по заказу
    db: AsyncSession,
    *,
    user_id: int,
    order_id: int,
    notification_type: str,
) -> None:
    await _delete_user_order_notifications(
        db,
        user_id=user_id,
        order_id=order_id,
        notification_types=(notification_type,),
        unread_only=True,
    )


async def clear_cancel_notifications_for_order(  # Очистить уведомления об отмене по заказу
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: Optional[int] = None,
    executor_id: Optional[int] = None,
) -> None:
    filters = [
        Notification.order_id == order_id,
        Notification.notification_type.in_(
            (
                CANCEL_REQUESTED_NOTIFICATION_TYPE,
                CANCEL_DECISION_NOTIFICATION_TYPE,
                ORDER_REFUSED_NOTIFICATION_TYPE,
            )
        ),
    ]
    user_ids = [user_id for user_id in (customer_id, executor_id) if user_id]
    if user_ids:
        filters.append(Notification.user_id.in_(user_ids))
    await db.execute(delete(Notification).where(*filters))
    await db.flush()


def should_email_notification(notification_type: str) -> bool:
    return notification_type in EMAIL_NOTIFICATION_TYPES


def _notification_email_html(
    title: str, message: str, link: Optional[str]
) -> str:
    safe_title = html.escape(title)
    safe_message = html.escape(message)
    button = ""
    if link:
        safe_link = html.escape(link, quote=True)
        button = (
            f'<p><a href="{safe_link}" style="display:inline-block;padding:10px 16px;'
            'background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;">'
            "Открыть в Fixer</a></p>"
        )
    return (
        "<!DOCTYPE html><html><body "
        'style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">'
        f"<h2>{safe_title}</h2><p>{safe_message}</p>{button}"
        '<p style="color:#6b7280;font-size:12px">'
        "Это автоматическое письмо. Отвечать на него не нужно.</p>"
        "</body></html>"
    )


async def _send_notification_email(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    message: str,
    action_path: Optional[str],
) -> None:
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user or not user.email:
        return

    link = build_app_link(action_path)
    text_body = message
    if action_path:
        text_body = f"{message}\n\nОткрыть: {link}"

    try:
        await send_email(
            to_email=user.email,
            subject=title,
            text_body=text_body,
            html_body=_notification_email_html(title, message, link if action_path else None),
        )
    except Exception as error:
        logger.warning(
            "notification email failed user_id=%s title=%s: %s",
            user_id,
            title,
            error,
        )


async def _create_notification(  # INSERT уведомления (с опциональной заменой unread)
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
    if replace_unread:  # убрать старое непрочитанное того же типа
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

    if should_email_notification(notification_type):
        await _send_notification_email(
            db,
            user_id=user_id,
            title=title,
            message=message,
            action_path=action_path,
        )


async def notify_executors_order_deleted(
    db: AsyncSession,
    *,
    order_id: int,
    order_title: str,
    customer_id: int,
    executor_ids: set[int],
) -> None:
    title = "Заказ удалён заказчиком"
    message = (
        f"Заказчик удалил заказ «{order_title}». "
        "Смета, отклики, переписка и договор по заказу удалены."
    )
    for executor_id in executor_ids:
        if not executor_id or executor_id == customer_id:
            continue
        await _create_notification(
            db,
            user_id=executor_id,
            order_id=order_id,
            order_title=order_title,
            notification_type=ORDER_DELETED_NOTIFICATION_TYPE,
            title=title,
            message=message,
            action_path=None,
            replace_unread=False,
        )


async def _load_order_and_customer(  # Заказ и его заказчик одной выборкой
    db: AsyncSession, order_id: int
) -> Optional[tuple[Order, User]]:
    result = await db.execute(
        select(Order, User)
        .join(User, User.id == Order.customer_id)
        .where(Order.id == order_id)
    )
    return result.first()


async def notify_order_event(  # Уведомление контрагента о событии по заказу
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
    copy = _NOTIFICATION_COPY.get(notification_type)
    if not copy:  # неизвестный тип
        return

    order = (
        await db.execute(select(Order).where(Order.id == order_id))
    ).scalar_one_or_none()
    if not order:
        return

    if recipient_id is None:  # получатель — контрагент актора
        recipient_id = await _resolve_counterparty_user_id(
            db, order_id=order_id, actor_user_id=actor_user_id
        )
    if not recipient_id or recipient_id == actor_user_id:  # некому слать
        return

    actor = (
        await db.execute(select(User).where(User.id == actor_user_id))
    ).scalar_one_or_none()
    if not actor:
        return

    order_title = order.title or f"№ {order_id}"
    message_key = (  # ключ текста по роли актора
        "actor_customer" if actor_user_id == order.customer_id else "actor_executor"
    )
    format_args = {
        "actor": _format_user_name(actor),
        "order": order_title,
        "status": "",
        "detail": "",
        **(extra_format or {}),
    }

    tab = _resolve_notification_tab(
        notification_type,
        recipient_is_customer=recipient_id == order.customer_id,
    )
    if action_path is None:  # построить deep link
        action_path = await _build_action_path(
            db,
            recipient_id=recipient_id,
            order_id=order_id,
            customer_id=order.customer_id,
            tab=tab,
        )
    elif tab and "tab=" not in action_path:  # добавить tab к готовому path
        action_path = _append_tab_to_path(action_path, tab)

    await _create_notification(
        db,
        user_id=recipient_id,
        order_id=order_id,
        order_title=order_title,
        notification_type=notification_type,
        title=copy["title"],
        message=copy[message_key].format(**format_args),
        action_path=action_path,
        replace_unread=replace_unread,
    )


async def notify_order_event_safe(  # notify_order_event без падения роута
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


async def notify_executor_customer_offer(  # Исполнителю: предложение от заказчика
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    row = await _load_order_and_customer(db, order_id)
    if not row:
        return

    order, customer = row
    order_title = order.title or f"№ {order_id}"
    await _create_notification(
        db,
        user_id=executor_id,
        order_id=order_id,
        order_title=order_title,
        notification_type=CUSTOMER_OFFER_NOTIFICATION_TYPE,
        title="Новое предложение от заказчика",
        message=(
            f"Заказчик {_format_user_name(customer)} предложил вам заказ «{order_title}». "
            "Откройте предложение, чтобы посмотреть детали и ответить."
        ),
        action_path=_append_tab_to_path(
            f"/profile/services/offer/{order_id}", "orderInfo"
        ),
    )


async def notify_customer_executor_response(  # Заказчику: ответ исполнителя
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


async def notify_executor_order_completed(  # Исполнителю: заказ выполнен
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    actor_user_id: int,
) -> None:
    await notify_order_event_safe(
        db,
        order_id=order_id,
        actor_user_id=actor_user_id,
        notification_type=ORDER_COMPLETED_NOTIFICATION_TYPE,
        recipient_id=executor_id,
    )


async def _clear_executor_spurious_work_start_notifications(  # Удалить лишние уведомления о старте работ
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    await _delete_user_order_notifications(
        db,
        user_id=executor_id,
        order_id=order_id,
        notification_types=(
            CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE,
            EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,
            WORK_STARTED_NOTIFICATION_TYPE,
        ),
    )
    await db.flush()


async def _clear_executor_acceptance_duplicates(  # Удалить дубли при принятии предложения
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    await _delete_user_order_notifications(
        db,
        user_id=executor_id,
        order_id=order_id,
        notification_types=(
            CUSTOMER_OFFER_NOTIFICATION_TYPE,
            CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE,
            EXECUTOR_ASSIGNED_NOTIFICATION_TYPE,
            EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,
        ),
    )
    await db.flush()


async def notify_executor_on_status_change(  # Реакция на смену статуса услуги исполнителя
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:
        return

    became_offer = _status_has(new_status, CUSTOMER_OFFER_STATUS) and not _status_has(
        previous_status, CUSTOMER_OFFER_STATUS
    )
    if became_offer:  # новое предложение заказчика
        await notify_executor_customer_offer(
            db=db, executor_id=executor_id, order_id=order_id
        )
        return

    became_wait = _status_has(new_status, WAIT_EXECUTE_STATUS) and not _status_has(
        previous_status, WAIT_EXECUTE_STATUS
    )
    if became_wait:  # заказчик принял предложение
        await notify_executor_proposal_accepted(
            db=db, executor_id=executor_id, order_id=order_id
        )
        return

    became_in_progress = is_in_progress_status(
        new_status
    ) and not is_in_progress_status(previous_status)
    if became_in_progress:  # работа начата
        await notify_order_event_safe(
            db,
            order_id=order_id,
            actor_user_id=executor_id,
            notification_type=WORK_STARTED_NOTIFICATION_TYPE,
        )
        await _clear_executor_spurious_work_start_notifications(
            db, executor_id=executor_id, order_id=order_id
        )
        return

    if _is_completed_status(new_status):  # выполнен — отдельная ветка у заказчика
        return

    await notify_customer_on_executor_status_change(
        db=db,
        executor_id=executor_id,
        order_id=order_id,
        previous_status=previous_status,
        new_status=new_status,
    )


async def notify_customer_on_executor_status_change(  # Заказчику о смене статуса исполнителя
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:
        return
    if _status_has(new_status, CUSTOMER_OFFER_STATUS) or _status_has(
        new_status, WAIT_EXECUTE_STATUS
    ):  # служебные статусы без push заказчику
        return
    if _status_has(new_status, CONSIDERATION_STATUS):  # на рассмотрении — без push
        return
    if _is_cancel_refusal_executor_status(new_status):  # отказ — отдельные типы
        return
    if _is_completed_status(new_status):  # выполнен — другая ветка
        return

    await notify_order_event_safe(
        db,
        order_id=order_id,
        actor_user_id=executor_id,
        notification_type=EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,
        extra_format={"status": new_status},
    )


async def notify_customer_on_customer_status_change(  # Реакция на смену статуса заказчика
    db: AsyncSession,
    *,
    customer_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:
        return

    executor_id = await _resolve_executor_id_for_order(db, order_id)

    if _is_completed_status(new_status):  # выполнен → только исполнителю
        if executor_id:
            await notify_executor_order_completed(
                db=db,
                executor_id=executor_id,
                order_id=order_id,
                actor_user_id=customer_id,
            )
        return

    if _status_has(new_status, WAIT_EXECUTE_STATUS):  # ожидание — без уведомления здесь
        return

    if is_in_progress_status(new_status):  # в процессе — чистим дубли
        if executor_id:
            await _clear_executor_spurious_work_start_notifications(
                db, executor_id=executor_id, order_id=order_id
            )
        return

    if not executor_id:
        return

    executor_status = await _latest_executor_status(db, order_id, executor_id)
    if is_in_progress_status(
        executor_status
    ):  # исполнитель уже в процессе — тоже чистим
        await _clear_executor_spurious_work_start_notifications(
            db, executor_id=executor_id, order_id=order_id
        )


async def notify_executor_proposal_accepted(  # Исполнителю: заказчик принял предложение
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    row = await _load_order_and_customer(db, order_id)
    if not row:
        return

    order, customer = row
    order_title = order.title or f"№ {order_id}"
    await _clear_executor_acceptance_duplicates(
        db=db, executor_id=executor_id, order_id=order_id
    )
    await _create_notification(
        db,
        user_id=executor_id,
        order_id=order_id,
        order_title=order_title,
        notification_type=PROPOSAL_ACCEPTED_NOTIFICATION_TYPE,
        title="Заказчик принял ваше предложение",
        message=(
            f"Заказчик {_format_user_name(customer)} принял ваше предложение по заказу "
            f"«{order_title}». Заказ переведён в статус «Ожидают выполнения»."
        ),
        action_path=_append_tab_to_path(
            f"/profile/services/wait_execute_work/{order_id}", "orderInfo"
        ),
        replace_unread=False,
    )


async def notify_complaint_message(  # Уведомление о сообщении в споре
    db: AsyncSession,
    *,
    order_id: int,
    sender_user_id: int,
    sender_type: str,
) -> None:
    if sender_type == "admin":  # админ не триггерит push
        return

    order = (
        await db.execute(select(Order).where(Order.id == order_id))
    ).scalar_one_or_none()
    if not order:
        return

    executor_id = await _resolve_executor_id_for_order(db, order_id)
    recipients = [
        user_id
        for user_id in (order.customer_id, executor_id)
        if user_id and user_id != sender_user_id
    ]
    for recipient_id in recipients:
        await notify_order_event_safe(
            db,
            order_id=order_id,
            actor_user_id=sender_user_id,
            notification_type=COMPLAINT_MESSAGE_NOTIFICATION_TYPE,
            recipient_id=recipient_id,
        )


async def notify_payment_event(  # Уведомление об изменении оплаты
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

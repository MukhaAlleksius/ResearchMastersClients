import logging  # Логирование ошибок уведомлений
from typing import Optional  # Опциональные параметры

from fastapi import HTTPException  # HTTP-ошибки API
from sqlalchemy import delete, func, select, update  # SQL DML/SELECT
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from models.orders_models import (  # Заказы, статусы, Notification
    ExecutorOrder,  # назначение исполнителя на заказ
    Notification,  # ORM уведомления
    Order,  # ORM заказа
    StatusOrderCustomer,  # статус заказчика
    StatusOrderExecutor,  # статус исполнителя
)
from models.users_models import User  # ORM User

logger = logging.getLogger(__name__)  # Логгер модуля notifications_crud

ALLOWED_REACTIONS = {  # Допустимые реакции на уведомление (acknowledge)
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
PROPOSAL_ACCEPTED_NOTIFICATION_TYPE = "customer_accepted_proposal"  # Тип: принято предложение
ORDER_DELETED_NOTIFICATION_TYPE = "order_deleted_by_customer"  # Тип: заказ удалён
ESTIMATE_UPDATED_NOTIFICATION_TYPE = "estimate_updated"  # Тип: обновлена смета
SCHEDULE_UPDATED_NOTIFICATION_TYPE = "schedule_updated"  # Тип: обновлён график
NEW_MESSAGE_NOTIFICATION_TYPE = "new_message"  # Тип: новое сообщение в чате
EXECUTOR_RESPONSE_NOTIFICATION_TYPE = "executor_response"  # Тип: ответ исполнителя
EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE = "executor_response_updated"  # Тип: обновлён ответ
ORDER_UPDATED_NOTIFICATION_TYPE = "order_updated"  # Тип: изменён заказ
CONTRACT_UPDATED_NOTIFICATION_TYPE = "contract_updated"  # Тип: обновлён договор
CONTRACT_SIGNED_NOTIFICATION_TYPE = "contract_signed"  # Тип: подписан договор
CANCEL_REQUESTED_NOTIFICATION_TYPE = "cancel_requested"  # Тип: запрос отмены
CANCEL_DECISION_NOTIFICATION_TYPE = "cancel_decision"  # Тип: решение по отмене
ORDER_REFUSED_NOTIFICATION_TYPE = "order_refused"  # Тип: отказ от заказа
EXECUTOR_ASSIGNED_NOTIFICATION_TYPE = "executor_assigned"  # Тип: назначен исполнитель
CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE = "customer_status_changed"  # Тип: статус заказчика
EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE = "executor_status_changed"  # Тип: статус исполнителя
WORK_STARTED_NOTIFICATION_TYPE = "work_started"  # Тип: работа начата
ORDER_COMPLETED_NOTIFICATION_TYPE = "order_completed"  # Тип: заказ выполнен
START_DATE_UPDATED_NOTIFICATION_TYPE = "start_date_updated"  # Тип: дата начала
COUNTERPARTY_INFO_UPDATED_NOTIFICATION_TYPE = "counterparty_info_updated"  # Тип: контакты
COMPLAINT_MESSAGE_NOTIFICATION_TYPE = "complaint_message"  # Тип: сообщение в споре
PAYMENT_UPDATED_NOTIFICATION_TYPE = "payment_updated"  # Тип: изменена оплата

_NOTIFICATION_COPY = {  # Шаблоны заголовков и текстов по типам уведомлений
    ESTIMATE_UPDATED_NOTIFICATION_TYPE: {  # смета
        "title": "Обновление сметы",  # заголовок push
        "actor_executor": "Исполнитель {actor} обновил смету по заказу «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} обновил смету по заказу «{order}».",  # текст если актор — заказчик
    },
    SCHEDULE_UPDATED_NOTIFICATION_TYPE: {  # фиксация выполненных работ
        "title": "Обновление выполненных работ",  # заголовок push
        "actor_executor": "Исполнитель {actor} обновил выполненные работы по заказу «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} обновил выполненные работы по заказу «{order}».",  # текст если актор — заказчик
    },
    NEW_MESSAGE_NOTIFICATION_TYPE: {  # чат
        "title": "Новое сообщение",  # заголовок push
        "actor_executor": "Исполнитель {actor} отправил сообщение в чате заказа «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} отправил сообщение в чате заказа «{order}».",  # текст если актор — заказчик
    },
    EXECUTOR_RESPONSE_NOTIFICATION_TYPE: {  # новое предложение исполнителя
        "title": "Новое предложение от исполнителя",  # заголовок push
        "actor_executor": (  # многострочный текст
            "Исполнитель {actor} отправил предложение по заказу «{order}». "  # часть 1
            "Откройте заказ, чтобы рассмотреть ответ."  # часть 2
        ),
        "actor_customer": (  # текст для заказчика
            "Исполнитель {actor} отправил предложение по заказу «{order}». "  # часть 1
            "Откройте заказ, чтобы рассмотреть ответ."  # часть 2
        ),
    },
    EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE: {  # обновление предложения
        "title": "Исполнитель обновил предложение",  # заголовок push
        "actor_executor": (  # многострочный текст
            "Исполнитель {actor} обновил предложение по заказу «{order}». "  # часть 1
            "Откройте заказ, чтобы посмотреть изменения."  # часть 2
        ),
        "actor_customer": (  # текст для заказчика
            "Исполнитель {actor} обновил предложение по заказу «{order}». "  # часть 1
            "Откройте заказ, чтобы посмотреть изменения."  # часть 2
        ),
    },
    ORDER_UPDATED_NOTIFICATION_TYPE: {  # изменение заказа
        "title": "Изменение заказа",  # заголовок push
        "actor_executor": "Исполнитель {actor} изменил данные заказа «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} изменил данные заказа «{order}».",  # текст если актор — заказчик
    },
    CONTRACT_UPDATED_NOTIFICATION_TYPE: {  # договор изменён
        "title": "Обновление договора",  # заголовок push
        "actor_executor": "Исполнитель {actor} обновил договор по заказу «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} обновил договор по заказу «{order}».",  # текст если актор — заказчик
    },
    CONTRACT_SIGNED_NOTIFICATION_TYPE: {  # договор подписан
        "title": "Подписание договора",  # заголовок push
        "actor_executor": "Исполнитель {actor} подписал договор по заказу «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} подписал договор по заказу «{order}».",  # текст если актор — заказчик
    },
    CANCEL_REQUESTED_NOTIFICATION_TYPE: {  # запрос отмены
        "title": "Отказ от заказа",  # заголовок push
        "actor_executor": "Исполнитель {actor} отказался от заказа «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} отказался от заказа «{order}».",  # текст если актор — заказчик
    },
    CANCEL_DECISION_NOTIFICATION_TYPE: {  # решение по отмене
        "title": "Ответ по отмене заказа",  # заголовок push
        "actor_executor": (  # текст если актор — исполнитель
            "Исполнитель {actor} {detail} на отказ от заказа «{order}»."  # шаблон
        ),
        "actor_customer": (  # текст если актор — заказчик
            "Заказчик {actor} {detail} на отказ от заказа «{order}»."  # шаблон
        ),
    },
    ORDER_REFUSED_NOTIFICATION_TYPE: {  # отказ от заказа
        "title": "Отказ от заказа",  # заголовок push
        "actor_executor": "Исполнитель {actor} отказался от заказа «{order}».",  # текст если актор — исполнитель
        "actor_customer": "Заказчик {actor} отказался от заказа «{order}».",  # текст если актор — заказчик
    },
    EXECUTOR_ASSIGNED_NOTIFICATION_TYPE: {  # назначен исполнитель
        "title": "Вас назначили исполнителем",  # заголовок push
        "actor_executor": "Заказчик {actor} назначил вас исполнителем заказа «{order}».",  # текст для исполнителя
        "actor_customer": "Заказчик {actor} назначил исполнителя на заказ «{order}».",  # текст для заказчика
    },
    CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE: {  # статус заказа (заказчик)
        "title": "Изменение статуса заказа",  # заголовок push
        "actor_executor": "Исполнитель {actor} изменил статус заказа «{order}» на «{status}».",  # текст если актор — исполнитель
        "actor_customer": (  # текст если актор — заказчик
            "Заказчик {actor} изменил статус заказа «{order}» на «{status}»."  # шаблон
        ),
    },
    EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE: {  # статус услуги (исполнитель)
        "title": "Изменение статуса услуги",  # заголовок push
        "actor_executor": (  # текст если актор — исполнитель
            "Исполнитель {actor} изменил статус услуги по заказу «{order}» на «{status}»."  # шаблон
        ),
        "actor_customer": (  # текст если актор — заказчик
            "Исполнитель {actor} изменил статус услуги по заказу «{order}» на «{status}»."  # шаблон
        ),
    },
    WORK_STARTED_NOTIFICATION_TYPE: {  # работа начата
        "title": "Исполнитель приступил к работе",  # заголовок push
        "actor_executor": (  # текст если актор — исполнитель
            "Исполнитель {actor} приступил к выполнению заказа «{order}»."  # шаблон
        ),
        "actor_customer": (  # текст если актор — заказчик
            "Исполнитель {actor} приступил к выполнению заказа «{order}»."  # шаблон
        ),
    },
    ORDER_COMPLETED_NOTIFICATION_TYPE: {  # заказ выполнен
        "title": "Заказ выполнен",  # заголовок push
        "actor_executor": (  # текст если актор — исполнитель
            "Исполнитель {actor} отметил заказ «{order}» выполненным."  # шаблон
        ),
        "actor_customer": (  # текст если актор — заказчик
            "Заказчик {actor} отметил заказ «{order}» выполненным."  # шаблон
        ),
    },
    START_DATE_UPDATED_NOTIFICATION_TYPE: {  # дата начала работ
        "title": "Дата начала работ",  # заголовок push
        "actor_executor": (  # текст если актор — исполнитель
            "Исполнитель {actor} указал дату начала работ по заказу «{order}»: {detail}."  # шаблон
        ),
        "actor_customer": (  # текст если актор — заказчик
            "Заказчик {actor} указал дату начала работ по заказу «{order}»: {detail}."  # шаблон
        ),
    },
    COUNTERPARTY_INFO_UPDATED_NOTIFICATION_TYPE: {  # контакты контрагента
        "title": "Обновление контактов",  # заголовок push
        "actor_executor": (  # текст если актор — исполнитель
            "Исполнитель {actor} обновил контактную информацию по заказу «{order}»."  # шаблон
        ),
        "actor_customer": (  # текст если актор — заказчик
            "Заказчик {actor} обновил контактную информацию по заказу «{order}»."  # шаблон
        ),
    },
    COMPLAINT_MESSAGE_NOTIFICATION_TYPE: {  # спор/жалоба
        "title": "Сообщение в споре",  # заголовок push
        "actor_executor": (  # текст если актор — исполнитель
            "Исполнитель {actor} отправил сообщение в споре по заказу «{order}»."  # шаблон
        ),
        "actor_customer": (  # текст если актор — заказчик
            "Заказчик {actor} отправил сообщение в споре по заказу «{order}»."  # шаблон
        ),
    },
    PAYMENT_UPDATED_NOTIFICATION_TYPE: {  # оплата
        "title": "Изменение оплаты",  # заголовок push
        "actor_executor": (  # текст для обеих ролей
            "По заказу «{order}» обновлена оплата: {detail}."  # шаблон
        ),
        "actor_customer": (  # текст для заказчика
            "По заказу «{order}» обновлена оплата: {detail}."  # шаблон
        ),
    },
}


def _append_tab_to_path(path: str, tab: Optional[str]) -> str:  # Добавить query-параметр tab к URL
    if not tab:  # вкладка не задана
        return path  # путь без изменений
    separator = "&" if "?" in path else "?"  # ? или & для query
    return f"{path}{separator}tab={tab}"  # путь с tab=


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


async def get_user_notifications(  # Список уведомлений пользователя + счётчик непрочитанных
    db: AsyncSession,
    user_id: int,
    *,
    unread_only: bool = False,
    limit: int = 50,
) -> tuple[list[Notification], int]:
    filters = [Notification.user_id == user_id]  # базовый фильтр по user
    if unread_only:  # только непрочитанные
        filters.append(Notification.is_read.is_(False))  # фильтр is_read=False

    unread_count_result = await db.execute(  # COUNT непрочитанных
        select(func.count())  # агрегация
        .select_from(Notification)  # таблица notifications
        .where(  # по user_id и is_read
            Notification.user_id == user_id,  # получатель
            Notification.is_read.is_(False),  # непрочитанные
        )
    )
    unread_count = unread_count_result.scalar_one()  # число

    result = await db.execute(  # выборка с лимитом
        select(Notification)  # все поля
        .where(*filters)  # user_id + опционально unread
        .order_by(Notification.created_at.desc(), Notification.id.desc())  # новые первыми
        .limit(limit)  # лимит выборки
    )
    return list(result.scalars().all()), unread_count  # список и count


async def mark_notification_read(  # Пометить одно уведомление прочитанным
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification:
    notification = await _get_notification_for_user(db, notification_id, user_id)  # проверка владельца
    if not notification.is_read:  # ещё непрочитано
        notification.is_read = True  # флаг read
        await db.flush()  # без commit (в транзакции роута)
    return notification  # обновлённое уведомление


async def acknowledge_notification(  # Реакция на уведомление → удаление записи
    db: AsyncSession,
    notification_id: int,
    user_id: int,
    reaction: str,
) -> int:
    if reaction not in ALLOWED_REACTIONS:  # недопустимая реакция
        raise HTTPException(  # 400
            status_code=400,  # клиентская ошибка
            detail="Недопустимая реакция. Допустимо: understood, find_other_orders, view_offer, view_wait_execute, open_order",  # текст
        )

    await _get_notification_for_user(db, notification_id, user_id)  # проверка доступа
    result = await db.execute(  # DELETE уведомления
        delete(Notification).where(  # по id и user_id
            Notification.id == notification_id,  # pk
            Notification.user_id == user_id,  # владелец
        )
    )
    await db.flush()  # flush
    if not result.rowcount:  # ничего не удалено
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return notification_id  # id удалённого


async def mark_all_notifications_read(  # Прочитать все уведомления пользователя
    db: AsyncSession,
    user_id: int,
) -> int:
    result = await db.execute(  # bulk UPDATE is_read=True
        update(Notification)  # таблица notifications
        .where(  # непрочитанные пользователя
            Notification.user_id == user_id,  # получатель
            Notification.is_read.is_(False),  # ещё не read
        )
        .values(is_read=True)  # пометить прочитанными
    )
    await db.flush()  # flush
    return result.rowcount or 0  # число обновлённых


def _format_user_name(user: User) -> str:  # «Имя Фамилия» или «Пользователь»
    return (  # сборка ФИО
        " ".join(part for part in (user.first_name, user.last_name) if part).strip()  # непустые части
        or "Пользователь"  # fallback без имени
    )


def format_cancel_decision_detail(  # Текст решения по отмене для шаблона
    status: Optional[str],
    comment: Optional[str] = None,
) -> str:
    normalized = (status or "").strip().lower()  # lower status
    if normalized == "agree":  # согласие
        return "согласен"
    if normalized == "disagree":  # отказ
        return "не согласен"
    if comment and comment.strip():  # комментарий
        return comment.strip()
    return "ответил"  # fallback


def _is_customer_offer_status(status: Optional[str]) -> bool:  # Статус «предложения заказчиков»
    return CUSTOMER_OFFER_STATUS in (status or "")


def _is_wait_execute_status(status: Optional[str]) -> bool:  # Статус «ожидают выполнения»
    return WAIT_EXECUTE_STATUS in (status or "")


async def is_order_in_wait_execute(  # Заказ в статусе «ожидают выполнения» у стороны
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> bool:
    customer_result = await db.execute(  # статус заказчика
        select(StatusOrderCustomer.status).where(  # последний статус
            StatusOrderCustomer.order_id == order_id,  # заказ
            StatusOrderCustomer.customer_id == customer_id,  # заказчик
        )
    )
    executor_result = await db.execute(  # статус исполнителя
        select(StatusOrderExecutor.status).where(  # последний статус
            StatusOrderExecutor.order_id == order_id,  # заказ
            StatusOrderExecutor.executor_id == executor_id,  # исполнитель
        )
    )
    customer_status = customer_result.scalar_one_or_none()  # строка или None
    executor_status = executor_result.scalar_one_or_none()  # строка или None
    return _is_wait_execute_status(customer_status) or _is_wait_execute_status(  # хотя бы одна сторона
        executor_status  # статус исполнителя
    )


def _is_consideration_status(status: Optional[str]) -> bool:  # «На рассмотрении заказчика»
    return CONSIDERATION_STATUS in (status or "")


def is_in_progress_status(status: Optional[str]) -> bool:  # Публичная проверка «В процессе»
    return "В процессе" in (status or "")


def _is_in_progress_status(status: Optional[str]) -> bool:  # Внутренняя обёртка
    return is_in_progress_status(status)


def _is_completed_status(status: Optional[str]) -> bool:  # «Выполнен»
    return "Выполнен" in (status or "")


def _is_cancel_refusal_executor_status(status: Optional[str]) -> bool:  # Отказ/отказано заказчиком
    normalized = status or ""
    return "Отказано заказчиком" in normalized or "Отказ от заказа" in normalized


async def _get_executor_service_route(  # Сегмент URL услуги исполнителя по статусу
    db: AsyncSession,
    executor_id: int,
    order_id: int,
) -> str:
    result = await db.execute(  # последний статус исполнителя
        select(StatusOrderExecutor.status)  # поле status
        .where(  # по заказу и исполнителю
            StatusOrderExecutor.order_id == order_id,  # заказ
            StatusOrderExecutor.executor_id == executor_id,  # исполнитель
        )
        .order_by(StatusOrderExecutor.id.desc())  # последняя запись
        .limit(1)  # одна строка
    )
    status = result.scalar_one_or_none() or ""  # строка статуса
    if "Предложения" in status:  # предложения
        return "offer"
    if "На рассмотрении" in status:  # рассмотрение
        return "consideration_customer"
    if "Ожидают" in status:  # ожидание
        return "wait_execute_work"
    if "В процессе" in status:  # в работе
        return "continue_execute_work"
    if "Выполнен" in status:  # выполнен
        return "execute_work"
    if "Отказано заказчиком" in status:  # отказ заказчика
        return "refused_by_customer"
    if "Отказ от заказа" in status:  # отказ от заказа
        return "refused_by_order"
    return "wait_execute_work"  # fallback


async def _build_action_path(  # URL перехода из уведомления
    db: AsyncSession,
    *,
    recipient_id: int,
    order_id: int,
    customer_id: int,
    tab: Optional[str] = None,
) -> str:
    if recipient_id == customer_id:  # получатель — заказчик
        path = f"/profile/orders/{order_id}"  # заказы
    else:  # исполнитель
        route = await _get_executor_service_route(db, recipient_id, order_id)  # сегмент услуги
        path = f"/profile/services/{route}/{order_id}"  # услуги
    return _append_tab_to_path(path, tab)  # с вкладкой


async def _resolve_counterparty_user_id(  # id второй стороны заказа
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
) -> Optional[int]:
    order_result = await db.execute(select(Order).where(Order.id == order_id))  # заказ
    order = order_result.scalar_one_or_none()  # Order или None
    if not order:  # нет заказа
        return None

    if actor_user_id == order.customer_id:  # актор — заказчик → исполнитель
        executor_id = await _resolve_executor_id_for_order(db, order_id)  # id исполнителя
        if executor_id and executor_id != actor_user_id:  # валидный контрагент
            return executor_id
        return None

    if order.customer_id and order.customer_id != actor_user_id:  # актор — исполнитель → заказчик
        return order.customer_id

    return None  # контрагент не определён


async def _resolve_executor_id_for_order(  # id исполнителя по заказу
    db: AsyncSession,
    order_id: int,
    *,
    preferred_executor_id: Optional[int] = None,
) -> Optional[int]:
    if preferred_executor_id:  # явно передан
        return preferred_executor_id

    executor_result = await db.execute(  # из ExecutorOrder
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)  # по заказу
    )
    executor_id = executor_result.scalar_one_or_none()  # id или None
    if executor_id:  # найден
        return executor_id

    status_result = await db.execute(  # fallback из StatusOrderExecutor
        select(StatusOrderExecutor.executor_id)  # id исполнителя
        .where(StatusOrderExecutor.order_id == order_id)  # заказ
        .order_by(StatusOrderExecutor.id.desc())  # последняя запись
        .limit(1)  # одна строка
    )
    return status_result.scalar_one_or_none()  # последний исполнитель


async def _replace_unread_notification(  # Удалить непрочитанное того же типа по заказу
    db: AsyncSession,
    *,
    user_id: int,
    order_id: int,
    notification_type: str,
) -> None:
    await db.execute(  # DELETE дубликатов
        delete(Notification).where(  # фильтры
            Notification.user_id == user_id,  # получатель
            Notification.order_id == order_id,  # заказ
            Notification.notification_type == notification_type,  # тип
            Notification.is_read.is_(False),  # только unread
        )
    )


async def clear_cancel_notifications_for_order(  # Очистить уведомления об отмене по заказу
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> None:
    cancel_types = (  # типы отмены/отказа
        CANCEL_REQUESTED_NOTIFICATION_TYPE,  # запрос отмены
        CANCEL_DECISION_NOTIFICATION_TYPE,  # решение по отмене
        ORDER_REFUSED_NOTIFICATION_TYPE,  # отказ от заказа
    )
    await db.execute(  # DELETE для обеих сторон
        delete(Notification).where(  # фильтры
            Notification.order_id == order_id,  # заказ
            Notification.user_id.in_([customer_id, executor_id]),  # обе стороны
            Notification.notification_type.in_(cancel_types),  # типы отмены
        )
    )
    await db.flush()  # flush


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
        await _replace_unread_notification(  # удалить unread-дубликат
            db,  # сессия
            user_id=user_id,  # получатель
            order_id=order_id,  # заказ
            notification_type=notification_type,  # тип
        )

    db.add(  # новая запись Notification
        Notification(
            user_id=user_id,  # получатель
            title=title,  # заголовок
            message=message,  # текст
            notification_type=notification_type,  # тип
            order_id=order_id,  # заказ
            order_title=order_title,  # название заказа
            action_path=action_path,  # deep link
            is_read=False,  # непрочитано
        )
    )
    await db.flush()  # flush


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
    if notification_type not in _NOTIFICATION_COPY:  # неизвестный тип
        return

    order_result = await db.execute(select(Order).where(Order.id == order_id))  # заказ
    order = order_result.scalar_one_or_none()  # Order или None
    if not order:  # нет заказа
        return

    if recipient_id is None:  # получатель — контрагент актора
        recipient_id = await _resolve_counterparty_user_id(  # id контрагента
            db,  # сессия
            order_id=order_id,  # заказ
            actor_user_id=actor_user_id,  # актор
        )
    if not recipient_id or recipient_id == actor_user_id:  # некому слать
        return

    actor_result = await db.execute(select(User).where(User.id == actor_user_id))  # актор
    actor = actor_result.scalar_one_or_none()  # User или None
    if not actor:  # не найден
        return

    order_title = order.title or f"№ {order_id}"  # название для текста
    actor_name = _format_user_name(actor)  # имя актора
    copy = _NOTIFICATION_COPY[notification_type]  # шаблон
    message_key = (  # ключ текста по роли актора
        "actor_customer"
        if actor_user_id == order.customer_id
        else "actor_executor"
    )
    format_args = {  # плейсхолдеры
        "actor": actor_name,  # имя актора
        "order": order_title,  # название заказа
        "status": "",  # статус (опционально)
        "detail": "",  # деталь (опционально)
    }
    if extra_format:  # status, detail и т.д.
        format_args.update(extra_format)

    resolved_action_path = action_path  # URL
    tab = _resolve_notification_tab(  # вкладка UI
        notification_type,
        recipient_is_customer=recipient_id == order.customer_id,
    )
    if resolved_action_path is None:  # построить path
        resolved_action_path = await _build_action_path(  # deep link
            db,  # сессия
            recipient_id=recipient_id,  # получатель
            order_id=order_id,  # заказ
            customer_id=order.customer_id,  # заказчик
            tab=tab,  # вкладка UI
        )
    elif tab and "tab=" not in resolved_action_path:  # добавить tab
        resolved_action_path = _append_tab_to_path(resolved_action_path, tab)

    await _create_notification(  # INSERT
        db,  # сессия
        user_id=recipient_id,  # получатель
        order_id=order_id,  # заказ
        order_title=order_title,  # название
        notification_type=notification_type,  # тип
        title=copy["title"],  # заголовок из шаблона
        message=copy[message_key].format(**format_args),  # текст из шаблона
        action_path=resolved_action_path,  # URL перехода
        replace_unread=replace_unread,  # заменять unread-дубликат
    )


async def notify_order_event_safe(  # notify_order_event без падения роута
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
    notification_type: str,
    **kwargs,
) -> None:
    try:  # безопасная обёртка
        await notify_order_event(  # основная логика
            db,  # сессия
            order_id=order_id,  # заказ
            actor_user_id=actor_user_id,  # актор
            notification_type=notification_type,  # тип
            **kwargs,  # доп. аргументы
        )
    except Exception as error:  # только warning в лог
        logger.warning(  # не падаем в роуте
            "notify %s failed order_id=%s actor=%s: %s",  # формат
            notification_type,  # тип
            order_id,  # заказ
            actor_user_id,  # актор
            error,  # исключение
        )


async def notify_executor_customer_offer(  # Исполнителю: предложение от заказчика
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    order_result = await db.execute(  # заказ + заказчик
        select(Order, User)  # join заказа и user
        .join(User, User.id == Order.customer_id)  # заказчик
        .where(Order.id == order_id)  # pk заказа
    )
    row = order_result.first()  # пара или None
    if not row:  # нет данных
        return

    order, customer = row  # распаковка
    order_title = order.title or f"№ {order_id}"  # название
    customer_name = _format_user_name(customer)  # имя заказчика
    action_path = _append_tab_to_path(f"/profile/services/offer/{order_id}", "orderInfo")  # deep link

    await _create_notification(  # INSERT
        db,  # сессия
        user_id=executor_id,  # исполнитель-получатель
        order_id=order_id,  # заказ
        order_title=order_title,  # название
        notification_type=CUSTOMER_OFFER_NOTIFICATION_TYPE,  # тип
        title="Новое предложение от заказчика",  # заголовок
        message=(  # текст push
            f"Заказчик {customer_name} предложил вам заказ «{order_title}». "  # часть 1
            "Откройте предложение, чтобы посмотреть детали и ответить."  # часть 2
        ),
        action_path=action_path,  # deep link
    )


async def notify_customer_executor_response(  # Заказчику: ответ исполнителя
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    is_update: bool = False,
) -> None:
    notification_type = (  # новый или обновлённый ответ
        EXECUTOR_RESPONSE_UPDATED_NOTIFICATION_TYPE  # обновление
        if is_update  # флаг update
        else EXECUTOR_RESPONSE_NOTIFICATION_TYPE  # новый отклик
    )
    await notify_order_event(  # общий пайплайн
        db,  # сессия
        order_id=order_id,  # заказ
        actor_user_id=executor_id,  # исполнитель-актор
        notification_type=notification_type,  # тип
        action_path=_append_tab_to_path(  # URL с вкладкой
            f"/profile/orders/{order_id}", "orderResponesExecutors"  # path + tab
        ),
    )


async def notify_executor_order_completed(  # Исполнителю: заказ выполнен
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    actor_user_id: int,
) -> None:
    await notify_order_event_safe(  # безопасная отправка
        db,  # сессия
        order_id=order_id,  # заказ
        actor_user_id=actor_user_id,  # актор
        notification_type=ORDER_COMPLETED_NOTIFICATION_TYPE,  # тип
        recipient_id=executor_id,  # исполнитель-получатель
    )


async def notify_executor_on_status_change(  # Реакция на смену статуса услуги исполнителя
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:  # без изменений
        return

    if _is_customer_offer_status(new_status) and not _is_customer_offer_status(  # новое предложение заказчика
        previous_status
    ):
        await notify_executor_customer_offer(  # push исполнителю
            db=db,  # сессия
            executor_id=executor_id,  # исполнитель
            order_id=order_id,  # заказ
        )
        return  # дальше не идём

    if _is_wait_execute_status(new_status) and not _is_wait_execute_status(  # принято предложение
        previous_status  # предыдущий статус
    ):
        await notify_executor_proposal_accepted(  # push о принятии
            db=db,  # сессия
            executor_id=executor_id,  # исполнитель
            order_id=order_id,  # заказ
        )
        return  # выход

    if _is_in_progress_status(new_status) and not _is_in_progress_status(  # работа начата
        previous_status  # предыдущий статус
    ):
        await notify_order_event_safe(  # уведомление о старте
            db,  # сессия
            order_id=order_id,  # заказ
            actor_user_id=executor_id,  # исполнитель
            notification_type=WORK_STARTED_NOTIFICATION_TYPE,  # тип
        )
        await _clear_executor_spurious_work_start_notifications(  # убрать лишние дубли
            db,  # сессия
            executor_id=executor_id,  # исполнитель
            order_id=order_id,  # заказ
        )
        return  # выход

    if _is_completed_status(new_status):  # выполнен — отдельная ветка у заказчика
        return

    await notify_customer_on_executor_status_change(  # прочие смены → заказчику
        db=db,  # сессия
        executor_id=executor_id,  # исполнитель
        order_id=order_id,  # заказ
        previous_status=previous_status,  # было
        new_status=new_status,  # стало
    )


async def notify_customer_on_executor_status_change(  # Заказчику о смене статуса исполнителя
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:  # без изменений
        return

    if _is_customer_offer_status(new_status) or _is_wait_execute_status(new_status):  # служебные статусы
        return

    if _is_consideration_status(new_status):  # на рассмотрении — без push
        return

    if _is_cancel_refusal_executor_status(new_status):  # отказ — отдельные типы
        return

    if _is_completed_status(new_status):  # выполнен — другая ветка
        return

    await notify_order_event_safe(  # уведомление о смене статуса
        db,  # сессия
        order_id=order_id,  # заказ
        actor_user_id=executor_id,  # исполнитель
        notification_type=EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,  # тип
        extra_format={"status": new_status},  # новый статус в тексте
    )


async def _get_executor_order_status(  # Последний статус исполнителя по заказу
    db: AsyncSession,
    *,
    order_id: int,
    executor_id: int,
) -> Optional[str]:
    result = await db.execute(  # SELECT последнего статуса
        select(StatusOrderExecutor.status)  # поле status
        .where(  # по заказу и исполнителю
            StatusOrderExecutor.order_id == order_id,  # заказ
            StatusOrderExecutor.executor_id == executor_id,  # исполнитель
        )
        .order_by(StatusOrderExecutor.id.desc())  # последняя запись
        .limit(1)  # одна строка
    )
    return result.scalar_one_or_none()  # строка или None


async def notify_customer_on_customer_status_change(  # Реакция на смену статуса заказчика
    db: AsyncSession,
    *,
    customer_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if previous_status == new_status:  # без изменений
        return

    executor_id = await _resolve_executor_id_for_order(db, order_id)  # исполнитель заказа

    if _is_completed_status(new_status):  # выполнен → только исполнителю
        if executor_id:
            await notify_executor_order_completed(  # push исполнителю
                db=db,  # сессия
                executor_id=executor_id,  # исполнитель
                order_id=order_id,  # заказ
                actor_user_id=customer_id,  # заказчик-актор
            )
        return  # дальше не идём

    if _is_wait_execute_status(new_status):  # ожидание — без уведомления здесь
        return

    if _is_in_progress_status(new_status):  # в процессе — чистим дубли
        if executor_id:
            await _clear_executor_spurious_work_start_notifications(  # чистим дубли
                db,  # сессия
                executor_id=executor_id,  # исполнитель
                order_id=order_id,  # заказ
            )
        return  # выход

    if executor_id:  # исполнитель уже «в процессе» — тоже чистим
        executor_status = await _get_executor_order_status(  # статус исполнителя
            db,  # сессия
            order_id=order_id,  # заказ
            executor_id=executor_id,  # исполнитель
        )
        if _is_in_progress_status(executor_status):  # уже в процессе
            await _clear_executor_spurious_work_start_notifications(  # чистим дубли
                db,  # сессия
                executor_id=executor_id,  # исполнитель
                order_id=order_id,  # заказ
            )
            return  # выход

    if not executor_id:  # нет исполнителя — выход
        return


async def _clear_executor_spurious_work_start_notifications(  # Удалить лишние уведомления о старте работ
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    await db.execute(  # DELETE по типам статуса/старта
        delete(Notification).where(  # фильтры
            Notification.user_id == executor_id,  # исполнитель
            Notification.order_id == order_id,  # заказ
            Notification.notification_type.in_(  # несколько типов
                (  # кортеж типов
                    CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE,  # статус заказчика
                    EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,  # статус исполнителя
                    WORK_STARTED_NOTIFICATION_TYPE,  # старт работ
                )
            ),
        )
    )
    await db.flush()  # flush


async def _clear_executor_acceptance_duplicates(  # Удалить дубли при принятии предложения
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    duplicate_types = (  # типы-дубликаты
        CUSTOMER_OFFER_NOTIFICATION_TYPE,  # предложение заказчика
        CUSTOMER_STATUS_CHANGED_NOTIFICATION_TYPE,  # статус заказчика
        EXECUTOR_ASSIGNED_NOTIFICATION_TYPE,  # назначение
        EXECUTOR_STATUS_CHANGED_NOTIFICATION_TYPE,  # статус исполнителя
    )
    await db.execute(  # DELETE
        delete(Notification).where(  # фильтры
            Notification.user_id == executor_id,  # исполнитель
            Notification.order_id == order_id,  # заказ
            Notification.notification_type.in_(duplicate_types),  # типы-дубликаты
        )
    )
    await db.flush()  # flush


async def notify_executor_proposal_accepted(  # Исполнителю: заказчик принял предложение
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
) -> None:
    order_result = await db.execute(  # заказ + заказчик
        select(Order, User)  # join заказа и user
        .join(User, User.id == Order.customer_id)  # заказчик
        .where(Order.id == order_id)  # pk заказа
    )
    row = order_result.first()  # пара или None
    if not row:  # нет данных
        return

    order, customer = row  # распаковка
    order_title = order.title or f"№ {order_id}"  # название
    customer_name = _format_user_name(customer)  # имя заказчика
    action_path = _append_tab_to_path(  # deep link
        f"/profile/services/wait_execute_work/{order_id}", "orderInfo"
    )

    await _clear_executor_acceptance_duplicates(  # убрать старые дубли
        db=db,  # сессия
        executor_id=executor_id,  # исполнитель
        order_id=order_id,  # заказ
    )

    await _create_notification(  # INSERT
        db,  # сессия
        user_id=executor_id,  # исполнитель-получатель
        order_id=order_id,  # заказ
        order_title=order_title,  # название
        notification_type=PROPOSAL_ACCEPTED_NOTIFICATION_TYPE,  # тип
        title="Заказчик принял ваше предложение",  # заголовок
        message=(  # текст push
            f"Заказчик {customer_name} принял ваше предложение по заказу "  # часть 1
            f"«{order_title}». Заказ переведён в статус «Ожидают выполнения»."  # часть 2
        ),
        action_path=action_path,  # deep link
        replace_unread=False,  # не заменять unread того же типа
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

    order_result = await db.execute(select(Order).where(Order.id == order_id))  # заказ
    order = order_result.scalar_one_or_none()  # Order или None
    if not order:  # нет заказа
        return

    executor_id = await _resolve_executor_id_for_order(db, order_id)  # исполнитель
    recipients: list[int] = []  # получатели кроме отправителя
    if order.customer_id and order.customer_id != sender_user_id:  # заказчик
        recipients.append(order.customer_id)
    if executor_id and executor_id != sender_user_id:  # исполнитель
        recipients.append(executor_id)

    for recipient_id in recipients:  # каждому контрагенту
        await notify_order_event_safe(  # безопасная отправка
            db,  # сессия
            order_id=order_id,  # заказ
            actor_user_id=sender_user_id,  # отправитель
            notification_type=COMPLAINT_MESSAGE_NOTIFICATION_TYPE,  # тип
            recipient_id=recipient_id,  # получатель
        )


async def notify_payment_event(  # Уведомление об изменении оплаты
    db: AsyncSession,
    *,
    order_id: int,
    actor_user_id: int,
    detail: str,
    recipient_id: Optional[int] = None,
) -> None:
    await notify_order_event_safe(  # безопасная отправка
        db,  # сессия
        order_id=order_id,  # заказ
        actor_user_id=actor_user_id,  # актор
        notification_type=PAYMENT_UPDATED_NOTIFICATION_TYPE,  # тип
        extra_format={"detail": detail},  # детали оплаты
        recipient_id=recipient_id,  # получатель (опционально)
    )


async def resolve_order_id_for_parties(  # id последнего заказа пары заказчик–исполнитель
    db: AsyncSession,
    *,
    customer_id: int,
    executor_id: int,
) -> Optional[int]:
    result = await db.execute(  # через ExecutorOrder
        select(Order.id)  # id заказа
        .join(ExecutorOrder, ExecutorOrder.order_id == Order.id)  # связь исполнителя
        .where(  # пара заказчик-исполнитель
            Order.customer_id == customer_id,  # заказчик
            ExecutorOrder.executor_id == executor_id,  # исполнитель
        )
        .order_by(Order.updated_at.desc(), Order.id.desc())  # последний обновлённый
        .limit(1)  # одна запись
    )
    order_id = result.scalar_one_or_none()  # id или None
    if order_id:  # найден
        return order_id

    status_result = await db.execute(  # fallback через StatusOrderExecutor
        select(StatusOrderExecutor.order_id)  # id заказа
        .join(Order, Order.id == StatusOrderExecutor.order_id)  # join orders
        .where(  # пара заказчик-исполнитель
            Order.customer_id == customer_id,  # заказчик
            StatusOrderExecutor.executor_id == executor_id,  # исполнитель
        )
        .order_by(StatusOrderExecutor.id.desc())  # последняя запись
        .limit(1)  # одна строка
    )
    return status_result.scalar_one_or_none()  # id или None


async def notify_counterparty_info_updated(  # Контрагенту: обновлены контакты
    db: AsyncSession,
    *,
    customer_id: int,
    executor_id: int,
    actor_user_id: int,
) -> None:
    order_id = await resolve_order_id_for_parties(  # общий заказ сторон
        db,  # сессия
        customer_id=customer_id,  # заказчик
        executor_id=executor_id,  # исполнитель
    )
    if not order_id:  # заказ не найден
        return

    recipient_id = executor_id if actor_user_id == customer_id else customer_id  # вторая сторона
    if recipient_id == actor_user_id:  # некому слать
        return

    await notify_order_event_safe(  # безопасная отправка
        db,  # сессия
        order_id=order_id,  # заказ
        actor_user_id=actor_user_id,  # актор
        notification_type=COUNTERPARTY_INFO_UPDATED_NOTIFICATION_TYPE,  # тип
        recipient_id=recipient_id,  # контрагент
    )


async def _get_notification_for_user(  # Уведомление с проверкой владельца
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification:
    result = await db.execute(  # SELECT по id и user_id
        select(Notification).where(  # фильтры
            Notification.id == notification_id,  # pk
            Notification.user_id == user_id,  # владелец
        )
    )
    notification = result.scalar_one_or_none()  # Notification или None
    if not notification:  # чужое или несуществующее
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return notification  # ORM-объект

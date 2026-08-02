import logging  # Логирование операций удаления
from typing import Optional  # Опциональные id заказчика/исполнителя

from fastapi import HTTPException  # HTTP-ошибки для API
from sqlalchemy import delete, select  # DELETE и SELECT запросы
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from cruds.estimate_graphic_works.delete_estimate_graphic_works import (  # Очистка сметы и графики
    clear_all_order_estimate_and_graphic_data,
    clear_estimate_and_graphic_for_order,
)
from cruds.orders.order_constants import HIDDEN_CUSTOMER_EXECUTOR_MARKER  # Маркер скрытого контакта
from cruds.notifications_crud import clear_cancel_notifications_for_order  # Снятие уведомлений об отказе
from models.users_models import User  # ORM пользователя
from models.contracts_models import Contract  # ORM договора
from models.conversations_models import (  # ORM чатов и жалоб
    ComplaintConversation,
    ComplaintMessage,
    ComplaintModerationAction,
    Conversation,
)
from models.estimate_graphic_works_models import GraphicWork, WorkEstimate  # Смета и графические работы
from models.payments_models import Payment  # ORM платежа
from models.orders_models import (  # ORM заказов, статусов, уведомлений
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

logger = logging.getLogger(__name__)  # Логгер модуля

SEARCH_EXECUTOR_STATUS = "В поиске исполнителя"  # Статус поиска исполнителя
REFUSED_BY_CUSTOMER_STATUS = "Отказано заказчиком"  # Отказ инициирован заказчиком
REFUSED_BY_ORDER_STATUS = "Отказ от заказа"  # Общий отказ от заказа

CUSTOMER_DELETABLE_STATUSES = {  # Статусы, при которых заказчик может удалить заказ
    "Не предложенные исполнителям",
    "Самостоятельное выполнение",
    "В поиске исполнителя",
    "Ожидают выполнения",
}


async def delete_executor_response_for_order(  # Удаляет отклик исполнителя по заказу
    db: AsyncSession,
    order_id: int,
    executor_id: int,
) -> int:
    """Удаляет отклик исполнителя по заказу (orders_responses_executors)."""
    result = await db.execute(  # Выполняем DELETE отклика
        delete(OrderResponseExecutor).where(
            OrderResponseExecutor.order_id == order_id,
            OrderResponseExecutor.executor_id == executor_id,
        )
    )
    deleted = result.rowcount or 0  # Число удалённых строк
    if deleted:  # Если что-то удалили — пишем в лог
        logger.info(
            "Deleted executor response: order_id=%s executor_id=%s",
            order_id,
            executor_id,
        )
    await db.flush()  # Сбрасываем изменения в транзакцию
    return deleted  # Возвращаем количество удалённых


async def clear_order_refusal_collateral(  # Удаляет чат, жалобы, отказы и отклик по заказу
    db: AsyncSession,
    order_id: int,
    *,
    customer_id: Optional[int] = None,
    executor_id: Optional[int] = None,
    preserve_cancellations: bool = False,
) -> None:
    """Удаляет чат, жалобы администратору, записи отказов и отклик исполнителя по заказу."""
    complaint_ids = select(ComplaintConversation.id).where(  # Подзапрос id жалоб по заказу
        ComplaintConversation.order_id == order_id
    )

    await db.execute(  # Удаляем действия модерации по жалобам
        delete(ComplaintModerationAction).where(
            ComplaintModerationAction.complaint_id.in_(complaint_ids)
        )
    )
    await db.execute(  # Удаляем сообщения жалоб
        delete(ComplaintMessage).where(
            ComplaintMessage.complaint_conversation_id.in_(complaint_ids)
        )
    )
    await db.execute(  # Удаляем сами жалобы
        delete(ComplaintConversation).where(
            ComplaintConversation.order_id == order_id
        )
    )

    conversation_conditions = [Conversation.order_id == order_id]  # Базовое условие чата
    if customer_id is not None:  # Сужаем по заказчику, если указан
        conversation_conditions.append(Conversation.customer_id == customer_id)
    if executor_id is not None:  # Сужаем по исполнителю, если указан
        conversation_conditions.append(Conversation.executor_id == executor_id)
    await db.execute(delete(Conversation).where(*conversation_conditions))  # Удаляем переписку

    customer_cancel_conditions = [CustomerOrderCancellation.order_id == order_id]  # Условия отказа заказчика
    executor_cancel_conditions = [ExecutorOrderCancellation.order_id == order_id]  # Условия отказа исполнителя
    if customer_id is not None:  # Фильтр отказов по заказчику
        customer_cancel_conditions.append(
            CustomerOrderCancellation.customer_id == customer_id
        )
        executor_cancel_conditions.append(
            ExecutorOrderCancellation.customer_id == customer_id
        )
    if executor_id is not None:  # Фильтр отказов по исполнителю
        customer_cancel_conditions.append(
            CustomerOrderCancellation.executor_id == executor_id
        )
        executor_cancel_conditions.append(
            ExecutorOrderCancellation.executor_id == executor_id
        )

    if not preserve_cancellations:  # При необходимости удаляем записи отказов
        await db.execute(
            delete(CustomerOrderCancellation).where(*customer_cancel_conditions)
        )
        await db.execute(
            delete(ExecutorOrderCancellation).where(*executor_cancel_conditions)
        )

    if executor_id is not None:  # Удаляем отклик конкретного исполнителя
        await delete_executor_response_for_order(db, order_id, executor_id)

    await db.flush()  # Фиксируем изменения в сессии


async def delete_all_order_related_data(db: AsyncSession, order_id: int) -> None:  # Полная очистка данных заказа
    """
    Удаляет данные заказа, доступные на ранних этапах:
    смета, чат, договор, отклики, отказы, статусы и незавершённые платежи.
    Записи information_about_executors не связаны с заказом — сохраняются.
    """
    await clear_order_refusal_collateral(db, order_id)  # Чат, жалобы, отказы, отклики

    await db.execute(delete(Contract).where(Contract.order_id == order_id))  # Договор

    await clear_all_order_estimate_and_graphic_data(db, order_id)  # Смета и графика

    await db.execute(delete(Payment).where(Payment.order_id == order_id))  # Платежи

    await db.execute(  # Все отклики исполнителей
        delete(OrderResponseExecutor).where(
            OrderResponseExecutor.order_id == order_id
        )
    )
    await db.execute(  # Назначения исполнителей
        delete(ExecutorOrder).where(ExecutorOrder.order_id == order_id)
    )
    await db.execute(  # Статусы исполнителей
        delete(StatusOrderExecutor).where(StatusOrderExecutor.order_id == order_id)
    )
    await db.execute(  # Статусы заказчика
        delete(StatusOrderCustomer).where(StatusOrderCustomer.order_id == order_id)
    )


def _is_refused_executor_service_status(status: Optional[str]) -> bool:  # Статус «отказ» для услуги исполнителя
    normalized = status or ""  # Пустой статус → пустая строка
    return REFUSED_BY_CUSTOMER_STATUS in normalized or REFUSED_BY_ORDER_STATUS in normalized  # Проверка подстрок


async def _get_executor_ids_to_notify_on_customer_delete(  # Id исполнителей для уведомления при удалении
    db: AsyncSession,
    order_id: int,
) -> set[int]:
    response_rows = await db.execute(  # Исполнители из откликов
        select(OrderResponseExecutor.executor_id).where(
            OrderResponseExecutor.order_id == order_id
        )
    )
    assigned_rows = await db.execute(  # Назначенные исполнители
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    executor_status_rows = await db.execute(  # Исполнители из статусов
        select(StatusOrderExecutor.executor_id).where(
            StatusOrderExecutor.order_id == order_id
        )
    )

    executor_ids: set[int] = set()  # Множество уникальных id
    executor_ids.update(row[0] for row in response_rows.all() if row[0])  # Из откликов
    executor_ids.update(row[0] for row in assigned_rows.all() if row[0])  # Из назначений
    executor_ids.update(row[0] for row in executor_status_rows.all() if row[0])  # Из статусов
    return executor_ids  # Итоговый список для уведомлений


async def delete_order_by_customer(  # Удаление заказа заказчиком
    db: AsyncSession,
    order_id: int,
    customer_id: int,
) -> dict:
    order_result = await db.execute(select(Order).where(Order.id == order_id))  # Ищем заказ
    order = order_result.scalar_one_or_none()
    if not order:  # Заказ не найден
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order.customer_id != customer_id:  # Проверка владельца
        raise HTTPException(status_code=403, detail="Нет прав на удаление заказа")

    status_result = await db.execute(  # Последний статус заказчика
        select(StatusOrderCustomer)
        .where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
        .order_by(StatusOrderCustomer.id.desc())
    )
    status_row = status_result.scalars().first()
    current_status = status_row.status if status_row else None  # Текущий статус или None

    if not current_status or current_status not in CUSTOMER_DELETABLE_STATUSES:  # Удаление запрещено
        raise HTTPException(
            status_code=400,
            detail="Заказ нельзя удалить в текущем статусе",
        )

    executor_ids = await _get_executor_ids_to_notify_on_customer_delete(db, order_id)  # Кого уведомить

    order_title = order.title or f"№ {order_id}"  # Заголовок для уведомления
    notification_message = (  # Текст уведомления исполнителям
        f"Заказчик удалил заказ «{order_title}». "
        "Смета, отклики, переписка и договор по заказу удалены."
    )

    for executor_id in executor_ids:  # Создаём уведомление каждому исполнителю
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

    await delete_all_order_related_data(db, order_id)  # Очищаем связанные данные
    await db.execute(delete(Order).where(Order.id == order_id))  # Удаляем сам заказ
    await db.flush()  # Сбрасываем в транзакцию

    logger.info(  # Лог успешного удаления
        "Order %s deleted by customer %s, notified %s executors",
        order_id,
        customer_id,
        len(executor_ids),
    )

    return {  # Ответ API
        "order_id": order_id,
        "deleted": True,
        "notified_executors": len(executor_ids),
    }


async def _has_assignment_data_to_clear(db: AsyncSession, order_id: int) -> bool:  # Есть ли данные назначения для очистки
    checks = (  # Набор проверочных SELECT по одной строке
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
    for query in checks:  # Перебираем таблицы
        result = await db.execute(query.limit(1))  # Достаточно одной записи
        if result.scalar_one_or_none() is not None:  # Данные найдены
            return True
    return False  # Нечего очищать


async def can_clear_order_after_executor_refusal(  # Можно ли очистить заказ после отказа исполнителя
    db: AsyncSession,
    order_id: int,
    customer_id: int,
) -> bool:
    order_result = await db.execute(select(Order).where(Order.id == order_id))  # Заказ
    order = order_result.scalar_one_or_none()
    if not order or order.customer_id != customer_id:  # Нет заказа или не владелец
        return False

    status_result = await db.execute(  # Последний статус заказчика
        select(StatusOrderCustomer.status)
        .where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
        .order_by(StatusOrderCustomer.id.desc())
        .limit(1)
    )
    current_status = status_result.scalar_one_or_none()
    if not current_status or SEARCH_EXECUTOR_STATUS not in current_status:  # Не в поиске исполнителя
        return False

    return await _has_assignment_data_to_clear(db, order_id)  # Есть что очищать


async def clear_order_data_after_executor_refusal(  # Очистка данных заказа после отказа исполнителя
    db: AsyncSession,
    order_id: int,
    customer_id: int,
) -> dict:
    if not await can_clear_order_after_executor_refusal(db, order_id, customer_id):  # Проверка допустимости
        raise HTTPException(
            status_code=400,
            detail="Очистка данных недоступна для этого заказа",
        )

    await clear_all_order_estimate_and_graphic_data(db, order_id)  # Смета и графика

    await db.execute(delete(Contract).where(Contract.order_id == order_id))  # Договор
    await clear_order_refusal_collateral(db, order_id)  # Чат, жалобы, отказы

    response_result = await db.execute(  # Удаляем все отклики
        delete(OrderResponseExecutor).where(
            OrderResponseExecutor.order_id == order_id
        )
    )
    deleted_responses = response_result.rowcount or 0  # Сколько откликов удалено

    await db.flush()  # Фиксируем в сессии

    logger.info(  # Лог очистки
        "Order %s assignment data cleared by customer %s, responses=%s",
        order_id,
        customer_id,
        deleted_responses,
    )

    return {  # Ответ API
        "order_id": order_id,
        "cleared": True,
        "deleted_responses": deleted_responses,
    }


async def _get_executor_service_status(  # Последний статус услуги исполнителя по заказу
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
    return result.scalar_one_or_none()  # Статус или None


async def can_executor_delete_service(  # Можно ли исполнителю удалить свою услугу
    db: AsyncSession,
    order_id: int,
    executor_id: int,
) -> bool:
    order_result = await db.execute(select(Order).where(Order.id == order_id))  # Заказ существует?
    if order_result.scalar_one_or_none() is None:
        return False

    status = await _get_executor_service_status(db, order_id, executor_id)  # Статус услуги
    return _is_refused_executor_service_status(status)  # Только при отказе


async def delete_executor_service(  # Удаление услуги исполнителя по заказу
    db: AsyncSession,
    order_id: int,
    executor_id: int,
) -> dict:
    if not await can_executor_delete_service(db, order_id, executor_id):  # Проверка статуса
        raise HTTPException(
            status_code=400,
            detail="Услугу нельзя удалить в текущем статусе",
        )

    order_result = await db.execute(select(Order).where(Order.id == order_id))  # Заказ для customer_id
    order = order_result.scalar_one_or_none()
    customer_id = order.customer_id if order else None  # Id заказчика

    await clear_estimate_and_graphic_for_order(  # Смета и графика исполнителя
        db=db,
        user_id=executor_id,
        order_id=order_id,
    )

    await db.execute(  # Договор этого исполнителя
        delete(Contract).where(
            Contract.order_id == order_id,
            Contract.executor_id == executor_id,
        )
    )

    if customer_id is not None:  # Полная очистка collateral с привязкой к паре
        await clear_order_refusal_collateral(
            db,
            order_id,
            customer_id=customer_id,
            executor_id=executor_id,
        )
    else:  # Без заказчика — только отклик
        await delete_executor_response_for_order(db, order_id, executor_id)

    await db.execute(  # Статус исполнителя по заказу
        delete(StatusOrderExecutor).where(
            StatusOrderExecutor.order_id == order_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
    )
    await db.flush()  # Сброс в транзакцию

    logger.info(  # Лог удаления услуги
        "Executor service removed: order_id=%s executor_id=%s",
        order_id,
        executor_id,
    )

    return {  # Ответ API
        "order_id": order_id,
        "deleted": True,
    }


async def remove_customer_executor_from_list(  # Скрывает исполнителя в списке «Мои исполнители»
    db: AsyncSession,
    customer_id: int,
    executor_id: int,
) -> dict:
    """Убирает исполнителя из списка «Мои исполнители» у заказчика."""
    user_result = await db.execute(select(User).where(User.id == executor_id))  # Исполнитель существует?
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Исполнитель не найден")

    result = await db.execute(  # Запись контакта заказчик–исполнитель
        select(InformationAboutExecutor).where(
            InformationAboutExecutor.customer_id == customer_id,
            InformationAboutExecutor.executor_id == executor_id,
        )
    )
    saved_info = result.scalar_one_or_none()

    if saved_info:  # Обновляем существующую запись
        saved_info.phone = HIDDEN_CUSTOMER_EXECUTOR_MARKER
        saved_info.notification = None
    else:  # Создаём скрытую запись
        db.add(
            InformationAboutExecutor(
                customer_id=customer_id,
                executor_id=executor_id,
                phone=HIDDEN_CUSTOMER_EXECUTOR_MARKER,
                notification=None,
            )
        )

    await db.flush()  # Сохраняем в сессии

    logger.info(  # Лог скрытия
        "Executor hidden from customer list: customer_id=%s executor_id=%s",
        customer_id,
        executor_id,
    )

    return {  # Ответ API
        "executor_id": executor_id,
        "removed": True,
    }


async def remove_executor_customer_from_list(  # Скрывает заказчика в списке «Заказчики»
    db: AsyncSession,
    executor_id: int,
    customer_id: int,
) -> dict:
    """Убирает заказчика из списка «Заказчики» у исполнителя."""
    user_result = await db.execute(select(User).where(User.id == customer_id))  # Заказчик существует?
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Заказчик не найден")

    result = await db.execute(  # Запись контакта исполнитель–заказчик
        select(InformationAboutCustomer).where(
            InformationAboutCustomer.executor_id == executor_id,
            InformationAboutCustomer.customer_id == customer_id,
        )
    )
    saved_info = result.scalar_one_or_none()

    if saved_info:  # Обновляем существующую запись
        saved_info.phone = HIDDEN_CUSTOMER_EXECUTOR_MARKER
        saved_info.notification = None
    else:  # Создаём скрытую запись
        db.add(
            InformationAboutCustomer(
                executor_id=executor_id,
                customer_id=customer_id,
                phone=HIDDEN_CUSTOMER_EXECUTOR_MARKER,
                notification=None,
            )
        )

    await db.flush()  # Сохраняем в сессии

    logger.info(  # Лог скрытия
        "Customer hidden from executor list: executor_id=%s customer_id=%s",
        executor_id,
        customer_id,
    )

    return {  # Ответ API
        "customer_id": customer_id,
        "removed": True,
    }


CUSTOMER_CANCEL_PENDING_STATUS = "pending_executor"  # Отказ заказчика ждёт ответа исполнителя
EXECUTOR_CANCEL_PENDING_STATUS = "pending_customer"  # Отказ исполнителя ждёт ответа заказчика


async def withdraw_customer_order_cancel(  # Отзыв заявки на отказ заказчиком
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> dict:
    result = await db.execute(  # Ищем заявку на отказ
        select(CustomerOrderCancellation).where(
            CustomerOrderCancellation.order_id == order_id,
            CustomerOrderCancellation.customer_id == customer_id,
            CustomerOrderCancellation.executor_id == executor_id,
        )
    )
    cancellation = result.scalar_one_or_none()
    if not cancellation:  # Заявка не найдена
        raise HTTPException(status_code=404, detail="Заявка на отказ не найдена")
    if cancellation.status != CUSTOMER_CANCEL_PENDING_STATUS:  # Не в ожидании исполнителя
        raise HTTPException(
            status_code=409,
            detail="Отменить можно только заявку, ожидающую ответа исполнителя",
        )

    await db.delete(cancellation)  # Удаляем заявку
    await clear_cancel_notifications_for_order(  # Убираем связанные уведомления
        db,
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
    )
    await db.flush()  # Фиксируем в сессии

    logger.info(  # Лог отзыва
        "Customer cancel withdrawn: order_id=%s customer_id=%s executor_id=%s",
        order_id,
        customer_id,
        executor_id,
    )
    return {"order_id": order_id, "withdrawn": True}  # Ответ API


async def withdraw_executor_order_cancel(  # Отзыв заявки на отказ исполнителем
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> dict:
    result = await db.execute(  # Ищем заявку на отказ
        select(ExecutorOrderCancellation).where(
            ExecutorOrderCancellation.order_id == order_id,
            ExecutorOrderCancellation.customer_id == customer_id,
            ExecutorOrderCancellation.executor_id == executor_id,
        )
    )
    cancellation = result.scalar_one_or_none()
    if not cancellation:  # Заявка не найдена
        raise HTTPException(status_code=404, detail="Заявка на отказ не найдена")
    if cancellation.status != EXECUTOR_CANCEL_PENDING_STATUS:  # Не в ожидании заказчика
        raise HTTPException(
            status_code=409,
            detail="Отменить можно только заявку, ожидающую ответа заказчика",
        )

    await db.delete(cancellation)  # Удаляем заявку
    await clear_cancel_notifications_for_order(  # Убираем связанные уведомления
        db,
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
    )
    await db.flush()  # Фиксируем в сессии

    logger.info(  # Лог отзыва
        "Executor cancel withdrawn: order_id=%s customer_id=%s executor_id=%s",
        order_id,
        customer_id,
        executor_id,
    )
    return {"order_id": order_id, "withdrawn": True}  # Ответ API

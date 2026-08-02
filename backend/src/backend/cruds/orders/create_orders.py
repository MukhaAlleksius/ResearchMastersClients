from datetime import datetime  # Дата/время для updated_at
from decimal import Decimal  # Точные суммы возвратов
import logging  # Логирование CRUD-операций
from typing import Optional  # Опциональные поля

from fastapi import HTTPException  # HTTP-ошибки API
from pydantic import ValidationError  # Ошибки валидации схем
from sqlalchemy import and_, delete, or_, select, func, update  # SQL-операции
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from cruds.estimate_graphic_works.delete_estimate_graphic_works import (  # Очистка сметы/графика
    clear_estimate_and_graphic_for_order,  # Продолжение выражения
)  # Закрытие вызова/выражения
from cruds.orders.delete_orders import clear_order_refusal_collateral  # Сброс залогов отказа
from cruds.notifications_crud import (  # Уведомления и статусы заказов
    CANCEL_DECISION_NOTIFICATION_TYPE,  # Продолжение выражения
    CANCEL_REQUESTED_NOTIFICATION_TYPE,  # Продолжение выражения
    CUSTOMER_OFFER_STATUS,  # Продолжение выражения
    ORDER_REFUSED_NOTIFICATION_TYPE,  # Продолжение выражения
    START_DATE_UPDATED_NOTIFICATION_TYPE,  # Продолжение выражения
    is_in_progress_status,  # Статус
    is_order_in_wait_execute,  # Продолжение выражения
    notify_customer_executor_response,  # Продолжение выражения
    notify_customer_on_customer_status_change,  # Статус
    notify_executor_on_status_change,  # Статус
    notify_order_event_safe,  # Продолжение выражения
)  # Закрытие вызова/выражения
from cruds.users_crud import is_specialization_user  # Проверка специализации исполнителя
from models.contracts_models import Contract  # Договор по заказу
from models.users_models import User  # Пользователь
from models.works_materials_models import CategoryWork, CategoryWorkMaster  # Категории работ
from models.orders_models import (  # Модели заказов и связанных сущностей
    CustomerOrderCancellation,  # Продолжение выражения
    ExecutorOrder,  # Продолжение выражения
    ExecutorOrderCancellation,  # Продолжение выражения
    GraphicOrderMaster,  # Продолжение выражения
    InformationAboutCustomer,  # Продолжение выражения
    InformationAboutExecutor,  # Продолжение выражения
    Order,  # Продолжение выражения
    OrderResponseExecutor,  # Продолжение выражения
    Review,  # Продолжение выражения
    StatusOrderCustomer,  # Продолжение выражения
    StatusOrderExecutor,  # Продолжение выражения
)  # Закрытие вызова/выражения

from schemas.orders_schemas import (  # Pydantic-схемы заказов
    CancelOrderCustomerForAdminRead,  # Продолжение выражения
    CustomerDecisionSchema,  # Продолжение выражения
    CustomerOrderCancellationCreateSchema,  # Продолжение выражения
    CustomerOrderCancellationReadSchema,  # Продолжение выражения
    ExecutorDecisionSchema,  # Продолжение выражения
    ExecutorOrderCancellationCreateSchema,  # Продолжение выражения
    ExecutorOrderCancellationReadSchema,  # Продолжение выражения
    ExecutorOrderSchema,  # Продолжение выражения
    GraphicOrderMasterCreate,  # Продолжение выражения
    GraphicOrderMasterRead,  # Продолжение выражения
    InformationAboutCustomerRead,  # Продолжение выражения
    InformationAboutCustomerSchema,  # Продолжение выражения
    InformationAboutExecutorRead,  # Продолжение выражения
    InformationAboutExecutorSchema,  # Продолжение выражения
    OrderCardForAdmin,  # Продолжение выражения
    OrderCreateSchema,  # Продолжение выражения
    OrderProfileForAdmin,  # Продолжение выражения
    OrderReadSchema,  # Продолжение выражения
    OrderResponseExecutorReadSchema,  # Продолжение выражения
    OrderResponseExecutorSchema,  # Продолжение выражения
    OrderUserSchema,  # Продолжение выражения
    ReviewCreateSchema,  # Продолжение выражения
    ServiceProfileForAdmin,  # Продолжение выражения
    ServiceUserSchema,  # Продолжение выражения
    StatusOrderCustomerSchema,  # Продолжение выражения
    StatusOrderExecutorSchema,  # Продолжение выражения
)  # Закрытие вызова/выражения

import traceback  # Трассировка исключений

logger = logging.getLogger(__name__)  # Логгер модуля

SELF_EXECUTION_STATUS = "Самостоятельное выполнение"  # Заказчик выполняет сам
DRAFT_STATUS = "Не предложенные исполнителям"  # Черновик заказа
SEARCH_EXECUTOR_STATUS = "В поиске исполнителя"  # Публичный поиск
REFUSED_BY_CUSTOMER_STATUS = "Отказано заказчиком"  # Отказ заказчика исполнителю
REFUSED_BY_ORDER_STATUS = "Отказ от заказа"  # Отказ исполнителя от заказа
AWAITING_EXECUTION_STATUS = "Ожидают выполнения"  # Назначен, ждёт старт
COMPLETED_EXECUTOR_STATUS = "Выполнен"  # Заказ завершён


def status_assigns_executor_order(status: Optional[str]) -> bool:  # Статус назначает исполнителя?
    normalized = (status or "").strip()  # Нормализуем строку
    if not normalized:  # Пустой статус
        return False  # Не назначает
    if normalized in {  # Явные статусы назначения
        AWAITING_EXECUTION_STATUS,  # Продолжение выражения
        SELF_EXECUTION_STATUS,  # Продолжение выражения
        COMPLETED_EXECUTOR_STATUS,  # Продолжение выражения
    }:  # Строка кода
        return True  # Назначает
    return is_in_progress_status(normalized)  # Или «в работе»


async def assert_executor_is_not_order_customer(  # Запрет: заказчик ≠ исполнитель
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    executor_id: int,  # ID исполнителя
) -> None:  # Закрытие вызова/выражения
    """Заказчик не может быть исполнителем по своему же заказу."""
    result = await db.execute(select(Order.customer_id).where(Order.id == order_id))  # ID заказчика
    customer_id = result.scalar_one_or_none()  # Значение или None
    if customer_id is None:  # Заказ не найден
        raise HTTPException(status_code=404, detail="Заказ не найден")  # Выбрасываем HTTP-ошибку
    if int(customer_id) == int(executor_id):  # Совпадение ролей
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=400,  # Статус
            detail="Нельзя выступать исполнителем по собственному заказу",  # Текст ошибки
        )  # Закрытие вызова/выражения


def assert_customer_and_executor_are_different(  # Разные пользователи для контактов
    customer_id: int,  # ID заказчика
    executor_id: int,  # ID исполнителя
) -> None:  # Закрытие вызова/выражения
    if int(customer_id) == int(executor_id):  # Один и тот же ID
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=400,  # Статус
            detail="Заказчик и исполнитель не могут быть одним и тем же пользователем",  # Текст ошибки
        )  # Закрытие вызова/выражения


async def ensure_executor_order_assignment(  # Создать/обновить назначение исполнителя
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    executor_id: int,  # ID исполнителя
) -> ExecutorOrder:  # Закрытие вызова/выражения
    await assert_executor_is_not_order_customer(  # Проверка ролей
        db, order_id=order_id, executor_id=executor_id  # Данные заказа
    )  # Закрытие вызова/выражения

    result = await db.execute(  # Ищем существующую запись
        select(ExecutorOrder).where(ExecutorOrder.order_id == order_id)  # SQL SELECT
    )  # Закрытие вызова/выражения
    existing = result.scalar_one_or_none()  # Текущее назначение

    if existing:  # Уже есть запись
        if existing.executor_id != executor_id:  # Другой исполнитель
            existing.executor_id = executor_id  # Переназначаем
            await db.flush()  # Сохраняем в БД
        return existing  # Возвращаем актуальную запись

    executor_order = ExecutorOrder(  # Новое назначение
        order_id=order_id,  # ID заказа
        executor_id=executor_id,  # ID исполнителя
    )  # Закрытие вызова/выражения
    db.add(executor_order)  # Добавляем в сессию
    await db.flush()  # Получаем ID
    return executor_order  # Готовая запись


async def _resolve_cancel_notification_type(  # Тип уведомления об отмене
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    customer_id: int,  # ID заказчика
    executor_id: int,  # ID исполнителя
) -> str:  # Закрытие вызова/выражения
    if await is_order_in_wait_execute(  # Заказ уже ждёт выполнения
        db,  # Сессия БД
        order_id=order_id,  # ID заказа
        customer_id=customer_id,  # ID заказчика
        executor_id=executor_id,  # ID исполнителя
    ):  # Закрытие вызова/выражения
        return ORDER_REFUSED_NOTIFICATION_TYPE  # Отказ от заказа
    return CANCEL_REQUESTED_NOTIFICATION_TYPE  # Запрос на отмену


def _can_release_order_to_search(customer_status: Optional[str]) -> bool:  # Можно вернуть в поиск?
    if not customer_status or customer_status == SEARCH_EXECUTOR_STATUS:  # Уже в поиске/пусто
        return False  # Условие не выполнено
    if AWAITING_EXECUTION_STATUS in customer_status:  # Был назначен исполнитель
        return True  # Доступ разрешён
    return is_in_progress_status(customer_status)  # Или заказ в работе


async def _maybe_notify_customer_status_change(  # Уведомить заказчика о смене статуса
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    status_order_customer_schema: StatusOrderCustomerSchema,  # Статус
    previous_status: Optional[str],  # Статус
    new_status: str,  # Статус
) -> None:  # Закрытие вызова/выражения
    if status_order_customer_schema.suppress_executor_notification:  # Флаг подавления
        return  # Выход из функции
    if is_in_progress_status(new_status):  # «В работе» — отдельная логика
        return  # Выход из функции

    await notify_customer_on_customer_status_change(  # Отправка уведомления
        db=db,  # Сессия БД
        customer_id=status_order_customer_schema.customer_id,  # ID заказчика
        order_id=status_order_customer_schema.order_id,  # ID заказа
        previous_status=previous_status,  # Статус
        new_status=new_status,  # Статус
    )  # Закрытие вызова/выражения


async def _notify_executor_on_status_change(  # Обёртка уведомления исполнителю
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    executor_id: int,  # ID исполнителя
    order_id: int,  # ID заказа
    previous_status: Optional[str],  # Статус
    new_status: str,  # Статус
) -> None:  # Закрытие вызова/выражения
    await notify_executor_on_status_change(  # Вызов CRUD уведомлений
        db=db,  # Сессия БД
        executor_id=executor_id,  # ID исполнителя
        order_id=order_id,  # ID заказа
        previous_status=previous_status,  # Статус
        new_status=new_status,  # Статус
    )  # Закрытие вызова/выражения


async def _sync_customer_status_for_executor_progress(  # Синхрон статуса заказчика с исполнителем
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    new_status: str,  # Статус
) -> None:  # Закрытие вызова/выражения
    if not is_in_progress_status(new_status):  # Не «в работе»
        return  # Выход из функции

    order = await db.get(Order, order_id)  # Заказ
    if not order or not order.customer_id:  # Нет заказа/заказчика
        return  # Выход из функции

    result = await db.execute(  # Статус заказчика
        select(StatusOrderCustomer).where(  # SQL SELECT
            StatusOrderCustomer.order_id == order_id,  # ID заказа
            StatusOrderCustomer.customer_id == order.customer_id,  # ID заказчика
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    customer_row = result.scalar_one_or_none()  # Строка статуса
    if not customer_row or customer_row.status == new_status:  # Нет изменений
        return  # Выход из функции

    previous_status = customer_row.status  # Старый статус
    customer_row.status = new_status  # Обновляем
    await db.flush()  # В БД
    await _maybe_notify_customer_status_change(  # Уведомление без дубля исполнителю
        db=db,  # Сессия БД
        status_order_customer_schema=StatusOrderCustomerSchema(  # Данные заказа
            order_id=order_id,  # ID заказа
            customer_id=order.customer_id,  # ID заказчика
            status=new_status,  # Статус
            suppress_executor_notification=True,  # Уведомление
        ),  # Продолжение выражения
        previous_status=previous_status,  # Статус
        new_status=new_status,  # Статус
    )  # Закрытие вызова/выражения


async def _release_order_to_search(  # Вернуть заказ в поиск исполнителя
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    customer_id: int,  # ID заказчика
    executor_id: int,  # ID исполнителя
    executor_status: str,  # Статус
) -> None:  # Закрытие вызова/выражения
    result = await db.execute(  # Статус заказчика
        select(StatusOrderCustomer).where(  # SQL SELECT
            StatusOrderCustomer.order_id == order_id,  # ID заказа
            StatusOrderCustomer.customer_id == customer_id,  # ID заказчика
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    customer_status_row = result.scalar_one_or_none()  # Текущая запись
    if not customer_status_row:  # Нет статуса
        return  # Выход из функции

    previous_customer_status = customer_status_row.status  # До изменения
    customer_status_row.status = SEARCH_EXECUTOR_STATUS  # В поиск
    await db.flush()  # Сохраняем изменения в сессии

    await _maybe_notify_customer_status_change(  # Уведомить заказчика
        db=db,  # Сессия БД
        status_order_customer_schema=StatusOrderCustomerSchema(  # Данные заказа
            order_id=order_id,  # ID заказа
            customer_id=customer_id,  # ID заказчика
            status=SEARCH_EXECUTOR_STATUS,  # Статус
            suppress_executor_notification=True,  # Уведомление
        ),  # Продолжение выражения
        previous_status=previous_customer_status,  # Статус
        new_status=SEARCH_EXECUTOR_STATUS,  # Статус
    )  # Закрытие вызова/выражения

    result = await db.execute(  # Статус исполнителя
        select(StatusOrderExecutor).where(  # SQL SELECT
            StatusOrderExecutor.order_id == order_id,  # ID заказа
            StatusOrderExecutor.executor_id == executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    executor_status_row = result.scalar_one_or_none()  # Запись или None
    if executor_status_row:  # Обновляем существующую
        executor_status_row.status = executor_status  # Строка результата
        await db.flush()  # Сохраняем изменения в сессии
    else:  # Создаём новую
        executor_status_row = StatusOrderExecutor(  # Строка результата
            order_id=order_id,  # ID заказа
            executor_id=executor_id,  # ID исполнителя
            status=executor_status,  # Статус
        )  # Закрытие вызова/выражения
        db.add(executor_status_row)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии

    await db.execute(  # Удаляем назначение исполнителя
        delete(ExecutorOrder).where(  # Назначение исполнителя
            ExecutorOrder.order_id == order_id,  # ID заказа
            ExecutorOrder.executor_id == executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    await db.execute(  # Удаляем договор
        delete(Contract).where(  # Строка кода
            Contract.order_id == order_id,  # ID заказа
            Contract.customer_id == customer_id,  # ID заказчика
            Contract.executor_id == executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    await clear_order_refusal_collateral(  # Сброс залогов, отмены сохраняем
        db,  # Сессия БД
        order_id,  # ID заказа
        customer_id=customer_id,  # ID заказчика
        executor_id=executor_id,  # ID исполнителя
        preserve_cancellations=True,  # Продолжение выражения
    )  # Закрытие вызова/выражения
    await db.execute(  # Обновляем updated_at заказа
        update(Order).where(Order.id == order_id).values(updated_at=datetime.utcnow())  # Идентификатор
    )  # Закрытие вызова/выражения
    await db.flush()  # Сохраняем изменения в сессии


async def apply_in_progress_customer_cancel_agreed(  # Согласие исполнителя на отмену заказчиком
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    customer_id: int,  # ID заказчика
    executor_id: int,  # ID исполнителя
) -> bool:  # Закрытие вызова/выражения
    """После согласия исполнителя на отмену заказчиком: заказ → в поиск, услуга → отказано заказчиком."""
    result = await db.execute(  # Статус заказчика
        select(StatusOrderCustomer).where(  # SQL SELECT
            StatusOrderCustomer.order_id == order_id,  # ID заказа
            StatusOrderCustomer.customer_id == customer_id,  # ID заказчика
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    customer_status_row = result.scalar_one_or_none()  # Строка результата
    if not customer_status_row or not _can_release_order_to_search(  # Нельзя вернуть в поиск
        customer_status_row.status  # Строка кода
    ):  # Закрытие вызова/выражения
        return False  # Ничего не сделано

    await _release_order_to_search(  # В поиск + статус отказа заказчиком
        db,  # Сессия БД
        order_id=order_id,  # ID заказа
        customer_id=customer_id,  # ID заказчика
        executor_id=executor_id,  # ID исполнителя
        executor_status=REFUSED_BY_CUSTOMER_STATUS,  # Статус
    )  # Закрытие вызова/выражения
    return True  # Успешно


async def apply_executor_cancel_agreed(  # Согласие заказчика на отказ исполнителя
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    customer_id: int,  # ID заказчика
    executor_id: int,  # ID исполнителя
) -> bool:  # Закрытие вызова/выражения
    """После согласия заказчика на отказ исполнителя: заказ → в поиск, услуга → отказ от заказа."""
    result = await db.execute(  # Статус заказчика
        select(StatusOrderCustomer).where(  # SQL SELECT
            StatusOrderCustomer.order_id == order_id,  # ID заказа
            StatusOrderCustomer.customer_id == customer_id,  # ID заказчика
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    customer_status_row = result.scalar_one_or_none()  # Строка результата
    if not customer_status_row or not _can_release_order_to_search(  # Нельзя вернуть
        customer_status_row.status  # Строка кода
    ):  # Закрытие вызова/выражения
        return False  # Условие не выполнено

    await _release_order_to_search(  # В поиск + «отказ от заказа»
        db,  # Сессия БД
        order_id=order_id,  # ID заказа
        customer_id=customer_id,  # ID заказчика
        executor_id=executor_id,  # ID исполнителя
        executor_status=REFUSED_BY_ORDER_STATUS,  # Статус
    )  # Закрытие вызова/выражения
    return True  # Доступ разрешён


async def add_order_user(db: AsyncSession, order_schema: OrderCreateSchema):  # Создать заказ заказчика
    try:  # Начало блока try
        result_category_work_id = await db.execute(  # ID категории по имени
            select(CategoryWork.id).filter(  # SQL SELECT
                CategoryWork.name == order_schema.category_work  # Имя/название
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        category_work_id = result_category_work_id.scalars().first()  # ID категории работ
        result = await db.execute(  # Проверка дубликата
            select(Order.id).filter(  # SQL SELECT
                and_(  # Логическое И
                    Order.title == order_schema.title,  # Заголовок
                    Order.description == order_schema.description,  # Описание
                    Order.customer_id == order_schema.customer_id,  # ID заказчика
                    Order.category_id == category_work_id,  # Категория работ
                    Order.budget == order_schema.budget,  # Бюджет
                    Order.budget_type == order_schema.budget_type,  # Бюджет
                    Order.location == order_schema.location,  # Адрес/локация
                    Order.town == order_schema.town,  # Город
                    Order.region == order_schema.region,  # Регион
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        existing_order_id = result.scalar_one_or_none()  # Существующая запись
        if existing_order_id:  # Уже есть такой заказ
            return  # Заказ уже существует, не добавляем

        order = Order(  # Новая запись заказа
            title=order_schema.title,  # Заголовок
            description=order_schema.description,  # Описание
            customer_id=order_schema.customer_id,  # ID заказчика
            category_id=category_work_id,  # Категория работ
            budget=order_schema.budget,  # Бюджет
            currency=order_schema.currency,  # Валюта
            budget_type=order_schema.budget_type,  # Бюджет
            urgency_level=order_schema.urgency_level,  # Срочность
            country=order_schema.country,  # Страна
            region=order_schema.region,  # Регион
            town=order_schema.town,  # Город
            location=order_schema.location,  # Адрес/локация
            deadline=order_schema.deadline,  # Срок
            insurance_required=order_schema.insurance_required,  # Страхование
        )  # Закрытие вызова/выражения

        db.add(order)  # В сессию
        await db.flush()  # ID в БД

        return order  # Созданный заказ
    except Exception as e:  # Любая ошибка
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # Выбрасываем HTTP-ошибку


async def add_status_order_customer(  # Статус заказа для заказчика
    db: AsyncSession, status_order_customer_schema: StatusOrderCustomerSchema  # Статус заказчика
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        logger.info(  # Лог создания
            f"Создание статуса: order_id={status_order_customer_schema.order_id}, customer_id={status_order_customer_schema.customer_id}"  # Данные заказа
        )  # Закрытие вызова/выражения

        result = await db.execute(  # Ищем существующий статус
            select(StatusOrderCustomer).where(  # SQL SELECT
                StatusOrderCustomer.order_id == status_order_customer_schema.order_id,  # ID заказа
                StatusOrderCustomer.customer_id  # Статус заказчика
                == status_order_customer_schema.customer_id,  # ID заказчика
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        existing = result.scalar_one_or_none()  # Существующая запись
        if existing:  # Обновление
            old_status = existing.status  # Старое значение
            new_status = status_order_customer_schema.status  # Новое значение

            if old_status == SELF_EXECUTION_STATUS and new_status == DRAFT_STATUS:  # Сам → черновик
                await clear_estimate_and_graphic_for_order(  # Очищаем смету и график
                    db=db,  # Сессия БД
                    user_id=status_order_customer_schema.customer_id,  # ID заказчика
                    order_id=status_order_customer_schema.order_id,  # ID заказа
                )  # Закрытие вызова/выражения

            existing.status = new_status  # Новый статус
            await db.flush()  # Сохраняем изменения в сессии
            await _maybe_notify_customer_status_change(  # Уведомление
                db=db,  # Сессия БД
                status_order_customer_schema=status_order_customer_schema,  # Статус
                previous_status=old_status,  # Статус
                new_status=new_status,  # Статус
            )  # Закрытие вызова/выражения
            await db.commit()  # Фиксируем транзакцию
            await db.refresh(existing)  # Актуальные данные
            return existing  # Возвращаем результат

        status_order_customer = StatusOrderCustomer(  # Новая запись статуса
            order_id=status_order_customer_schema.order_id,  # ID заказа
            customer_id=status_order_customer_schema.customer_id,  # ID заказчика
            status=status_order_customer_schema.status,  # Статус
        )  # Закрытие вызова/выражения

        db.add(status_order_customer)  # Закрывающая скобка вызова
        await db.flush()  # Генерируем ID
        await _maybe_notify_customer_status_change(  # Отправляем уведомление
            db=db,  # Сессия БД
            status_order_customer_schema=status_order_customer_schema,  # Статус
            previous_status=None,  # Статус
            new_status=status_order_customer_schema.status,  # Статус
        )  # Закрытие вызова/выражения
        await db.commit()  # Фиксируем транзакцию
        await db.refresh(status_order_customer)  # Обновляем объект из БД

        logger.info(f"Статус создан: id={status_order_customer.id}")  # Запись в лог
        return status_order_customer  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откат при ошибке
        logger.error(f"Ошибка создания статуса: {str(e)}")  # Запись в лог
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500, detail=f"Ошибка создания статуса: {str(e)}"  # Статусная запись
        )  # Закрытие вызова/выражения


async def is_executor_blocked_from_customer_reoffer(  # Блок повторного предложения
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    executor_id: int,  # ID исполнителя
) -> bool:  # Закрытие вызова/выражения
    """Исполнитель уже отклонён заказчиком — повторно предложить заказ нельзя."""
    status_result = await db.execute(  # Статус исполнителя по заказу
        select(StatusOrderExecutor.status).where(  # SQL SELECT
            StatusOrderExecutor.order_id == order_id,  # ID заказа
            StatusOrderExecutor.executor_id == executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    executor_status = status_result.scalar_one_or_none()  # Данные исполнителя
    if executor_status and REFUSED_BY_CUSTOMER_STATUS in executor_status:  # Уже отказано
        return True  # Доступ разрешён

    cancel_result = await db.execute(  # Согласованная отмена заказчиком
        select(CustomerOrderCancellation.id).where(  # SQL SELECT
            CustomerOrderCancellation.order_id == order_id,  # ID заказа
            CustomerOrderCancellation.executor_id == executor_id,  # ID исполнителя
            CustomerOrderCancellation.status == "agree",  # Статус
        )  # Закрытие вызова/выражения
    )  # Закрытие вызова/выражения
    return cancel_result.scalar_one_or_none() is not None  # Есть блокирующая отмена


async def add_status_order_executor(  # Статус заказа для исполнителя
    db: AsyncSession,  # Продолжение выражения
    status_order_executor_schema: StatusOrderExecutorSchema,  # Статус
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        await assert_executor_is_not_order_customer(  # Заказчик ≠ исполнитель
            db,  # Сессия БД
            order_id=status_order_executor_schema.order_id,  # ID заказа
            executor_id=status_order_executor_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения

        if status_order_executor_schema.status == CUSTOMER_OFFER_STATUS:  # Предложение заказчиком
            if await is_executor_blocked_from_customer_reoffer(  # Повтор после отказа
                db,  # Сессия БД
                order_id=status_order_executor_schema.order_id,  # ID заказа
                executor_id=status_order_executor_schema.executor_id,  # ID исполнителя
            ):  # Закрытие вызова/выражения
                raise HTTPException(  # Выбрасываем HTTP-ошибку
                    status_code=409,  # Статус
                    detail=(  # Временная строка
                        "Нельзя снова предложить этот заказ исполнителю "  # Строковый литерал
                        "после отказа заказчика"  # Строковый литерал
                    ),  # Продолжение выражения
                )  # Закрытие вызова/выражения

        result = await db.execute(  # Существующая запись статуса
            select(StatusOrderExecutor).filter(  # SQL SELECT
                StatusOrderExecutor.order_id == status_order_executor_schema.order_id,  # ID заказа
                StatusOrderExecutor.executor_id  # Статус исполнителя
                == status_order_executor_schema.executor_id,  # ID исполнителя
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        existing = result.scalar_one_or_none()  # Существующая запись

        if existing:  # Обновление
            previous_status = existing.status  # Предыдущее значение
            existing.status = status_order_executor_schema.status  # Существующая запись
            await db.flush()  # Сохраняем изменения в сессии
            if status_assigns_executor_order(status_order_executor_schema.status):  # Нужно назначение
                await ensure_executor_order_assignment(  # Гарантируем назначение
                    db,  # Сессия БД
                    order_id=status_order_executor_schema.order_id,  # ID заказа
                    executor_id=status_order_executor_schema.executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            await _sync_customer_status_for_executor_progress(  # Синхрон с заказчиком
                db=db,  # Сессия БД
                order_id=status_order_executor_schema.order_id,  # ID заказа
                new_status=status_order_executor_schema.status,  # Статус
            )  # Закрытие вызова/выражения
            await _notify_executor_on_status_change(  # Уведомление
                db=db,  # Сессия БД
                executor_id=status_order_executor_schema.executor_id,  # ID исполнителя
                order_id=status_order_executor_schema.order_id,  # ID заказа
                previous_status=previous_status,  # Статус
                new_status=status_order_executor_schema.status,  # Статус
            )  # Закрытие вызова/выражения
            await db.commit()  # Фиксируем транзакцию
            await db.refresh(existing)  # Обновляем объект из БД
            return existing  # Возвращаем результат

        status_order_executor = StatusOrderExecutor(  # Новая запись
            order_id=status_order_executor_schema.order_id,  # ID заказа
            executor_id=status_order_executor_schema.executor_id,  # ID исполнителя
            status=status_order_executor_schema.status,  # Статус
        )  # Закрытие вызова/выражения

        db.add(status_order_executor)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии
        if status_assigns_executor_order(status_order_executor_schema.status):  # Условная проверка
            await ensure_executor_order_assignment(  # Гарантируем назначение
                db,  # Сессия БД
                order_id=status_order_executor_schema.order_id,  # ID заказа
                executor_id=status_order_executor_schema.executor_id,  # ID исполнителя
            )  # Закрытие вызова/выражения
        await _sync_customer_status_for_executor_progress(  # Асинхронный вызов
            db=db,  # Сессия БД
            order_id=status_order_executor_schema.order_id,  # ID заказа
            new_status=status_order_executor_schema.status,  # Статус
        )  # Закрытие вызова/выражения
        await _notify_executor_on_status_change(  # Отправляем уведомление
            db=db,  # Сессия БД
            executor_id=status_order_executor_schema.executor_id,  # ID исполнителя
            order_id=status_order_executor_schema.order_id,  # ID заказа
            previous_status=None,  # Статус
            new_status=status_order_executor_schema.status,  # Статус
        )  # Закрытие вызова/выражения
        await db.commit()  # Фиксируем транзакцию
        await db.refresh(status_order_executor)  # Обновляем объект из БД

        return status_order_executor  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"Ошибка создания статуса: {str(e)}")  # Запись в лог
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500, detail=f"Ошибка создания статуса: {str(e)}"  # Статусная запись
        )  # Закрытие вызова/выражения


async def add_executor_order(  # Назначить исполнителя на заказ
    db: AsyncSession, executor_order_schema: ExecutorOrderSchema  # Назначение исполнителя
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await ensure_executor_order_assignment(  # Создать/обновить
            db,  # Сессия БД
            order_id=executor_order_schema.order_id,  # ID заказа
            executor_id=executor_order_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения
        await db.commit()  # Фиксируем транзакцию
        return result  # Возвращаем результат
    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"Ошибка назначения исполнителя: {str(e)}")  # Запись в лог
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500, detail=f"Ошибка назначения исполнителя: {str(e)}"  # Статусная запись
        )  # Закрытие вызова/выражения


async def add_order_customer_cancel(  # Запрос отмены заказчиком
    db: AsyncSession,  # Продолжение выражения
    customer_order_cancel_schema: CustomerOrderCancellationCreateSchema,  # Продолжение выражения
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Проверка дубликата
            select(CustomerOrderCancellation.id).where(  # SQL SELECT
                and_(  # Логическое И
                    CustomerOrderCancellation.order_id  # Отмена заказчиком
                    == customer_order_cancel_schema.order_id,  # ID заказа
                    CustomerOrderCancellation.customer_id  # Отмена заказчиком
                    == customer_order_cancel_schema.customer_id,  # ID заказчика
                    CustomerOrderCancellation.executor_id  # Отмена заказчиком
                    == customer_order_cancel_schema.executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        existing_id = result.scalar_one_or_none()  # Существующая запись
        if existing_id:  # Уже создано
            logger.info(  # Запись в лог
                f"Этот заказ у исполнитиеля уже существует: id={existing_id}"  # Идентификатор
            )  # Закрытие вызова/выражения
            return existing_id  # Возвращаем результат

        customer_order_cancel = CustomerOrderCancellation(  # Новая отмена
            order_id=customer_order_cancel_schema.order_id,  # ID заказа
            customer_id=customer_order_cancel_schema.customer_id,  # ID заказчика
            executor_id=customer_order_cancel_schema.executor_id,  # ID исполнителя
            status=customer_order_cancel_schema.status,  # Статус
            executor_comment=customer_order_cancel_schema.executor_comment,  # Комментарий
            reason_type=customer_order_cancel_schema.reason_type,  # Причина
            reason_text=customer_order_cancel_schema.reason_text,  # Причина
        )  # Закрытие вызова/выражения

        db.add(customer_order_cancel)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии

        notification_type = await _resolve_cancel_notification_type(  # Тип уведомления
            db,  # Сессия БД
            order_id=customer_order_cancel_schema.order_id,  # ID заказа
            customer_id=customer_order_cancel_schema.customer_id,  # ID заказчика
            executor_id=customer_order_cancel_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения
        await notify_order_event_safe(  # Уведомить исполнителя
            db,  # Сессия БД
            order_id=customer_order_cancel_schema.order_id,  # ID заказа
            actor_user_id=customer_order_cancel_schema.customer_id,  # ID заказчика
            notification_type=notification_type,  # Уведомление
            recipient_id=customer_order_cancel_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения

        await db.commit()  # Фиксируем транзакцию
        await db.refresh(customer_order_cancel)  # Обновляем объект из БД
        logger.info(f"Статус создан: id={customer_order_cancel.id}")  # Запись в лог
        return customer_order_cancel  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"Ошибка создания статуса: {str(e)}")  # Запись в лог
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500, detail=f"Ошибка создания статуса: {str(e)}"  # Статусная запись
        )  # Закрытие вызова/выражения


async def add_order_executor_cancel(  # Запрос отмены исполнителем
    db: AsyncSession,  # Продолжение выражения
    executor_order_cancel_schema: ExecutorOrderCancellationCreateSchema,  # Продолжение выражения
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Проверка дубликата
            select(ExecutorOrderCancellation.id).where(  # SQL SELECT
                and_(  # Логическое И
                    ExecutorOrderCancellation.order_id  # Назначение исполнителя
                    == executor_order_cancel_schema.order_id,  # ID заказа
                    ExecutorOrderCancellation.customer_id  # Назначение исполнителя
                    == executor_order_cancel_schema.customer_id,  # ID заказчика
                    ExecutorOrderCancellation.executor_id  # Назначение исполнителя
                    == executor_order_cancel_schema.executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        existing_id = result.scalar_one_or_none()  # Существующая запись
        if existing_id:  # Условная проверка
            logger.info(  # Запись в лог
                f"Этот заказ у исполнитиеля уже существует: id={existing_id}"  # Идентификатор
            )  # Закрытие вызова/выражения
            return existing_id  # Возвращаем результат

        executor_order_cancel = ExecutorOrderCancellation(  # Новая отмена
            order_id=executor_order_cancel_schema.order_id,  # ID заказа
            customer_id=executor_order_cancel_schema.customer_id,  # ID заказчика
            executor_id=executor_order_cancel_schema.executor_id,  # ID исполнителя
            status=executor_order_cancel_schema.status,  # Статус
            customer_comment=executor_order_cancel_schema.customer_comment,  # Комментарий
            reason_type=executor_order_cancel_schema.reason_type,  # Причина
            reason_text=executor_order_cancel_schema.reason_text,  # Причина
        )  # Закрытие вызова/выражения

        db.add(executor_order_cancel)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии

        notification_type = await _resolve_cancel_notification_type(  # Тип уведомления
            db,  # Сессия БД
            order_id=executor_order_cancel_schema.order_id,  # ID заказа
            customer_id=executor_order_cancel_schema.customer_id,  # ID заказчика
            executor_id=executor_order_cancel_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения
        await notify_order_event_safe(  # Уведомить заказчика
            db,  # Сессия БД
            order_id=executor_order_cancel_schema.order_id,  # ID заказа
            actor_user_id=executor_order_cancel_schema.executor_id,  # ID исполнителя
            notification_type=notification_type,  # Уведомление
            recipient_id=executor_order_cancel_schema.customer_id,  # ID заказчика
        )  # Закрытие вызова/выражения

        await db.commit()  # Фиксируем транзакцию
        await db.refresh(executor_order_cancel)  # Обновляем объект из БД
        logger.info(f"Статус создан: id={executor_order_cancel.id}")  # Запись в лог
        return executor_order_cancel  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"Ошибка создания статуса: {str(e)}")  # Запись в лог
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500, detail=f"Ошибка создания статуса: {str(e)}"  # Статусная запись
        )  # Закрытие вызова/выражения


def _order_response_to_read_schema(  # ORM → схема ответа исполнителя
    row: OrderResponseExecutor,  # Продолжение выражения
) -> OrderResponseExecutorReadSchema:  # Закрытие вызова/выражения
    proposed_price = row.proposed_price  # Предложенная цена
    if isinstance(proposed_price, Decimal):  # Decimal → float для JSON
        proposed_price = float(proposed_price)  # Предложенная цена

    return OrderResponseExecutorReadSchema(  # Возвращаем результат
        id=row.id,  # Продолжение выражения
        executor_id=row.executor_id,  # ID исполнителя
        proposed_price=proposed_price,  # Предложенная цена
        budget_type=row.budget_type,  # Бюджет
        currency=row.currency or "BYN",  # Валюта
        estimated_time=row.estimated_time,  # Оценка времени
        start_time_work=row.start_time_work,  # Время начала работ
        message=row.message or "",  # Сообщение
        created_at=row.created_at,  # Дата создания
    )  # Закрытие вызова/выражения


async def add_order_response_executor(  # Ответ/обновление предложения исполнителя
    db: AsyncSession, order_response_executor_schema: OrderResponseExecutorSchema  # Отклик исполнителя
) -> OrderResponseExecutorReadSchema:  # Закрытие вызова/выражения
    try:  # Начало блока try
        await assert_executor_is_not_order_customer(  # Заказчик не откликается сам
            db,  # Сессия БД
            order_id=order_response_executor_schema.order_id,  # ID заказа
            executor_id=order_response_executor_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения

        order = await db.get(Order, order_response_executor_schema.order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        if not order.category_id:
            raise HTTPException(
                status_code=400,
                detail="У заказа не указана категория работ",
            )
        await is_specialization_user(
            db=db,
            user_id=order_response_executor_schema.executor_id,
            category_work_id=order.category_id,
        )

        result = await db.execute(  # Последний отклик (и возможные дубли)
            select(OrderResponseExecutor)  # SQL SELECT
            .where(  # Условие WHERE
                and_(  # Логическое И
                    OrderResponseExecutor.order_id  # Отклик исполнителя
                    == order_response_executor_schema.order_id,  # ID заказа
                    OrderResponseExecutor.executor_id  # Отклик исполнителя
                    == order_response_executor_schema.executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
            .order_by(OrderResponseExecutor.id.desc())  # Сортировка результата
        )  # Закрытие вызова/выражения
        rows = result.scalars().all()  # Строки результата
        existing = rows[0] if rows else None  # Актуальный отклик
        is_update = existing is not None  # Создание или обновление

        for duplicate in rows[1:]:  # Удаляем лишние дубликаты
            await db.delete(duplicate)  # Удаляем запись из сессии

        if existing:  # Обновляем поля
            existing.proposed_price = order_response_executor_schema.proposed_price  # Существующая запись
            existing.budget_type = order_response_executor_schema.budget_type  # Существующая запись
            existing.currency = order_response_executor_schema.currency  # Существующая запись
            existing.estimated_time = order_response_executor_schema.estimated_time  # Существующая запись
            existing.start_time_work = order_response_executor_schema.start_time_work  # Существующая запись
            existing.message = order_response_executor_schema.message  # Существующая запись
            row = existing  # Строка результата
        else:  # Новый отклик
            row = OrderResponseExecutor(  # Строка результата
                order_id=order_response_executor_schema.order_id,  # ID заказа
                executor_id=order_response_executor_schema.executor_id,  # ID исполнителя
                proposed_price=order_response_executor_schema.proposed_price,  # Предложенная цена
                budget_type=order_response_executor_schema.budget_type,  # Бюджет
                currency=order_response_executor_schema.currency,  # Валюта
                estimated_time=order_response_executor_schema.estimated_time,  # Оценка времени
                start_time_work=order_response_executor_schema.start_time_work,  # Время начала работ
                message=order_response_executor_schema.message,  # Сообщение
            )  # Закрытие вызова/выражения
            db.add(row)  # Закрывающая скобка вызова

        await db.flush()  # Сохраняем изменения в сессии

        await db.execute(  # Обновляем updated_at заказа
            update(Order)  # Закрывающая скобка вызова
            .where(Order.id == order_response_executor_schema.order_id)  # Условие WHERE
            .values(updated_at=datetime.utcnow())  # Строка для обработки
        )  # Закрытие вызова/выражения

        await notify_customer_executor_response(  # Уведомить заказчика
            db=db,  # Сессия БД
            executor_id=order_response_executor_schema.executor_id,  # ID исполнителя
            order_id=order_response_executor_schema.order_id,  # ID заказа
            is_update=is_update,  # Флаг обновления
        )  # Закрытие вызова/выражения

        await db.commit()  # Фиксируем транзакцию
        await db.refresh(row)  # Обновляем объект из БД

        logger.info(  # Запись в лог
            "Ответ исполнителя сохранён: id=%s, order_id=%s, executor_id=%s, update=%s",  # ID заказа
            row.id,  # Продолжение выражения
            order_response_executor_schema.order_id,  # ID заказа
            order_response_executor_schema.executor_id,  # ID исполнителя
            is_update,  # Флаг обновления
        )  # Закрытие вызова/выражения
        return _order_response_to_read_schema(row)  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"Ошибка сохранения ответа исполнителя: {str(e)}")  # Запись в лог
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500, detail=f"Ошибка сохранения ответа исполнителя: {str(e)}"  # Статусная запись
        )  # Закрытие вызова/выражения


async def add_verdict_admin_cancel_customer(  # Решение админа по отмене заказчиком
    db: AsyncSession,  # Продолжение выражения
    schema: CustomerOrderCancellationCreateSchema,  # Продолжение выражения
) -> Optional[CustomerOrderCancellation]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        stmt = select(CustomerOrderCancellation).where(  # Ищем отмену
            and_(  # Логическое И
                CustomerOrderCancellation.order_id == schema.order_id,  # ID заказа
                CustomerOrderCancellation.customer_id == schema.customer_id,  # ID заказчика
                CustomerOrderCancellation.executor_id == schema.executor_id,  # ID исполнителя
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        result = await db.execute(stmt)  # Результат запроса
        cancellation = result.scalar_one_or_none()  # Запись отмены

        if cancellation is None:  # Не найдена
            raise HTTPException(404, "Отмена не найдена")  # Выбрасываем HTTP-ошибку

        print(  # Отладка до сохранения
            f"🔍 Найдена отмена #{cancellation.id}, "  # Форматированная строка
            f"before: "  # Форматированная строка
            f"customer={cancellation.refund_amount_customer}, "  # Данные заказчика
            f"executor={cancellation.refund_amount_executor}, "  # Данные исполнителя
            f"admin={cancellation.admin_comment}"  # Индекс
        )  # Закрытие вызова/выражения
        print(  # Данные из схемы
            f"📊 schema: "  # Форматированная строка
            f"refund_customer={schema.refund_amount_customer}, "  # Данные заказчика
            f"refund_executor={schema.refund_amount_executor}, "  # Данные исполнителя
            f"admin={schema.admin_comment}"  # Индекс
        )  # Закрытие вызова/выражения

        if schema.refund_amount_customer is not None:  # Сумма возврата заказчику
            cancellation.refund_amount_customer = Decimal(schema.refund_amount_customer)  # Запись отмены
        if schema.refund_amount_executor is not None:  # Сумма исполнителю
            cancellation.refund_amount_executor = Decimal(schema.refund_amount_executor)  # Запись отмены
        if schema.admin_comment is not None:  # Комментарий админа
            cancellation.admin_comment = schema.admin_comment  # Запись отмены
        cancellation.status = "resolved"  # Закрыта
        cancellation.resolved_at = func.now()  # Время решения

        await db.flush()  # Сохраняем изменения в сессии
        await db.commit()  # Фиксируем транзакцию

        result_saved = await db.execute(  # Перечитываем из БД
            select(CustomerOrderCancellation).where(  # SQL SELECT
                CustomerOrderCancellation.id == cancellation.id  # Идентификатор
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        saved = result_saved.scalar_one()  # Сохранённые данные

        print(  # Отладка после сохранения
            f"✅ СОХРАНЕНО: ID={saved.id}, "  # Присваивание значения
            f"refund_customer={saved.refund_amount_customer}, "  # Данные заказчика
            f"refund_executor={saved.refund_amount_executor}, "  # Данные исполнителя
            f"comment='{saved.admin_comment}'"  # Комментарий
        )  # Закрытие вызова/выражения
        return saved  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        print(f"❌ Ошибка: {e}")  # Отладочный вывод
        raise HTTPException(status_code=500, detail=str(e))  # Выбрасываем HTTP-ошибку


async def add_date_start_execute_order(  # Дата начала работ по заказу
    db: AsyncSession, date_start_execute_order_schema: GraphicOrderMasterCreate  # График работ
) -> GraphicOrderMaster:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Существующая запись графика
            select(GraphicOrderMaster).where(  # SQL SELECT
                and_(  # Логическое И
                    GraphicOrderMaster.user_id  # График работ
                    == date_start_execute_order_schema.user_id,  # Дата начала
                    GraphicOrderMaster.order_id  # График работ
                    == date_start_execute_order_schema.order_id,  # ID заказа
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        existing_record = result.scalar_one_or_none()  # Существующая запись
        if existing_record:  # Обновление даты
            existing_record.date_start = date_start_execute_order_schema.date_start  # Существующая запись
            await notify_order_event_safe(  # Уведомление о смене даты
                db,  # Сессия БД
                order_id=date_start_execute_order_schema.order_id,  # ID заказа
                actor_user_id=date_start_execute_order_schema.user_id,  # Дата начала
                notification_type=START_DATE_UPDATED_NOTIFICATION_TYPE,  # Уведомление
                extra_format={"detail": date_start_execute_order_schema.date_start or ""},  # Дата начала
            )  # Закрытие вызова/выражения
            await db.commit()  # Фиксируем транзакцию
            await db.refresh(existing_record)  # Обновляем объект из БД
            return existing_record  # Возвращаем результат

        date_start_execute_order = GraphicOrderMaster(  # Новая запись
            user_id=date_start_execute_order_schema.user_id,  # Дата начала
            order_id=date_start_execute_order_schema.order_id,  # ID заказа
            date_start=date_start_execute_order_schema.date_start,  # Дата начала
        )  # Закрытие вызова/выражения

        db.add(date_start_execute_order)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии
        await notify_order_event_safe(  # Отправляем уведомление
            db,  # Сессия БД
            order_id=date_start_execute_order_schema.order_id,  # ID заказа
            actor_user_id=date_start_execute_order_schema.user_id,  # Дата начала
            notification_type=START_DATE_UPDATED_NOTIFICATION_TYPE,  # Уведомление
            extra_format={"detail": date_start_execute_order_schema.date_start or ""},  # Дата начала
        )  # Закрытие вызова/выражения
        await db.commit()  # Фиксируем транзакцию
        await db.refresh(date_start_execute_order)  # Обновляем объект из БД

        logger.info(f"✅ Добавлена дата для заказа {date_start_execute_order.order_id}")  # Запись в лог
        return date_start_execute_order  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"❌ Ошибка: {str(e)}", exc_info=True)  # Запись в лог
        raise HTTPException(status_code=500, detail=str(e))  # Выбрасываем HTTP-ошибку


async def add_information_about_customer(  # Контакты заказчика от исполнителя
    db: AsyncSession, information_about_customer_schema: InformationAboutCustomerSchema  # Контактная информация
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        assert_customer_and_executor_are_different(  # Разные пользователи
            information_about_customer_schema.customer_id,  # ID заказчика
            information_about_customer_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения

        result = await db.execute(  # Существующая запись
            select(InformationAboutCustomer).where(  # SQL SELECT
                and_(  # Логическое И
                    InformationAboutCustomer.customer_id  # Контактная информация
                    == information_about_customer_schema.customer_id,  # ID заказчика
                    InformationAboutCustomer.executor_id  # Контактная информация
                    == information_about_customer_schema.executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        existing_information_about_customer = result.scalar_one_or_none()  # Существующая запись
        if existing_information_about_customer:  # Обновление
            existing_information_about_customer.phone = (  # Существующая запись
                information_about_customer_schema.phone  # Строка кода
            )  # Закрытие вызова/выражения
            existing_information_about_customer.notification = (  # Существующая запись
                information_about_customer_schema.notification  # Строка кода
            )  # Закрытие вызова/выражения
            await db.commit()  # Фиксируем транзакцию
            await db.refresh(existing_information_about_customer)  # Обновляем объект из БД
            return existing_information_about_customer  # Возвращаем результат

        information_about_customer = InformationAboutCustomer(  # Создание
            executor_id=information_about_customer_schema.executor_id,  # ID исполнителя
            customer_id=information_about_customer_schema.customer_id,  # ID заказчика
            phone=information_about_customer_schema.phone,  # Телефон
            notification=information_about_customer_schema.notification,  # Уведомление
        )  # Закрытие вызова/выражения

        db.add(information_about_customer)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии
        await db.commit()  # Фиксируем транзакцию
        await db.refresh(information_about_customer)  # Обновляем объект из БД

        logger.info(  # Запись в лог
            f"✅ Добавлена информация о заказчике от исполнителя {information_about_customer.id}"  # Форматированная строка
        )  # Закрытие вызова/выражения
        return information_about_customer  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"❌ Ошибка: {str(e)}", exc_info=True)  # Запись в лог
        raise HTTPException(status_code=500, detail=str(e))  # Выбрасываем HTTP-ошибку


async def add_information_about_executor(  # Контакты исполнителя от заказчика
    db: AsyncSession, information_about_executor_schema: InformationAboutExecutorSchema  # Контактная информация
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        assert_customer_and_executor_are_different(  # Проверка разных ролей
            information_about_executor_schema.customer_id,  # ID заказчика
            information_about_executor_schema.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения

        result = await db.execute(  # Результат запроса
            select(InformationAboutExecutor).where(  # SQL SELECT
                and_(  # Логическое И
                    InformationAboutExecutor.customer_id  # Контактная информация
                    == information_about_executor_schema.customer_id,  # ID заказчика
                    InformationAboutExecutor.executor_id  # Контактная информация
                    == information_about_executor_schema.executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        existing_information_about_executor = result.scalar_one_or_none()  # Существующая запись
        if existing_information_about_executor:  # Условная проверка
            existing_information_about_executor.phone = (  # Существующая запись
                information_about_executor_schema.phone  # Строка кода
            )  # Закрытие вызова/выражения
            existing_information_about_executor.notification = (  # Существующая запись
                information_about_executor_schema.notification  # Строка кода
            )  # Закрытие вызова/выражения
            await db.commit()  # Фиксируем транзакцию
            await db.refresh(existing_information_about_executor)  # Обновляем объект из БД
            return existing_information_about_executor  # Возвращаем результат

        information_about_executor = InformationAboutExecutor(  # Данные исполнителя
            executor_id=information_about_executor_schema.executor_id,  # ID исполнителя
            customer_id=information_about_executor_schema.customer_id,  # ID заказчика
            phone=information_about_executor_schema.phone,  # Телефон
            notification=information_about_executor_schema.notification,  # Уведомление
        )  # Закрытие вызова/выражения

        db.add(information_about_executor)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии
        await db.commit()  # Фиксируем транзакцию
        await db.refresh(information_about_executor)  # Обновляем объект из БД

        logger.info(  # Запись в лог
            f"✅ Добавлена информация об исполнителе от заказчика {information_about_executor.id}"  # Форматированная строка
        )  # Закрытие вызова/выражения
        return information_about_executor  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"❌ Ошибка: {str(e)}", exc_info=True)  # Запись в лог
        raise HTTPException(status_code=500, detail=str(e))  # Выбрасываем HTTP-ошибку


async def add_order_review(  # Создать отзыв заказчика об исполнителе
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    reviewer_id: int,  # ID автора отзыва
    schema: ReviewCreateSchema,  # Продолжение выражения
) -> Review:  # Закрытие вызова/выражения
    """Заказчик сохраняет отзыв об исполнителе по завершённому заказу."""
    try:  # Начало блока try
        order = await db.get(Order, order_id)  # Заказ
        if not order:  # Проверка отрицания
            raise HTTPException(status_code=404, detail="Заказ не найден")  # Выбрасываем HTTP-ошибку
        if order.customer_id != reviewer_id:  # Только заказчик
            raise HTTPException(  # Выбрасываем HTTP-ошибку
                status_code=403,  # Статус
                detail="Только заказчик может оставить отзыв по этому заказу",  # Текст ошибки
            )  # Закрытие вызова/выражения

        assert_customer_and_executor_are_different(reviewer_id, schema.executor_id)  # Проверка разных ролей

        status_customer = (  # Статус заказчика
            await db.execute(  # Выполняем SQL-запрос
                select(StatusOrderCustomer).where(  # SQL SELECT
                    StatusOrderCustomer.order_id == order_id,  # ID заказа
                    StatusOrderCustomer.customer_id == reviewer_id,  # ID заказчика
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        ).scalar_one_or_none()  # Закрытие вызова/выражения
        if not status_customer or COMPLETED_EXECUTOR_STATUS not in (  # Не завершён
            status_customer.status or ""  # Строка кода
        ):  # Закрытие вызова/выражения
            raise HTTPException(  # Выбрасываем HTTP-ошибку
                status_code=400,  # Статус
                detail="Отзыв можно оставить только после завершения заказа",  # Текст ошибки
            )  # Закрытие вызова/выражения

        status_executor = (  # Связь исполнителя с заказом
            await db.execute(  # Выполняем SQL-запрос
                select(StatusOrderExecutor).where(  # SQL SELECT
                    StatusOrderExecutor.order_id == order_id,  # ID заказа
                    StatusOrderExecutor.executor_id == schema.executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        ).scalar_one_or_none()  # Закрытие вызова/выражения
        if not status_executor:  # Проверка отрицания
            raise HTTPException(  # Выбрасываем HTTP-ошибку
                status_code=400,  # Статус
                detail="Указанный исполнитель не связан с этим заказом",  # Текст ошибки
            )  # Закрытие вызова/выражения

        existing = (  # Дубликат отзыва
            await db.execute(  # Выполняем SQL-запрос
                select(Review).where(  # SQL SELECT
                    Review.order_id == order_id,  # ID заказа
                    Review.reviewer_id == reviewer_id,  # ID автора отзыва
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        ).scalar_one_or_none()  # Закрытие вызова/выражения
        if existing:  # Условная проверка
            raise HTTPException(  # Выбрасываем HTTP-ошибку
                status_code=409,  # Статус
                detail="Отзыв по этому заказу уже оставлен",  # Текст ошибки
            )  # Закрытие вызова/выражения

        comment = (schema.comment or "").strip() or None  # Пустой коммент → None
        review = Review(  # Новый отзыв
            order_id=order_id,  # ID заказа
            reviewer_id=reviewer_id,  # ID автора отзыва
            reviewee_id=schema.executor_id,  # ID исполнителя
            rating=schema.rating,  # Рейтинг
            comment=comment,  # Комментарий
        )  # Закрытие вызова/выражения
        db.add(review)  # Закрывающая скобка вызова
        await db.flush()  # Сохраняем изменения в сессии
        await db.commit()  # Фиксируем транзакцию
        await db.refresh(review)  # Обновляем объект из БД
        logger.info(  # Запись в лог
            f"✅ Отзыв {review.id} по заказу {order_id} от заказчика {reviewer_id}"  # Форматированная строка
        )  # Закрытие вызова/выражения
        return review  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"❌ Ошибка сохранения отзыва: {str(e)}", exc_info=True)  # Запись в лог
        raise HTTPException(status_code=500, detail=str(e))  # Выбрасываем HTTP-ошибку


async def update_order_review(  # Обновить отзыв заказчика
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    reviewer_id: int,  # ID автора отзыва
    schema: ReviewCreateSchema,  # Продолжение выражения
) -> Review:  # Закрытие вызова/выражения
    """Заказчик обновляет свой отзыв об исполнителе."""
    try:  # Начало блока try
        order = await db.get(Order, order_id)  # Данные заказа
        if not order:  # Проверка отрицания
            raise HTTPException(status_code=404, detail="Заказ не найден")  # Выбрасываем HTTP-ошибку
        if order.customer_id != reviewer_id:  # Неравенство
            raise HTTPException(  # Выбрасываем HTTP-ошибку
                status_code=403,  # Статус
                detail="Только заказчик может изменить отзыв по этому заказу",  # Текст ошибки
            )  # Закрытие вызова/выражения

        assert_customer_and_executor_are_different(reviewer_id, schema.executor_id)  # Проверка разных ролей

        review = (  # Существующий отзыв
            await db.execute(  # Выполняем SQL-запрос
                select(Review).where(  # SQL SELECT
                    Review.order_id == order_id,  # ID заказа
                    Review.reviewer_id == reviewer_id,  # ID автора отзыва
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        ).scalar_one_or_none()  # Закрытие вызова/выражения
        if not review:  # Проверка отрицания
            raise HTTPException(status_code=404, detail="Отзыв не найден")  # Выбрасываем HTTP-ошибку

        if review.reviewee_id != schema.executor_id:  # Смена исполнителя в отзыве
            status_executor = (  # Данные исполнителя
                await db.execute(  # Выполняем SQL-запрос
                    select(StatusOrderExecutor).where(  # SQL SELECT
                        StatusOrderExecutor.order_id == order_id,  # ID заказа
                        StatusOrderExecutor.executor_id == schema.executor_id,  # ID исполнителя
                    )  # Закрытие вызова/выражения
                )  # Закрытие вызова/выражения
            ).scalar_one_or_none()  # Закрытие вызова/выражения
            if not status_executor:  # Проверка отрицания
                raise HTTPException(  # Выбрасываем HTTP-ошибку
                    status_code=400,  # Статус
                    detail="Указанный исполнитель не связан с этим заказом",  # Текст ошибки
                )  # Закрытие вызова/выражения
            review.reviewee_id = schema.executor_id  # Отзыв

        review.rating = schema.rating  # Обновляем поля
        review.comment = (schema.comment or "").strip() or None  # Отзыв

        await db.flush()  # Сохраняем изменения в сессии
        await db.commit()  # Фиксируем транзакцию
        await db.refresh(review)  # Обновляем объект из БД
        logger.info(  # Запись в лог
            f"✅ Обновлён отзыв {review.id} по заказу {order_id} от заказчика {reviewer_id}"  # Форматированная строка
        )  # Закрытие вызова/выражения
        return review  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        await db.rollback()  # Откатываем транзакцию
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        await db.rollback()  # Откатываем транзакцию
        logger.error(f"❌ Ошибка обновления отзыва: {str(e)}", exc_info=True)  # Запись в лог
        raise HTTPException(status_code=500, detail=str(e))  # Выбрасываем HTTP-ошибку

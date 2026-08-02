from datetime import datetime  # Дата по умолчанию для заказа
import logging  # Логирование чтения заказов
from typing import Optional  # Опциональные параметры
from fastapi import HTTPException  # HTTP-ошибки
from pydantic import ValidationError  # Ошибки Pydantic
from sqlalchemy import and_, or_, select, func  # SQL-запросы
from models.contracts_models import Contract  # Договор
from models.geography_models import Region, Town
from models.users_models import User  # Пользователь
from models.works_materials_models import CategoryWork, CategoryWorkMaster  # Категории
from models.orders_models import (  # Модели заказов
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
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from cruds.orders.order_constants import (
    is_hidden_customer_executor_phone,
)  # Скрытый телефон
from schemas.orders_schemas import (  # Схемы ответов
    CancelOrderCustomerForAdminRead,  # Продолжение выражения
    CustomerOrderCancellationReadSchema,  # Продолжение выражения
    ExecutorOrderCancellationReadSchema,  # Продолжение выражения
    ExecutorOrderSchema,  # Продолжение выражения
    GraphicOrderMasterRead,  # Продолжение выражения
    InformationAboutCustomerRead,  # Продолжение выражения
    InformationAboutExecuteOrderRead,  # Продолжение выражения
    InformationAboutExecutorRead,  # Продолжение выражения
    CustomerExecutorListItemSchema,  # Продолжение выражения
    ExecutorCustomerListItemSchema,  # Продолжение выражения
    OrderCardForAdmin,  # Продолжение выражения
    OrderProfileForAdmin,  # Продолжение выражения
    ServiceProfileForAdmin,  # Продолжение выражения
    OrderReadSchema,  # Продолжение выражения
    OrderResponseExecutorReadSchema,  # Продолжение выражения
    OrderUserSchema,  # Продолжение выражения
    ServiceUserSchema,  # Продолжение выражения
)  # Закрытие вызова/выражения

from sqlalchemy.orm import aliased, joinedload  # Алиасы и eager-load User

from sqlalchemy import select  # Повторный импорт select
from sqlalchemy.orm import contains_eager, selectinload  # Eager loading (резерв)

from sqlalchemy import select, and_  # Дубли для каталога
from sqlalchemy.orm import Session  # Sync Session (legacy)
from fastapi import HTTPException  # Повторный импорт


import traceback  # Трассировка ошибок

logger = logging.getLogger(__name__)  # Логгер модуля


def _user_address_load():
    """Eager-load географии и бизнеса пользователя (не на уровне import)."""
    return (
        joinedload(User.town).joinedload(Town.region).joinedload(Region.country),
        joinedload(User.business_info),
    )


def _format_user_name(user: User | None) -> str:  # Имя для карточки
    if not user:  # Нет пользователя
        return "—"  # Возвращаем результат
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()  # ФИО
    return name or "—"  # Возвращаем результат


def _format_user_address(user: User | None) -> str:
    """Адрес из User.town (+ region/country) и UserBusiness.location."""
    if not user:
        return "—"

    parts: list[str] = []
    town = user.town
    if town is not None:
        region = town.region
        country = region.country if region else None
        for value in (
            country.name_country if country else None,
            region.name_region if region else None,
            town.name_town,
        ):
            if value:
                parts.append(value)

    location = user.business_info.location if user.business_info else None
    if location and str(location).strip():
        parts.append(str(location).strip())

    return ", ".join(parts) or "—"


async def get_orders_customer(  # Карточки заказов заказчика
    db: AsyncSession,  # Продолжение выражения
    user_id: int,  # Продолжение выражения
    exclude_offered_to_executor_id: Optional[int] = None,  # ID исполнителя
) -> list[OrderUserSchema]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Заказы с категорией, статусами, исполнителем
            select(
                Order, StatusOrderCustomer, CategoryWork, StatusOrderExecutor, User
            )  # SQL SELECT
            .outerjoin(  # JOIN таблиц
                StatusOrderCustomer,  # Продолжение выражения
                StatusOrderCustomer.order_id == Order.id,  # ID заказа
            )  # Закрытие вызова/выражения
            .outerjoin(
                CategoryWork, Order.category_id == CategoryWork.id
            )  # JOIN таблиц
            .outerjoin(ExecutorOrder, ExecutorOrder.order_id == Order.id)  # JOIN таблиц
            .outerjoin(
                StatusOrderExecutor, StatusOrderExecutor.order_id == Order.id
            )  # JOIN таблиц
            .outerjoin(User, User.id == StatusOrderExecutor.executor_id)  # JOIN таблиц
            .filter(Order.customer_id == user_id)  # Условие WHERE
            .order_by(Order.created_at.desc())  # Сортировка результата
        )  # Закрытие вызова/выражения

        rows = result.unique().all()  # Уникальные строки JOIN

        if not rows:  # Проверка отрицания
            return []  # Пустой список

        list_orders: list[OrderUserSchema] = []  # Накопленный список

        for (
            order,
            status_order_customer,
            category,
            status_order_executor,
            user,
        ) in rows:  # Цикл по элементам
            list_orders.append(  # Карточка заказа
                OrderUserSchema(  # Карточка заказа
                    id=order.id,  # Продолжение выражения
                    category_work=(
                        category.name if category else "Без категории"
                    ),  # Категория работ
                    category_work_id=category.id,  # Категория работ
                    title=order.title,  # Заголовок
                    budget=(
                        str(order.budget) if order.budget is not None else None
                    ),  # Бюджет
                    currency=order.currency or "BYN",  # Валюта
                    created_at=order.created_at,  # Дата создания
                    executor_name=user.first_name if user else None,  # Имя
                    executor_id=(  # Данные исполнителя
                        status_order_executor.executor_id  # Строка кода
                        if status_order_executor  # Условная проверка
                        else None  # Строка кода
                    ),  # Продолжение выражения
                    status_order_customer=(  # Данные заказа
                        status_order_customer.status
                        if status_order_customer
                        else None  # Строка кода
                    ),  # Продолжение выражения
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения

        if (
            exclude_offered_to_executor_id is not None
        ):  # Исключить заказы для исполнителя
            offered_result = await db.execute(  # Уже предложены
                select(StatusOrderExecutor.order_id).where(  # SQL SELECT
                    StatusOrderExecutor.executor_id
                    == exclude_offered_to_executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
            assigned_result = await db.execute(  # Уже назначены
                select(ExecutorOrder.order_id).where(  # SQL SELECT
                    ExecutorOrder.executor_id
                    == exclude_offered_to_executor_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
            refused_by_customer_result = await db.execute(  # Отмена согласована
                select(CustomerOrderCancellation.order_id).where(  # SQL SELECT
                    CustomerOrderCancellation.executor_id  # Отмена заказчиком
                    == exclude_offered_to_executor_id,  # ID исполнителя
                    CustomerOrderCancellation.status == "agree",  # Статус
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
            excluded_order_ids = (  # Объединение ID для фильтра
                set(offered_result.scalars().all())  # Множество ID
                | set(assigned_result.scalars().all())  # Множество ID
                | set(refused_by_customer_result.scalars().all())  # Множество ID
            )  # Закрытие вызова/выражения
            if excluded_order_ids:  # Условная проверка
                list_orders = [  # Убираем исключённые
                    order_item  # Строка кода
                    for order_item in list_orders  # Цикл по элементам
                    if order_item.id not in excluded_order_ids  # Проверка вхождения
                    and order_item.executor_id
                    != exclude_offered_to_executor_id  # Данные заказа
                ]  # Строка кода

        return list_orders  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(
            f"get_orders_customer error for user {user_id}: {str(e)}"
        )  # Запись в лог
        raise HTTPException(
            status_code=500, detail="Ошибка получения заказов"
        )  # Выбрасываем HTTP-ошибку


async def _resolve_executor_for_admin(  # Исполнитель для админ-профиля
    db: AsyncSession,  # Продолжение выражения
    order_id: int,  # ID заказа
    executor_order: Optional[ExecutorOrder],  # Продолжение выражения
    executor_user: Optional[User],  # Продолжение выражения
    contract: Optional[Contract] = None,  # Продолжение выражения
) -> tuple[
    Optional[int], Optional[dict[str, Optional[str]]]
]:  # Закрытие вызова/выражения
    resolved_executor_id = None  # Определённое значение
    if executor_order and executor_order.executor_id:  # Из назначения
        resolved_executor_id = executor_order.executor_id  # Определённое значение
    elif contract and contract.executor_id:  # Из договора
        resolved_executor_id = contract.executor_id  # Определённое значение

    if not resolved_executor_id:  # Проверка отрицания
        return None, None  # Ничего не найдено

    user = executor_user  # Данные пользователя
    if not user or user.id != resolved_executor_id:  # Догрузить User
        user_result = await db.execute(  # Результат запроса
            select(User).where(User.id == resolved_executor_id)  # SQL SELECT
        )  # Закрытие вызова/выражения
        user = user_result.scalar_one_or_none()  # Данные пользователя

    if not user:  # Проверка отрицания
        return resolved_executor_id, None  # Ничего не найдено

    return resolved_executor_id, {  # Имя для админки
        "first_name": user.first_name,  # Имя
        "last_name": user.last_name,  # Фамилия
    }  # Строка кода


async def get_executor_order(  # Назначение исполнителя по заказу
    db: AsyncSession,  # Продолжение выражения
    order_id: int,  # ID заказа
) -> ExecutorOrderSchema | None:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(ExecutorOrder).where(
                ExecutorOrder.order_id == order_id
            )  # SQL SELECT
        )  # Закрытие вызова/выражения

        executor_order = result.scalars().first()  # Данные заказа
        if not executor_order:
            return None

        return ExecutorOrderSchema(  # Возвращаем результат
            id=executor_order.id,  # Продолжение выражения
            order_id=executor_order.order_id,  # ID заказа
            executor_id=executor_order.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения

    except Exception as e:  # Обработка исключения
        raise HTTPException(
            status_code=500, detail=f"Ошибка получения заказа: {e}"
        )  # Выбрасываем HTTP-ошибку


async def get_services_executor(  # Карточки услуг исполнителя
    db: AsyncSession, user_id: int  # Строка кода
) -> list[ServiceUserSchema]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Заказы, где user — исполнитель
            select(Order, StatusOrderExecutor, CategoryWork, User)  # SQL SELECT
            .join(  # JOIN таблиц
                StatusOrderExecutor,
                Order.id == StatusOrderExecutor.order_id,  # Идентификатор
            )  # Закрытие вызова/выражения
            .outerjoin(
                CategoryWork, Order.category_id == CategoryWork.id
            )  # JOIN таблиц
            .outerjoin(User, Order.customer_id == User.id)  # JOIN таблиц
            .where(StatusOrderExecutor.executor_id == user_id)  # Условие WHERE
        )  # Закрытие вызова/выражения

        services = result.all()  # Список услуг
        if not services:  # Проверка отрицания
            return []  # Пустой список

        list_services = []  # Накопленный список
        for order, status_executor, category, customer in services:  # Цикл по элементам
            if order.customer_id == user_id:  # Свой заказ — не услуга
                continue  # Пропуск итерации
            list_services.append(  # Строка кода
                ServiceUserSchema(  # Карточка услуги
                    id=order.id,  # Продолжение выражения
                    customer_id=order.customer_id,  # ID заказчика
                    category_work=(
                        category.name if category else None
                    ),  # Категория работ
                    title=order.title,  # Заголовок
                    budget=order.budget,  # Бюджет
                    currency=order.currency or "BYN",  # Валюта
                    created_at=order.created_at,  # Дата создания
                    customer_name=(  # Данные заказчика
                        f"{customer.first_name or ''} {customer.last_name or ''}".strip()  # Закрывающая скобка вызова
                        if customer  # Условная проверка
                        else None  # Строка кода
                    ),  # Продолжение выражения
                    status_service_executor=(  # Данные исполнителя
                        status_executor.status
                        if status_executor
                        else None  # Строка кода
                    ),  # Продолжение выражения
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения

        return list_services  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(
            f"Ошибка получения услуг user_id={user_id}: {str(e)}"
        )  # Запись в лог
        raise HTTPException(
            status_code=500, detail="Ошибка получения услуг"
        )  # Выбрасываем HTTP-ошибку


async def get_order(
    db: AsyncSession, order_id: int
) -> OrderReadSchema:  # Полный заказ по ID
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(Order, CategoryWork, User, ExecutorOrder)  # SQL SELECT
            .outerjoin(
                CategoryWork, Order.category_id == CategoryWork.id
            )  # JOIN таблиц
            .outerjoin(User, Order.customer_id == User.id)  # JOIN таблиц
            .outerjoin(ExecutorOrder, Order.id == ExecutorOrder.order_id)  # JOIN таблиц
            .where(Order.id == order_id)  # Условие WHERE
        )  # Закрытие вызова/выражения

        result_tuple = result.first()  # Результат запроса
        if not result_tuple:  # Проверка отрицания
            raise HTTPException(
                status_code=404, detail="Заказ не найден"
            )  # Выбрасываем HTTP-ошибку

        order, category_work, customer, executor_order = result_tuple  # Данные заказа

        order_schema = OrderReadSchema(  # DTO для API
            id=order.id,  # Продолжение выражения
            executor_id=executor_order.executor_id if executor_order else None,
            category_work=(
                category_work.name if category_work else None
            ),  # Категория работ
            category_work_id=(  # ID категории работ
                category_work.id if category_work else None  # Строка кода
            ),  # Продолжение выражения
            title=order.title,  # Заголовок
            description=order.description,  # Описание
            customer_id=customer.id,  # ID заказчика
            budget=order.budget,  # Бюджет
            currency=order.currency,  # Валюта
            budget_type=order.budget_type,  # Бюджет
            urgency_level=order.urgency_level,  # Срочность
            country=order.country,  # Страна
            region=order.region,  # Регион
            town=order.town,  # Город
            location=order.location,  # Адрес/локация
            deadline=order.deadline,  # Срок
            insurance_required=order.insurance_required,  # Страхование
            created_at=order.created_at or datetime.utcnow(),  # Дата создания
            updated_at=order.updated_at or datetime.utcnow(),  # Дата обновления
        )  # Закрытие вызова/выражения

        return order_schema  # Возвращаем результат

    except HTTPException:  # Пробрасываем HTTP-ошибку
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail=f"Ошибка получения заказа: {str(e)}",  # Статусная запись
        )  # Закрытие вызова/выражения


async def get_order_responses_executors(  # Все отклики исполнителей на заказ
    db: AsyncSession, order_id: int  # Строка кода
) -> list[OrderResponseExecutorReadSchema]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(OrderResponseExecutor, User)  # SQL SELECT
            .outerjoin(
                User, OrderResponseExecutor.executor_id == User.id
            )  # JOIN таблиц
            .where(OrderResponseExecutor.order_id == order_id)  # Условие WHERE
        )  # Закрытие вызова/выражения

        rows = result.all()  # Строки результата
        if not rows:  # Проверка отрицания
            return []  # Пустой список

        order_responses_executors = [  # Список DTO
            OrderResponseExecutorReadSchema(  # Отклик исполнителя
                id=ore.id,  # Продолжение выражения
                executor_name={  # Данные исполнителя
                    "first_name": (user.first_name if user else "Неизвестный"),  # Имя
                    "second_name": (
                        user.last_name if user else "Неизвестный"
                    ),  # Фамилия
                },  # Продолжение выражения
                executor_id=ore.executor_id,  # ID исполнителя
                proposed_price=ore.proposed_price,  # Предложенная цена
                budget_type=ore.budget_type,  # Бюджет
                currency=ore.currency or "BYN",  # Валюта
                estimated_time=ore.estimated_time,  # Оценка времени
                start_time_work=ore.start_time_work,  # Время начала работ
                message=ore.message or "",  # Сообщение
                created_at=ore.created_at,  # Дата создания
            )  # Закрытие вызова/выражения
            for ore, user in rows  # Цикл по элементам
        ]  # Строка кода

        return order_responses_executors  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail=f"Ошибка получения предложений: {str(e)}",  # Статусная запись
        )  # Закрытие вызова/выражения


async def can_view_order_executor_response(  # Доступ к отклику исполнителя
    db: AsyncSession,  # Продолжение выражения
    viewer_id: int,  # Продолжение выражения
    order_id: int,  # ID заказа
    executor_id: int,  # ID исполнителя
) -> bool:  # Закрытие вызова/выражения
    if viewer_id == executor_id:  # Сам исполнитель
        return True  # Доступ разрешён

    viewer = await db.get(User, viewer_id)  # Просматривающий пользователь
    if viewer and viewer.role in {"admin", "moderator"}:  # Staff
        return True  # Доступ разрешён

    customer_row = await db.execute(  # Заказчик заказа
        select(Order.customer_id).where(Order.id == order_id)  # SQL SELECT
    )  # Закрытие вызова/выражения
    customer_id = customer_row.scalar_one_or_none()  # Данные заказчика
    return customer_id is not None and customer_id == viewer_id  # Ничего не найдено


async def get_order_response_executor(  # Один отклик исполнителя
    db: AsyncSession, user_id: int, order_id: int  # Строка кода
) -> OrderResponseExecutorReadSchema:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(OrderResponseExecutor, User)  # SQL SELECT
            .outerjoin(
                User, OrderResponseExecutor.executor_id == User.id
            )  # JOIN таблиц
            .where(  # Условие WHERE
                and_(  # Логическое И
                    OrderResponseExecutor.executor_id == user_id,  # ID исполнителя
                    OrderResponseExecutor.order_id == order_id,  # ID заказа
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        row = result.first()  # Строка результата
        if not row:  # Проверка отрицания
            raise HTTPException(
                status_code=404, detail="Предложение не найдено"
            )  # Выбрасываем HTTP-ошибку

        order_response_executor, user = row  # Данные заказа

        return OrderResponseExecutorReadSchema(  # Возвращаем результат
            id=order_response_executor.id,  # Продолжение выражения
            executor_id=order_response_executor.executor_id,  # ID исполнителя
            executor_name={  # Данные исполнителя
                "first_name": user.first_name if user else "Неизвестный",  # Имя
                "second_name": getattr(
                    user, "last_name", ""
                )  # Безопасное чтение атрибута
                or "Неизвестный",  # Продолжение выражения
            },  # Продолжение выражения
            proposed_price=order_response_executor.proposed_price,  # Предложенная цена
            budget_type=order_response_executor.budget_type,  # Бюджет
            currency=order_response_executor.currency or "BYN",  # Валюта
            estimated_time=order_response_executor.estimated_time,  # Оценка времени
            start_time_work=order_response_executor.start_time_work,  # Время начала работ
            message=order_response_executor.message or "",  # Сообщение
            created_at=order_response_executor.created_at,  # Дата создания
        )  # Закрытие вызова/выражения

    except HTTPException:  # Пробрасываем HTTP-ошибку
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail=f"Ошибка получения предложений: {str(e)}",  # Статусная запись
        )  # Закрытие вызова/выражения


async def get_executors_for_order(  # Поиск исполнителей (заглушка/legacy)
    db: AsyncSession,  # Продолжение выражения
    category_work_id: int,  # Категория работ
    country_id: int,  # Страна
    region_id: int,  # Регион
    town_id: int,  # Город
    rating: float,  # Рейтинг
    cost: float,  # Продолжение выражения
) -> OrderResponseExecutorReadSchema:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(OrderResponseExecutor, User)  # SQL SELECT
            .outerjoin(
                User, OrderResponseExecutor.executor_id == User.id
            )  # JOIN таблиц
            .where(  # Условие WHERE
                and_(  # Логическое И
                    OrderResponseExecutor.executor_id == user_id,  # ID исполнителя
                    OrderResponseExecutor.order_id == order_id,  # ID заказа
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        row = result.first()  # Строка результата
        if not row:  # Проверка отрицания
            raise HTTPException(
                status_code=404, detail="Предложение не найдено"
            )  # Выбрасываем HTTP-ошибку

        order_response_executor, user = row  # Данные заказа

        return OrderResponseExecutorReadSchema(  # Возвращаем результат
            id=order_response_executor.id,  # Продолжение выражения
            executor_id=order_response_executor.executor_id,  # ID исполнителя
            executor_name={  # Данные исполнителя
                "first_name": user.first_name if user else "Неизвестный",  # Имя
                "second_name": getattr(
                    user, "last_name", ""
                )  # Безопасное чтение атрибута
                or "Неизвестный",  # Продолжение выражения
            },  # Продолжение выражения
            proposed_price=order_response_executor.proposed_price,  # Предложенная цена
            budget_type=order_response_executor.budget_type,  # Бюджет
            currency=order_response_executor.currency or "BYN",  # Валюта
            estimated_time=order_response_executor.estimated_time,  # Оценка времени
            start_time_work=order_response_executor.start_time_work,  # Время начала работ
            message=order_response_executor.message or "",  # Сообщение
            created_at=order_response_executor.created_at,  # Дата создания
        )  # Закрытие вызова/выражения

    except HTTPException:  # Пробрасываем HTTP-ошибку
        raise  # Пробрасываем исключение
    except Exception as e:  # Обработка исключения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail=f"Ошибка получения предложений: {str(e)}",  # Статусная запись
        )  # Закрытие вызова/выражения


async def get_orders_customers(  # Каталог заказов «в поиске»
    db: AsyncSession,  # Продолжение выражения
    category_work_slug: str = None,  # Категория работ
    country: str = None,  # Страна
    region: str = None,  # Регион
    town: str = None,  # Город
    page: int = 1,  # Продолжение выражения
    page_size: int = 12,  # Продолжение выражения
    exclude_customer_id: Optional[int] = None,  # ID заказчика
):  # Закрытие вызова/выражения
    try:  # Начало блока try
        conditions = [
            StatusOrderCustomer.status == "В поиске исполнителя"
        ]  # Базовый фильтр

        if category_work_slug:  # Условная проверка
            conditions.append(
                CategoryWork.slug == category_work_slug
            )  # Добавляем фильтр
        if country:  # Условная проверка
            conditions.append(Order.country == country)  # Добавляем фильтр
        if region:  # Условная проверка
            conditions.append(Order.region == region)  # Добавляем фильтр
        if town:  # Условная проверка
            conditions.append(Order.town == town)  # Добавляем фильтр
        if exclude_customer_id is not None:  # Проверка на None
            conditions.append(
                Order.customer_id != exclude_customer_id
            )  # Добавляем фильтр

        query = (  # SELECT с JOIN
            select(Order, CategoryWork)  # SQL SELECT
            .join(
                StatusOrderCustomer, Order.id == StatusOrderCustomer.order_id
            )  # JOIN таблиц
            .join(CategoryWork, Order.category_id == CategoryWork.id)  # JOIN таблиц
            .where(and_(*conditions))  # Условие WHERE
            .order_by(Order.created_at.desc())  # Сортировка результата
        )  # Закрытие вызова/выражения

        print(f"🔍 Запрос: {str(query)}")  # Отладочный вывод

        count_result = await db.execute(  # Общее количество
            select(func.count())  # SQL SELECT
            .select_from(Order)  # Закрывающая скобка вызова
            .join(
                StatusOrderCustomer, Order.id == StatusOrderCustomer.order_id
            )  # JOIN таблиц
            .join(CategoryWork, Order.category_id == CategoryWork.id)  # JOIN таблиц
            .where(and_(*conditions))  # Условие WHERE
        )  # Закрытие вызова/выражения
        total = count_result.scalar_one() or 0  # Общее количество

        print(f"🔍 Всего заказов: {total}")  # Отладочный вывод

        if total == 0:  # Сравнение значений
            return [], 0  # Пустой список

        offset = (page - 1) * page_size  # Пагинация
        result = await db.execute(
            query.offset(offset).limit(page_size)
        )  # Пагинация запроса
        orders_data = result.all()  # Данные заказа

        print(
            f"🔍 Получено заказов на странице {page}: {len(orders_data)}"
        )  # Отладочный вывод

        return [  # Список + total
            OrderReadSchema(  # Схема заказа
                id=order.id,  # Продолжение выражения
                category_work=category_work.name,  # Категория работ
                category_work_id=order.category_id,  # Категория работ
                title=order.title,  # Заголовок
                description=order.description,  # Описание
                customer_id=order.customer_id,  # ID заказчика
                budget=order.budget,  # Бюджет
                currency=getattr(order, "currency", "BYN"),  # Валюта
                budget_type=order.budget_type,  # Бюджет
                urgency_level=order.urgency_level,  # Срочность
                country=order.country,  # Страна
                region=order.region,  # Регион
                town=order.town,  # Город
                location=order.location,  # Адрес/локация
                deadline=order.deadline,  # Срок
                insurance_required=order.insurance_required,  # Страхование
                created_at=order.created_at,  # Дата создания
                updated_at=order.updated_at,  # Дата обновления
            )  # Закрытие вызова/выражения
            for order, category_work in orders_data  # Цикл по элементам
        ], total  # Строка кода

    except Exception as e:  # Обработка исключения
        print(f"❌ Ошибка get_orders_customers: {str(e)}")  # Отладочный вывод
        traceback.print_exc()  # Трассировка стека
        return [], 0  # Пустой список


async def get_orders_count_for_period(  # Число заказов за период
    db: AsyncSession,  # Продолжение выражения
    user_id: Optional[int] = None,  # Продолжение выражения
    start_date: Optional[str] = None,  # Продолжение выражения
    end_date: Optional[str] = None,  # Продолжение выражения
) -> int:  # Закрытие вызова/выражения
    """
    Подсчёт количества заказов за период по дате создания.  # Строка кода

    :param user_id: если передан — считаем только заказы этого пользователя (customer_id)  # Закрывающая скобка вызова
    :param start_date: дата начала периода (ISO строка, как в админке)  # Закрывающая скобка вызова
    :param end_date: дата окончания периода (ISO строка, как в админке)  # Закрывающая скобка вызова
    """
    try:  # Начало блока try
        filters = []  # Условия WHERE

        if user_id is not None:  # Проверка на None
            filters.append(Order.customer_id == user_id)  # Добавляем фильтр

        if start_date and end_date:  # Интервал дат
            filters.append(Order.created_at >= start_date)  # Добавляем фильтр
            filters.append(Order.created_at <= end_date)  # Добавляем фильтр
        elif start_date:  # Условная проверка
            filters.append(Order.created_at >= start_date)  # Добавляем фильтр
        elif end_date:  # Условная проверка
            filters.append(Order.created_at <= end_date)  # Добавляем фильтр

        stmt = select(func.count()).select_from(Order)  # COUNT(*)
        if filters:  # Условная проверка
            stmt = stmt.where(and_(*filters))  # SQL-запрос

        result = await db.execute(stmt)  # Результат запроса
        count = result.scalar_one() or 0  # Счётчик
        return count  # Возвращаем результат
    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            f"get_orders_count_for_period error user_id={user_id}: {e}",
            exc_info=True,  # Счётчик
        )  # Закрытие вызова/выражения
        raise HTTPException(
            status_code=500, detail="Ошибка подсчёта заказов"
        )  # Выбрасываем HTTP-ошибку


async def get_orders_customer_admin(  # Заказы заказчика для админки
    db: AsyncSession,  # Продолжение выражения
    user_id: Optional[int] = None,  # Продолжение выражения
    category_work_slug: Optional[str] = None,  # Категория работ
    country: Optional[str] = None,  # Страна
    region: Optional[str] = None,  # Регион
    town: Optional[str] = None,  # Город
    status_order: Optional[str] = None,  # Статус
    budget_from: Optional[float] = None,  # Бюджет
    budget_to: Optional[float] = None,  # Бюджет
    start_date_orders: Optional[str] = None,  # Продолжение выражения
    end_date_orders: Optional[str] = None,  # Продолжение выражения
) -> list[OrderCardForAdmin]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        filters = []  # Накопление фильтров

        if user_id is not None:  # Проверка на None
            filters.append(Order.customer_id == user_id)  # Добавляем фильтр

        if category_work_slug:  # Условная проверка
            filters.append(CategoryWork.slug == category_work_slug)  # Добавляем фильтр
        if country:  # Условная проверка
            filters.append(Order.country == country)  # Добавляем фильтр
        if region:  # Условная проверка
            filters.append(Order.region == region)  # Добавляем фильтр
        if town:  # Условная проверка
            filters.append(Order.town == town)  # Добавляем фильтр
        if status_order:  # Условная проверка
            filters.append(
                StatusOrderCustomer.status == status_order
            )  # Добавляем фильтр

        if (
            budget_from is not None and budget_to is not None
        ):  # Бюджет: договор или заказ
            filters.append(  # Строка кода
                or_(  # Логическое ИЛИ
                    and_(  # Логическое И
                        Contract.budget.isnot(None),  # Бюджет
                        Contract.budget >= budget_from,  # Бюджет
                        Contract.budget <= budget_to,  # Бюджет
                    ),  # Продолжение выражения
                    and_(  # Логическое И
                        Contract.budget.is_(None),  # Бюджет
                        Order.budget >= budget_from,  # Бюджет
                        Order.budget <= budget_to,  # Бюджет
                    ),  # Продолжение выражения
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        elif budget_from is not None:  # Проверка на None
            filters.append(  # Строка кода
                or_(  # Логическое ИЛИ
                    and_(
                        Contract.budget.isnot(None), Contract.budget >= budget_from
                    ),  # Бюджет
                    and_(
                        Contract.budget.is_(None), Order.budget >= budget_from
                    ),  # Бюджет
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        elif budget_to is not None:  # Проверка на None
            filters.append(  # Строка кода
                or_(  # Логическое ИЛИ
                    and_(
                        Contract.budget.isnot(None), Contract.budget <= budget_to
                    ),  # Бюджет
                    and_(
                        Contract.budget.is_(None), Order.budget <= budget_to
                    ),  # Бюджет
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения

        if start_date_orders and end_date_orders:  # Период создания
            filters.append(Order.created_at >= start_date_orders)  # Добавляем фильтр
            filters.append(Order.created_at <= end_date_orders)  # Добавляем фильтр
        elif start_date_orders:  # Условная проверка
            filters.append(Order.created_at >= start_date_orders)  # Добавляем фильтр
        elif end_date_orders:  # Условная проверка
            filters.append(Order.created_at <= end_date_orders)  # Добавляем фильтр

        result = await db.execute(  # JOIN всех связей
            select(  # SQL SELECT
                Order,  # Продолжение выражения
                StatusOrderCustomer,  # Продолжение выражения
                CategoryWork,  # Продолжение выражения
                StatusOrderExecutor,  # Продолжение выражения
                User,  # Продолжение выражения
                Contract,  # Продолжение выражения
            )  # Закрытие вызова/выражения
            .outerjoin(
                StatusOrderCustomer, StatusOrderCustomer.order_id == Order.id
            )  # JOIN таблиц
            .outerjoin(
                CategoryWork, Order.category_id == CategoryWork.id
            )  # JOIN таблиц
            .outerjoin(
                StatusOrderExecutor, StatusOrderExecutor.order_id == Order.id
            )  # JOIN таблиц
            .outerjoin(User, User.id == StatusOrderExecutor.executor_id)  # JOIN таблиц
            .outerjoin(Contract, Contract.order_id == Order.id)  # JOIN таблиц
            .where(and_(*filters) if filters else True)  # Условие WHERE
            .order_by(Order.created_at.desc())  # Сортировка результата
        )  # Закрытие вызова/выражения

        rows = result.unique().all()  # Строки результата

        if not rows:  # Проверка отрицания
            return []  # Пустой список

        list_orders = []  # Накопленный список
        seen_order_ids: set[int] = set()  # Дедупликация JOIN
        for (
            order,
            status_customer,
            category,
            status_executor,
            user,
            contract,
        ) in rows:  # Цикл по элементам
            if order.id in seen_order_ids:  # Проверка вхождения
                continue  # Пропуск итерации
            seen_order_ids.add(order.id)  # Закрывающая скобка вызова

            display_budget = (  # Бюджет из договора или заказа
                contract.budget  # Строка кода
                if contract and contract.budget is not None  # Проверка на None
                else order.budget  # Строка кода
            )  # Закрытие вызова/выражения
            display_currency = (  # Значение для отображения
                contract.currency
                if contract and contract.currency
                else order.currency  # Строка кода
            )  # Закрытие вызова/выражения
            customer_status = (
                status_customer.status if status_customer else None
            )  # Данные заказчика

            order_admin = OrderCardForAdmin(  # Карточка для админки
                id=order.id,  # Продолжение выражения
                title=order.title,  # Заголовок
                description=order.description,  # Описание
                category_work=category.name if category else None,  # Категория работ
                country=order.country,  # Страна
                region=order.region,  # Регион
                town=order.town,  # Город
                location=order.location,  # Адрес/локация
                budget=display_budget,  # Бюджет
                currency=display_currency,  # Валюта
                created_at=order.created_at,  # Дата создания
                status_order_customer=customer_status,  # Статус
                status=customer_status,  # Статус
            )  # Закрытие вызова/выражения
            list_orders.append(order_admin)  # Закрывающая скобка вызова

        return list_orders  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            f"get_orders_customer_admin error user_id={user_id}: {e}",
            exc_info=True,  # Данные заказа
        )  # Закрытие вызова/выражения
        raise HTTPException(
            status_code=500, detail="Ошибка получения заказов"
        )  # Выбрасываем HTTP-ошибку


async def get_services_executor_admin(  # Услуги исполнителя для админки
    db: AsyncSession,  # Продолжение выражения
    user_id: Optional[int] = None,  # Продолжение выражения
    category_work_slug: Optional[str] = None,  # Категория работ
    country: Optional[str] = None,  # Страна
    region: Optional[str] = None,  # Регион
    town: Optional[str] = None,  # Город
    status_service: Optional[str] = None,  # Статус
    budget_from: Optional[float] = None,  # Бюджет
    budget_to: Optional[float] = None,  # Бюджет
    start_date_orders: Optional[str] = None,  # Продолжение выражения
    end_date_orders: Optional[str] = None,  # Продолжение выражения
) -> list[OrderCardForAdmin]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        filters = []  # Условия фильтрации

        if user_id is not None:  # Проверка на None
            filters.append(ExecutorOrder.executor_id == user_id)  # Добавляем фильтр

        if category_work_slug:  # Условная проверка
            filters.append(CategoryWork.slug == category_work_slug)  # Добавляем фильтр
        if country:  # Условная проверка
            filters.append(Order.country == country)  # Добавляем фильтр
        if region:  # Условная проверка
            filters.append(Order.region == region)  # Добавляем фильтр
        if town:  # Условная проверка
            filters.append(Order.town == town)  # Добавляем фильтр
        if status_service:  # Условная проверка
            filters.append(
                StatusOrderExecutor.status == status_service
            )  # Добавляем фильтр

        if budget_from is not None:  # Проверка на None
            filters.append(Order.budget >= budget_from)  # Добавляем фильтр
        if budget_to is not None:  # Проверка на None
            filters.append(Order.budget <= budget_to)  # Добавляем фильтр

        if start_date_orders and end_date_orders:  # Условная проверка
            filters.append(Order.created_at >= start_date_orders)  # Добавляем фильтр
            filters.append(Order.created_at <= end_date_orders)  # Добавляем фильтр
        elif start_date_orders:  # Условная проверка
            filters.append(Order.created_at >= start_date_orders)  # Добавляем фильтр
        elif end_date_orders:  # Условная проверка
            filters.append(Order.created_at <= end_date_orders)  # Добавляем фильтр

        status_join = and_(  # Статус того же исполнителя
            StatusOrderExecutor.order_id == Order.id,  # ID заказа
            StatusOrderExecutor.executor_id
            == ExecutorOrder.executor_id,  # ID исполнителя
        )  # Закрытие вызова/выражения

        result = await db.execute(  # Результат запроса
            select(
                Order, ExecutorOrder, StatusOrderExecutor, CategoryWork, Contract
            )  # SQL SELECT
            .join(ExecutorOrder, ExecutorOrder.order_id == Order.id)  # JOIN таблиц
            .outerjoin(StatusOrderExecutor, status_join)  # JOIN таблиц
            .outerjoin(
                CategoryWork, Order.category_id == CategoryWork.id
            )  # JOIN таблиц
            .outerjoin(Contract, Contract.order_id == Order.id)  # JOIN таблиц
            .where(and_(*filters) if filters else True)  # Условие WHERE
            .order_by(Order.created_at.desc())  # Сортировка результата
        )  # Закрытие вызова/выражения

        rows = result.all()  # Строки результата
        list_orders = []  # Накопленный список
        seen_order_ids: set[int] = set()  # Уже обработанные ID

        for (
            order,
            _executor_order,
            status_executor,
            category,
            contract,
        ) in rows:  # Цикл по элементам
            if user_id is not None and order.id in seen_order_ids:  # Дедуп
                continue  # Пропуск итерации
            seen_order_ids.add(order.id)  # Закрывающая скобка вызова

            display_budget = (  # Значение для отображения
                contract.budget  # Строка кода
                if contract and contract.budget is not None  # Проверка на None
                else order.budget  # Строка кода
            )  # Закрытие вызова/выражения
            display_currency = (  # Значение для отображения
                contract.currency
                if contract and contract.currency
                else order.currency  # Строка кода
            )  # Закрытие вызова/выражения
            executor_status = (
                status_executor.status if status_executor else None
            )  # Данные исполнителя

            order_admin = OrderCardForAdmin(  # Данные заказа
                id=order.id,  # Продолжение выражения
                title=order.title,  # Заголовок
                description=order.description,  # Описание
                category_work=category.name if category else None,  # Категория работ
                country=order.country,  # Страна
                region=order.region,  # Регион
                town=order.town,  # Город
                location=order.location,  # Адрес/локация
                budget=display_budget,  # Бюджет
                currency=display_currency,  # Валюта
                created_at=order.created_at,  # Дата создания
                status_service_executor=executor_status,  # Статус
                status=executor_status,  # Статус
            )  # Закрытие вызова/выражения
            list_orders.append(order_admin)  # Закрывающая скобка вызова

        return list_orders  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            f"get_services_executor_admin error user_id={user_id}: {e}",
            exc_info=True,  # Данные пользователя
        )  # Закрытие вызова/выражения
        raise HTTPException(
            status_code=500, detail="Ошибка получения заказов"
        )  # Выбрасываем HTTP-ошибку


from sqlalchemy.orm import aliased  # Повторный импорт aliased


async def get_order_profile_for_admin(  # Полный профиль заказа для админа
    db: AsyncSession, order_id: int  # Строка кода
) -> Optional[OrderProfileForAdmin]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        CustomerUser = aliased(User)  # Заказчик
        ExecutorUser = aliased(User)  # Исполнитель

        result = await db.execute(  # Результат запроса
            select(  # SQL SELECT
                Order,  # Продолжение выражения
                CustomerUser,  # Продолжение выражения
                ExecutorOrder,  # Продолжение выражения
                ExecutorUser,  # Продолжение выражения
                StatusOrderCustomer,  # Продолжение выражения
                CategoryWork,  # Продолжение выражения
                Contract,  # Продолжение выражения
            )  # Закрытие вызова/выражения
            .select_from(Order)  # Закрывающая скобка вызова
            .join(CustomerUser, Order.customer_id == CustomerUser.id)  # JOIN таблиц
            .outerjoin(ExecutorOrder, Order.id == ExecutorOrder.order_id)  # JOIN таблиц
            .outerjoin(  # JOIN таблиц
                ExecutorUser,
                ExecutorOrder.executor_id == ExecutorUser.id,  # Алиас User для JOIN
            )  # Закрытие вызова/выражения
            .outerjoin(
                StatusOrderCustomer, Order.id == StatusOrderCustomer.order_id
            )  # JOIN таблиц
            .outerjoin(
                CategoryWork, Order.category_id == CategoryWork.id
            )  # JOIN таблиц
            .outerjoin(Contract, Order.id == Contract.order_id)  # JOIN таблиц
            .where(Order.id == order_id)  # Условие WHERE
        )  # Закрытие вызова/выражения

        row = result.first()  # Строка результата
        if not row:  # Проверка отрицания
            return None  # Ничего не найдено

        (  # Начало многострочного выражения
            order,  # Продолжение выражения
            customer,  # Продолжение выражения
            executor_order,  # Продолжение выражения
            executor,  # Продолжение выражения
            status_customer,  # Статус
            category_work,  # Категория работ
            contract,  # Продолжение выражения
        ) = row  # Присваивание значения

        resolved_executor_id, executor_name = (
            await _resolve_executor_for_admin(  # Исполнитель
                db=db,  # Сессия БД
                order_id=order_id,  # ID заказа
                executor_order=executor_order,  # Продолжение выражения
                executor_user=executor,  # Продолжение выражения
                contract=contract,  # Продолжение выражения
            )
        )  # Закрытие вызова/выражения

        order_profile = OrderProfileForAdmin(  # DTO профиля
            id=order.id,  # Продолжение выражения
            category_work=(
                category_work.name if category_work else "Без категории"
            ),  # Категория работ
            title=order.title,  # Заголовок
            description=order.description,  # Описание
            customer_id=order.customer_id,  # ID заказчика
            budget=order.budget,  # Бюджет
            currency=order.currency,  # Валюта
            budget_type=order.budget_type,  # Бюджет
            urgency_level=order.urgency_level,  # Срочность
            country=order.country,  # Страна
            region=order.region,  # Регион
            town=order.town,  # Город
            location=order.location,  # Адрес/локация
            deadline=order.deadline,  # Срок
            insurance_required=order.insurance_required,  # Страхование
            created_at=order.created_at,  # Дата создания
            updated_at=order.updated_at,  # Дата обновления
            customer_name={  # Данные заказчика
                "first_name": customer.first_name if customer else None,  # Имя
                "last_name": customer.last_name if customer else None,  # Фамилия
            },  # Продолжение выражения
            executor_name=executor_name,  # Продолжение выражения
            executor_id=resolved_executor_id,  # ID исполнителя
            status_order_customer=(
                status_customer.status if status_customer else None
            ),  # Статус
            date_start_work=(
                contract.date_start_work if contract else None
            ),  # Дата начала
            date_end_work=(
                contract.date_end_work if contract else None
            ),  # Продолжение выражения
            budget_contract=(  # Договор
                float(contract.budget)
                if contract and contract.budget
                else None  # Приведение к float
            ),  # Продолжение выражения
            currency_contract=contract.currency if contract else None,  # Валюта
            category_work_id=order.category_id,  # Категория работ
        )  # Закрытие вызова/выражения

        return order_profile  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        print(
            f"❌ Ошибка get_order_profile_for_admin(order_id={order_id}): {str(e)}"
        )  # Отладочный вывод
        import traceback  # Импорт traceback

        traceback.print_exc()  # Трассировка стека
        return None  # Ничего не найдено


async def get_service_profile_for_admin(  # Профиль услуги (заказа исполнителя) для админа
    db: AsyncSession, service_id: int  # Строка кода
) -> Optional[ServiceProfileForAdmin]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        CustomerUser = aliased(User)  # Алиас User для JOIN
        ExecutorUser = aliased(User)  # Алиас User для JOIN

        result = await db.execute(  # Результат запроса
            select(  # SQL SELECT
                Order,  # Продолжение выражения
                CustomerUser,  # Продолжение выражения
                ExecutorOrder,  # Продолжение выражения
                ExecutorUser,  # Продолжение выражения
                StatusOrderExecutor,  # Продолжение выражения
                CategoryWork,  # Продолжение выражения
                CategoryWorkMaster,  # Продолжение выражения
                Contract,  # Продолжение выражения
            )  # Закрытие вызова/выражения
            .select_from(Order)  # Закрывающая скобка вызова
            .join(CustomerUser, Order.customer_id == CustomerUser.id)  # JOIN таблиц
            .outerjoin(ExecutorOrder, Order.id == ExecutorOrder.order_id)  # JOIN таблиц
            .outerjoin(
                ExecutorUser, ExecutorOrder.executor_id == ExecutorUser.id
            )  # JOIN таблиц
            .outerjoin(
                StatusOrderExecutor, Order.id == StatusOrderExecutor.order_id
            )  # JOIN таблиц
            .outerjoin(  # JOIN таблиц
                CategoryWorkMaster,  # Продолжение выражения
                ExecutorOrder.executor_id
                == CategoryWorkMaster.master_id,  # ID исполнителя
            )  # Закрытие вызова/выражения
            .outerjoin(  # JOIN таблиц
                CategoryWork,
                CategoryWorkMaster.category_work_id
                == CategoryWork.id,  # ID категории работ
            )  # Закрытие вызова/выражения
            .outerjoin(Contract, Order.id == Contract.order_id)  # JOIN таблиц
            .where(Order.id == service_id)  # Условие WHERE
        )  # Закрытие вызова/выражения

        row = result.first()  # Одна строка JOIN
        if not row:  # Проверка отрицания
            return None  # Ничего не найдено

        (  # Начало многострочного выражения
            order,  # Продолжение выражения
            customer,  # Продолжение выражения
            executor_order,  # Продолжение выражения
            executor,  # Продолжение выражения
            status_executor,  # Статус
            category_work,  # Категория работ
            category_work_master,  # Категория работ
            contract,  # Продолжение выражения
        ) = row  # Распаковка

        resolved_executor_id, executor_name = (
            await _resolve_executor_for_admin(  # Исполнитель
                db=db,  # Сессия БД
                order_id=service_id,  # ID заказа
                executor_order=executor_order,  # Продолжение выражения
                executor_user=executor,  # Продолжение выражения
                contract=contract,  # Продолжение выражения
            )
        )  # Закрытие вызова/выражения

        order_profile = ServiceProfileForAdmin(  # DTO профиля услуги
            id=order.id,  # Продолжение выражения
            category_work=(
                category_work.name if category_work else "Без категории"
            ),  # Категория работ
            title=order.title,  # Заголовок
            description=order.description,  # Описание
            customer_id=order.customer_id,  # ID заказчика
            budget=order.budget,  # Бюджет
            currency=order.currency,  # Валюта
            budget_type=order.budget_type,  # Бюджет
            urgency_level=order.urgency_level,  # Срочность
            country=order.country,  # Страна
            region=order.region,  # Регион
            town=order.town,  # Город
            location=order.location,  # Адрес/локация
            deadline=order.deadline,  # Срок
            insurance_required=order.insurance_required,  # Страхование
            created_at=order.created_at,  # Дата создания
            updated_at=order.updated_at,  # Дата обновления
            customer_name={  # Данные заказчика
                "first_name": customer.first_name if customer else None,  # Имя
                "last_name": customer.last_name if customer else None,  # Фамилия
            },  # Продолжение выражения
            executor_name=executor_name,  # Продолжение выражения
            executor_id=resolved_executor_id,  # ID исполнителя
            status_order_executor=(
                status_executor.status if status_executor else None
            ),  # Статус
            date_start_work=(
                contract.date_start_work if contract else None
            ),  # Дата начала
            date_end_work=(
                contract.date_end_work if contract else None
            ),  # Продолжение выражения
            budget_contract=(  # Договор
                float(contract.budget)
                if contract and contract.budget
                else None  # Приведение к float
            ),  # Продолжение выражения
            currency_contract=contract.currency if contract else None,  # Валюта
            category_work_id=order.category_id,  # Категория работ
        )  # Закрытие вызова/выражения

        return order_profile  # Готовый профиль

    except Exception as e:  # Обработка исключения
        print(
            f"❌ Ошибка get_service_profile_for_admin(order_id={order.id}): {str(e)}"
        )  # Отладочный вывод
        import traceback  # Для отладки

        traceback.print_exc()  # Трассировка стека
        return None  # Ничего не найдено


async def get_customer_order_cancel(  # Отмена заказчиком по ключам
    db: AsyncSession, order_id: int, customer_id: int, executor_id: int  # Строка кода
) -> Optional[CustomerOrderCancellationReadSchema]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # SELECT по составному ключу
            select(CustomerOrderCancellation).where(  # SQL SELECT
                CustomerOrderCancellation.order_id == order_id,  # ID заказа
                CustomerOrderCancellation.customer_id == customer_id,  # ID заказчика
                CustomerOrderCancellation.executor_id == executor_id,  # ID исполнителя
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        customer_order_cancel = result.scalars().first()  # Первая запись

        if not customer_order_cancel:  # Проверка отрицания
            return None  # Ничего не найдено

        return customer_order_cancel  # ORM → схема

    except ValidationError as ve:  # Ошибка валидации
        print(f"❌ Pydantic validation error: {ve}")  # Отладочный вывод
        return None  # Ничего не найдено
    except Exception as e:  # Обработка исключения
        print(
            f"❌ Ошибка get_customer_order_cancel(order_id={order_id}): {str(e)}"
        )  # Отладочный вывод
        import traceback  # Импорт traceback

        traceback.print_exc()  # Трассировка стека
        return None  # Ничего не найдено


async def get_executor_order_cancel(  # Отмена исполнителем по ключам
    db: AsyncSession, order_id: int, customer_id: int, executor_id: int  # Строка кода
) -> Optional[ExecutorOrderCancellationReadSchema]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(ExecutorOrderCancellation).where(  # SQL SELECT
                ExecutorOrderCancellation.order_id == order_id,  # ID заказа
                ExecutorOrderCancellation.customer_id == customer_id,  # ID заказчика
                ExecutorOrderCancellation.executor_id == executor_id,  # ID исполнителя
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        executor_order_cancel = result.scalars().first()  # Данные заказа

        if not executor_order_cancel:  # Проверка отрицания
            return None  # Ничего не найдено

        return executor_order_cancel  # Возвращаем результат

    except ValidationError as ve:  # Ошибка валидации
        print(f"❌ Pydantic validation error: {ve}")  # Отладочный вывод
        return None  # Ничего не найдено
    except Exception as e:  # Обработка исключения
        print(
            f"❌ Ошибка get_customer_order_cancel(order_id={order_id}): {str(e)}"
        )  # Отладочный вывод
        import traceback  # Импорт traceback

        traceback.print_exc()  # Трассировка стека
        return None  # Ничего не найдено


async def get_cancel_orders_customers_for_admin(  # Спорные отмены для админа
    db: AsyncSession,  # Продолжение выражения
) -> Optional[list[CancelOrderCustomerForAdminRead]]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        UserCustomer = aliased(User)  # Алиас заказчика
        UserExecutor = aliased(User)  # Алиас исполнителя

        stmt = (  # status == disagree
            select(
                CustomerOrderCancellation, Order, UserCustomer, UserExecutor
            )  # SQL SELECT
            .outerjoin(
                Order, CustomerOrderCancellation.order_id == Order.id
            )  # JOIN таблиц
            .outerjoin(  # JOIN таблиц
                UserCustomer,
                CustomerOrderCancellation.customer_id
                == UserCustomer.id,  # Алиас User для JOIN
            )  # Закрытие вызова/выражения
            .outerjoin(  # JOIN таблиц
                UserExecutor,
                CustomerOrderCancellation.executor_id
                == UserExecutor.id,  # Алиас User для JOIN
            )  # Закрытие вызова/выражения
            .where(CustomerOrderCancellation.status == "disagree")  # Условие WHERE
        )  # Закрытие вызова/выражения

        result = await db.execute(stmt)  # Результат запроса
        rows = result.all()  # Все спорные отмены

        cancel_orders_customers: list[CancelOrderCustomerForAdminRead] = (
            []
        )  # Данные заказа

        for (
            customer_order_cancel,
            order,
            user_customer,
            user_executor,
        ) in rows:  # Цикл по элементам
            cancel_order_customer = CancelOrderCustomerForAdminRead(  # Карточка для админа
                id=customer_order_cancel.id,  # Продолжение выражения
                order_id=customer_order_cancel.order_id,  # ID заказа
                order_name=order.title if order else "",  # Заголовок
                customer_name=(  # Данные заказчика
                    f"{user_customer.first_name} {user_customer.last_name}"  # Форматированная строка
                    if user_customer  # Условная проверка
                    else ""  # Строка кода
                ),  # Продолжение выражения
                executor_name=(  # Данные исполнителя
                    f"{user_executor.first_name} {user_executor.last_name}"  # Форматированная строка
                    if user_executor  # Условная проверка
                    else ""  # Строка кода
                ),  # Продолжение выражения
            )  # Закрытие вызова/выражения
            cancel_orders_customers.append(
                cancel_order_customer
            )  # Закрывающая скобка вызова

        if not cancel_orders_customers:  # Проверка отрицания
            return None  # Ничего не найдено

        return cancel_orders_customers  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        print(
            f"❌ Ошибка get_cancel_orders_customers_for_admin: {str(e)}"
        )  # Отладочный вывод
        import traceback  # Импорт traceback

        traceback.print_exc()  # Трассировка стека
        return None  # Ничего не найдено


async def get_cancel_order_customer_for_admin(  # Одна отмена по ID для админа
    db: AsyncSession, cancel_order_customer_id: int  # Строка кода
) -> Optional[CustomerOrderCancellationReadSchema]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(CustomerOrderCancellation).where(  # SQL SELECT
                CustomerOrderCancellation.id
                == cancel_order_customer_id  # Идентификатор
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        cancel_order_customer = result.scalar_one_or_none()  # Запись или None
        if cancel_order_customer is None:  # Проверка на None
            return None  # Ничего не найдено

        return cancel_order_customer  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        print(
            f"❌ Ошибка get_cancel_order_customer_for_admin: {str(e)}"
        )  # Отладочный вывод
        import traceback  # Импорт traceback

        traceback.print_exc()  # Трассировка стека
        return None  # Ничего не найдено


async def get_dates_start_execute_orders(  # График дат начала работ
    db: AsyncSession, user_id: int  # Строка кода
) -> list[GraphicOrderMasterRead]:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Заказы с датами пользователя
            select(Order, GraphicOrderMaster)  # SQL SELECT
            .join(
                GraphicOrderMaster, Order.id == GraphicOrderMaster.order_id
            )  # JOIN таблиц
            .where(GraphicOrderMaster.user_id == user_id)  # Условие WHERE
        )  # Закрытие вызова/выражения

        rows = result.all()  # Строки результата
        if not rows:  # Проверка отрицания
            return []  # Пустой список

        list_graphic_orders_master = []  # Накопленный список
        for order, graphic_order_master in rows:  # Цикл по элементам
            list_graphic_orders_master.append(  # Элемент графика
                GraphicOrderMasterRead(  # График работ
                    id=graphic_order_master.id,  # Продолжение выражения
                    name_order=order.title,  # Заголовок
                    address=f"{order.country}, {order.region}, {order.town}, {order.location}",  # Страна
                    date_start=graphic_order_master.date_start,  # Дата начала
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        return list_graphic_orders_master  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(
            f"Ошибка получения графика заказов user_id={user_id}: {str(e)}"
        )  # Запись в лог
        raise HTTPException(
            status_code=500, detail="Ошибка получения графика заказов"
        )  # Выбрасываем HTTP-ошибку


async def get_information_about_customer(  # Контакты заказчика для исполнителя
    db: AsyncSession,  # Продолжение выражения
    executor_id: int,  # ID исполнителя
    customer_id: int,  # ID заказчика
) -> InformationAboutCustomerRead | None:  # Закрытие вызова/выражения
    try:  # Начало блока try
        result = await db.execute(  # Результат запроса
            select(User, InformationAboutCustomer)  # SQL SELECT
            .options(*_user_address_load())
            .join(  # JOIN таблиц
                InformationAboutCustomer,  # Продолжение выражения
                User.id == InformationAboutCustomer.customer_id,  # ID заказчика
            )  # Закрытие вызова/выражения
            .where(  # Условие WHERE
                and_(  # Логическое И
                    InformationAboutCustomer.executor_id
                    == executor_id,  # ID исполнителя
                    InformationAboutCustomer.customer_id == customer_id,  # ID заказчика
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения

        row = result.unique().first()  # Строка результата
        if not row:  # Проверка отрицания
            return None  # Ничего не найдено

        user_result, information_about_customer_result = row  # Результат запроса

        if is_hidden_customer_executor_phone(
            information_about_customer_result.phone
        ):  # Скрыт
            return None  # Ничего не найдено

        information_about_customer = InformationAboutCustomerRead(  # Данные заказчика
            name_customer=f"{user_result.first_name} {user_result.last_name}",  # Имя
            address=_format_user_address(user_result),
            phone=information_about_customer_result.phone,  # Телефон
            notification=information_about_customer_result.notification,  # Уведомление
        )  # Закрытие вызова/выражения

        return information_about_customer  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            f"Ошибка получения информации о заказчике customer_id={customer_id}: {str(e)}"  # Данные заказчика
        )  # Закрытие вызова/выражения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail="Ошибка получения информации о заказчике",  # Статусная запись
        )  # Закрытие вызова/выражения


async def get_information_about_executor(  # Контакты исполнителя для заказчика
    db: AsyncSession,  # Продолжение выражения
    executor_id: int,  # ID исполнителя
    customer_id: int,  # ID заказчика
) -> InformationAboutExecutorRead | None:  # Закрытие вызова/выражения
    try:  # Начало блока try
        executor_result = await db.execute(  # Профиль исполнителя
            select(User)
            .options(*_user_address_load())
            .where(User.id == executor_id)  # SQL SELECT
        )  # Закрытие вызова/выражения
        executor_user = (
            executor_result.unique().scalar_one_or_none()
        )  # Данные пользователя
        if not executor_user:  # Проверка отрицания
            return None  # Ничего не найдено

        info_result = await db.execute(  # Сохранённые контакты
            select(InformationAboutExecutor).where(  # SQL SELECT
                and_(  # Логическое И
                    InformationAboutExecutor.executor_id
                    == executor_id,  # ID исполнителя
                    InformationAboutExecutor.customer_id == customer_id,  # ID заказчика
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        saved_info = info_result.scalar_one_or_none()  # Сохранённые данные
        if saved_info and is_hidden_customer_executor_phone(
            saved_info.phone
        ):  # Условная проверка
            saved_info = None  # Телефон скрыт

        return InformationAboutExecutorRead(  # Возвращаем результат
            executor_id=executor_id,  # ID исполнителя
            name_executor=_format_user_name(executor_user),  # Продолжение выражения
            address=_format_user_address(executor_user),
            phone=saved_info.phone if saved_info else None,  # Телефон
            notification=saved_info.notification if saved_info else None,  # Уведомление
        )  # Закрытие вызова/выражения

    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            "Ошибка получения информации об исполнителе executor_id=%s customer_id=%s: %s",  # ID исполнителя
            executor_id,  # ID исполнителя
            customer_id,  # ID заказчика
            str(e),  # Продолжение выражения
        )  # Закрытие вызова/выражения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail="Ошибка получения информации об исполнителе",  # Статусная запись
        )  # Закрытие вызова/выражения


async def get_customer_executors_list(  # Список исполнителей заказчика
    db: AsyncSession,  # Продолжение выражения
    customer_id: int,  # ID заказчика
) -> list[CustomerExecutorListItemSchema]:  # Закрытие вызова/выражения
    """Список исполнителей заказчика: из сохранённых контактов и истории заказов."""
    try:  # Начало блока try
        saved_result = await db.execute(  # Сохранённые контакты
            select(InformationAboutExecutor).where(  # SQL SELECT
                InformationAboutExecutor.customer_id == customer_id  # Данные заказчика
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        saved_rows = saved_result.scalars().all()  # Строки результата
        hidden_executor_ids = {  # Скрытые телефоны
            row.executor_id  # Строка кода
            for row in saved_rows  # Цикл по элементам
            if is_hidden_customer_executor_phone(row.phone)  # Условная проверка
        }  # Строка кода
        saved_map = {  # Видимые контакты
            row.executor_id: row  # Строка кода
            for row in saved_rows  # Цикл по элементам
            if not is_hidden_customer_executor_phone(row.phone)  # Проверка отрицания
        }  # Строка кода

        executor_ids: set[int] = set(saved_map.keys())  # Данные исполнителя

        response_rows = await db.execute(  # Откликали на заказы заказчика
            select(OrderResponseExecutor.executor_id)  # SQL SELECT
            .join(Order, Order.id == OrderResponseExecutor.order_id)  # JOIN таблиц
            .where(Order.customer_id == customer_id)  # Условие WHERE
            .distinct()  # Уникальные значения
        )  # Закрытие вызова/выражения
        executor_ids.update(
            row[0] for row in response_rows.all() if row[0]
        )  # Закрывающая скобка вызова

        assigned_rows = await db.execute(  # Назначены на заказы
            select(ExecutorOrder.executor_id)  # SQL SELECT
            .join(Order, Order.id == ExecutorOrder.order_id)  # JOIN таблиц
            .where(Order.customer_id == customer_id)  # Условие WHERE
            .distinct()  # Уникальные значения
        )  # Закрытие вызова/выражения
        executor_ids.update(
            row[0] for row in assigned_rows.all() if row[0]
        )  # Закрывающая скобка вызова
        executor_ids.discard(customer_id)  # Не сам заказчик
        executor_ids -= hidden_executor_ids  # Исключаем из множества

        if not executor_ids:  # Проверка отрицания
            return []  # Пустой список

        users_result = await db.execute(  # Данные пользователей
            select(User)
            .options(*_user_address_load())
            .where(User.id.in_(executor_ids))  # SQL SELECT
        )  # Закрытие вызова/выражения
        users = {
            user.id: user for user in users_result.unique().scalars().all()
        }  # Словарь пользователей

        items: list[CustomerExecutorListItemSchema] = []  # Элементы списка
        for executor_id in sorted(executor_ids):  # Цикл по элементам
            user = users.get(executor_id)  # Данные пользователя
            saved = saved_map.get(executor_id)  # Сохранённые данные
            items.append(  # Строка кода
                CustomerExecutorListItemSchema(  # Элемент списка исполнителей
                    executor_id=executor_id,  # ID исполнителя
                    name_executor=_format_user_name(user),  # Продолжение выражения
                    address=_format_user_address(user),
                    phone=saved.phone if saved else None,  # Телефон
                    notification=saved.notification if saved else None,  # Уведомление
                    has_saved_info=saved is not None,  # Продолжение выражения
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения

        return items  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            "Ошибка получения списка исполнителей customer_id=%s: %s",  # ID заказчика
            customer_id,  # ID заказчика
            str(e),  # Продолжение выражения
        )  # Закрытие вызова/выражения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail="Ошибка получения списка исполнителей",  # Статусная запись
        )  # Закрытие вызова/выражения


async def get_executor_customers_list(  # Список заказчиков исполнителя
    db: AsyncSession,  # Продолжение выражения
    executor_id: int,  # ID исполнителя
) -> list[ExecutorCustomerListItemSchema]:  # Закрытие вызова/выражения
    """Список заказчиков исполнителя: из сохранённых контактов и истории заказов."""
    try:  # Начало блока try
        saved_result = await db.execute(  # Результат запроса
            select(InformationAboutCustomer).where(  # SQL SELECT
                InformationAboutCustomer.executor_id
                == executor_id  # Данные исполнителя
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        saved_rows = saved_result.scalars().all()  # Строки результата
        hidden_customer_ids = {  # Скрытые ID
            row.customer_id  # Строка кода
            for row in saved_rows  # Цикл по элементам
            if is_hidden_customer_executor_phone(row.phone)  # Условная проверка
        }  # Строка кода
        saved_map = {  # Сохранённые данные
            row.customer_id: row  # Строка кода
            for row in saved_rows  # Цикл по элементам
            if not is_hidden_customer_executor_phone(row.phone)  # Проверка отрицания
        }  # Строка кода

        customer_ids: set[int] = set(saved_map.keys())  # Данные заказчика

        response_rows = await db.execute(  # Заказчики, чьи заказы откликал
            select(Order.customer_id)  # SQL SELECT
            .join(
                OrderResponseExecutor, Order.id == OrderResponseExecutor.order_id
            )  # JOIN таблиц
            .where(OrderResponseExecutor.executor_id == executor_id)  # Условие WHERE
            .distinct()  # Уникальные значения
        )  # Закрытие вызова/выражения
        customer_ids.update(
            row[0] for row in response_rows.all() if row[0]
        )  # Закрывающая скобка вызова

        assigned_rows = await db.execute(  # Заказчики с назначением
            select(Order.customer_id)  # SQL SELECT
            .join(ExecutorOrder, Order.id == ExecutorOrder.order_id)  # JOIN таблиц
            .where(ExecutorOrder.executor_id == executor_id)  # Условие WHERE
            .distinct()  # Уникальные значения
        )  # Закрытие вызова/выражения
        customer_ids.update(
            row[0] for row in assigned_rows.all() if row[0]
        )  # Закрывающая скобка вызова
        customer_ids.discard(executor_id)  # Закрывающая скобка вызова
        customer_ids -= hidden_customer_ids  # Исключаем из множества

        if not customer_ids:  # Проверка отрицания
            return []  # Пустой список

        users_result = await db.execute(  # Результат запроса
            select(User)
            .options(*_user_address_load())
            .where(User.id.in_(customer_ids))  # SQL SELECT
        )  # Закрытие вызова/выражения
        users = {
            user.id: user for user in users_result.unique().scalars().all()
        }  # Словарь пользователей

        items: list[ExecutorCustomerListItemSchema] = []  # Элементы списка
        for customer_id in sorted(customer_ids):  # Цикл по элементам
            user = users.get(customer_id)  # Данные пользователя
            saved = saved_map.get(customer_id)  # Сохранённые данные
            items.append(  # Строка кода
                ExecutorCustomerListItemSchema(  # Элемент списка заказчиков
                    customer_id=customer_id,  # ID заказчика
                    name_customer=_format_user_name(user),  # Продолжение выражения
                    address=_format_user_address(user),
                    phone=saved.phone if saved else None,  # Телефон
                    notification=saved.notification if saved else None,  # Уведомление
                    has_saved_info=saved is not None,  # Продолжение выражения
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения

        return items  # Возвращаем результат

    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            "Ошибка получения списка заказчиков executor_id=%s: %s",  # ID исполнителя
            executor_id,  # ID исполнителя
            str(e),  # Продолжение выражения
        )  # Закрытие вызова/выражения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,
            detail="Ошибка получения списка заказчиков",  # Статусная запись
        )  # Закрытие вызова/выражения


async def get_information_about_execute_order(  # Доступность заказа для исполнителя
    db: AsyncSession,  # Продолжение выражения
    user_id: int,  # Продолжение выражения
    order_id: int,  # ID заказа
) -> InformationAboutExecuteOrderRead:  # Закрытие вызова/выражения
    """
    Сообщает исполнителю, что заказ больше недоступен:  # Строка кода
    - заказчик выбрал другого исполнителя;  # Строка кода
    - заказ убран в черновик;  # Строка кода
    - заказ переведён в самостоятельное выполнение.  # Строка кода
    user_id — текущий исполнитель, просматривающий услугу.  # Строка кода
    """
    CUSTOMER_STATUS_DRAFT = "Не предложенные исполнителям"  # Черновик
    CUSTOMER_STATUS_SELF = "Самостоятельное выполнение"  # Сам выполняет

    def build_unavailable(  # DTO «заказ недоступен»
        *,  # Продолжение выражения
        reason: str,  # Причина
        message: str,  # Сообщение
        selected_executor_id: Optional[int] = None,  # ID исполнителя
        selected_executor_name: Optional[str] = None,  # Продолжение выражения
    ) -> InformationAboutExecuteOrderRead:  # Закрытие вызова/выражения
        return InformationAboutExecuteOrderRead(  # Возвращаем результат
            order_unavailable=True,  # Продолжение выражения
            unavailability_reason=reason,  # Причина
            customer_chose_another_executor=reason == "another_executor",  # Причина
            message=message,  # Сообщение
            selected_executor_id=selected_executor_id,  # ID исполнителя
            selected_executor_name=selected_executor_name,  # Продолжение выражения
        )  # Закрытие вызова/выражения

    try:  # Начало блока try
        response_exists = await db.execute(  # Был ли отклик этого исполнителя
            select(OrderResponseExecutor.id).where(  # SQL SELECT
                OrderResponseExecutor.order_id == order_id,  # ID заказа
                OrderResponseExecutor.executor_id == user_id,  # ID исполнителя
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        if response_exists.scalar_one_or_none() is None:  # Нет отклика — пустой ответ
            return InformationAboutExecuteOrderRead()  # Возвращаем результат

        customer_status_result = await db.execute(  # Статус заказчика
            select(StatusOrderCustomer.status).where(  # SQL SELECT
                StatusOrderCustomer.order_id == order_id  # Данные заказа
            )  # Закрытие вызова/выражения
        )  # Закрытие вызова/выражения
        customer_status = (
            customer_status_result.scalar_one_or_none()
        )  # Данные заказчика

        if customer_status == CUSTOMER_STATUS_DRAFT:  # Сравнение значений
            return build_unavailable(  # Возвращаем результат
                reason="moved_to_draft",  # Причина
                message=(  # Текст сообщения
                    "Заказчик убрал заказ в черновик. "  # Строковый литерал
                    "Заказ больше недоступен для выполнения."  # Строковый литерал
                ),  # Продолжение выражения
            )  # Закрытие вызова/выражения

        if customer_status == CUSTOMER_STATUS_SELF:  # Сравнение значений
            return build_unavailable(  # Возвращаем результат
                reason="self_execution",  # Причина
                message=(  # Текст сообщения
                    "Заказчик решил выполнить заказ самостоятельно. "  # Строковый литерал
                    "Заказ больше недоступен для исполнителей."  # Строковый литерал
                ),  # Продолжение выражения
            )  # Закрытие вызова/выражения

        result = await db.execute(  # Назначенный исполнитель
            select(ExecutorOrder, User)  # SQL SELECT
            .outerjoin(User, ExecutorOrder.executor_id == User.id)  # JOIN таблиц
            .where(ExecutorOrder.order_id == order_id)  # Условие WHERE
        )  # Закрытие вызова/выражения
        row = result.first()  # Строка результата

        if not row:  # Никто не назначен
            return InformationAboutExecuteOrderRead()  # Возвращаем результат

        executor_order, selected_user = row  # Данные заказа
        selected_executor_id = executor_order.executor_id  # Данные исполнителя
        selected_executor_name = (  # Данные исполнителя
            f"{selected_user.first_name or ''} {selected_user.last_name or ''}".strip()  # Закрывающая скобка вызова
            if selected_user  # Условная проверка
            else None  # Строка кода
        )  # Закрытие вызова/выражения

        if selected_executor_id != user_id:  # Выбран другой
            return build_unavailable(  # Возвращаем результат
                reason="another_executor",  # Причина
                message="Заказчик выбрал другого исполнителя",  # Сообщение
                selected_executor_id=selected_executor_id,  # ID исполнителя
                selected_executor_name=selected_executor_name
                or "Другой исполнитель",  # Продолжение выражения
            )  # Закрытие вызова/выражения

        return InformationAboutExecuteOrderRead(  # Текущий — назначенный
            selected_executor_id=selected_executor_id,  # ID исполнителя
            selected_executor_name=selected_executor_name,  # Продолжение выражения
        )  # Закрытие вызова/выражения

    except Exception as e:  # Обработка исключения
        logger.error(  # Запись в лог
            f"Ошибка получения информации о заказе order_id={order_id}, "  # Данные заказа
            f"user_id={user_id}: {str(e)}"  # Данные пользователя
        )  # Закрытие вызова/выражения
        raise HTTPException(  # Выбрасываем HTTP-ошибку
            status_code=500,  # Статус
            detail="Ошибка получения информации о заказе",  # Текст ошибки
        )  # Закрытие вызова/выражения


async def get_order_review(  # Отзыв по заказу для участника
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    order_id: int,  # ID заказа
    viewer_id: int,  # Продолжение выражения
) -> Optional[Review]:  # Закрытие вызова/выражения
    """Отзыв по заказу: доступен заказчику или исполнителю этого заказа."""
    order = await db.get(Order, order_id)  # Данные заказа
    if not order:  # Проверка отрицания
        raise HTTPException(
            status_code=404, detail="Заказ не найден"
        )  # Выбрасываем HTTP-ошибку

    is_customer = order.customer_id == viewer_id  # Флаг условия
    is_executor = False  # Флаг условия
    if not is_customer:  # Проверяем исполнителя
        executor_row = (  # Строка результата
            await db.execute(  # Выполняем SQL-запрос
                select(StatusOrderExecutor.id).where(  # SQL SELECT
                    StatusOrderExecutor.order_id == order_id,  # ID заказа
                    StatusOrderExecutor.executor_id == viewer_id,  # ID исполнителя
                )  # Закрытие вызова/выражения
            )  # Закрытие вызова/выражения
        ).scalar_one_or_none()  # Закрытие вызова/выражения
        is_executor = executor_row is not None  # Флаг условия

    if not is_customer and not is_executor:  # Нет доступа
        raise HTTPException(
            status_code=403, detail="Access denied"
        )  # Выбрасываем HTTP-ошибку

    review = (  # Единственный отзыв по заказу
        await db.execute(
            select(Review).where(Review.order_id == order_id)
        )  # Выполняем SQL-запрос
    ).scalar_one_or_none()  # Закрытие вызова/выражения
    return review  # Возвращаем результат


def _format_reviewer_display_name(  # Имя автора отзыва для списка
    first_name: Optional[str], last_name: Optional[str]  # Строка кода
) -> str:  # Закрытие вызова/выражения
    first = (first_name or "").strip()  # Имя
    last = (last_name or "").strip()  # Фамилия
    if first and last:  # «Имя Ф.»
        return f"{first} {last[0]}."  # Возвращаем результат
    if first:  # Условная проверка
        return first  # Возвращаем результат
    if last:  # Условная проверка
        return last  # Возвращаем результат
    return "Заказчик"  # Возвращаем результат


async def get_reviews_for_executor(  # Рейтинг и отзывы об исполнителе
    db: AsyncSession,  # Продолжение выражения
    *,  # Продолжение выражения
    reviewee_id: int,  # ID получателя отзыва
) -> dict:  # Закрытие вызова/выражения
    """Средний рейтинг и список отзывов об исполнителе."""
    stats = (  # AVG и COUNT
        await db.execute(  # Выполняем SQL-запрос
            select(  # SQL SELECT
                func.coalesce(func.avg(Review.rating), 0),  # Рейтинг
                func.count(Review.id),  # Продолжение выражения
            ).where(
                Review.reviewee_id == reviewee_id
            )  # Отзыв
        )  # Закрытие вызова/выражения
    ).one()  # Закрытие вызова/выражения
    avg_rating = float(stats[0] or 0)  # Средний рейтинг
    reviews_count = int(stats[1] or 0)  # Счётчик

    rows = (  # Список отзывов с именами
        await db.execute(  # Выполняем SQL-запрос
            select(Review, User.first_name, User.last_name)  # SQL SELECT
            .outerjoin(User, User.id == Review.reviewer_id)  # JOIN таблиц
            .where(Review.reviewee_id == reviewee_id)  # Условие WHERE
            .order_by(
                Review.created_at.desc(), Review.id.desc()
            )  # Сортировка результата
        )  # Закрытие вызова/выражения
    ).all()  # Закрытие вызова/выражения

    reviews = []  # Список отзывов
    for review, first_name, last_name in rows:  # Цикл по элементам
        reviews.append(  # Строка кода
            {  # Словарь/JSON-поле
                "id": review.id,  # Продолжение выражения
                "order_id": review.order_id,  # ID заказа
                "rating": review.rating,  # Рейтинг
                "comment": review.comment,  # Комментарий
                "created_at": review.created_at,  # Дата создания
                "reviewer_id": review.reviewer_id,  # ID автора отзыва
                "reviewer_name": _format_reviewer_display_name(
                    first_name, last_name
                ),  # Имя
            }  # Строка кода
        )  # Закрытие вызова/выражения

    return {  # Итоговый JSON
        "average_rating": round(avg_rating, 1) if reviews_count else 0.0,  # Рейтинг
        "reviews_count": reviews_count,  # Продолжение выражения
        "reviews": reviews,  # Продолжение выражения
    }  # Строка кода

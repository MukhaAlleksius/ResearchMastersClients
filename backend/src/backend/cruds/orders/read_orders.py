from datetime import datetime
import logging
from typing import Optional
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import and_, or_, select, func
from models.contracts_models import Contract
from models.users_models import User
from models.works_materials_models import CategoryWork, CategoryWorkMaster
from models.orders_models import (
    CustomerOrderCancellation,
    ExecutorOrder,
    ExecutorOrderCancellation,
    GraphicOrderMaster,
    InformationAboutCustomer,
    InformationAboutExecutor,
    Order,
    OrderResponseExecutor,
    StatusOrderCustomer,
    StatusOrderExecutor,
)
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.orders.order_constants import is_hidden_customer_executor_phone
from schemas.orders_schemas import (
    CancelOrderCustomerForAdminRead,
    CustomerOrderCancellationReadSchema,
    ExecutorOrderCancellationReadSchema,
    ExecutorOrderSchema,
    GraphicOrderMasterRead,
    InformationAboutCustomerRead,
    InformationAboutExecuteOrderRead,
    InformationAboutExecutorRead,
    CustomerExecutorListItemSchema,
    ExecutorCustomerListItemSchema,
    OrderCardForAdmin,
    OrderProfileForAdmin,
    ServiceProfileForAdmin,
    OrderReadSchema,
    OrderResponseExecutorReadSchema,
    OrderUserSchema,
    OrderActivitySignals,
    ServiceUserSchema,
)
from cruds.orders.order_activity import get_batch_order_activity
from cruds.orders.create_orders import backfill_executor_orders_from_assigned_statuses

from sqlalchemy.orm import aliased


import traceback

logger = logging.getLogger(__name__)


def _format_user_name(user: User | None) -> str:
    if not user:
        return "—"
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or "—"


def _format_user_address(user: User | None) -> str:
    if not user:
        return "—"
    parts = [user.country, user.region, user.town]
    return " ".join(part for part in parts if part).strip() or "—"


# метод для предоставления информации о своих заказах пользователю в карточках
async def get_orders_customer(
    db: AsyncSession,
    user_id: int,
    exclude_offered_to_executor_id: Optional[int] = None,
) -> list[OrderUserSchema]:
    try:
        result = await db.execute(
            select(Order, StatusOrderCustomer, CategoryWork, StatusOrderExecutor, User)
            .outerjoin(
                StatusOrderCustomer,
                StatusOrderCustomer.order_id == Order.id,
            )
            .outerjoin(CategoryWork, Order.category_id == CategoryWork.id)
            .outerjoin(ExecutorOrder, ExecutorOrder.order_id == Order.id)
            .outerjoin(StatusOrderExecutor, StatusOrderExecutor.order_id == Order.id)
            .outerjoin(User, User.id == StatusOrderExecutor.executor_id)
            .filter(Order.customer_id == user_id)
            .order_by(Order.created_at.desc())
        )

        rows = result.unique().all()

        if not rows:
            return []

        list_orders: list[OrderUserSchema] = []

        for order, status_order_customer, category, status_order_executor, user in rows:
            list_orders.append(
                OrderUserSchema(
                    id=order.id,
                    category_work=category.name if category else "Без категории",
                    category_work_id=category.id,
                    title=order.title,
                    budget=str(order.budget) if order.budget is not None else None,
                    created_at=order.created_at,
                    executor_name=user.first_name if user else None,
                    executor_id=(
                        status_order_executor.executor_id
                        if status_order_executor
                        else None
                    ),
                    status_order_customer=(
                        status_order_customer.status if status_order_customer else None
                    ),
                )
            )

        order_ids = [order.id for order in list_orders]
        activity_map = await get_batch_order_activity(
            db=db,
            order_ids=order_ids,
            viewer_id=user_id,
            role="customer",
        )
        for order_item in list_orders:
            order_item.activity = activity_map.get(
                order_item.id,
                OrderActivitySignals(),
            )

        if exclude_offered_to_executor_id is not None:
            offered_result = await db.execute(
                select(StatusOrderExecutor.order_id).where(
                    StatusOrderExecutor.executor_id == exclude_offered_to_executor_id,
                )
            )
            assigned_result = await db.execute(
                select(ExecutorOrder.order_id).where(
                    ExecutorOrder.executor_id == exclude_offered_to_executor_id,
                )
            )
            refused_by_customer_result = await db.execute(
                select(CustomerOrderCancellation.order_id).where(
                    CustomerOrderCancellation.executor_id
                    == exclude_offered_to_executor_id,
                    CustomerOrderCancellation.status == "agree",
                )
            )
            excluded_order_ids = (
                set(offered_result.scalars().all())
                | set(assigned_result.scalars().all())
                | set(refused_by_customer_result.scalars().all())
            )
            if excluded_order_ids:
                list_orders = [
                    order_item
                    for order_item in list_orders
                    if order_item.id not in excluded_order_ids
                    and order_item.executor_id != exclude_offered_to_executor_id
                ]

        return list_orders

    except Exception as e:
        logger.error(f"get_orders_customer error for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения заказов")


async def _resolve_assigned_executor_id(
    db: AsyncSession,
    order_id: int,
) -> Optional[int]:
    executor_order_result = await db.execute(
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    executor_id = executor_order_result.scalar_one_or_none()
    if executor_id:
        return executor_id

    status_result = await db.execute(
        select(StatusOrderExecutor.executor_id, StatusOrderExecutor.status)
        .where(StatusOrderExecutor.order_id == order_id)
        .order_by(StatusOrderExecutor.id.desc())
    )
    skip_status_tokens = (
        "Отказано заказчиком",
        "Отказ от заказа",
        "Предложения заказчиков",
    )
    for row_executor_id, status in status_result.all():
        if not row_executor_id:
            continue
        status_text = status or ""
        if any(token in status_text for token in skip_status_tokens):
            continue
        return row_executor_id

    return None


async def _resolve_executor_for_admin(
    db: AsyncSession,
    order_id: int,
    executor_order: Optional[ExecutorOrder],
    executor_user: Optional[User],
    contract: Optional[Contract] = None,
) -> tuple[Optional[int], Optional[dict[str, Optional[str]]]]:
    resolved_executor_id = None
    if executor_order and executor_order.executor_id:
        resolved_executor_id = executor_order.executor_id
    elif contract and contract.executor_id:
        resolved_executor_id = contract.executor_id
    else:
        resolved_executor_id = await _resolve_assigned_executor_id(db, order_id)

    if not resolved_executor_id:
        return None, None

    user = executor_user
    if not user or user.id != resolved_executor_id:
        user_result = await db.execute(
            select(User).where(User.id == resolved_executor_id)
        )
        user = user_result.scalar_one_or_none()

    if not user:
        return resolved_executor_id, None

    return resolved_executor_id, {
        "first_name": user.first_name,
        "last_name": user.last_name,
    }


async def get_executor_order(
    db: AsyncSession,
    order_id: int,
) -> ExecutorOrderSchema | None:
    try:
        result = await db.execute(
            select(ExecutorOrder).where(ExecutorOrder.order_id == order_id)
        )

        executor_order = result.scalars().first()

        if executor_order:
            return ExecutorOrderSchema(
                id=executor_order.id,
                order_id=executor_order.order_id,
                executor_id=executor_order.executor_id,
            )

        resolved_executor_id = await _resolve_assigned_executor_id(db, order_id)
        if not resolved_executor_id:
            return None

        return ExecutorOrderSchema(
            id=0,
            order_id=order_id,
            executor_id=resolved_executor_id,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения заказа: {e}")


# метод для предоставления информации о своих услугах пользователю в карточках
async def get_services_executor(
    db: AsyncSession, user_id: int
) -> list[ServiceUserSchema]:
    try:
        result = await db.execute(
            select(Order, StatusOrderExecutor, CategoryWork, User)
            .join(
                StatusOrderExecutor, Order.id == StatusOrderExecutor.order_id
            )  # ✅ INNER JOIN!
            .outerjoin(CategoryWork, Order.category_id == CategoryWork.id)
            .outerjoin(User, Order.customer_id == User.id)
            .where(StatusOrderExecutor.executor_id == user_id)  # ✅ Теперь работает!
        )

        services = result.all()
        if not services:
            return []

        list_services = []
        for order, status_executor, category, customer in services:
            # Свои заказы не должны попадать в услуги исполнителя
            if order.customer_id == user_id:
                continue
            list_services.append(
                ServiceUserSchema(
                    id=order.id,
                    customer_id=order.customer_id,
                    category_work=category.name if category else None,
                    title=order.title,
                    budget=order.budget,
                    created_at=order.created_at,
                    customer_name=(
                        f"{customer.first_name or ''} {customer.last_name or ''}".strip()
                        if customer
                        else None
                    ),
                    status_service_executor=(
                        status_executor.status if status_executor else None
                    ),
                )
            )

        order_ids = [service.id for service in list_services]
        activity_map = await get_batch_order_activity(
            db=db,
            order_ids=order_ids,
            viewer_id=user_id,
            role="executor",
        )
        for service_item in list_services:
            service_item.activity = activity_map.get(
                service_item.id,
                OrderActivitySignals(),
            )

        return list_services

    except Exception as e:
        logger.error(f"Ошибка получения услуг user_id={user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения услуг")


async def get_order(db: AsyncSession, order_id: int) -> OrderReadSchema:
    try:
        result = await db.execute(
            select(Order, CategoryWork, User, ExecutorOrder)
            .outerjoin(CategoryWork, Order.category_id == CategoryWork.id)
            .outerjoin(User, Order.customer_id == User.id)
            .outerjoin(ExecutorOrder, Order.id == ExecutorOrder.order_id)
            .where(Order.id == order_id)
        )

        result_tuple = result.first()
        if not result_tuple:
            raise HTTPException(status_code=404, detail="Заказ не найден")

        order, category_work, customer, executor_order = (
            result_tuple  # ✅ Переименовано customer_name -> customer
        )

        resolved_executor_id = (
            executor_order.executor_id
            if executor_order
            else await _resolve_assigned_executor_id(db, order_id)
        )

        order_schema = OrderReadSchema(
            id=order.id,
            executor_id=resolved_executor_id,
            category_work=category_work.name if category_work else None,
            category_work_id=(
                category_work.id if category_work else None
            ),  # ✅ Защита от None
            title=order.title,
            description=order.description,
            customer_id=customer.id,
            budget=order.budget,
            currency=order.currency,
            budget_type=order.budget_type,
            urgency_level=order.urgency_level,
            country=order.country,
            region=order.region,
            town=order.town,
            location=order.location,
            deadline=order.deadline,
            insurance_required=order.insurance_required,
            created_at=order.created_at or datetime.utcnow(),  # ✅ Python-идиома
            updated_at=order.updated_at or datetime.utcnow(),
        )

        return order_schema

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Ошибка получения заказа: {str(e)}"
        )


# метод для предоставления информации пользователю об ответах на заказ
async def get_order_responses_executors(
    db: AsyncSession, order_id: int
) -> list[OrderResponseExecutorReadSchema]:  # ✅ Изменен тип возврата
    try:
        result = await db.execute(
            select(OrderResponseExecutor, User)
            .outerjoin(User, OrderResponseExecutor.executor_id == User.id)
            .where(OrderResponseExecutor.order_id == order_id)
        )

        rows = result.all()
        if not rows:
            return []  # ✅ Список, а не None

        order_responses_executors = [
            OrderResponseExecutorReadSchema(
                id=ore.id,
                executor_name={
                    "first_name": (user.first_name if user else "Неизвестный"),
                    "second_name": (user.last_name if user else "Неизвестный"),
                },
                executor_id=ore.executor_id,
                proposed_price=ore.proposed_price,
                budget_type=ore.budget_type,
                currency=ore.currency or "BYN",
                estimated_time=ore.estimated_time,
                start_time_work=ore.start_time_work,
                message=ore.message or "",
                created_at=ore.created_at,
            )
            for ore, user in rows
        ]

        return order_responses_executors

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Ошибка получения предложений: {str(e)}"
        )


# метод для предоставления информации пользователю об ответах на заказ
async def can_view_order_executor_response(
    db: AsyncSession,
    viewer_id: int,
    order_id: int,
    executor_id: int,
) -> bool:
    if viewer_id == executor_id:
        return True

    viewer = await db.get(User, viewer_id)
    if viewer and viewer.role in {"admin", "moderator"}:
        return True

    customer_row = await db.execute(
        select(Order.customer_id).where(Order.id == order_id)
    )
    customer_id = customer_row.scalar_one_or_none()
    return customer_id is not None and customer_id == viewer_id


# метод для предоставления информации пользователю об ответе на заказ
async def get_order_response_executor(
    db: AsyncSession, user_id: int, order_id: int
) -> OrderResponseExecutorReadSchema:
    try:
        result = await db.execute(
            select(OrderResponseExecutor, User)
            .outerjoin(User, OrderResponseExecutor.executor_id == User.id)
            .where(
                and_(
                    OrderResponseExecutor.executor_id == user_id,
                    OrderResponseExecutor.order_id == order_id,
                )
            )
        )

        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Предложение не найдено")

        order_response_executor, user = row

        return OrderResponseExecutorReadSchema(
            id=order_response_executor.id,
            executor_id=order_response_executor.executor_id,
            executor_name={
                "first_name": user.first_name if user else "Неизвестный",
                "second_name": getattr(user, "last_name", "")
                or "Неизвестный",  # ✅ last_name!
            },
            proposed_price=order_response_executor.proposed_price,
            budget_type=order_response_executor.budget_type,
            currency=order_response_executor.currency or "BYN",
            estimated_time=order_response_executor.estimated_time,
            start_time_work=order_response_executor.start_time_work,
            message=order_response_executor.message or "",
            created_at=order_response_executor.created_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Ошибка получения предложений: {str(e)}"
        )


# метод для предоставления информации пользователю об ответе на заказ
async def get_executors_for_order(
    db: AsyncSession,
    category_work_id: int,
    country_id: int,
    region_id: int,
    town_id: int,
    rating: float,
    cost: float,
) -> OrderResponseExecutorReadSchema:
    try:
        result = await db.execute(
            select(OrderResponseExecutor, User)
            .outerjoin(User, OrderResponseExecutor.executor_id == User.id)
            .where(
                and_(
                    OrderResponseExecutor.executor_id == user_id,
                    OrderResponseExecutor.order_id == order_id,
                )
            )
        )

        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Предложение не найдено")

        order_response_executor, user = row

        return OrderResponseExecutorReadSchema(
            id=order_response_executor.id,
            executor_id=order_response_executor.executor_id,
            executor_name={
                "first_name": user.first_name if user else "Неизвестный",
                "second_name": getattr(user, "last_name", "")
                or "Неизвестный",  # ✅ last_name!
            },
            proposed_price=order_response_executor.proposed_price,
            budget_type=order_response_executor.budget_type,
            currency=order_response_executor.currency or "BYN",
            estimated_time=order_response_executor.estimated_time,
            start_time_work=order_response_executor.start_time_work,
            message=order_response_executor.message or "",
            created_at=order_response_executor.created_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Ошибка получения предложений: {str(e)}"
        )


from sqlalchemy import select
from sqlalchemy.orm import contains_eager, selectinload  # Если нужны связанные данные

# метод для предоставления информации о заказах при поиске заказов пользователями
from sqlalchemy import select, and_
from sqlalchemy.orm import Session
from fastapi import HTTPException


async def get_orders_customers(
    db: AsyncSession,
    category_work_slug: str = None,
    country: str = None,
    region: str = None,
    town: str = None,
    page: int = 1,
    page_size: int = 12,
    exclude_customer_id: Optional[int] = None,
):
    try:
        # ✅ 1. Собираем условия WHERE
        conditions = [StatusOrderCustomer.status == "В поиске исполнителя"]

        if category_work_slug:
            conditions.append(CategoryWork.slug == category_work_slug)
        if country:
            conditions.append(Order.country == country)
        if region:
            conditions.append(Order.region == region)
        if town:
            conditions.append(Order.town == town)
        if exclude_customer_id is not None:
            conditions.append(Order.customer_id != exclude_customer_id)

        # ✅ 2. Всегда делаем JOIN с CategoryWork для category_work
        query = (
            select(Order, CategoryWork)
            .join(StatusOrderCustomer, Order.id == StatusOrderCustomer.order_id)
            .join(CategoryWork, Order.category_id == CategoryWork.id)
            .where(and_(*conditions))
            .order_by(Order.created_at.desc())
        )

        print(f"🔍 Запрос: {str(query)}")

        count_result = await db.execute(
            select(func.count())
            .select_from(Order)
            .join(StatusOrderCustomer, Order.id == StatusOrderCustomer.order_id)
            .join(CategoryWork, Order.category_id == CategoryWork.id)
            .where(and_(*conditions))
        )
        total = count_result.scalar_one() or 0

        print(f"🔍 Всего заказов: {total}")

        if total == 0:
            return [], 0

        offset = (page - 1) * page_size
        result = await db.execute(query.offset(offset).limit(page_size))
        orders_data = result.all()

        print(f"🔍 Получено заказов на странице {page}: {len(orders_data)}")

        return [
            OrderReadSchema(
                id=order.id,
                category_work=category_work.name,
                category_work_id=order.category_id,  # ✅ Правильно!
                title=order.title,
                description=order.description,
                customer_id=order.customer_id,
                budget=order.budget,
                currency=getattr(order, "currency", "BYN"),
                budget_type=order.budget_type,
                urgency_level=order.urgency_level,
                country=order.country,
                region=order.region,
                town=order.town,
                location=order.location,
                deadline=order.deadline,
                insurance_required=order.insurance_required,
                created_at=order.created_at,
                updated_at=order.updated_at,
            )
            for order, category_work in orders_data
        ], total

    except Exception as e:
        print(f"❌ Ошибка get_orders_customers: {str(e)}")
        traceback.print_exc()
        return [], 0


async def get_orders_count_for_period(
    db: AsyncSession,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> int:
    """
    Подсчёт количества заказов за период по дате создания.

    :param user_id: если передан — считаем только заказы этого пользователя (customer_id)
    :param start_date: дата начала периода (ISO строка, как в админке)
    :param end_date: дата окончания периода (ISO строка, как в админке)
    """
    try:
        filters = []

        if user_id is not None:
            filters.append(Order.customer_id == user_id)

        # Фильтрация по дате создания заказа
        if start_date and end_date:
            filters.append(Order.created_at >= start_date)
            filters.append(Order.created_at <= end_date)
        elif start_date:
            filters.append(Order.created_at >= start_date)
        elif end_date:
            filters.append(Order.created_at <= end_date)

        stmt = select(func.count()).select_from(Order)
        if filters:
            stmt = stmt.where(and_(*filters))

        result = await db.execute(stmt)
        count = result.scalar_one() or 0
        return count
    except Exception as e:
        logger.error(
            f"get_orders_count_for_period error user_id={user_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Ошибка подсчёта заказов")


# метод для предоставления информации о заказах пользователя администратору по запросу с фильтрами
async def get_orders_customer_admin(
    db: AsyncSession,
    user_id: Optional[int] = None,
    category_work_slug: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    town: Optional[str] = None,
    status_order: Optional[str] = None,
    budget_from: Optional[float] = None,
    budget_to: Optional[float] = None,
    start_date_orders: Optional[str] = None,
    end_date_orders: Optional[str] = None,
) -> list[OrderCardForAdmin]:
    try:
        filters = []

        # ✅ Фильтр по пользователю (для админки optional)
        if user_id is not None:
            filters.append(Order.customer_id == user_id)

        # ✅ Фильтры по полям Order
        if category_work_slug:
            filters.append(CategoryWork.slug == category_work_slug)
        if country:
            filters.append(Order.country == country)
        if region:
            filters.append(Order.region == region)
        if town:
            filters.append(Order.town == town)
        if status_order:
            filters.append(StatusOrderCustomer.status == status_order)

        # ✅ ФИЛЬТРАЦИЯ БЮДЖЕТА: Contract → Order
        if budget_from is not None and budget_to is not None:
            filters.append(
                or_(
                    and_(
                        Contract.budget.isnot(None),
                        Contract.budget >= budget_from,
                        Contract.budget <= budget_to,
                    ),
                    and_(
                        Contract.budget.is_(None),
                        Order.budget >= budget_from,
                        Order.budget <= budget_to,
                    ),
                )
            )
        elif budget_from is not None:
            filters.append(
                or_(
                    and_(Contract.budget.isnot(None), Contract.budget >= budget_from),
                    and_(Contract.budget.is_(None), Order.budget >= budget_from),
                )
            )
        elif budget_to is not None:
            filters.append(
                or_(
                    and_(Contract.budget.isnot(None), Contract.budget <= budget_to),
                    and_(Contract.budget.is_(None), Order.budget <= budget_to),
                )
            )

        # ✅ Даты создания заказа
        if start_date_orders and end_date_orders:
            filters.append(Order.created_at >= start_date_orders)
            filters.append(Order.created_at <= end_date_orders)
        elif start_date_orders:
            filters.append(Order.created_at >= start_date_orders)
        elif end_date_orders:
            filters.append(Order.created_at <= end_date_orders)

        # ✅ LEFT JOIN - все заказы + Contract если есть
        result = await db.execute(
            select(
                Order,
                StatusOrderCustomer,
                CategoryWork,
                StatusOrderExecutor,
                User,
                Contract,
            )
            .outerjoin(StatusOrderCustomer, StatusOrderCustomer.order_id == Order.id)
            .outerjoin(CategoryWork, Order.category_id == CategoryWork.id)
            .outerjoin(StatusOrderExecutor, StatusOrderExecutor.order_id == Order.id)
            .outerjoin(User, User.id == StatusOrderExecutor.executor_id)
            .outerjoin(Contract, Contract.order_id == Order.id)
            .where(and_(*filters) if filters else True)
            .order_by(Order.created_at.desc())
        )

        rows = result.unique().all()

        if not rows:
            return []

        list_orders = []
        seen_order_ids: set[int] = set()
        for order, status_customer, category, status_executor, user, contract in rows:
            if order.id in seen_order_ids:
                continue
            seen_order_ids.add(order.id)

            display_budget = (
                contract.budget
                if contract and contract.budget is not None
                else order.budget
            )
            display_currency = (
                contract.currency if contract and contract.currency else order.currency
            )
            customer_status = status_customer.status if status_customer else None

            order_admin = OrderCardForAdmin(
                id=order.id,
                title=order.title,
                description=order.description,
                category_work=category.name if category else None,
                country=order.country,
                region=order.region,
                town=order.town,
                location=order.location,
                budget=display_budget,
                currency=display_currency,
                created_at=order.created_at,
                status_order_customer=customer_status,
                status=customer_status,
            )
            list_orders.append(order_admin)

        return list_orders

    except Exception as e:
        logger.error(
            f"get_orders_customer_admin error user_id={user_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Ошибка получения заказов")


# async def get_services_executor_for_admin(db


# метод для предоставления информации об услугах пользователя администратору по запросу с фильтрами
async def get_services_executor_admin(
    db: AsyncSession,
    user_id: Optional[int] = None,
    category_work_slug: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    town: Optional[str] = None,
    status_service: Optional[str] = None,
    budget_from: Optional[float] = None,
    budget_to: Optional[float] = None,
    start_date_orders: Optional[str] = None,
    end_date_orders: Optional[str] = None,
) -> list[OrderCardForAdmin]:
    try:
        await backfill_executor_orders_from_assigned_statuses(db, user_id=user_id)

        filters = []

        if user_id is not None:
            filters.append(ExecutorOrder.executor_id == user_id)

        if category_work_slug:
            filters.append(CategoryWork.slug == category_work_slug)
        if country:
            filters.append(Order.country == country)
        if region:
            filters.append(Order.region == region)
        if town:
            filters.append(Order.town == town)
        if status_service:
            filters.append(StatusOrderExecutor.status == status_service)

        if budget_from is not None:
            filters.append(Order.budget >= budget_from)
        if budget_to is not None:
            filters.append(Order.budget <= budget_to)

        if start_date_orders and end_date_orders:
            filters.append(Order.created_at >= start_date_orders)
            filters.append(Order.created_at <= end_date_orders)
        elif start_date_orders:
            filters.append(Order.created_at >= start_date_orders)
        elif end_date_orders:
            filters.append(Order.created_at <= end_date_orders)

        status_join = and_(
            StatusOrderExecutor.order_id == Order.id,
            StatusOrderExecutor.executor_id == ExecutorOrder.executor_id,
        )

        result = await db.execute(
            select(Order, ExecutorOrder, StatusOrderExecutor, CategoryWork, Contract)
            .join(ExecutorOrder, ExecutorOrder.order_id == Order.id)
            .outerjoin(StatusOrderExecutor, status_join)
            .outerjoin(CategoryWork, Order.category_id == CategoryWork.id)
            .outerjoin(Contract, Contract.order_id == Order.id)
            .where(and_(*filters) if filters else True)
            .order_by(Order.created_at.desc())
        )

        rows = result.all()
        list_orders = []
        seen_order_ids: set[int] = set()

        for order, _executor_order, status_executor, category, contract in rows:
            if user_id is not None and order.id in seen_order_ids:
                continue
            seen_order_ids.add(order.id)

            display_budget = (
                contract.budget
                if contract and contract.budget is not None
                else order.budget
            )
            display_currency = (
                contract.currency if contract and contract.currency else order.currency
            )
            executor_status = status_executor.status if status_executor else None

            order_admin = OrderCardForAdmin(
                id=order.id,
                title=order.title,
                description=order.description,
                category_work=category.name if category else None,
                country=order.country,
                region=order.region,
                town=order.town,
                location=order.location,
                budget=display_budget,
                currency=display_currency,
                created_at=order.created_at,
                status_service_executor=executor_status,
                status=executor_status,
            )
            list_orders.append(order_admin)

        return list_orders

    except Exception as e:
        logger.error(
            f"get_services_executor_admin error user_id={user_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Ошибка получения заказов")


from sqlalchemy.orm import aliased


async def get_order_profile_for_admin(
    db: AsyncSession, order_id: int
) -> Optional[OrderProfileForAdmin]:
    try:
        # ✅ Создаем алиасы для двух разных User
        CustomerUser = aliased(User)  # Заказчик
        ExecutorUser = aliased(User)  # Исполнитель

        result = await db.execute(
            select(
                Order,
                CustomerUser,  # ✅ Алиас 1: Заказчик
                ExecutorOrder,
                ExecutorUser,  # ✅ Алиас 2: Исполнитель
                StatusOrderCustomer,
                CategoryWork,
                Contract,
            )
            .select_from(Order)
            .join(CustomerUser, Order.customer_id == CustomerUser.id)  # Заказчик
            .outerjoin(ExecutorOrder, Order.id == ExecutorOrder.order_id)
            .outerjoin(
                ExecutorUser, ExecutorOrder.executor_id == ExecutorUser.id
            )  # ✅ Исполнитель с алиасом
            .outerjoin(StatusOrderCustomer, Order.id == StatusOrderCustomer.order_id)
            .outerjoin(CategoryWork, Order.category_id == CategoryWork.id)
            .outerjoin(Contract, Order.id == Contract.order_id)
            .where(Order.id == order_id)
        )

        row = result.first()
        if not row:
            return None

        # ✅ Распаковка с алиасами
        (
            order,
            customer,  # CustomerUser
            executor_order,
            executor,  # ExecutorUser
            status_customer,
            category_work,
            contract,
        ) = row

        resolved_executor_id, executor_name = await _resolve_executor_for_admin(
            db=db,
            order_id=order_id,
            executor_order=executor_order,
            executor_user=executor,
            contract=contract,
        )

        order_profile = OrderProfileForAdmin(
            id=order.id,
            category_work=category_work.name if category_work else "Без категории",
            title=order.title,
            description=order.description,
            customer_id=order.customer_id,
            budget=order.budget,
            currency=order.currency,
            budget_type=order.budget_type,
            urgency_level=order.urgency_level,
            country=order.country,
            region=order.region,
            town=order.town,
            location=order.location,
            deadline=order.deadline,
            insurance_required=order.insurance_required,
            created_at=order.created_at,
            updated_at=order.updated_at,
            customer_name={
                "first_name": customer.first_name if customer else None,
                "last_name": customer.last_name if customer else None,
            },
            executor_name=executor_name,
            executor_id=resolved_executor_id,
            status_order_customer=status_customer.status if status_customer else None,
            date_start_work=contract.date_start_work if contract else None,
            date_end_work=contract.date_end_work if contract else None,
            budget_contract=(
                float(contract.budget) if contract and contract.budget else None
            ),
            currency_contract=contract.currency if contract else None,
            category_work_id=order.category_id,
        )

        return order_profile

    except Exception as e:
        print(f"❌ Ошибка get_order_profile_for_admin(order_id={order_id}): {str(e)}")
        import traceback

        traceback.print_exc()
        return None


async def get_service_profile_for_admin(
    db: AsyncSession, service_id: int
) -> Optional[ServiceProfileForAdmin]:
    try:
        CustomerUser = aliased(User)  # Заказчик
        ExecutorUser = aliased(User)  # Исполнитель

        result = await db.execute(
            select(
                Order,
                CustomerUser,
                ExecutorOrder,
                ExecutorUser,
                StatusOrderExecutor,
                CategoryWork,
                CategoryWorkMaster,
                Contract,
            )
            .select_from(Order)
            .join(CustomerUser, Order.customer_id == CustomerUser.id)
            .outerjoin(ExecutorOrder, Order.id == ExecutorOrder.order_id)
            .outerjoin(ExecutorUser, ExecutorOrder.executor_id == ExecutorUser.id)
            .outerjoin(StatusOrderExecutor, Order.id == StatusOrderExecutor.order_id)
            .outerjoin(
                CategoryWorkMaster,
                ExecutorOrder.executor_id == CategoryWorkMaster.master_id,
            )
            .outerjoin(
                CategoryWork, CategoryWorkMaster.category_work_id == CategoryWork.id
            )
            .outerjoin(Contract, Order.id == Contract.order_id)
            .where(Order.id == service_id)
        )

        row = result.first()
        if not row:
            return None

        (
            order,
            customer,
            executor_order,
            executor,
            status_executor,
            category_work,
            category_work_master,
            contract,
        ) = row

        resolved_executor_id, executor_name = await _resolve_executor_for_admin(
            db=db,
            order_id=service_id,
            executor_order=executor_order,
            executor_user=executor,
            contract=contract,
        )

        order_profile = ServiceProfileForAdmin(
            id=order.id,
            category_work=category_work.name if category_work else "Без категории",
            title=order.title,
            description=order.description,
            customer_id=order.customer_id,
            budget=order.budget,
            currency=order.currency,
            budget_type=order.budget_type,
            urgency_level=order.urgency_level,
            country=order.country,
            region=order.region,
            town=order.town,
            location=order.location,
            deadline=order.deadline,
            insurance_required=order.insurance_required,
            created_at=order.created_at,
            updated_at=order.updated_at,
            customer_name={
                "first_name": customer.first_name if customer else None,
                "last_name": customer.last_name if customer else None,
            },
            executor_name=executor_name,
            executor_id=resolved_executor_id,
            status_order_executor=status_executor.status if status_executor else None,
            date_start_work=contract.date_start_work if contract else None,
            date_end_work=contract.date_end_work if contract else None,
            budget_contract=(
                float(contract.budget) if contract and contract.budget else None
            ),
            currency_contract=contract.currency if contract else None,
            category_work_id=order.category_id,
        )

        return order_profile

    except Exception as e:
        print(f"❌ Ошибка get_service_profile_for_admin(order_id={order.id}): {str(e)}")
        import traceback

        traceback.print_exc()
        return None

    # получить информацию из базы данных об отмене заказа зазказчиком


async def get_customer_order_cancel(
    db: AsyncSession, order_id: int, customer_id: int, executor_id: int
) -> Optional[CustomerOrderCancellationReadSchema]:
    try:
        result = await db.execute(
            select(CustomerOrderCancellation).where(
                CustomerOrderCancellation.order_id == order_id,
                CustomerOrderCancellation.customer_id == customer_id,
                CustomerOrderCancellation.executor_id == executor_id,
            )
        )

        customer_order_cancel = result.scalars().first()

        if not customer_order_cancel:
            return None

        return customer_order_cancel

    except ValidationError as ve:
        print(f"❌ Pydantic validation error: {ve}")
        return None
    except Exception as e:
        print(f"❌ Ошибка get_customer_order_cancel(order_id={order_id}): {str(e)}")
        import traceback

        traceback.print_exc()
        return None


# получить информацию из базы данных об отмене заказа исполнителем
async def get_executor_order_cancel(
    db: AsyncSession, order_id: int, customer_id: int, executor_id: int
) -> Optional[ExecutorOrderCancellationReadSchema]:
    try:
        result = await db.execute(
            select(ExecutorOrderCancellation).where(
                ExecutorOrderCancellation.order_id == order_id,
                ExecutorOrderCancellation.customer_id == customer_id,
                ExecutorOrderCancellation.executor_id == executor_id,
            )
        )

        executor_order_cancel = result.scalars().first()

        if not executor_order_cancel:
            return None

        return executor_order_cancel

    except ValidationError as ve:
        print(f"❌ Pydantic validation error: {ve}")
        return None
    except Exception as e:
        print(f"❌ Ошибка get_customer_order_cancel(order_id={order_id}): {str(e)}")
        import traceback

        traceback.print_exc()
        return None


# функция для выбора информации об отказах заказчика, на которые исполнителель ответил отрицательно и отказ
# попал на рассмотрение администратором.
async def get_cancel_orders_customers_for_admin(
    db: AsyncSession,
) -> Optional[list[CancelOrderCustomerForAdminRead]]:
    try:
        UserCustomer = aliased(User)
        UserExecutor = aliased(User)

        stmt = (
            select(CustomerOrderCancellation, Order, UserCustomer, UserExecutor)
            .outerjoin(Order, CustomerOrderCancellation.order_id == Order.id)
            .outerjoin(
                UserCustomer, CustomerOrderCancellation.customer_id == UserCustomer.id
            )
            .outerjoin(
                UserExecutor, CustomerOrderCancellation.executor_id == UserExecutor.id
            )
            .where(CustomerOrderCancellation.status == "disagree")
        )

        result = await db.execute(stmt)
        rows = result.all()

        cancel_orders_customers: list[CancelOrderCustomerForAdminRead] = []

        for customer_order_cancel, order, user_customer, user_executor in rows:
            cancel_order_customer = CancelOrderCustomerForAdminRead(
                id=customer_order_cancel.id,
                order_id=customer_order_cancel.order_id,
                order_name=order.title if order else "",
                customer_name=(
                    f"{user_customer.first_name} {user_customer.last_name}"
                    if user_customer
                    else ""
                ),
                executor_name=(
                    f"{user_executor.first_name} {user_executor.last_name}"
                    if user_executor
                    else ""
                ),
            )
            cancel_orders_customers.append(cancel_order_customer)

        if not cancel_orders_customers:
            return None

        return cancel_orders_customers

    except Exception as e:
        print(f"❌ Ошибка get_cancel_orders_customers_for_admin: {str(e)}")
        import traceback

        traceback.print_exc()
        return None


async def get_cancel_order_customer_for_admin(
    db: AsyncSession, cancel_order_customer_id: int
) -> Optional[CustomerOrderCancellationReadSchema]:
    try:
        result = await db.execute(
            select(CustomerOrderCancellation).where(
                CustomerOrderCancellation.id == cancel_order_customer_id
            )
        )
        cancel_order_customer = result.scalar_one_or_none()
        if cancel_order_customer is None:
            return None

        return cancel_order_customer

    except Exception as e:
        print(f"❌ Ошибка get_cancel_order_customer_for_admin: {str(e)}")
        import traceback

        traceback.print_exc()
        return None


# метод для получения графика заказов для пользователя
async def get_dates_start_execute_orders(
    db: AsyncSession, user_id: int
) -> list[GraphicOrderMasterRead]:
    try:
        result = await db.execute(
            select(Order, GraphicOrderMaster)
            .join(GraphicOrderMaster, Order.id == GraphicOrderMaster.order_id)
            .where(GraphicOrderMaster.user_id == user_id)
        )

        rows = result.all()
        if not rows:
            return []

        list_graphic_orders_master = []
        for order, graphic_order_master in rows:
            list_graphic_orders_master.append(
                GraphicOrderMasterRead(
                    id=graphic_order_master.id,
                    name_order=order.title,
                    address=f"{order.country}, {order.region}, {order.town}, {order.location}",
                    date_start=graphic_order_master.date_start,
                )
            )
        return list_graphic_orders_master

    except Exception as e:
        logger.error(f"Ошибка получения графика заказов user_id={user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения графика заказов")


# метод для получения информации о заказчике исполнителем
async def get_information_about_customer(
    db: AsyncSession,
    executor_id: int,
    customer_id: int,
) -> InformationAboutCustomerRead | None:
    try:
        result = await db.execute(
            select(User, InformationAboutCustomer)
            .join(
                InformationAboutCustomer,
                User.id == InformationAboutCustomer.customer_id,
            )
            .where(
                and_(
                    InformationAboutCustomer.executor_id == executor_id,
                    InformationAboutCustomer.customer_id == customer_id,
                )
            )
        )

        row = result.first()  # или .one_or_none(), если строго одна строка
        if not row:
            return None

        user_result, information_about_customer_result = row

        if is_hidden_customer_executor_phone(information_about_customer_result.phone):
            return None

        information_about_customer = InformationAboutCustomerRead(
            name_customer=f"{user_result.first_name} {user_result.last_name}",
            address=f"{user_result.country} {user_result.region} {user_result.town}",  # запятая!
            phone=information_about_customer_result.phone,
            notification=information_about_customer_result.notification,
        )

        return information_about_customer

    except Exception as e:
        logger.error(
            f"Ошибка получения информации о заказчике customer_id={customer_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail="Ошибка получения информации о заказчике"
        )


# метод для получения информации об исполнителе заказчиком
async def get_information_about_executor(
    db: AsyncSession,
    executor_id: int,
    customer_id: int,
) -> InformationAboutExecutorRead | None:
    try:
        executor_result = await db.execute(
            select(User).where(User.id == executor_id)
        )
        executor_user = executor_result.scalar_one_or_none()
        if not executor_user:
            return None

        info_result = await db.execute(
            select(InformationAboutExecutor).where(
                and_(
                    InformationAboutExecutor.executor_id == executor_id,
                    InformationAboutExecutor.customer_id == customer_id,
                )
            )
        )
        saved_info = info_result.scalar_one_or_none()
        if saved_info and is_hidden_customer_executor_phone(saved_info.phone):
            saved_info = None

        return InformationAboutExecutorRead(
            executor_id=executor_id,
            name_executor=_format_user_name(executor_user),
            address=_format_user_address(executor_user),
            phone=saved_info.phone if saved_info else None,
            notification=saved_info.notification if saved_info else None,
        )

    except Exception as e:
        logger.error(
            "Ошибка получения информации об исполнителе executor_id=%s customer_id=%s: %s",
            executor_id,
            customer_id,
            str(e),
        )
        raise HTTPException(
            status_code=500, detail="Ошибка получения информации об исполнителе"
        )


async def get_customer_executors_list(
    db: AsyncSession,
    customer_id: int,
) -> list[CustomerExecutorListItemSchema]:
    """Список исполнителей заказчика: из сохранённых контактов и истории заказов."""
    try:
        saved_result = await db.execute(
            select(InformationAboutExecutor).where(
                InformationAboutExecutor.customer_id == customer_id
            )
        )
        saved_rows = saved_result.scalars().all()
        hidden_executor_ids = {
            row.executor_id
            for row in saved_rows
            if is_hidden_customer_executor_phone(row.phone)
        }
        saved_map = {
            row.executor_id: row
            for row in saved_rows
            if not is_hidden_customer_executor_phone(row.phone)
        }

        executor_ids: set[int] = set(saved_map.keys())

        response_rows = await db.execute(
            select(OrderResponseExecutor.executor_id)
            .join(Order, Order.id == OrderResponseExecutor.order_id)
            .where(Order.customer_id == customer_id)
            .distinct()
        )
        executor_ids.update(row[0] for row in response_rows.all() if row[0])

        assigned_rows = await db.execute(
            select(ExecutorOrder.executor_id)
            .join(Order, Order.id == ExecutorOrder.order_id)
            .where(Order.customer_id == customer_id)
            .distinct()
        )
        executor_ids.update(row[0] for row in assigned_rows.all() if row[0])
        executor_ids.discard(customer_id)
        executor_ids -= hidden_executor_ids

        if not executor_ids:
            return []

        users_result = await db.execute(
            select(User).where(User.id.in_(executor_ids))
        )
        users = {user.id: user for user in users_result.scalars().all()}

        items: list[CustomerExecutorListItemSchema] = []
        for executor_id in sorted(executor_ids):
            user = users.get(executor_id)
            saved = saved_map.get(executor_id)
            items.append(
                CustomerExecutorListItemSchema(
                    executor_id=executor_id,
                    name_executor=_format_user_name(user),
                    address=_format_user_address(user),
                    phone=saved.phone if saved else None,
                    notification=saved.notification if saved else None,
                    has_saved_info=saved is not None,
                )
            )

        return items

    except Exception as e:
        logger.error(
            "Ошибка получения списка исполнителей customer_id=%s: %s",
            customer_id,
            str(e),
        )
        raise HTTPException(
            status_code=500, detail="Ошибка получения списка исполнителей"
        )


async def get_executor_customers_list(
    db: AsyncSession,
    executor_id: int,
) -> list[ExecutorCustomerListItemSchema]:
    """Список заказчиков исполнителя: из сохранённых контактов и истории заказов."""
    try:
        saved_result = await db.execute(
            select(InformationAboutCustomer).where(
                InformationAboutCustomer.executor_id == executor_id
            )
        )
        saved_rows = saved_result.scalars().all()
        hidden_customer_ids = {
            row.customer_id
            for row in saved_rows
            if is_hidden_customer_executor_phone(row.phone)
        }
        saved_map = {
            row.customer_id: row
            for row in saved_rows
            if not is_hidden_customer_executor_phone(row.phone)
        }

        customer_ids: set[int] = set(saved_map.keys())

        response_rows = await db.execute(
            select(Order.customer_id)
            .join(OrderResponseExecutor, Order.id == OrderResponseExecutor.order_id)
            .where(OrderResponseExecutor.executor_id == executor_id)
            .distinct()
        )
        customer_ids.update(row[0] for row in response_rows.all() if row[0])

        assigned_rows = await db.execute(
            select(Order.customer_id)
            .join(ExecutorOrder, Order.id == ExecutorOrder.order_id)
            .where(ExecutorOrder.executor_id == executor_id)
            .distinct()
        )
        customer_ids.update(row[0] for row in assigned_rows.all() if row[0])
        customer_ids.discard(executor_id)
        customer_ids -= hidden_customer_ids

        if not customer_ids:
            return []

        users_result = await db.execute(
            select(User).where(User.id.in_(customer_ids))
        )
        users = {user.id: user for user in users_result.scalars().all()}

        items: list[ExecutorCustomerListItemSchema] = []
        for customer_id in sorted(customer_ids):
            user = users.get(customer_id)
            saved = saved_map.get(customer_id)
            items.append(
                ExecutorCustomerListItemSchema(
                    customer_id=customer_id,
                    name_customer=_format_user_name(user),
                    address=_format_user_address(user),
                    phone=saved.phone if saved else None,
                    notification=saved.notification if saved else None,
                    has_saved_info=saved is not None,
                )
            )

        return items

    except Exception as e:
        logger.error(
            "Ошибка получения списка заказчиков executor_id=%s: %s",
            executor_id,
            str(e),
        )
        raise HTTPException(
            status_code=500, detail="Ошибка получения списка заказчиков"
        )


async def get_information_about_execute_order(
    db: AsyncSession,
    user_id: int,
    order_id: int,
) -> InformationAboutExecuteOrderRead:
    """
    Сообщает исполнителю, что заказ больше недоступен:
    - заказчик выбрал другого исполнителя;
    - заказ убран в черновик;
    - заказ переведён в самостоятельное выполнение.
    user_id — текущий исполнитель, просматривающий услугу.
    """
    CUSTOMER_STATUS_DRAFT = "Не предложенные исполнителям"
    CUSTOMER_STATUS_SELF = "Самостоятельное выполнение"

    def build_unavailable(
        *,
        reason: str,
        message: str,
        selected_executor_id: Optional[int] = None,
        selected_executor_name: Optional[str] = None,
    ) -> InformationAboutExecuteOrderRead:
        return InformationAboutExecuteOrderRead(
            order_unavailable=True,
            unavailability_reason=reason,
            customer_chose_another_executor=reason == "another_executor",
            message=message,
            selected_executor_id=selected_executor_id,
            selected_executor_name=selected_executor_name,
        )

    try:
        response_exists = await db.execute(
            select(OrderResponseExecutor.id).where(
                OrderResponseExecutor.order_id == order_id,
                OrderResponseExecutor.executor_id == user_id,
            )
        )
        if response_exists.scalar_one_or_none() is None:
            return InformationAboutExecuteOrderRead()

        customer_status_result = await db.execute(
            select(StatusOrderCustomer.status).where(
                StatusOrderCustomer.order_id == order_id
            )
        )
        customer_status = customer_status_result.scalar_one_or_none()

        if customer_status == CUSTOMER_STATUS_DRAFT:
            return build_unavailable(
                reason="moved_to_draft",
                message=(
                    "Заказчик убрал заказ в черновик. "
                    "Заказ больше недоступен для выполнения."
                ),
            )

        if customer_status == CUSTOMER_STATUS_SELF:
            return build_unavailable(
                reason="self_execution",
                message=(
                    "Заказчик решил выполнить заказ самостоятельно. "
                    "Заказ больше недоступен для исполнителей."
                ),
            )

        result = await db.execute(
            select(ExecutorOrder, User)
            .outerjoin(User, ExecutorOrder.executor_id == User.id)
            .where(ExecutorOrder.order_id == order_id)
        )
        row = result.first()

        if not row:
            return InformationAboutExecuteOrderRead()

        executor_order, selected_user = row
        selected_executor_id = executor_order.executor_id
        selected_executor_name = (
            f"{selected_user.first_name or ''} {selected_user.last_name or ''}".strip()
            if selected_user
            else None
        )

        if selected_executor_id != user_id:
            return build_unavailable(
                reason="another_executor",
                message="Заказчик выбрал другого исполнителя",
                selected_executor_id=selected_executor_id,
                selected_executor_name=selected_executor_name or "Другой исполнитель",
            )

        return InformationAboutExecuteOrderRead(
            selected_executor_id=selected_executor_id,
            selected_executor_name=selected_executor_name,
        )

    except Exception as e:
        logger.error(
            f"Ошибка получения информации о заказе order_id={order_id}, "
            f"user_id={user_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500,
            detail="Ошибка получения информации о заказе",
        )

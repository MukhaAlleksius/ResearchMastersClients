from datetime import datetime
from decimal import Decimal
import logging
from typing import Optional

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import and_, delete, or_, select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.estimate_graphic_works.delete_estimate_graphic_works import (
    clear_estimate_and_graphic_for_order,
)
from cruds.orders.delete_orders import clear_order_refusal_collateral
from cruds.notifications_crud import (
    CANCEL_DECISION_NOTIFICATION_TYPE,
    CANCEL_REQUESTED_NOTIFICATION_TYPE,
    CUSTOMER_OFFER_STATUS,
    ORDER_REFUSED_NOTIFICATION_TYPE,
    START_DATE_UPDATED_NOTIFICATION_TYPE,
    is_in_progress_status,
    is_order_in_wait_execute,
    notify_customer_executor_response,
    notify_customer_on_customer_status_change,
    notify_executor_on_status_change,
    notify_order_event_safe,
)
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

from schemas.orders_schemas import (
    CancelOrderCustomerForAdminRead,
    CustomerDecisionSchema,
    CustomerOrderCancellationCreateSchema,
    CustomerOrderCancellationReadSchema,
    ExecutorDecisionSchema,
    ExecutorOrderCancellationCreateSchema,
    ExecutorOrderCancellationReadSchema,
    ExecutorOrderSchema,
    GraphicOrderMasterCreate,
    GraphicOrderMasterRead,
    InformationAboutCustomerRead,
    InformationAboutCustomerSchema,
    InformationAboutExecutorRead,
    InformationAboutExecutorSchema,
    OrderCardForAdmin,
    OrderCreateSchema,
    OrderProfileForAdmin,
    OrderReadSchema,
    OrderResponseExecutorReadSchema,
    OrderResponseExecutorSchema,
    OrderUserSchema,
    ServiceProfileForAdmin,
    ServiceUserSchema,
    StatusOrderCustomerSchema,
    StatusOrderExecutorSchema,
)

import traceback

logger = logging.getLogger(__name__)

SELF_EXECUTION_STATUS = "Самостоятельное выполнение"
DRAFT_STATUS = "Не предложенные исполнителям"
SEARCH_EXECUTOR_STATUS = "В поиске исполнителя"
REFUSED_BY_CUSTOMER_STATUS = "Отказано заказчиком"
REFUSED_BY_ORDER_STATUS = "Отказ от заказа"
AWAITING_EXECUTION_STATUS = "Ожидают выполнения"
COMPLETED_EXECUTOR_STATUS = "Выполнен"


def status_assigns_executor_order(status: Optional[str]) -> bool:
    normalized = (status or "").strip()
    if not normalized:
        return False
    if normalized in {
        AWAITING_EXECUTION_STATUS,
        SELF_EXECUTION_STATUS,
        COMPLETED_EXECUTOR_STATUS,
    }:
        return True
    return is_in_progress_status(normalized)


async def assert_executor_is_not_order_customer(
    db: AsyncSession,
    *,
    order_id: int,
    executor_id: int,
) -> None:
    """Заказчик не может быть исполнителем по своему же заказу."""
    result = await db.execute(select(Order.customer_id).where(Order.id == order_id))
    customer_id = result.scalar_one_or_none()
    if customer_id is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if int(customer_id) == int(executor_id):
        raise HTTPException(
            status_code=400,
            detail="Нельзя выступать исполнителем по собственному заказу",
        )


def assert_customer_and_executor_are_different(
    customer_id: int,
    executor_id: int,
) -> None:
    if int(customer_id) == int(executor_id):
        raise HTTPException(
            status_code=400,
            detail="Заказчик и исполнитель не могут быть одним и тем же пользователем",
        )


async def ensure_executor_order_assignment(
    db: AsyncSession,
    *,
    order_id: int,
    executor_id: int,
) -> ExecutorOrder:
    await assert_executor_is_not_order_customer(
        db, order_id=order_id, executor_id=executor_id
    )

    result = await db.execute(
        select(ExecutorOrder).where(ExecutorOrder.order_id == order_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.executor_id != executor_id:
            existing.executor_id = executor_id
            await db.flush()
        return existing

    executor_order = ExecutorOrder(
        order_id=order_id,
        executor_id=executor_id,
    )
    db.add(executor_order)
    await db.flush()
    return executor_order


async def backfill_executor_orders_from_assigned_statuses(
    db: AsyncSession,
    user_id: Optional[int] = None,
) -> None:
    filters = []
    if user_id is not None:
        filters.append(StatusOrderExecutor.executor_id == user_id)

    result = await db.execute(
        select(StatusOrderExecutor).where(and_(*filters) if filters else True)
    )
    for status_row in result.scalars().all():
        if status_assigns_executor_order(status_row.status):
            await ensure_executor_order_assignment(
                db,
                order_id=status_row.order_id,
                executor_id=status_row.executor_id,
            )


async def _resolve_cancel_notification_type(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> str:
    if await is_order_in_wait_execute(
        db,
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
    ):
        return ORDER_REFUSED_NOTIFICATION_TYPE
    return CANCEL_REQUESTED_NOTIFICATION_TYPE


def _can_release_order_to_search(customer_status: Optional[str]) -> bool:
    if not customer_status or customer_status == SEARCH_EXECUTOR_STATUS:
        return False
    if AWAITING_EXECUTION_STATUS in customer_status:
        return True
    return is_in_progress_status(customer_status)


async def _maybe_notify_customer_status_change(
    db: AsyncSession,
    *,
    status_order_customer_schema: StatusOrderCustomerSchema,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    if status_order_customer_schema.suppress_executor_notification:
        return
    if is_in_progress_status(new_status):
        return

    await notify_customer_on_customer_status_change(
        db=db,
        customer_id=status_order_customer_schema.customer_id,
        order_id=status_order_customer_schema.order_id,
        previous_status=previous_status,
        new_status=new_status,
    )


async def _notify_executor_on_status_change(
    db: AsyncSession,
    *,
    executor_id: int,
    order_id: int,
    previous_status: Optional[str],
    new_status: str,
) -> None:
    await notify_executor_on_status_change(
        db=db,
        executor_id=executor_id,
        order_id=order_id,
        previous_status=previous_status,
        new_status=new_status,
    )


async def _sync_customer_status_for_executor_progress(
    db: AsyncSession,
    *,
    order_id: int,
    new_status: str,
) -> None:
    if not is_in_progress_status(new_status):
        return

    order = await db.get(Order, order_id)
    if not order or not order.customer_id:
        return

    result = await db.execute(
        select(StatusOrderCustomer).where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == order.customer_id,
        )
    )
    customer_row = result.scalar_one_or_none()
    if not customer_row or customer_row.status == new_status:
        return

    previous_status = customer_row.status
    customer_row.status = new_status
    await db.flush()
    await _maybe_notify_customer_status_change(
        db=db,
        status_order_customer_schema=StatusOrderCustomerSchema(
            order_id=order_id,
            customer_id=order.customer_id,
            status=new_status,
            suppress_executor_notification=True,
        ),
        previous_status=previous_status,
        new_status=new_status,
    )


async def _release_order_to_search(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
    executor_status: str,
) -> None:
    result = await db.execute(
        select(StatusOrderCustomer).where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
    )
    customer_status_row = result.scalar_one_or_none()
    if not customer_status_row:
        return

    previous_customer_status = customer_status_row.status
    customer_status_row.status = SEARCH_EXECUTOR_STATUS
    await db.flush()

    await _maybe_notify_customer_status_change(
        db=db,
        status_order_customer_schema=StatusOrderCustomerSchema(
            order_id=order_id,
            customer_id=customer_id,
            status=SEARCH_EXECUTOR_STATUS,
            suppress_executor_notification=True,
        ),
        previous_status=previous_customer_status,
        new_status=SEARCH_EXECUTOR_STATUS,
    )

    result = await db.execute(
        select(StatusOrderExecutor).where(
            StatusOrderExecutor.order_id == order_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
    )
    executor_status_row = result.scalar_one_or_none()
    if executor_status_row:
        executor_status_row.status = executor_status
        await db.flush()
    else:
        executor_status_row = StatusOrderExecutor(
            order_id=order_id,
            executor_id=executor_id,
            status=executor_status,
        )
        db.add(executor_status_row)
        await db.flush()

    await db.execute(
        delete(ExecutorOrder).where(
            ExecutorOrder.order_id == order_id,
            ExecutorOrder.executor_id == executor_id,
        )
    )
    await db.execute(
        delete(Contract).where(
            Contract.order_id == order_id,
            Contract.customer_id == customer_id,
            Contract.executor_id == executor_id,
        )
    )
    await clear_order_refusal_collateral(
        db,
        order_id,
        customer_id=customer_id,
        executor_id=executor_id,
        preserve_cancellations=True,
    )
    await db.execute(
        update(Order).where(Order.id == order_id).values(updated_at=datetime.utcnow())
    )
    await db.flush()


async def apply_in_progress_customer_cancel_agreed(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> bool:
    """После согласия исполнителя на отмену заказчиком: заказ → в поиск, услуга → отказано заказчиком."""
    result = await db.execute(
        select(StatusOrderCustomer).where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
    )
    customer_status_row = result.scalar_one_or_none()
    if not customer_status_row or not _can_release_order_to_search(
        customer_status_row.status
    ):
        return False

    await _release_order_to_search(
        db,
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
        executor_status=REFUSED_BY_CUSTOMER_STATUS,
    )
    return True


async def apply_executor_cancel_agreed(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_id: int,
) -> bool:
    """После согласия заказчика на отказ исполнителя: заказ → в поиск, услуга → отказ от заказа."""
    result = await db.execute(
        select(StatusOrderCustomer).where(
            StatusOrderCustomer.order_id == order_id,
            StatusOrderCustomer.customer_id == customer_id,
        )
    )
    customer_status_row = result.scalar_one_or_none()
    if not customer_status_row or not _can_release_order_to_search(
        customer_status_row.status
    ):
        return False

    await _release_order_to_search(
        db,
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
        executor_status=REFUSED_BY_ORDER_STATUS,
    )
    return True


# метод для добавления заказа пользователя
async def add_order_user(db: AsyncSession, order_schema: OrderCreateSchema):
    try:
        result_category_work_id = await db.execute(
            select(CategoryWork.id).filter(
                CategoryWork.name == order_schema.category_work
            )
        )
        category_work_id = result_category_work_id.scalars().first()
        result = await db.execute(
            select(Order.id).filter(
                and_(
                    Order.title == order_schema.title,
                    Order.description == order_schema.description,
                    Order.customer_id == order_schema.customer_id,
                    Order.category_id == category_work_id,
                    Order.budget == order_schema.budget,
                    Order.budget_type == order_schema.budget_type,
                    Order.location == order_schema.location,
                    Order.town == order_schema.town,
                    Order.region == order_schema.region,
                )
            )
        )
        existing_order_id = result.scalar_one_or_none()
        if existing_order_id:
            return  # Заказ уже существует, не добавляем

        order = Order(
            title=order_schema.title,
            description=order_schema.description,
            customer_id=order_schema.customer_id,
            category_id=category_work_id,
            budget=order_schema.budget,
            currency=order_schema.currency,
            budget_type=order_schema.budget_type,
            urgency_level=order_schema.urgency_level,
            country=order_schema.country,
            region=order_schema.region,
            town=order_schema.town,
            location=order_schema.location,
            deadline=order_schema.deadline,
            insurance_required=order_schema.insurance_required,
        )

        db.add(order)
        await db.flush()

        return order
    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# метод для добавления статуса заказа относительно заказчика
async def add_status_order_customer(
    db: AsyncSession, status_order_customer_schema: StatusOrderCustomerSchema
):
    try:
        logger.info(
            f"Создание статуса: order_id={status_order_customer_schema.order_id}, customer_id={status_order_customer_schema.customer_id}"
        )

        # 1. Проверка существования
        result = await db.execute(
            select(StatusOrderCustomer).where(
                StatusOrderCustomer.order_id == status_order_customer_schema.order_id,
                StatusOrderCustomer.customer_id
                == status_order_customer_schema.customer_id,
            )
        )

        existing = result.scalar_one_or_none()
        if existing:
            old_status = existing.status
            new_status = status_order_customer_schema.status

            if old_status == SELF_EXECUTION_STATUS and new_status == DRAFT_STATUS:
                await clear_estimate_and_graphic_for_order(
                    db=db,
                    user_id=status_order_customer_schema.customer_id,
                    order_id=status_order_customer_schema.order_id,
                )

            # обновляем статус
            existing.status = new_status
            await db.flush()
            await _maybe_notify_customer_status_change(
                db=db,
                status_order_customer_schema=status_order_customer_schema,
                previous_status=old_status,
                new_status=new_status,
            )
            # flush в SQLAlchemy отправляет изменения из сессии в базу, но не делает commit
            await db.commit()
            await db.refresh(existing)
            return existing

        # 2. Создание БЕЗ лишних полей
        status_order_customer = StatusOrderCustomer(
            order_id=status_order_customer_schema.order_id,
            customer_id=status_order_customer_schema.customer_id,
            status=status_order_customer_schema.status,
        )

        db.add(status_order_customer)
        await db.flush()  # Генерируем ID
        await _maybe_notify_customer_status_change(
            db=db,
            status_order_customer_schema=status_order_customer_schema,
            previous_status=None,
            new_status=status_order_customer_schema.status,
        )
        await db.commit()
        await db.refresh(status_order_customer)

        logger.info(f"Статус создан: id={status_order_customer.id}")
        return status_order_customer

    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка создания статуса: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Ошибка создания статуса: {str(e)}"
        )


async def is_executor_blocked_from_customer_reoffer(
    db: AsyncSession,
    *,
    order_id: int,
    executor_id: int,
) -> bool:
    """Исполнитель уже отклонён заказчиком — повторно предложить заказ нельзя."""
    status_result = await db.execute(
        select(StatusOrderExecutor.status).where(
            StatusOrderExecutor.order_id == order_id,
            StatusOrderExecutor.executor_id == executor_id,
        )
    )
    executor_status = status_result.scalar_one_or_none()
    if executor_status and REFUSED_BY_CUSTOMER_STATUS in executor_status:
        return True

    cancel_result = await db.execute(
        select(CustomerOrderCancellation.id).where(
            CustomerOrderCancellation.order_id == order_id,
            CustomerOrderCancellation.executor_id == executor_id,
            CustomerOrderCancellation.status == "agree",
        )
    )
    return cancel_result.scalar_one_or_none() is not None


# метод для добавления статуса заказа относительно исполнителя
async def add_status_order_executor(
    db: AsyncSession,
    status_order_executor_schema: StatusOrderExecutorSchema,
):
    try:
        await assert_executor_is_not_order_customer(
            db,
            order_id=status_order_executor_schema.order_id,
            executor_id=status_order_executor_schema.executor_id,
        )

        if status_order_executor_schema.status == CUSTOMER_OFFER_STATUS:
            if await is_executor_blocked_from_customer_reoffer(
                db,
                order_id=status_order_executor_schema.order_id,
                executor_id=status_order_executor_schema.executor_id,
            ):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Нельзя снова предложить этот заказ исполнителю "
                        "после отказа заказчика"
                    ),
                )

        # ищем существующую запись
        result = await db.execute(
            select(StatusOrderExecutor).filter(
                StatusOrderExecutor.order_id == status_order_executor_schema.order_id,
                StatusOrderExecutor.executor_id
                == status_order_executor_schema.executor_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # обновляем статус
            previous_status = existing.status
            existing.status = status_order_executor_schema.status
            await db.flush()
            if status_assigns_executor_order(status_order_executor_schema.status):
                await ensure_executor_order_assignment(
                    db,
                    order_id=status_order_executor_schema.order_id,
                    executor_id=status_order_executor_schema.executor_id,
                )
            await _sync_customer_status_for_executor_progress(
                db=db,
                order_id=status_order_executor_schema.order_id,
                new_status=status_order_executor_schema.status,
            )
            await _notify_executor_on_status_change(
                db=db,
                executor_id=status_order_executor_schema.executor_id,
                order_id=status_order_executor_schema.order_id,
                previous_status=previous_status,
                new_status=status_order_executor_schema.status,
            )
            # flush в SQLAlchemy отправляет изменения из сессии в базу, но не делает commit
            await db.commit()
            await db.refresh(existing)
            return existing

        # иначе создаём новую
        status_order_executor = StatusOrderExecutor(
            order_id=status_order_executor_schema.order_id,
            executor_id=status_order_executor_schema.executor_id,
            status=status_order_executor_schema.status,
        )

        db.add(status_order_executor)
        await db.flush()
        if status_assigns_executor_order(status_order_executor_schema.status):
            await ensure_executor_order_assignment(
                db,
                order_id=status_order_executor_schema.order_id,
                executor_id=status_order_executor_schema.executor_id,
            )
        await _sync_customer_status_for_executor_progress(
            db=db,
            order_id=status_order_executor_schema.order_id,
            new_status=status_order_executor_schema.status,
        )
        await _notify_executor_on_status_change(
            db=db,
            executor_id=status_order_executor_schema.executor_id,
            order_id=status_order_executor_schema.order_id,
            previous_status=None,
            new_status=status_order_executor_schema.status,
        )
        await db.commit()
        await db.refresh(status_order_executor)

        return status_order_executor

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка создания статуса: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Ошибка создания статуса: {str(e)}"
        )


# добавляем исполнителя для заказа
async def add_executor_order(
    db: AsyncSession, executor_order_schema: ExecutorOrderSchema
):
    async with db.begin():
        try:
            return await ensure_executor_order_assignment(
                db,
                order_id=executor_order_schema.order_id,
                executor_id=executor_order_schema.executor_id,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Ошибка назначения исполнителя: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Ошибка назначения исполнителя: {str(e)}"
            )


async def add_order_customer_cancel(
    db: AsyncSession,
    customer_order_cancel_schema: CustomerOrderCancellationCreateSchema,
):
    async with db.begin():  # ✅ Автоматический commit/rollback
        try:

            # 1. Проверка существования
            result = await db.execute(
                select(CustomerOrderCancellation.id).where(
                    and_(
                        CustomerOrderCancellation.order_id
                        == customer_order_cancel_schema.order_id,
                        CustomerOrderCancellation.customer_id
                        == customer_order_cancel_schema.customer_id,
                        CustomerOrderCancellation.executor_id
                        == customer_order_cancel_schema.executor_id,
                    )
                )
            )

            existing_id = result.scalar_one_or_none()
            if existing_id:
                logger.info(
                    f"Этот заказ у исполнитиеля уже существует: id={existing_id}"
                )
                return existing_id

            customer_order_cancel = CustomerOrderCancellation(
                order_id=customer_order_cancel_schema.order_id,
                customer_id=customer_order_cancel_schema.customer_id,
                executor_id=customer_order_cancel_schema.executor_id,
                status=customer_order_cancel_schema.status,
                executor_comment=customer_order_cancel_schema.executor_comment,
                reason_type=customer_order_cancel_schema.reason_type,
                reason_text=customer_order_cancel_schema.reason_text,
            )

            db.add(customer_order_cancel)
            await db.flush()  # Генерируем ID

            notification_type = await _resolve_cancel_notification_type(
                db,
                order_id=customer_order_cancel_schema.order_id,
                customer_id=customer_order_cancel_schema.customer_id,
                executor_id=customer_order_cancel_schema.executor_id,
            )
            await notify_order_event_safe(
                db,
                order_id=customer_order_cancel_schema.order_id,
                actor_user_id=customer_order_cancel_schema.customer_id,
                notification_type=notification_type,
                recipient_id=customer_order_cancel_schema.executor_id,
            )

            logger.info(f"Статус создан: id={customer_order_cancel.id}")
            return customer_order_cancel

        except Exception as e:
            logger.error(f"Ошибка создания статуса: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Ошибка создания статуса: {str(e)}"
            )


async def add_order_executor_cancel(
    db: AsyncSession,
    executor_order_cancel_schema: ExecutorOrderCancellationCreateSchema,
):
    async with db.begin():  # ✅ Автоматический commit/rollback
        try:

            # 1. Проверка существования
            result = await db.execute(
                select(ExecutorOrderCancellation.id).where(
                    and_(
                        ExecutorOrderCancellation.order_id
                        == executor_order_cancel_schema.order_id,
                        ExecutorOrderCancellation.customer_id
                        == executor_order_cancel_schema.customer_id,
                        ExecutorOrderCancellation.executor_id
                        == executor_order_cancel_schema.executor_id,
                    )
                )
            )

            existing_id = result.scalar_one_or_none()
            if existing_id:
                logger.info(
                    f"Этот заказ у исполнитиеля уже существует: id={existing_id}"
                )
                return existing_id

            executor_order_cancel = ExecutorOrderCancellation(
                order_id=executor_order_cancel_schema.order_id,
                customer_id=executor_order_cancel_schema.customer_id,
                executor_id=executor_order_cancel_schema.executor_id,
                status=executor_order_cancel_schema.status,
                customer_comment=executor_order_cancel_schema.customer_comment,
                reason_type=executor_order_cancel_schema.reason_type,
                reason_text=executor_order_cancel_schema.reason_text,
            )

            db.add(executor_order_cancel)
            await db.flush()  # Генерируем ID

            notification_type = await _resolve_cancel_notification_type(
                db,
                order_id=executor_order_cancel_schema.order_id,
                customer_id=executor_order_cancel_schema.customer_id,
                executor_id=executor_order_cancel_schema.executor_id,
            )
            await notify_order_event_safe(
                db,
                order_id=executor_order_cancel_schema.order_id,
                actor_user_id=executor_order_cancel_schema.executor_id,
                notification_type=notification_type,
                recipient_id=executor_order_cancel_schema.customer_id,
            )

            logger.info(f"Статус создан: id={executor_order_cancel.id}")
            return executor_order_cancel

        except Exception as e:
            logger.error(f"Ошибка создания статуса: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Ошибка создания статуса: {str(e)}"
            )


def _order_response_to_read_schema(
    row: OrderResponseExecutor,
) -> OrderResponseExecutorReadSchema:
    proposed_price = row.proposed_price
    if isinstance(proposed_price, Decimal):
        proposed_price = float(proposed_price)

    return OrderResponseExecutorReadSchema(
        id=row.id,
        executor_id=row.executor_id,
        proposed_price=proposed_price,
        budget_type=row.budget_type,
        currency=row.currency or "BYN",
        estimated_time=row.estimated_time,
        start_time_work=row.start_time_work,
        message=row.message or "",
        created_at=row.created_at,
    )


# добавляем ответ исполнителя на предложенный заказ
async def add_order_response_executor(
    db: AsyncSession, order_response_executor_schema: OrderResponseExecutorSchema
) -> OrderResponseExecutorReadSchema:
    try:
        await assert_executor_is_not_order_customer(
            db,
            order_id=order_response_executor_schema.order_id,
            executor_id=order_response_executor_schema.executor_id,
        )

        result = await db.execute(
            select(OrderResponseExecutor)
            .where(
                and_(
                    OrderResponseExecutor.order_id
                    == order_response_executor_schema.order_id,
                    OrderResponseExecutor.executor_id
                    == order_response_executor_schema.executor_id,
                )
            )
            .order_by(OrderResponseExecutor.id.desc())
        )
        rows = result.scalars().all()
        existing = rows[0] if rows else None
        is_update = existing is not None

        for duplicate in rows[1:]:
            await db.delete(duplicate)

        if existing:
            existing.proposed_price = order_response_executor_schema.proposed_price
            existing.budget_type = order_response_executor_schema.budget_type
            existing.currency = order_response_executor_schema.currency
            existing.estimated_time = order_response_executor_schema.estimated_time
            existing.start_time_work = order_response_executor_schema.start_time_work
            existing.message = order_response_executor_schema.message
            row = existing
        else:
            row = OrderResponseExecutor(
                order_id=order_response_executor_schema.order_id,
                executor_id=order_response_executor_schema.executor_id,
                proposed_price=order_response_executor_schema.proposed_price,
                budget_type=order_response_executor_schema.budget_type,
                currency=order_response_executor_schema.currency,
                estimated_time=order_response_executor_schema.estimated_time,
                start_time_work=order_response_executor_schema.start_time_work,
                message=order_response_executor_schema.message,
            )
            db.add(row)

        await db.flush()

        await db.execute(
            update(Order)
            .where(Order.id == order_response_executor_schema.order_id)
            .values(updated_at=datetime.utcnow())
        )

        await notify_customer_executor_response(
            db=db,
            executor_id=order_response_executor_schema.executor_id,
            order_id=order_response_executor_schema.order_id,
            is_update=is_update,
        )

        await db.commit()
        await db.refresh(row)

        logger.info(
            "Ответ исполнителя сохранён: id=%s, order_id=%s, executor_id=%s, update=%s",
            row.id,
            order_response_executor_schema.order_id,
            order_response_executor_schema.executor_id,
            is_update,
        )
        return _order_response_to_read_schema(row)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка сохранения ответа исполнителя: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Ошибка сохранения ответа исполнителя: {str(e)}"
        )


async def add_verdict_admin_cancel_customer(
    db: AsyncSession,
    schema: CustomerOrderCancellationCreateSchema,
) -> Optional[CustomerOrderCancellation]:
    try:
        stmt = select(CustomerOrderCancellation).where(
            and_(
                CustomerOrderCancellation.order_id == schema.order_id,
                CustomerOrderCancellation.customer_id == schema.customer_id,
                CustomerOrderCancellation.executor_id == schema.executor_id,
            )
        )
        result = await db.execute(stmt)
        cancellation = result.scalar_one_or_none()

        if cancellation is None:
            raise HTTPException(404, "Отмена не найдена")

        print(
            f"🔍 Найдена отмена #{cancellation.id}, "
            f"before: "
            f"customer={cancellation.refund_amount_customer}, "
            f"executor={cancellation.refund_amount_executor}, "
            f"admin={cancellation.admin_comment}"
        )
        print(
            f"📊 schema: "
            f"refund_customer={schema.refund_amount_customer}, "
            f"refund_executor={schema.refund_amount_executor}, "
            f"admin={schema.admin_comment}"
        )

        # записываем в БД даже если пришёл 0.0 или None
        if schema.refund_amount_customer is not None:
            cancellation.refund_amount_customer = Decimal(schema.refund_amount_customer)
        if schema.refund_amount_executor is not None:
            cancellation.refund_amount_executor = Decimal(schema.refund_amount_executor)
        if schema.admin_comment is not None:
            cancellation.admin_comment = schema.admin_comment
        cancellation.status = "resolved"
        cancellation.resolved_at = func.now()

        await db.flush()
        await db.commit()

        result_saved = await db.execute(
            select(CustomerOrderCancellation).where(
                CustomerOrderCancellation.id == cancellation.id
            )
        )
        saved = result_saved.scalar_one()

        print(
            f"✅ СОХРАНЕНО: ID={saved.id}, "
            f"refund_customer={saved.refund_amount_customer}, "
            f"refund_executor={saved.refund_amount_executor}, "
            f"comment='{saved.admin_comment}'"
        )
        return saved

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"❌ Ошибка: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def add_date_start_execute_order(
    db: AsyncSession, date_start_execute_order_schema: GraphicOrderMasterCreate
) -> GraphicOrderMaster:
    try:
        result = await db.execute(
            select(GraphicOrderMaster).where(
                and_(
                    GraphicOrderMaster.user_id
                    == date_start_execute_order_schema.user_id,
                    GraphicOrderMaster.order_id
                    == date_start_execute_order_schema.order_id,
                )
            )
        )

        existing_record = result.scalar_one_or_none()
        if existing_record:
            existing_record.date_start = date_start_execute_order_schema.date_start
            await notify_order_event_safe(
                db,
                order_id=date_start_execute_order_schema.order_id,
                actor_user_id=date_start_execute_order_schema.user_id,
                notification_type=START_DATE_UPDATED_NOTIFICATION_TYPE,
                extra_format={"detail": date_start_execute_order_schema.date_start or ""},
            )
            await db.commit()
            await db.refresh(existing_record)
            return existing_record

        date_start_execute_order = GraphicOrderMaster(
            user_id=date_start_execute_order_schema.user_id,
            order_id=date_start_execute_order_schema.order_id,
            date_start=date_start_execute_order_schema.date_start,
        )

        db.add(date_start_execute_order)
        await db.flush()
        await notify_order_event_safe(
            db,
            order_id=date_start_execute_order_schema.order_id,
            actor_user_id=date_start_execute_order_schema.user_id,
            notification_type=START_DATE_UPDATED_NOTIFICATION_TYPE,
            extra_format={"detail": date_start_execute_order_schema.date_start or ""},
        )
        await db.commit()
        await db.refresh(date_start_execute_order)

        logger.info(f"✅ Добавлена дата для заказа {date_start_execute_order.order_id}")
        return date_start_execute_order

    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Ошибка: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def add_information_about_customer(
    db: AsyncSession, information_about_customer_schema: InformationAboutCustomerSchema
):
    try:
        assert_customer_and_executor_are_different(
            information_about_customer_schema.customer_id,
            information_about_customer_schema.executor_id,
        )

        result = await db.execute(
            select(InformationAboutCustomer).where(
                and_(
                    InformationAboutCustomer.customer_id
                    == information_about_customer_schema.customer_id,
                    InformationAboutCustomer.executor_id
                    == information_about_customer_schema.executor_id,
                )
            )
        )

        existing_information_about_customer = result.scalar_one_or_none()
        if existing_information_about_customer:
            existing_information_about_customer.phone = (
                information_about_customer_schema.phone
            )
            existing_information_about_customer.notification = (
                information_about_customer_schema.notification
            )
            await db.commit()
            await db.refresh(existing_information_about_customer)
            return existing_information_about_customer

        information_about_customer = InformationAboutCustomer(
            executor_id=information_about_customer_schema.executor_id,
            customer_id=information_about_customer_schema.customer_id,
            phone=information_about_customer_schema.phone,
            notification=information_about_customer_schema.notification,
        )

        db.add(information_about_customer)
        await db.flush()
        await db.commit()
        await db.refresh(information_about_customer)

        logger.info(
            f"✅ Добавлена информация о заказчике от исполнителя {information_about_customer.id}"
        )
        return information_about_customer

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Ошибка: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def add_information_about_executor(
    db: AsyncSession, information_about_executor_schema: InformationAboutExecutorSchema
):
    try:
        assert_customer_and_executor_are_different(
            information_about_executor_schema.customer_id,
            information_about_executor_schema.executor_id,
        )

        result = await db.execute(
            select(InformationAboutExecutor).where(
                and_(
                    InformationAboutExecutor.customer_id
                    == information_about_executor_schema.customer_id,
                    InformationAboutExecutor.executor_id
                    == information_about_executor_schema.executor_id,
                )
            )
        )

        existing_information_about_executor = result.scalar_one_or_none()
        if existing_information_about_executor:
            existing_information_about_executor.phone = (
                information_about_executor_schema.phone
            )
            existing_information_about_executor.notification = (
                information_about_executor_schema.notification
            )
            await db.commit()
            await db.refresh(existing_information_about_executor)
            return existing_information_about_executor

        information_about_executor = InformationAboutExecutor(
            executor_id=information_about_executor_schema.executor_id,
            customer_id=information_about_executor_schema.customer_id,
            phone=information_about_executor_schema.phone,
            notification=information_about_executor_schema.notification,
        )

        db.add(information_about_executor)
        await db.flush()
        await db.commit()
        await db.refresh(information_about_executor)

        logger.info(
            f"✅ Добавлена информация об исполнителе от заказчика {information_about_executor.id}"
        )
        return information_about_executor

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Ошибка: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

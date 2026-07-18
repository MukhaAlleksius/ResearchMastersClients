from datetime import datetime
import logging

from fastapi import HTTPException
from sqlalchemy import and_, select, update
from models.works_materials_models import CategoryWork
from models.orders_models import (
    CustomerOrderCancellation,
    ExecutorOrderCancellation,
    Order,
    OrderResponseExecutor,
)
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.notifications_crud import (
    CANCEL_DECISION_NOTIFICATION_TYPE,
    ORDER_UPDATED_NOTIFICATION_TYPE,
    format_cancel_decision_detail,
    notify_customer_executor_response,
    notify_order_event_safe,
)
from cruds.orders.create_orders import (
    apply_executor_cancel_agreed,
    apply_in_progress_customer_cancel_agreed,
)
from cruds.orders.read_orders import get_order
from schemas.orders_schemas import (
    CustomerDecisionSchema,
    ExecutorDecisionSchema,
    OrderReadSchema,
    OrderResponseExecutorSchema,
    OrderUpdateSchema,
)

logger = logging.getLogger(__name__)


async def resolve_category_work_id(
    db: AsyncSession,
    order_update: OrderUpdateSchema,
) -> int:
    if order_update.category_work_id:
        result = await db.execute(
            select(CategoryWork.id).where(
                CategoryWork.id == order_update.category_work_id
            )
        )
        category_work_id = result.scalar_one_or_none()
        if category_work_id:
            return category_work_id

    result = await db.execute(
        select(CategoryWork.id).where(CategoryWork.name == order_update.category_work)
    )
    category_work_id = result.scalar_one_or_none()
    if not category_work_id:
        raise HTTPException(status_code=400, detail="Категория работ не найдена")
    return category_work_id


# метод для обновления информации о заказе
async def update_order_customer(
    db: AsyncSession,
    order_customer: OrderUpdateSchema,
    user_id: int,
    order_id: int,
) -> OrderReadSchema:
    try:
        if order_customer.customer_id != user_id:
            raise HTTPException(status_code=403, detail="Нет доступа к этому заказу")

        category_work_id = await resolve_category_work_id(db, order_customer)

        result = await db.execute(
            update(Order)
            .where(
                and_(Order.customer_id == user_id, Order.id == order_id),
            )
            .values(
                title=order_customer.title,
                description=order_customer.description or "",
                category_id=category_work_id,
                budget=order_customer.budget,
                currency=order_customer.currency,
                budget_type=order_customer.budget_type,
                urgency_level=order_customer.urgency_level,
                country=order_customer.country,
                region=order_customer.region,
                town=order_customer.town,
                location=order_customer.location,
                deadline=order_customer.deadline,
                insurance_required=bool(order_customer.insurance_required),
                updated_at=datetime.utcnow(),
            )
        )

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Заказ не найден")

        await notify_order_event_safe(
            db,
            order_id=order_id,
            actor_user_id=user_id,
            notification_type=ORDER_UPDATED_NOTIFICATION_TYPE,
        )
        await db.commit()

        return await get_order(db=db, order_id=order_id)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(
            f"update_order_customer error order_id={order_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")


# метод для обновления информации об ответе пользователя на заказ
async def update_order_response_executor(
    db: AsyncSession,
    order_response_executor: OrderResponseExecutorSchema,
    user_id: int,
    order_id: int,
):
    try:
        result = await db.execute(
            select(OrderResponseExecutor).where(
                and_(
                    OrderResponseExecutor.executor_id == user_id,
                    OrderResponseExecutor.order_id == order_id,
                )
            )
        )

        row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Запись не найдена")

        row.proposed_price = order_response_executor.proposed_price
        row.budget_type = order_response_executor.budget_type
        row.currency = order_response_executor.currency
        row.estimated_time = order_response_executor.estimated_time
        row.start_time_work = order_response_executor.start_time_work
        row.message = order_response_executor.message

        await db.execute(
            update(Order)
            .where(Order.id == order_id)
            .values(updated_at=datetime.utcnow())
        )

        await notify_customer_executor_response(
            db=db,
            executor_id=user_id,
            order_id=order_id,
            is_update=True,
        )

        await db.commit()
        await db.refresh(row)

        return row

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")


# обновляем запись отказа исполнителя от закзаза ответом заказчика
async def put_customer_decision(
    db: AsyncSession, customer_decision_schema: CustomerDecisionSchema
):
    try:

        result = await db.execute(
            select(ExecutorOrderCancellation).where(
                ExecutorOrderCancellation.order_id == customer_decision_schema.order_id,
                ExecutorOrderCancellation.customer_id
                == customer_decision_schema.customer_id,
                ExecutorOrderCancellation.executor_id
                == customer_decision_schema.executor_id,
            )
        )

        customer_decision = result.scalar_one_or_none()

        if not customer_decision:
            return None

        customer_decision.status = customer_decision_schema.status
        customer_decision.customer_comment = customer_decision_schema.customer_comment

        if customer_decision_schema.status == "agree":
            await apply_executor_cancel_agreed(
                db,
                order_id=customer_decision_schema.order_id,
                customer_id=customer_decision_schema.customer_id,
                executor_id=customer_decision_schema.executor_id,
            )

        detail = format_cancel_decision_detail(
            customer_decision_schema.status,
            customer_decision_schema.customer_comment,
        )
        await notify_order_event_safe(
            db,
            order_id=customer_decision_schema.order_id,
            actor_user_id=customer_decision_schema.customer_id,
            notification_type=CANCEL_DECISION_NOTIFICATION_TYPE,
            extra_format={"detail": detail},
            recipient_id=customer_decision_schema.executor_id,
        )

        await db.commit()
        await db.refresh(customer_decision)
        return customer_decision

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"put_customer_decision error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка сохранения решения по отмене")


# обновляем запись отказа заказчика от закзаза ответом исполнителя
async def put_executor_decision(
    db: AsyncSession, executor_decision_schema: ExecutorDecisionSchema
):
    try:

        result = await db.execute(
            select(CustomerOrderCancellation).where(
                CustomerOrderCancellation.order_id == executor_decision_schema.order_id,
                CustomerOrderCancellation.customer_id
                == executor_decision_schema.customer_id,
                CustomerOrderCancellation.executor_id
                == executor_decision_schema.executor_id,
            )
        )

        executor_decision = result.scalar_one_or_none()

        if not executor_decision:
            return None

        executor_decision.status = executor_decision_schema.status
        executor_decision.executor_comment = executor_decision_schema.executor_comment

        if executor_decision_schema.status == "agree":
            await apply_in_progress_customer_cancel_agreed(
                db,
                order_id=executor_decision_schema.order_id,
                customer_id=executor_decision_schema.customer_id,
                executor_id=executor_decision_schema.executor_id,
            )

        detail = format_cancel_decision_detail(
            executor_decision_schema.status,
            executor_decision_schema.executor_comment,
        )
        await notify_order_event_safe(
            db,
            order_id=executor_decision_schema.order_id,
            actor_user_id=executor_decision_schema.executor_id,
            notification_type=CANCEL_DECISION_NOTIFICATION_TYPE,
            extra_format={"detail": detail},
            recipient_id=executor_decision_schema.customer_id,
        )

        await db.commit()
        await db.refresh(executor_decision)
        return executor_decision

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"put_executor_decision error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка сохранения решения по отмене")

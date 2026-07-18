import logging
from fastapi import APIRouter, Depends, HTTPException


from core.auth import ensure_same_user, get_current_user
from core.config import get_db

from sqlalchemy.ext.asyncio import AsyncSession


from cruds.orders.update_orders import (
    put_customer_decision,
    put_executor_decision,
    update_order_customer,
    update_order_response_executor,
)
from schemas.orders_schemas import (
    CustomerDecisionSchema,
    ExecutorDecisionSchema,
    OrderReadSchema,
    OrderResponseExecutorSchema,
    OrderUpdateSchema,
)
from schemas.users_schemas import UserCommonSchema

router = APIRouter(prefix="", tags=["users"])

logger = logging.getLogger(__name__)


# обновление информации о заказе
@router.put(
    "/update_order_customer/{user_id}/{order_id}",
    response_model=OrderReadSchema,
)
async def update_order_customer_api(
    order_customer: OrderUpdateSchema,
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    ensure_same_user(current_user, order_customer.customer_id)
    try:
        return await update_order_customer(
            db=db,
            order_customer=order_customer,
            user_id=current_user.user_id,
            order_id=order_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Ошибка при обновлении заказа {order_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


# обновление информации об ответе пользователя на заказ
@router.put(
    "/update_order_response_executor/{user_id}/{order_id}",
)
async def update_order_response_executor_api(
    order_response_executor: OrderResponseExecutorSchema,
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    ensure_same_user(current_user, order_response_executor.executor_id)
    try:
        order_responses_executors = await update_order_response_executor(
            db=db,
            order_response_executor=order_response_executor,
            user_id=current_user.user_id,
            order_id=order_id,
        )
        if not order_responses_executors:
            raise HTTPException(
                status_code=409, detail="Ответа исполнителя на заказ не существует"
            )
        return order_responses_executors
    except Exception as e:
        # Логируем полную причину ошибки с трейсбеком
        logger.error(
            f"Ошибка при получении услуг пользователя {order_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


# обновляем запись отказа исполнителя от закзаза ответом заказчика
@router.put("/order/{order_id}/customer_decision")
async def put_customer_decision_api(
    customer_decision: CustomerDecisionSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, customer_decision.customer_id)
    try:

        customer_decision = await put_customer_decision(
            db=db, customer_decision_schema=customer_decision
        )

        return customer_decision

    except Exception as e:
        logger.error(f"API error for service {customer_decision}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


# обновляем запись отказа заказчика от закзаза ответом исполнителя
@router.put("/order/{order_id}/executor_decision")
async def put_customer_decision_api(
    executor_decision: ExecutorDecisionSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, executor_decision.executor_id)
    try:

        executor_decision = await put_executor_decision(
            db=db, executor_decision_schema=executor_decision
        )

        return executor_decision

    except Exception as e:
        logger.error(f"API error for service {executor_decision}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

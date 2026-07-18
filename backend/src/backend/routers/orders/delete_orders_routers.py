import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from core.config import get_db
from cruds.orders.delete_orders import (
    can_clear_order_after_executor_refusal,
    can_executor_delete_service,
    clear_order_data_after_executor_refusal,
    delete_executor_service,
    delete_order_by_customer,
    remove_customer_executor_from_list,
    remove_executor_customer_from_list,
    withdraw_customer_order_cancel,
    withdraw_executor_order_cancel,
)
from schemas.orders_schemas import (
    CustomerExecutorDeleteResponseSchema,
    ExecutorCustomerDeleteResponseSchema,
    ExecutorServiceDeleteEligibilitySchema,
    ExecutorServiceDeleteResponseSchema,
    OrderCancellationWithdrawResponseSchema,
    OrderClearAfterExecutorRefusalEligibilitySchema,
    OrderClearAfterExecutorRefusalResponseSchema,
    OrderDeleteResponseSchema,
)
from schemas.users_schemas import UserCommonSchema

router = APIRouter(prefix="", tags=["orders"])

logger = logging.getLogger(__name__)


@router.delete("/order/{order_id}", response_model=OrderDeleteResponseSchema)
async def delete_order_by_customer_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        return await delete_order_by_customer(
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "delete_order_by_customer error order_id=%s customer_id=%s: %s",
            order_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка удаления заказа") from exc


@router.get(
    "/order/{order_id}/clear_after_executor_refusal_eligibility",
    response_model=OrderClearAfterExecutorRefusalEligibilitySchema,
)
async def clear_after_executor_refusal_eligibility_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        can_clear = await can_clear_order_after_executor_refusal(
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
        )
        return {"can_clear": can_clear}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "clear_after_executor_refusal_eligibility error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка проверки заказа") from exc


@router.post(
    "/order/{order_id}/clear_after_executor_refusal",
    response_model=OrderClearAfterExecutorRefusalResponseSchema,
)
async def clear_order_after_executor_refusal_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        result = await clear_order_data_after_executor_refusal(
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
        )
        await db.commit()
        return result
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "clear_order_after_executor_refusal error order_id=%s customer_id=%s: %s",
            order_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Ошибка очистки данных заказа"
        ) from exc


@router.get(
    "/order/{order_id}/executor_service_delete_eligibility",
    response_model=ExecutorServiceDeleteEligibilitySchema,
)
async def executor_service_delete_eligibility_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        can_delete = await can_executor_delete_service(
            db=db,
            order_id=order_id,
            executor_id=current_user.user_id,
        )
        return {"can_delete": can_delete}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "executor_service_delete_eligibility error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка проверки услуги") from exc


@router.delete(
    "/order/{order_id}/executor_service",
    response_model=ExecutorServiceDeleteResponseSchema,
)
async def delete_executor_service_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        result = await delete_executor_service(
            db=db,
            order_id=order_id,
            executor_id=current_user.user_id,
        )
        await db.commit()
        return result
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "delete_executor_service error order_id=%s executor_id=%s: %s",
            order_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка удаления услуги") from exc


@router.delete(
    "/customer_executors/{customer_id}/{executor_id}",
    response_model=CustomerExecutorDeleteResponseSchema,
)
async def remove_customer_executor_from_list_api(
    customer_id: int,
    executor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    if current_user.user_id != customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = await remove_customer_executor_from_list(
            db=db,
            customer_id=customer_id,
            executor_id=executor_id,
        )
        await db.commit()
        return result
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "remove_customer_executor_from_list error customer_id=%s executor_id=%s: %s",
            customer_id,
            executor_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Ошибка удаления исполнителя"
        ) from exc


@router.delete(
    "/executor_customers/{executor_id}/{customer_id}",
    response_model=ExecutorCustomerDeleteResponseSchema,
)
async def remove_executor_customer_from_list_api(
    executor_id: int,
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    if current_user.user_id != executor_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = await remove_executor_customer_from_list(
            db=db,
            executor_id=executor_id,
            customer_id=customer_id,
        )
        await db.commit()
        return result
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "remove_executor_customer_from_list error executor_id=%s customer_id=%s: %s",
            executor_id,
            customer_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Ошибка удаления заказчика"
        ) from exc


@router.delete(
    "/order/{order_id}/customer_cancel",
    response_model=OrderCancellationWithdrawResponseSchema,
)
async def withdraw_customer_order_cancel_api(
    order_id: int,
    executor_id: int = Query(..., gt=0, description="ID исполнителя"),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        result = await withdraw_customer_order_cancel(
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
            executor_id=executor_id,
        )
        await db.commit()
        return result
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "withdraw_customer_order_cancel error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Ошибка отмены заявки на отказ"
        ) from exc


@router.delete(
    "/order/{order_id}/executor_cancel",
    response_model=OrderCancellationWithdrawResponseSchema,
)
async def withdraw_executor_order_cancel_api(
    order_id: int,
    customer_id: int = Query(..., gt=0, description="ID заказчика"),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        result = await withdraw_executor_order_cancel(
            db=db,
            order_id=order_id,
            customer_id=customer_id,
            executor_id=current_user.user_id,
        )
        await db.commit()
        return result
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "withdraw_executor_order_cancel error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Ошибка отмены заявки на отказ"
        ) from exc

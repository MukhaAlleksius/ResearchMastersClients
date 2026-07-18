import logging
from fastapi import APIRouter, Depends, HTTPException


from core.auth import ensure_same_user, get_current_admin_user, get_current_user
from core.config import get_db

from sqlalchemy.ext.asyncio import AsyncSession

from cruds.orders.create_orders import (
    add_date_start_execute_order,
    add_executor_order,
    add_information_about_customer,
    add_information_about_executor,
    add_order_customer_cancel,
    add_order_executor_cancel,
    add_order_response_executor,
    add_order_user,
    add_status_order_customer,
    add_status_order_executor,
    add_verdict_admin_cancel_customer,
)


from schemas.orders_schemas import (
    CustomerOrderCancellationCreateSchema,
    ExecutorOrderCancellationCreateSchema,
    ExecutorOrderSchema,
    GraphicOrderMasterCreate,
    InformationAboutCustomerSchema,
    InformationAboutExecutorSchema,
    OrderCreateSchema,
    OrderResponseExecutorSchema,
    StatusOrderCustomerSchema,
    StatusOrderExecutorSchema,
)
from schemas.users_schemas import UserCommonSchema
from models.orders_models import Order

router = APIRouter(prefix="", tags=["users"])

logger = logging.getLogger(__name__)


async def ensure_can_modify_executor_status(
    db: AsyncSession,
    current_user: UserCommonSchema,
    *,
    order_id: int,
    executor_id: int,
) -> None:
    """Исполнитель меняет свой статус или заказчик предлагает заказ мастеру."""
    if current_user.user_id == executor_id:
        return

    order = await db.get(Order, order_id)
    if order and order.customer_id == current_user.user_id:
        return

    raise HTTPException(status_code=403, detail="Access denied")


@router.post("/add_order_user")
async def add_order_user_api(
    order_schema: OrderCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, order_schema.customer_id)
    try:
        order = await add_order_user(db=db, order_schema=order_schema)
        if order is None:
            # Можно вернуть, например, 409 Conflict если заказ уже существует
            raise HTTPException(status_code=409, detail="Заказ уже существует")
        return order  # Возвращаем созданный объект заказ клиенту
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")


@router.post("/add_status_order_customer")
async def add_status_order_customer_api(
    status_order_customer_schema: StatusOrderCustomerSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, status_order_customer_schema.customer_id)
    try:
        order = await add_status_order_customer(
            db=db, status_order_customer_schema=status_order_customer_schema
        )
        if order is None:
            # Можно вернуть, например, 409 Conflict если заказ уже существует
            raise HTTPException(status_code=409, detail="Заказ уже существует")
        return order  # Возвращаем созданный объект заказ клиенту
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")


# метод для добавления статуса заказа относительно исполнителя
@router.post("/add_status_order_executor")
async def add_status_order_executor_api(
    status_order_executor_schema: StatusOrderExecutorSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    await ensure_can_modify_executor_status(
        db,
        current_user,
        order_id=status_order_executor_schema.order_id,
        executor_id=status_order_executor_schema.executor_id,
    )
    try:
        status_obj = await add_status_order_executor(
            db=db,
            status_order_executor_schema=status_order_executor_schema,
        )

        if status_obj is None:
            raise HTTPException(
                status_code=409,
                detail="Статус для этого заказа и исполнителя уже существует",
            )

        return {
            "id": status_obj.id,
            "order_id": status_obj.order_id,
            "executor_id": status_obj.executor_id,
            "status": status_obj.status,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка в add_status_order_executor_api")  # ВАЖНО
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


# добавляем заказ для исполнителя на его рассмотрение
@router.post("/add_executor_order")
async def add_executor_order_api(
    executor_order: ExecutorOrderSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    await ensure_can_modify_executor_status(
        db,
        current_user,
        order_id=executor_order.order_id,
        executor_id=executor_order.executor_id,
    )
    try:
        order = await add_executor_order(db=db, executor_order_schema=executor_order)
        if order is None:
            # Можно вернуть, например, 409 Conflict если заказ уже существует
            raise HTTPException(status_code=409, detail="Заказ уже существует")
        return order  # Возвращаем созданный объект заказ клиенту
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")


# добавляем ответ исполнителя на предложенный заказ
@router.post("/add_order_response_executor")
async def add_order_response_executor_api(
    order_response_executor_schema: OrderResponseExecutorSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, order_response_executor_schema.executor_id)
    try:
        return await add_order_response_executor(
            db=db, order_response_executor_schema=order_response_executor_schema
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка в add_order_response_executor_api")
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


# добавляем отказ от заказа от заказчика
@router.post("/order/{order_id}/customer_cancel")
async def add_order_customer_cancel_api(
    customer_order_cancel_schema: CustomerOrderCancellationCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, customer_order_cancel_schema.customer_id)
    try:
        customer_order_cancel = await add_order_customer_cancel(
            db=db, customer_order_cancel_schema=customer_order_cancel_schema
        )
        if customer_order_cancel is None:
            # Можно вернуть, например, 409 Conflict если отказ от заказа уже существует
            raise HTTPException(
                status_code=409, detail="Отказ от заказа уже существует"
            )
        return customer_order_cancel  # Возвращаем созданный объект заказ клиенту
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")


# добавляем отказ от заказа от исполнителя
@router.post("/order/{order_id}/executor_cancel")
async def add_order_executor_cancel_api(
    executor_order_cancel_schema: ExecutorOrderCancellationCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, executor_order_cancel_schema.executor_id)
    try:
        executor_order_cancel = await add_order_executor_cancel(
            db=db, executor_order_cancel_schema=executor_order_cancel_schema
        )
        if executor_order_cancel is None:
            # Можно вернуть, например, 409 Conflict если отказ от заказа уже существует
            raise HTTPException(
                status_code=409, detail="Отказ от заказа уже существует"
            )
        return executor_order_cancel  # Возвращаем созданный объект заказ клиенту
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")


@router.post("/admin/add_verdict_cancel_customer")
async def add_verdict_admin_cancel_customer_api(
    schema: CustomerOrderCancellationCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        saved = await add_verdict_admin_cancel_customer(db=db, schema=schema)
        return saved
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"API error for add_verdict_admin_cancel_customer : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/add_date_start_execute_order/{user_id}")
async def add_date_start_execute_order_api(
    user_id: int,
    date_start_execute_order_schema: GraphicOrderMasterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    ensure_same_user(current_user, date_start_execute_order_schema.user_id)
    try:

        date_start_execute_order = await add_date_start_execute_order(
            db=db, date_start_execute_order_schema=date_start_execute_order_schema
        )

        return date_start_execute_order

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"API error for add_date_start_execute_order : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/add_information_about_customer")
async def add_information_about_customer_api(
    information_about_customer_schema: InformationAboutCustomerSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, information_about_customer_schema.executor_id)
    try:

        information_about_customer = await add_information_about_customer(
            db=db, information_about_customer_schema=information_about_customer_schema
        )

        return information_about_customer

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"API error for add_information_about_customer_api : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/add_information_about_executor")
async def add_information_about_executor_api(
    information_about_executor_schema: InformationAboutExecutorSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, information_about_executor_schema.customer_id)
    try:

        information_about_executor = await add_information_about_executor(
            db=db, information_about_executor_schema=information_about_executor_schema
        )

        return information_about_executor

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"API error for add_information_about_executor_api : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

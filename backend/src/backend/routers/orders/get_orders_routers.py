import logging
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query


from core.config import get_db
from core.access import (
    assert_can_read_order,
    assert_can_view_executor_profile,
)
from core.auth import (
    ensure_same_user,
    get_current_admin_user,
    get_current_user,
    get_optional_current_user,
)

from sqlalchemy.ext.asyncio import AsyncSession


from cruds.orders.read_orders import (
    get_cancel_order_customer_for_admin,
    get_cancel_orders_customers_for_admin,
    get_customer_order_cancel,
    get_dates_start_execute_orders,
    get_executor_order,
    get_executor_order_cancel,
    get_information_about_customer,
    get_information_about_execute_order,
    get_information_about_executor,
    get_customer_executors_list,
    get_executor_customers_list,
    get_order,
    get_order_profile_for_admin,
    can_view_order_executor_response,
    get_order_response_executor,
    get_order_responses_executors,
    get_orders_count_for_period,
    get_orders_customer,
    get_orders_customer_admin,
    get_orders_customers,
    get_service_profile_for_admin,
    get_services_executor,
    get_services_executor_admin,
)

from models.payments_models import ExecutorBankAccount, Payment
from models.users_models import User
from cruds.orders.order_activity import get_order_activity_for_viewer
from schemas.pagination_schemas import PaginatedResponse
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
    OrderActivitySignals,
    OrderCardForAdmin,
    OrderProfileForAdmin,
    OrderReadSchema,
    OrderResponseExecutorReadSchema,
    OrderUserSchema,
    ServiceProfileForAdmin,
    ServiceUserSchema,
)
from schemas.users_schemas import UserCommonSchema

router = APIRouter(prefix="", tags=["users"])

logger = logging.getLogger(__name__)


@router.get("/executor_order/{order_id}", response_model=ExecutorOrderSchema)
async def get_executor_order_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        executor_order = await get_executor_order(db=db, order_id=order_id)
        if not executor_order:
            raise HTTPException(status_code=409, detail="У пользователя нет заказов")
        return executor_order
    except Exception as e:

        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


@router.get("/orders_customer", response_model=list[OrderUserSchema])
async def get_orders_customer_api(
    exclude_offered_to_executor_id: Optional[int] = Query(
        None,
        description="Исключить заказы, уже предложенные этому исполнителю",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        orders_customer = await get_orders_customer(
            db=db,
            user_id=current_user.user_id,
            exclude_offered_to_executor_id=exclude_offered_to_executor_id,
        )
        return orders_customer
    except Exception as e:
        # Логируем полную причину ошибки с трейсбеком
        logger.error(
            f"Ошибка при получении заказов пользователя {current_user.user_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


@router.get("/orders_count")
async def get_orders_count_api(
    start_date: Optional[str] = Query(
        None, description="Дата начала периода (ISO формат)"
    ),
    end_date: Optional[str] = Query(
        None, description="Дата окончания периода (ISO формат)"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    """
    Эндпоинт для получения количества заказов за указанный период.
    Может использоваться в аналитике (как общая статистика или по конкретному пользователю).
    """
    try:
        count = await get_orders_count_for_period(
            db=db,
            user_id=current_user.user_id,
            start_date=start_date,
            end_date=end_date,
        )
        return {"count": count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"API error get_orders_count user_id={current_user.user_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Внутренняя ошибка сервера при подсчёте заказов",
        )


@router.get("/services_executor", response_model=list[ServiceUserSchema])
async def get_services_executor_api(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        services_executor = await get_services_executor(
            db=db, user_id=current_user.user_id
        )
        return services_executor
    except HTTPException as e:
        logger.error(
            f"HTTP ошибка при получении услуг пользователя {current_user.user_id}: {e}",
            exc_info=True,
        )
        raise
    except Exception as e:
        logger.error(
            f"Неожиданная ошибка при получении услуг пользователя {current_user.user_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/order/{order_id}", response_model=OrderReadSchema)
async def get_order_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    """Каталог — без входа; прочие заказы — только участники."""
    try:
        await assert_can_read_order(
            db, order_id=order_id, current_user=current_user
        )
        order = await get_order(db=db, order_id=order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        return order
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Ошибка при получении заказа %s: %s", order_id, e, exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/order/{order_id}/activity", response_model=OrderActivitySignals)
async def get_order_activity_api(
    order_id: int,
    role: Literal["customer", "executor"] = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        return await get_order_activity_for_viewer(
            db=db,
            order_id=order_id,
            viewer_id=current_user.user_id,
            role=role,
        )
    except Exception as e:
        logger.error(
            f"Ошибка при получении activity заказа {order_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


# предоставления информации заказчику об ответе на заказ всех исполнителей
@router.get(
    "/order_responses_executors/{order_id}",
    response_model=list[OrderResponseExecutorReadSchema],
)
async def get_order_responses_executors_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        return await get_order_responses_executors(db=db, order_id=order_id)
    except Exception as e:
        # Логируем полную причину ошибки с трейсбеком
        logger.error(
            f"Ошибка при получении услуг пользователя {order_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


# предоставление информации об ответе исполнителя на заказ
@router.get(
    "/order_response_executor/{user_id}/{order_id}",
    response_model=OrderResponseExecutorReadSchema,
)
async def get_order_response_executor_api(
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        allowed = await can_view_order_executor_response(
            db=db,
            viewer_id=current_user.user_id,
            order_id=order_id,
            executor_id=user_id,
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="Access denied")

        return await get_order_response_executor(
            db=db, user_id=user_id, order_id=order_id
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Ошибка при получении ответа исполнителя order_id={order_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")


# предоставление информации о заказах при поиске заказов пользователями
@router.get("/orders_customers", response_model=PaginatedResponse[OrderReadSchema])
async def get_orders_customers_api(
    category_work_slug: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    town: Optional[str] = Query(None),
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(12, ge=1, le=100, description="Размер страницы"),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    """
    Каталог заказов клиентов.
    Всегда возвращает список (даже если он пустой), без 409 ошибки.
    Свои заказы у текущего пользователя в каталоге не показываются.
    """
    try:
        orders_customers, total = await get_orders_customers(
            db=db,
            category_work_slug=category_work_slug,
            country=country,
            region=region,
            town=town,
            page=page,
            page_size=page_size,
            exclude_customer_id=current_user.user_id if current_user else None,
        )
        return PaginatedResponse.create(
            orders_customers, total, page, page_size
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка в orders_customers_api: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/orders_customer_admin", response_model=list[OrderCardForAdmin])
async def get_orders_customer_admin_api(
    user_id: Optional[int] = Query(None, description="ID пользователя"),
    category_work_slug: Optional[str] = Query(None, description="Слаг категории работ"),
    country: Optional[str] = Query(None, description="Страна"),
    region: Optional[str] = Query(None, description="Регион"),
    town: Optional[str] = Query(None, description="Город"),
    status_order: Optional[str] = Query(None, description="Статус заказа"),
    budget_from: Optional[float] = Query(None, description="Минимальный бюджет"),
    budget_to: Optional[float] = Query(None, description="Максимальный бюджет"),
    start_date_orders: Optional[str] = Query(
        None, description="Дата начала (ISO формат)"
    ),
    end_date_orders: Optional[str] = Query(
        None, description="Дата окончания (ISO формат)"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        orders = await get_orders_customer_admin(
            db=db,
            user_id=user_id,
            category_work_slug=category_work_slug,
            country=country,
            region=region,
            town=town,
            status_order=status_order,
            budget_from=budget_from,
            budget_to=budget_to,
            start_date_orders=start_date_orders,
            end_date_orders=end_date_orders,
        )
        return orders
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"API error for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/services_executor_admin", response_model=list[OrderCardForAdmin])
async def get_services_executor_admin_api(
    user_id: Optional[int] = Query(None, description="ID пользователя"),
    category_work_slug: Optional[str] = Query(None, description="Слаг категории работ"),
    country: Optional[str] = Query(None, description="Страна"),
    region: Optional[str] = Query(None, description="Регион"),
    town: Optional[str] = Query(None, description="Город"),
    status_service: Optional[str] = Query(None, description="Статус услуги"),
    budget_from: Optional[float] = Query(None, description="Минимальный бюджет"),
    budget_to: Optional[float] = Query(None, description="Максимальный бюджет"),
    start_date_orders: Optional[str] = Query(
        None, description="Дата начала (ISO формат)"
    ),
    end_date_orders: Optional[str] = Query(
        None, description="Дата окончания (ISO формат)"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        services = await get_services_executor_admin(
            db=db,
            user_id=user_id,
            category_work_slug=category_work_slug,
            country=country,
            region=region,
            town=town,
            status_service=status_service,
            budget_from=budget_from,
            budget_to=budget_to,
            start_date_orders=start_date_orders,
            end_date_orders=end_date_orders,
        )
        return services
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"API error for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/order_profile_for_admin/{order_id}", response_model=OrderProfileForAdmin)
async def get_order_profile_for_admin_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        order_profile = await get_order_profile_for_admin(db=db, order_id=order_id)
        if not order_profile:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        return order_profile
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"API error for order {order_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get(
    "/service_profile_for_admin/{service_id}", response_model=ServiceProfileForAdmin
)
async def get_order_profile_for_admin_api(
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        service_profile = await get_service_profile_for_admin(
            db=db, service_id=service_id
        )
        if not service_profile:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        return service_profile
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"API error for service {service_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


# получить информацию из базы данных об отмене заказа зазказчиком
@router.get(
    "/order/{order_id}/customer_order_cancel",
    response_model=CustomerOrderCancellationReadSchema,
)
async def get_customer_order_cancel_api(
    order_id: int,
    executor_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        customer_order_cancel = await get_customer_order_cancel(
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
            executor_id=executor_id,
        )
        if not customer_order_cancel:
            raise HTTPException(
                status_code=404, detail="Заявка на отмену заказчиком не найдена"
            )
        return customer_order_cancel
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"API error for service {customer_order_cancel}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


# получить информацию из базы данных об отмене заказа исполнителем
@router.get(
    "/order/{order_id}/executor_order_cancel",
    response_model=ExecutorOrderCancellationReadSchema,
)
async def get_executor_order_cancel_api(
    order_id: int,
    customer_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        executor_order_cancel = await get_executor_order_cancel(
            db=db,
            order_id=order_id,
            customer_id=customer_id,
            executor_id=current_user.user_id,
        )
        if not executor_order_cancel:
            raise HTTPException(
                status_code=404, detail="Заявка на отмену заказчиком не найдена"
            )
        return executor_order_cancel
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"API error for service {executor_order_cancel}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


# получить все отказы для администратора, которые были не подтверждены оппонентами
@router.get(
    "/admin/cancel_orders_customers",
    response_model=list[CancelOrderCustomerForAdminRead],
)
async def get_cancel_orders_customers_for_admin_api(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        cancel_orders_customers = await get_cancel_orders_customers_for_admin(db=db)
        return cancel_orders_customers or []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"API error for cancel_orders_customers : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


# получить отказ для администратора от заказчика
@router.get(
    "/admin/cancel_order_customer/{cancel_order_customer_id}",
    response_model=Optional[CustomerOrderCancellationReadSchema],
)
async def get_cancel_orders_customers_for_admin_api(
    cancel_order_customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        cancel_order_customer = await get_cancel_order_customer_for_admin(
            db=db, cancel_order_customer_id=cancel_order_customer_id
        )
        if not cancel_order_customer:
            raise HTTPException(status_code=404, detail="Отказ не найден")
        return cancel_order_customer
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"API error for cancel_orders_customers : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get(
    "/graphic_orders_master/{user_id}", response_model=list[GraphicOrderMasterRead]
)
async def get_graphic_orders_master_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    try:
        graphic_orders_master = await get_dates_start_execute_orders(
            db=db, user_id=current_user.user_id
        )
        return graphic_orders_master
    except HTTPException as e:
        logger.error(
            f"HTTP ошибка при получении услуг пользователя {user_id}: {e}",
            exc_info=True,
        )
        raise
    except Exception as e:
        logger.error(
            f"Неожиданная ошибка при получении услуг пользователя {user_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get(
    "/information_about_customer/{executor_id}/{customer_id}",
    response_model=Optional[InformationAboutCustomerRead],
)
async def get_information_about_customer_api(
    executor_id: int,
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, executor_id)
    try:
        information_about_customer = await get_information_about_customer(
            db=db, executor_id=executor_id, customer_id=customer_id
        )
        return information_about_customer if information_about_customer else None
    except HTTPException as e:
        logger.error(
            f"HTTP ошибка при получении информации о заказчике {customer_id}: {e}",
            exc_info=True,
        )
        raise
    except Exception as e:
        logger.error(
            f"Неожиданная ошибка при получении информации о заказчике {customer_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get(
    "/customer_executors/{customer_id}",
    response_model=list[CustomerExecutorListItemSchema],
)
async def get_customer_executors_list_api(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, customer_id)
    try:
        return await get_customer_executors_list(db=db, customer_id=customer_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Ошибка получения списка исполнителей customer_id=%s: %s",
            customer_id,
            e,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get(
    "/executor_customers/{executor_id}",
    response_model=list[ExecutorCustomerListItemSchema],
)
async def get_executor_customers_list_api(
    executor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, executor_id)
    try:
        return await get_executor_customers_list(db=db, executor_id=executor_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Ошибка получения списка заказчиков executor_id=%s: %s",
            executor_id,
            e,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get(
    "/information_about_executor/{customer_id}/{executor_id}",
    response_model=Optional[InformationAboutExecutorRead],
)
async def get_information_about_executor_api(
    executor_id: int,
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, customer_id)
    try:
        information_about_executor = await get_information_about_executor(
            db=db, executor_id=executor_id, customer_id=customer_id
        )
        return information_about_executor if information_about_executor else None
    except HTTPException as e:
        logger.error(
            f"HTTP ошибка при получении информации об исполнителе {executor_id}: {e}",
            exc_info=True,
        )
        raise
    except Exception as e:
        logger.error(
            f"Неожиданная ошибка при получении информации об исполнителе {executor_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get(
    "/information_about_execute_order/{user_id}/{order_id}",
    response_model=InformationAboutExecuteOrderRead,
)
async def get_information_about_execute_order_api(
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    try:
        return await get_information_about_execute_order(
            db=db,
            user_id=current_user.user_id,
            order_id=order_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Неожиданная ошибка information_about_execute_order "
            f"user_id={user_id} order_id={order_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

import logging  # Стандартное логирование
from fastapi import APIRouter, Depends, HTTPException  # FastAPI: роутер, DI, HTTP-ошибки


from core.auth import ensure_same_user, get_current_admin_user, get_current_user  # Авторизация и проверка пользователя
from core.config import get_db  # Зависимость сессии БД

from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия SQLAlchemy

from cruds.orders.create_orders import (  # CRUD: создание заказов и связанных сущностей
    add_date_start_execute_order,
    add_executor_order,
    add_information_about_customer,
    add_information_about_executor,
    add_order_customer_cancel,
    add_order_executor_cancel,
    add_order_response_executor,
    add_order_review,
    add_order_user,
    add_status_order_customer,
    add_status_order_executor,
    add_verdict_admin_cancel_customer,
)


from schemas.orders_schemas import (  # Pydantic-схемы заказов
    CustomerOrderCancellationCreateSchema,
    ExecutorOrderCancellationCreateSchema,
    ExecutorOrderSchema,
    GraphicOrderMasterCreate,
    InformationAboutCustomerSchema,
    InformationAboutExecutorSchema,
    OrderCreateSchema,
    OrderResponseExecutorSchema,
    ReviewCreateSchema,
    ReviewReadSchema,
    StatusOrderCustomerSchema,
    StatusOrderExecutorSchema,
)
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя
from models.orders_models import Order  # ORM-модель заказа

router = APIRouter(prefix="", tags=["users"])  # Роутер POST-эндпоинтов заказов

logger = logging.getLogger(__name__)  # Логгер модуля


async def ensure_can_modify_executor_status(  # Проверка права менять статус исполнителя
    db: AsyncSession,
    current_user: UserCommonSchema,
    *,
    order_id: int,
    executor_id: int,
) -> None:
    """Исполнитель меняет свой статус или заказчик предлагает заказ мастеру."""
    if current_user.user_id == executor_id:  # Сам исполнитель — доступ разрешён
        return

    order = await db.get(Order, order_id)  # Загружаем заказ для проверки заказчика
    if order and order.customer_id == current_user.user_id:  # Заказчик этого заказа — доступ разрешён
        return

    raise HTTPException(status_code=403, detail="Access denied")  # Иначе запрет


@router.post("/add_order_user")  # POST: создание заказа заказчиком
async def add_order_user_api(
    order_schema: OrderCreateSchema,  # Данные нового заказа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, order_schema.customer_id)  # Только сам заказчик создаёт заказ
    try:
        order = await add_order_user(db=db, order_schema=order_schema)  # Сохраняем заказ в БД
        if order is None:
            # Можно вернуть, например, 409 Conflict если заказ уже существует
            raise HTTPException(status_code=409, detail="Заказ уже существует")
        return order  # Возвращаем созданный объект заказ клиенту
    except Exception as e:  # Неожиданная ошибка
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")  # 500 клиенту


@router.post("/add_status_order_customer")  # POST: статус заказа со стороны заказчика
async def add_status_order_customer_api(
    status_order_customer_schema: StatusOrderCustomerSchema,  # Данные статуса
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, status_order_customer_schema.customer_id)  # Только сам заказчик
    try:
        order = await add_status_order_customer(  # Сохраняем статус в БД
            db=db, status_order_customer_schema=status_order_customer_schema
        )
        if order is None:
            # Можно вернуть, например, 409 Conflict если заказ уже существует
            raise HTTPException(status_code=409, detail="Заказ уже существует")
        return order  # Возвращаем созданный объект заказ клиенту
    except Exception as e:  # Неожиданная ошибка
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")  # 500 клиенту


# метод для добавления статуса заказа относительно исполнителя
@router.post("/add_status_order_executor")  # POST: статус заказа со стороны исполнителя
async def add_status_order_executor_api(
    status_order_executor_schema: StatusOrderExecutorSchema,  # Данные статуса
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    await ensure_can_modify_executor_status(  # Исполнитель или заказчик этого заказа
        db,
        current_user,
        order_id=status_order_executor_schema.order_id,
        executor_id=status_order_executor_schema.executor_id,
    )
    try:
        status_obj = await add_status_order_executor(  # Сохраняем статус в БД
            db=db,
            status_order_executor_schema=status_order_executor_schema,
        )

        if status_obj is None:  # Статус для пары заказ–исполнитель уже есть
            raise HTTPException(
                status_code=409,
                detail="Статус для этого заказа и исполнителя уже существует",
            )

        return {  # Отдаём ключевые поля созданного статуса
            "id": status_obj.id,
            "order_id": status_obj.order_id,
            "executor_id": status_obj.executor_id,
            "status": status_obj.status,
        }

    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.exception("Ошибка в add_status_order_executor_api")  # ВАЖНО
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # 500 клиенту


# добавляем заказ для исполнителя на его рассмотрение
@router.post("/add_executor_order")  # POST: предложение заказа исполнителю
async def add_executor_order_api(
    executor_order: ExecutorOrderSchema,  # Связь заказ–исполнитель
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    await ensure_can_modify_executor_status(  # Исполнитель или заказчик этого заказа
        db,
        current_user,
        order_id=executor_order.order_id,
        executor_id=executor_order.executor_id,
    )
    try:
        order = await add_executor_order(db=db, executor_order_schema=executor_order)  # Сохраняем в БД
        if order is None:
            # Можно вернуть, например, 409 Conflict если заказ уже существует
            raise HTTPException(status_code=409, detail="Заказ уже существует")
        return order  # Возвращаем созданный объект заказ клиенту
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")  # 500 клиенту


# добавляем ответ исполнителя на предложенный заказ
@router.post("/add_order_response_executor")  # POST: ответ исполнителя на заказ
async def add_order_response_executor_api(
    order_response_executor_schema: OrderResponseExecutorSchema,  # Данные ответа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, order_response_executor_schema.executor_id)  # Только сам исполнитель
    try:
        return await add_order_response_executor(  # Сохраняем ответ в БД
            db=db, order_response_executor_schema=order_response_executor_schema
        )
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.exception("Ошибка в add_order_response_executor_api")  # Лог с трейсбеком
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # 500 клиенту


# добавляем отказ от заказа от заказчика
@router.post("/order/{order_id}/customer_cancel")  # POST: заявка заказчика на отказ
async def add_order_customer_cancel_api(
    customer_order_cancel_schema: CustomerOrderCancellationCreateSchema,  # Данные отказа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, customer_order_cancel_schema.customer_id)  # Только сам заказчик
    try:
        customer_order_cancel = await add_order_customer_cancel(  # Сохраняем отказ в БД
            db=db, customer_order_cancel_schema=customer_order_cancel_schema
        )
        if customer_order_cancel is None:
            # Можно вернуть, например, 409 Conflict если отказ от заказа уже существует
            raise HTTPException(
                status_code=409, detail="Отказ от заказа уже существует"
            )
        return customer_order_cancel  # Возвращаем созданный объект заказ клиенту
    except Exception as e:  # Неожиданная ошибка
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")  # 500 клиенту


# добавляем отказ от заказа от исполнителя
@router.post("/order/{order_id}/executor_cancel")  # POST: заявка исполнителя на отказ
async def add_order_executor_cancel_api(
    executor_order_cancel_schema: ExecutorOrderCancellationCreateSchema,  # Данные отказа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, executor_order_cancel_schema.executor_id)  # Только сам исполнитель
    try:
        executor_order_cancel = await add_order_executor_cancel(  # Сохраняем отказ в БД
            db=db, executor_order_cancel_schema=executor_order_cancel_schema
        )
        if executor_order_cancel is None:
            # Можно вернуть, например, 409 Conflict если отказ от заказа уже существует
            raise HTTPException(
                status_code=409, detail="Отказ от заказа уже существует"
            )
        return executor_order_cancel  # Возвращаем созданный объект заказ клиенту
    except Exception as e:  # Неожиданная ошибка
        raise HTTPException(status_code=500, detail=f"Ошибка сервера {e}")  # 500 клиенту


@router.post("/admin/add_verdict_cancel_customer")  # POST: вердикт админа по отказу заказчика
async def add_verdict_admin_cancel_customer_api(
    schema: CustomerOrderCancellationCreateSchema,  # Данные вердикта
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только администратор
):
    try:
        saved = await add_verdict_admin_cancel_customer(db=db, schema=schema)  # Сохраняем вердикт
        return saved  # Возвращаем сохранённую запись
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"API error for add_verdict_admin_cancel_customer : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.post("/add_date_start_execute_order/{user_id}")  # POST: дата начала выполнения заказа
async def add_date_start_execute_order_api(
    user_id: int,  # ID пользователя из URL
    date_start_execute_order_schema: GraphicOrderMasterCreate,  # Дата и параметры графика
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, user_id)  # URL должен совпадать с текущим пользователем
    ensure_same_user(current_user, date_start_execute_order_schema.user_id)  # user_id в теле — тот же пользователь
    try:

        date_start_execute_order = await add_date_start_execute_order(  # Сохраняем дату в БД
            db=db, date_start_execute_order_schema=date_start_execute_order_schema
        )

        return date_start_execute_order  # Возвращаем созданную запись

    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"API error for add_date_start_execute_order : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.post("/add_information_about_customer")  # POST: информация об заказчике от исполнителя
async def add_information_about_customer_api(
    information_about_customer_schema: InformationAboutCustomerSchema,  # Данные о заказчике
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, information_about_customer_schema.executor_id)  # Только сам исполнитель
    try:

        information_about_customer = await add_information_about_customer(  # Сохраняем в БД
            db=db, information_about_customer_schema=information_about_customer_schema
        )

        return information_about_customer  # Возвращаем созданную запись

    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"API error for add_information_about_customer_api : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.post("/add_information_about_executor")  # POST: информация об исполнителе от заказчика
async def add_information_about_executor_api(
    information_about_executor_schema: InformationAboutExecutorSchema,  # Данные об исполнителе
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, information_about_executor_schema.customer_id)  # Только сам заказчик
    try:

        information_about_executor = await add_information_about_executor(  # Сохраняем в БД
            db=db, information_about_executor_schema=information_about_executor_schema
        )

        return information_about_executor  # Возвращаем созданную запись

    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"API error for add_information_about_executor_api : {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.post("/order/{order_id}/review", response_model=ReviewReadSchema)  # POST: отзыв по заказу
async def add_order_review_api(
    order_id: int,  # ID заказа из URL
    schema: ReviewCreateSchema,  # Данные отзыва
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    try:
        review = await add_order_review(  # Сохраняем отзыв в БД
            db=db,
            order_id=order_id,
            reviewer_id=current_user.user_id,
            schema=schema,
        )
        return review  # Возвращаем созданный отзыв
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"API error for add_order_review order_id={order_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту

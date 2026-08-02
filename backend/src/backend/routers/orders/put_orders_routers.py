import logging  # Стандартное логирование
from fastapi import APIRouter, Depends, HTTPException  # FastAPI: роутер, DI, HTTP-ошибки


from core.auth import ensure_same_user, get_current_user  # Проверка пользователя и текущая сессия
from core.config import get_db  # Зависимость сессии БД

from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия SQLAlchemy


from cruds.orders.create_orders import update_order_review  # CRUD: обновление отзыва по заказу
from cruds.orders.update_orders import (  # CRUD: обновление заказов и решений сторон
    put_customer_decision,
    put_executor_decision,
    update_order_customer,
    update_order_response_executor,
)
from schemas.orders_schemas import (  # Pydantic-схемы заказов
    CustomerDecisionSchema,
    ExecutorDecisionSchema,
    OrderReadSchema,
    OrderResponseExecutorSchema,
    OrderUpdateSchema,
    ReviewCreateSchema,
    ReviewReadSchema,
)
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя

router = APIRouter(prefix="", tags=["users"])  # Роутер PUT-эндпоинтов заказов

logger = logging.getLogger(__name__)  # Логгер модуля


# обновление информации о заказе
@router.put(  # PUT: обновление данных заказа заказчиком
    "/update_order_customer/{user_id}/{order_id}",
    response_model=OrderReadSchema,
)
async def update_order_customer_api(
    order_customer: OrderUpdateSchema,  # Тело запроса с новыми данными заказа
    user_id: int,  # ID пользователя из URL
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, user_id)  # URL должен совпадать с текущим пользователем
    ensure_same_user(current_user, order_customer.customer_id)  # Заказчик в теле — тот же пользователь
    try:
        return await update_order_customer(  # Сохраняем изменения заказа в БД
            db=db,
            order_customer=order_customer,
            user_id=current_user.user_id,
            order_id=order_id,
        )
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # Пишем в лог с трейсбеком
            f"Ошибка при обновлении заказа {order_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # 500 клиенту


# обновление информации об ответе пользователя на заказ
@router.put(  # PUT: правка ответа исполнителя на заказ
    "/update_order_response_executor/{user_id}/{order_id}",
)
async def update_order_response_executor_api(
    order_response_executor: OrderResponseExecutorSchema,  # Новые данные ответа исполнителя
    user_id: int,  # ID пользователя из URL
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, user_id)  # URL должен совпадать с текущим пользователем
    ensure_same_user(current_user, order_response_executor.executor_id)  # Исполнитель в теле — тот же пользователь
    try:
        order_responses_executors = await update_order_response_executor(  # Обновляем ответ в БД
            db=db,
            order_response_executor=order_response_executor,
            user_id=current_user.user_id,
            order_id=order_id,
        )
        if not order_responses_executors:  # Запись ответа не найдена
            raise HTTPException(
                status_code=409, detail="Ответа исполнителя на заказ не существует"
            )
        return order_responses_executors  # Возвращаем обновлённый ответ
    except Exception as e:  # Любая ошибка (HTTPException тоже попадёт сюда)
        # Логируем полную причину ошибки с трейсбеком
        logger.error(
            f"Ошибка при получении услуг пользователя {order_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # 500 клиенту


# обновляем запись отказа исполнителя от закзаза ответом заказчика
@router.put("/order/{order_id}/customer_decision")  # PUT: решение заказчика по отказу исполнителя
async def put_customer_decision_api(
    customer_decision: CustomerDecisionSchema,  # Решение заказчика
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, customer_decision.customer_id)  # Только сам заказчик
    try:

        customer_decision = await put_customer_decision(  # Сохраняем решение в БД
            db=db, customer_decision_schema=customer_decision
        )

        return customer_decision  # Возвращаем сохранённое решение

    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for service {customer_decision}: {e}", exc_info=True)  # Лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


# обновляем запись отказа заказчика от закзаза ответом исполнителя
@router.put("/order/{order_id}/executor_decision")  # PUT: решение исполнителя по отказу заказчика
async def put_customer_decision_api(
    executor_decision: ExecutorDecisionSchema,  # Решение исполнителя
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    ensure_same_user(current_user, executor_decision.executor_id)  # Только сам исполнитель
    try:

        executor_decision = await put_executor_decision(  # Сохраняем решение в БД
            db=db, executor_decision_schema=executor_decision
        )

        return executor_decision  # Возвращаем сохранённое решение

    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for service {executor_decision}: {e}", exc_info=True)  # Лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.put("/order/{order_id}/review", response_model=ReviewReadSchema)  # PUT: обновление отзыва
async def update_order_review_api(
    order_id: int,  # ID заказа из URL
    schema: ReviewCreateSchema,  # Новые данные отзыва
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    try:
        return await update_order_review(  # Обновляем отзыв в БД
            db=db,
            order_id=order_id,
            reviewer_id=current_user.user_id,
            schema=schema,
        )
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"API error for update_order_review order_id={order_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту

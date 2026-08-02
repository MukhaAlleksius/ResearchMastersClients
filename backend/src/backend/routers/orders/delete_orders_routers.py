import logging  # Стандартное логирование

from fastapi import APIRouter, Depends, HTTPException, Query  # FastAPI: роутер, DI, ошибки, query-параметры
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия SQLAlchemy

from core.auth import get_current_user  # Текущий авторизованный пользователь
from core.config import get_db  # Зависимость сессии БД
from cruds.orders.delete_orders import (  # CRUD: удаление и отмена операций по заказам
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
from schemas.orders_schemas import (  # Pydantic-схемы ответов delete-операций
    CustomerExecutorDeleteResponseSchema,
    ExecutorCustomerDeleteResponseSchema,
    ExecutorServiceDeleteEligibilitySchema,
    ExecutorServiceDeleteResponseSchema,
    OrderCancellationWithdrawResponseSchema,
    OrderClearAfterExecutorRefusalEligibilitySchema,
    OrderClearAfterExecutorRefusalResponseSchema,
    OrderDeleteResponseSchema,
)
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя

router = APIRouter(prefix="", tags=["orders"])  # Роутер delete/get/post очистки заказов

logger = logging.getLogger(__name__)  # Логгер модуля


@router.delete("/order/{order_id}", response_model=OrderDeleteResponseSchema)  # DELETE: заказчик удаляет заказ
async def delete_order_by_customer_api(
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный заказчик
):
    try:
        return await delete_order_by_customer(  # Удаляем заказ от имени заказчика
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
        )
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as exc:  # Неожиданная ошибка
        logger.error(  # Лог с контекстом заказа и заказчика
            "delete_order_by_customer error order_id=%s customer_id=%s: %s",
            order_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка удаления заказа") from exc  # 500 клиенту


@router.get(  # GET: можно ли очистить заказ после отказа исполнителя
    "/order/{order_id}/clear_after_executor_refusal_eligibility",
    response_model=OrderClearAfterExecutorRefusalEligibilitySchema,
)
async def clear_after_executor_refusal_eligibility_api(
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный заказчик
):
    try:
        can_clear = await can_clear_order_after_executor_refusal(  # Проверяем условия очистки
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
        )
        return {"can_clear": can_clear}  # Флаг доступности очистки
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as exc:  # Неожиданная ошибка
        logger.error(
            "clear_after_executor_refusal_eligibility error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка проверки заказа") from exc  # 500 клиенту


@router.post(  # POST: очистка данных заказа после отказа исполнителя
    "/order/{order_id}/clear_after_executor_refusal",
    response_model=OrderClearAfterExecutorRefusalResponseSchema,
)
async def clear_order_after_executor_refusal_api(
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный заказчик
):
    try:
        result = await clear_order_data_after_executor_refusal(  # Очищаем связанные данные заказа
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
        )
        await db.commit()  # Фиксируем транзакцию
        return result  # Возвращаем результат очистки
    except HTTPException:  # Бизнес-ошибка — откатываем и пробрасываем
        await db.rollback()
        raise
    except Exception as exc:  # Неожиданная ошибка — откатываем
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
        ) from exc  # 500 клиенту


@router.get(  # GET: можно ли исполнителю удалить свою услугу по заказу
    "/order/{order_id}/executor_service_delete_eligibility",
    response_model=ExecutorServiceDeleteEligibilitySchema,
)
async def executor_service_delete_eligibility_api(
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    try:
        can_delete = await can_executor_delete_service(  # Проверяем условия удаления услуги
            db=db,
            order_id=order_id,
            executor_id=current_user.user_id,
        )
        return {"can_delete": can_delete}  # Флаг доступности удаления
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise
    except Exception as exc:  # Неожиданная ошибка
        logger.error(
            "executor_service_delete_eligibility error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка проверки услуги") from exc  # 500 клиенту


@router.delete(  # DELETE: исполнитель удаляет свою услугу по заказу
    "/order/{order_id}/executor_service",
    response_model=ExecutorServiceDeleteResponseSchema,
)
async def delete_executor_service_api(
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    try:
        result = await delete_executor_service(  # Удаляем услугу исполнителя
            db=db,
            order_id=order_id,
            executor_id=current_user.user_id,
        )
        await db.commit()  # Фиксируем транзакцию
        return result  # Возвращаем результат удаления
    except HTTPException:  # Бизнес-ошибка — откатываем и пробрасываем
        await db.rollback()
        raise
    except Exception as exc:  # Неожиданная ошибка — откатываем
        await db.rollback()
        logger.error(
            "delete_executor_service error order_id=%s executor_id=%s: %s",
            order_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка удаления услуги") from exc  # 500 клиенту


@router.delete(  # DELETE: заказчик убирает исполнителя из своего списка
    "/customer_executors/{customer_id}/{executor_id}",
    response_model=CustomerExecutorDeleteResponseSchema,
)
async def remove_customer_executor_from_list_api(
    customer_id: int,  # ID заказчика из URL
    executor_id: int,  # ID исполнителя из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    if current_user.user_id != customer_id:  # Только сам заказчик может удалять из своего списка
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = await remove_customer_executor_from_list(  # Удаляем связь заказчик–исполнитель
            db=db,
            customer_id=customer_id,
            executor_id=executor_id,
        )
        await db.commit()  # Фиксируем транзакцию
        return result  # Возвращаем результат удаления
    except HTTPException:  # Бизнес-ошибка — откатываем и пробрасываем
        await db.rollback()
        raise
    except Exception as exc:  # Неожиданная ошибка — откатываем
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
        ) from exc  # 500 клиенту


@router.delete(  # DELETE: исполнитель убирает заказчика из своего списка
    "/executor_customers/{executor_id}/{customer_id}",
    response_model=ExecutorCustomerDeleteResponseSchema,
)
async def remove_executor_customer_from_list_api(
    executor_id: int,  # ID исполнителя из URL
    customer_id: int,  # ID заказчика из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    if current_user.user_id != executor_id:  # Только сам исполнитель может удалять из своего списка
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = await remove_executor_customer_from_list(  # Удаляем связь исполнитель–заказчик
            db=db,
            executor_id=executor_id,
            customer_id=customer_id,
        )
        await db.commit()  # Фиксируем транзакцию
        return result  # Возвращаем результат удаления
    except HTTPException:  # Бизнес-ошибка — откатываем и пробрасываем
        await db.rollback()
        raise
    except Exception as exc:  # Неожиданная ошибка — откатываем
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
        ) from exc  # 500 клиенту


@router.delete(  # DELETE: заказчик отзывает заявку на отказ от заказа
    "/order/{order_id}/customer_cancel",
    response_model=OrderCancellationWithdrawResponseSchema,
)
async def withdraw_customer_order_cancel_api(
    order_id: int,  # ID заказа из URL
    executor_id: int = Query(..., gt=0, description="ID исполнителя"),  # Исполнитель из query
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный заказчик
):
    try:
        result = await withdraw_customer_order_cancel(  # Отзываем заявку на отказ
            db=db,
            order_id=order_id,
            customer_id=current_user.user_id,
            executor_id=executor_id,
        )
        await db.commit()  # Фиксируем транзакцию
        return result  # Возвращаем результат отзыва
    except HTTPException:  # Бизнес-ошибка — откатываем и пробрасываем
        await db.rollback()
        raise
    except Exception as exc:  # Неожиданная ошибка — откатываем
        await db.rollback()
        logger.error(
            "withdraw_customer_order_cancel error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Ошибка отмены заявки на отказ"
        ) from exc  # 500 клиенту


@router.delete(  # DELETE: исполнитель отзывает заявку на отказ от заказа
    "/order/{order_id}/executor_cancel",
    response_model=OrderCancellationWithdrawResponseSchema,
)
async def withdraw_executor_order_cancel_api(
    order_id: int,  # ID заказа из URL
    customer_id: int = Query(..., gt=0, description="ID заказчика"),  # Заказчик из query
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    try:
        result = await withdraw_executor_order_cancel(  # Отзываем заявку на отказ
            db=db,
            order_id=order_id,
            customer_id=customer_id,
            executor_id=current_user.user_id,
        )
        await db.commit()  # Фиксируем транзакцию
        return result  # Возвращаем результат отзыва
    except HTTPException:  # Бизнес-ошибка — откатываем и пробрасываем
        await db.rollback()
        raise
    except Exception as exc:  # Неожиданная ошибка — откатываем
        await db.rollback()
        logger.error(
            "withdraw_executor_order_cancel error order_id=%s: %s",
            order_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Ошибка отмены заявки на отказ"
        ) from exc  # 500 клиенту

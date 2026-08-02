import logging  # Логгер модуля
from typing import Optional  # Optional для фильтров
from fastapi import APIRouter, Depends, HTTPException, Query  # FastAPI: роутер, DI, ошибки, query-параметры


from core.config import get_db  # Dependency сессии БД
from core.access import assert_can_read_order  # Проверка чтения заказа
from core.auth import (  # Аутентификация
    ensure_same_user,  # Действие только от своего user_id
    get_current_admin_user,  # Staff-only
    get_current_user,  # Обязательный пользователь
    get_optional_current_user,  # Гость или авторизованный
)

from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД


from cruds.orders.read_orders import (  # Чтение заказов, услуг, отмен, отзывов
    get_cancel_order_customer_for_admin,  # отмена для админа
    get_cancel_orders_customers_for_admin,  # список отмен
    get_customer_order_cancel,  # отмена заказчиком
    get_dates_start_execute_orders,  # даты начала работ
    get_executor_order,  # заказ исполнителя
    get_executor_order_cancel,  # отмена исполнителем
    get_information_about_customer,  # инфо о заказчике
    get_information_about_execute_order,  # инфо об исполнении
    get_information_about_executor,  # инфо об исполнителе
    get_customer_executors_list,  # исполнители заказчика
    get_executor_customers_list,  # заказчики исполнителя
    get_order,  # детали заказа
    get_order_profile_for_admin,  # профиль заказа для админа
    get_order_review,  # отзыв по заказу
    can_view_order_executor_response,  # доступ к отклику
    get_order_response_executor,  # отклик исполнителя
    get_order_responses_executors,  # все отклики
    get_orders_count_for_period,  # счётчик за период
    get_orders_customer,  # заказы заказчика
    get_orders_customer_admin,  # заказы для админки
    get_orders_customers,  # каталог заказов
    get_service_profile_for_admin,  # профиль услуги для админа
    get_services_executor,  # услуги исполнителя
    get_services_executor_admin,  # услуги для админки
)

from models.payments_models import ExecutorBankAccount, Payment  # ORM платежей (импорт для связей/типов)
from models.users_models import User  # ORM пользователя
from schemas.pagination_schemas import PaginatedResponse  # Постраничный ответ
from schemas.orders_schemas import (  # Pydantic-схемы заказов
    CancelOrderCustomerForAdminRead,  # отмена для админа
    CustomerOrderCancellationReadSchema,  # отмена заказчиком
    ExecutorOrderCancellationReadSchema,  # отмена исполнителем
    ExecutorOrderSchema,  # заказ исполнителя
    GraphicOrderMasterRead,  # точка графика мастера
    InformationAboutCustomerRead,  # карточка заказчика
    InformationAboutExecuteOrderRead,  # инфо об исполнении
    InformationAboutExecutorRead,  # карточка исполнителя
    CustomerExecutorListItemSchema,  # элемент списка исполнителей
    ExecutorCustomerListItemSchema,  # элемент списка заказчиков
    OrderCardForAdmin,  # карточка заказа для админа
    OrderProfileForAdmin,  # профиль заказа для админа
    OrderReadSchema,  # детали заказа
    OrderResponseExecutorReadSchema,  # отклик исполнителя
    OrderUserSchema,  # заказ пользователя
    ReviewReadSchema,  # отзыв
    ServiceProfileForAdmin,  # профиль услуги
    ServiceUserSchema,  # услуга пользователя
)
from schemas.users_schemas import UserCommonSchema  # Текущий пользователь из JWT

router = APIRouter(prefix="", tags=["users"])  # Роутер чтения заказов (тег users исторически)

logger = logging.getLogger(__name__)  # Логгер модуля


@router.get("/executor_order/{order_id}", response_model=ExecutorOrderSchema)  # Заказ, назначенный исполнителю
async def get_executor_order_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT текущего пользователя
):
    try:  # обработка ошибок
        executor_order = await get_executor_order(db=db, order_id=order_id)  # Связь executor↔order
        if not executor_order:  # Нет назначения на этот заказ
            raise HTTPException(status_code=409, detail="У пользователя нет заказов")  # 409
        return executor_order  # результат
    except Exception as e:  # Любая ошибка → 500

        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # Обёртка в HTTP 500


@router.get("/orders_customer", response_model=list[OrderUserSchema])  # Заказы текущего заказчика
async def get_orders_customer_api(
    exclude_offered_to_executor_id: Optional[int] = Query(
        None,  # опционально
        description="Исключить заказы, уже предложенные этому исполнителю",  # описание
    ),
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Заказчик из JWT
):
    try:  # выборка заказов заказчика
        orders_customer = await get_orders_customer(  # Список заказов user_id
            db=db,  # сессия
            user_id=current_user.user_id,  # id заказчика
            exclude_offered_to_executor_id=exclude_offered_to_executor_id,  # фильтр
        )
        return orders_customer  # Список карточек заказов
    except Exception as e:  # Неожиданная ошибка CRUD/БД
        # Логируем полную причину ошибки с трейсбеком
        logger.error(  # лог с traceback
            f"Ошибка при получении заказов пользователя {current_user.user_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # Ответ клиенту


@router.get("/orders_count")  # Количество заказов пользователя за период
async def get_orders_count_api(
    start_date: Optional[str] = Query(
        None, description="Дата начала периода (ISO формат)"
    ),
    end_date: Optional[str] = Query(
        None, description="Дата окончания периода (ISO формат)"
    ),
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Владелец статистики
):
    """
    Эндпоинт для получения количества заказов за указанный период.
    Может использоваться в аналитике (как общая статистика или по конкретному пользователю).
    """
    try:  # подсчёт заказов
        count = await get_orders_count_for_period(  # Агрегация по датам
            db=db,  # сессия
            user_id=current_user.user_id,  # владелец
            start_date=start_date,  # начало периода
            end_date=end_date,  # конец периода
        )
        return {"count": count}  # Простой JSON со счётчиком
    except HTTPException:  # Пробрасываем HTTP-ошибки CRUD
        raise  # пробрасываем
    except Exception as e:  # неожиданная ошибка
        logger.error(  # лог
            f"API error get_orders_count user_id={current_user.user_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(  # 500
            status_code=500,  # код
            detail="Внутренняя ошибка сервера при подсчёте заказов",  # текст
        )


@router.get("/services_executor", response_model=list[ServiceUserSchema])  # Услуги (заказы) текущего исполнителя
async def get_services_executor_api(
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Исполнитель из JWT
):
    try:  # услуги исполнителя
        services_executor = await get_services_executor(  # Список услуг исполнителя
            db=db, user_id=current_user.user_id  # id исполнителя
        )
        return services_executor  # Карточки услуг
    except HTTPException as e:  # Ожидаемая HTTP-ошибка
        logger.error(  # лог
            f"HTTP ошибка при получении услуг пользователя {current_user.user_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise  # пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"Неожиданная ошибка при получении услуг пользователя {current_user.user_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500


@router.get("/order/{order_id}", response_model=OrderReadSchema)  # Детали одного заказа
async def get_order_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),  # гость или JWT  # Гость или участник
):
    """Каталог — без входа; прочие заказы — только участники."""
    try:  # детали заказа
        await assert_can_read_order(  # Каталог публичен; иначе — участник/staff
            db, order_id=order_id, current_user=current_user  # аргументы access
        )
        order = await get_order(db=db, order_id=order_id)  # Полная карточка заказа
        if not order:  # Нет записи
            raise HTTPException(status_code=404, detail="Заказ не найден")  # 404
        return order  # Полная карточка
    except HTTPException:  # 403/404 из access или CRUD
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            "Ошибка при получении заказа %s: %s", order_id, e, exc_info=True  # формат
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get("/order/{order_id}/review", response_model=Optional[ReviewReadSchema])  # Отзыв по заказу для viewer
async def get_order_review_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Участник заказа
):
    try:  # отзыв по заказу
        return await get_order_review(  # None если отзыва ещё нет
            db=db,  # сессия
            order_id=order_id,  # заказ
            viewer_id=current_user.user_id,  # viewer
        )
    except HTTPException:  # Ошибки доступа
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"API error for get_order_review order_id={order_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


# предоставления информации заказчику об ответе на заказ всех исполнителей
@router.get(
    "/order_responses_executors/{order_id}",
    response_model=list[OrderResponseExecutorReadSchema],
)  # Все отклики исполнителей на заказ заказчика
async def get_order_responses_executors_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Заказчик заказа
):
    try:  # отклики исполнителей
        return await get_order_responses_executors(db=db, order_id=order_id)  # Список откликов
    except Exception as e:  # Ошибка CRUD
        # Логируем полную причину ошибки с трейсбеком
        logger.error(  # лог
            f"Ошибка при получении услуг пользователя {order_id}: {e}", exc_info=True  # сообщение
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # 500 клиенту


# предоставление информации об ответе исполнителя на заказ
@router.get(
    "/order_response_executor/{user_id}/{order_id}",
    response_model=OrderResponseExecutorReadSchema,
)  # Один отклик конкретного исполнителя
async def get_order_response_executor_api(
    user_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Заказчик или исполнитель
):
    try:  # один отклик исполнителя
        allowed = await can_view_order_executor_response(  # Заказчик, исполнитель или staff
            db=db,  # сессия
            viewer_id=current_user.user_id,  # viewer
            order_id=order_id,  # заказ
            executor_id=user_id,  # исполнитель
        )
        if not allowed:  # Нет прав
            raise HTTPException(status_code=403, detail="Access denied")  # 403

        return await get_order_response_executor(  # Детали отклика
            db=db, user_id=user_id, order_id=order_id  # аргументы
        )
    except HTTPException:  # 403 и прочие
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"Ошибка при получении ответа исполнителя order_id={order_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {e}")  # 500 клиенту


# предоставление информации о заказах при поиске заказов пользователями
@router.get("/orders_customers", response_model=PaginatedResponse[OrderReadSchema])  # Публичный каталог заказов
async def get_orders_customers_api(
    category_work_slug: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    town: Optional[str] = Query(None),
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(12, ge=1, le=100, description="Размер страницы"),
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД (публичный каталог)
):
    """
    Каталог заказов клиентов.
    Всегда возвращает список (даже если он пустой), без 409 ошибки.
    Свои заказы тоже видны владельцу; кнопка «Предложить услугу» скрывается на фронте.
    """
    try:  # публичный каталог
        orders_customers, total = await get_orders_customers(  # Фильтры + пагинация
            db=db,  # сессия
            category_work_slug=category_work_slug,  # категория
            country=country,  # страна
            region=region,  # регион
            town=town,  # город
            page=page,  # страница
            page_size=page_size,  # размер
        )
        return PaginatedResponse.create(  # обёртка
            orders_customers, total, page, page_size  # данные
        )  # Обёртка страницы
    except HTTPException:  # Пробрасываем
        raise  # пробрасываем
    except Exception as e:  # Неожиданная ошибка каталога
        logger.error(f"Ошибка в orders_customers_api: {e}", exc_info=True)  # лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get("/orders_customer_admin", response_model=list[OrderCardForAdmin])  # Заказы заказчиков для админки
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
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff  # Только staff
):
    try:  # админский список заказов
        orders = await get_orders_customer_admin(  # Расширенные фильтры для админа
            db=db,  # сессия
            user_id=user_id,  # фильтр user
            category_work_slug=category_work_slug,  # категория
            country=country,  # страна
            region=region,  # регион
            town=town,  # город
            status_order=status_order,  # статус
            budget_from=budget_from,  # бюджет от
            budget_to=budget_to,  # бюджет до
            start_date_orders=start_date_orders,  # дата от
            end_date_orders=end_date_orders,  # дата до
        )
        return orders  # Список карточек для админки
    except HTTPException:  # HTTP из CRUD
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for user {user_id}: {e}", exc_info=True)  # лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get("/services_executor_admin", response_model=list[OrderCardForAdmin])  # Услуги исполнителей для админки
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
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff  # Только staff
):
    try:  # админский список услуг
        services = await get_services_executor_admin(  # Аналог orders_customer_admin для услуг
            db=db,  # сессия
            user_id=user_id,  # фильтр user
            category_work_slug=category_work_slug,  # категория
            country=country,  # страна
            region=region,  # регион
            town=town,  # город
            status_service=status_service,  # статус услуги
            budget_from=budget_from,  # бюджет от
            budget_to=budget_to,  # бюджет до
            start_date_orders=start_date_orders,  # дата от
            end_date_orders=end_date_orders,  # дата до
        )
        return services  # Список услуг для админки
    except HTTPException:  # HTTP из CRUD
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for user {user_id}: {e}", exc_info=True)  # лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get("/order_profile_for_admin/{order_id}", response_model=OrderProfileForAdmin)  # Карточка заказа для админа
async def get_order_profile_for_admin_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff  # Только staff
):
    try:  # профиль заказа для админа
        order_profile = await get_order_profile_for_admin(db=db, order_id=order_id)  # Полный профиль заказа
        if not order_profile:  # Заказ не найден
            raise HTTPException(status_code=404, detail="Заказ не найден")  # 404
        return order_profile  # Детали заказа
    except HTTPException:  # 404 и прочие
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for order {order_id}: {e}", exc_info=True)  # лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get(
    "/service_profile_for_admin/{service_id}", response_model=ServiceProfileForAdmin
)  # Карточка услуги исполнителя для админа
async def get_order_profile_for_admin_api(
    service_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff  # Только staff
):
    try:  # профиль услуги для админа
        service_profile = await get_service_profile_for_admin(  # Детали услуги по service_id
            db=db, service_id=service_id  # аргументы
        )
        if not service_profile:  # Услуга не найдена
            raise HTTPException(status_code=404, detail="Заказ не найден")  # 404
        return service_profile  # Детали услуги
    except HTTPException:  # 404 и прочие
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for service {service_id}: {e}", exc_info=True)  # лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


def _ensure_cancel_participant(  # Участник отмены — заказчик или исполнитель
    current_user: UserCommonSchema, customer_id: int, executor_id: int
) -> None:
    if current_user.user_id not in (customer_id, executor_id):  # Чужой user_id
        raise HTTPException(status_code=403, detail="Access denied")


# получить информацию из базы данных об отмене заказа зазказчиком
@router.get(
    "/order/{order_id}/customer_order_cancel",
    response_model=CustomerOrderCancellationReadSchema,
)  # Заявка заказчика на отмену заказа
async def get_customer_order_cancel_api(
    order_id: int,  # id заказа
    customer_id: int = Query(...),  # id заказчика
    executor_id: int = Query(...),  # id исполнителя
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Участник сделки
):
    _ensure_cancel_participant(current_user, customer_id, executor_id)  # Только стороны сделки
    try:  # отмена заказчиком
        customer_order_cancel = await get_customer_order_cancel(  # Запись отмены из БД
            db=db,  # сессия
            order_id=order_id,  # заказ
            customer_id=customer_id,  # заказчик
            executor_id=executor_id,  # исполнитель
        )
        if not customer_order_cancel:  # Нет заявки
            raise HTTPException(  # 404
                status_code=404, detail="Заявка на отмену заказчиком не найдена"  # текст
            )
        return customer_order_cancel  # Данные заявки
    except HTTPException:  # 404 и прочие
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"API error for customer_order_cancel order_id={order_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


# получить информацию из базы данных об отмене заказа исполнителем
@router.get(
    "/order/{order_id}/executor_order_cancel",
    response_model=ExecutorOrderCancellationReadSchema,
)  # Заявка исполнителя на отмену заказа
async def get_executor_order_cancel_api(
    order_id: int,  # id заказа
    customer_id: int = Query(...),  # id заказчика
    executor_id: int = Query(...),  # id исполнителя
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Участник сделки
):
    _ensure_cancel_participant(current_user, customer_id, executor_id)  # Проверка участника
    try:  # отмена исполнителем
        executor_order_cancel = await get_executor_order_cancel(  # Запись отмены исполнителя
            db=db,  # сессия
            order_id=order_id,  # заказ
            customer_id=customer_id,  # заказчик
            executor_id=executor_id,  # исполнитель
        )
        if not executor_order_cancel:  # Нет заявки
            raise HTTPException(  # 404
                status_code=404, detail="Заявка на отмену исполнителем не найдена"  # текст
            )
        return executor_order_cancel  # Данные заявки
    except HTTPException:  # 404 и прочие
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"API error for executor_order_cancel order_id={order_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


# получить все отказы для администратора, которые были не подтверждены оппонентами
@router.get(
    "/admin/cancel_orders_customers",
    response_model=list[CancelOrderCustomerForAdminRead],
)  # Список неподтверждённых отмен для модерации
async def get_cancel_orders_customers_for_admin_api(
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff  # Только staff
):
    try:  # список pending отмен
        cancel_orders_customers = await get_cancel_orders_customers_for_admin(db=db)  # Все pending отмены
        return cancel_orders_customers or []  # Пустой список вместо None
    except HTTPException:  # HTTP из CRUD
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for cancel_orders_customers : {e}", exc_info=True)  # лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


# получить отказ для администратора от заказчика
@router.get(
    "/admin/cancel_order_customer/{cancel_order_customer_id}",
    response_model=Optional[CustomerOrderCancellationReadSchema],
)  # Одна заявка на отмену по id для админа
async def get_cancel_orders_customers_for_admin_api(
    cancel_order_customer_id: int,  # id заявки на отмену
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff  # Только staff
):
    try:  # одна отмена для админа
        cancel_order_customer = await get_cancel_order_customer_for_admin(  # Детали одной отмены
            db=db, cancel_order_customer_id=cancel_order_customer_id  # аргументы
        )
        if not cancel_order_customer:  # Не найдена
            raise HTTPException(status_code=404, detail="Отказ не найден")  # 404
        return cancel_order_customer  # Данные отмены
    except HTTPException:  # 404 и прочие
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"API error for cancel_orders_customers : {e}", exc_info=True)  # лог
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get(
    "/graphic_orders_master/{user_id}", response_model=list[GraphicOrderMasterRead]
)  # Даты начала выполнения заказов для графика мастера
async def get_graphic_orders_master_api(
    user_id: int,  # id мастера
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # Владелец графика
):
    ensure_same_user(current_user, user_id)  # Только свой график
    try:  # график мастера
        graphic_orders_master = await get_dates_start_execute_orders(  # Даты для календаря
            db=db, user_id=current_user.user_id  # id мастера
        )
        return graphic_orders_master  # Точки на графике
    except HTTPException as e:  # Ожидаемая HTTP-ошибка
        logger.error(  # лог
            f"HTTP ошибка при получении услуг пользователя {user_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"Неожиданная ошибка при получении услуг пользователя {user_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get(
    "/information_about_customer/{executor_id}/{customer_id}",
    response_model=Optional[InformationAboutCustomerRead],
)  # Карточка заказчика для исполнителя
async def get_information_about_customer_api(
    executor_id: int,  # id исполнителя (viewer)
    customer_id: int,  # id заказчика
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT исполнителя
):
    ensure_same_user(current_user, executor_id)  # Запрос от имени исполнителя
    try:  # карточка заказчика
        information_about_customer = await get_information_about_customer(  # Сводка по заказчику
            db=db, executor_id=executor_id, customer_id=customer_id  # аргументы
        )
        return information_about_customer if information_about_customer else None  # Явный None
    except HTTPException as e:  # Ожидаемая HTTP-ошибка
        logger.error(  # лог
            f"HTTP ошибка при получении информации о заказчике {customer_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"Неожиданная ошибка при получении информации о заказчике {customer_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get(
    "/customer_executors/{customer_id}",
    response_model=list[CustomerExecutorListItemSchema],
)  # Исполнители, с которыми работал заказчик
async def get_customer_executors_list_api(
    customer_id: int,  # id заказчика
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT заказчика
):
    ensure_same_user(current_user, customer_id)  # Только свой список
    try:  # список исполнителей заказчика
        return await get_customer_executors_list(db=db, customer_id=customer_id)  # CRUD списка
    except HTTPException:  # HTTP из CRUD
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            "Ошибка получения списка исполнителей customer_id=%s: %s",  # формат
            customer_id,  # id
            e,  # исключение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get(
    "/executor_customers/{executor_id}",
    response_model=list[ExecutorCustomerListItemSchema],
)  # Заказчики, с которыми работал исполнитель
async def get_executor_customers_list_api(
    executor_id: int,  # id исполнителя
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT исполнителя
):
    ensure_same_user(current_user, executor_id)  # Только свой список
    try:  # список заказчиков исполнителя
        return await get_executor_customers_list(db=db, executor_id=executor_id)  # CRUD списка
    except HTTPException:  # HTTP из CRUD
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            "Ошибка получения списка заказчиков executor_id=%s: %s",  # формат
            executor_id,  # id
            e,  # исключение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get(
    "/information_about_executor/{customer_id}/{executor_id}",
    response_model=Optional[InformationAboutExecutorRead],
)  # Карточка исполнителя для заказчика
async def get_information_about_executor_api(
    executor_id: int,  # id исполнителя
    customer_id: int,  # id заказчика (viewer)
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT заказчика
):
    ensure_same_user(current_user, customer_id)  # Запрос от имени заказчика
    try:  # карточка исполнителя
        information_about_executor = await get_information_about_executor(  # Сводка по исполнителю
            db=db, executor_id=executor_id, customer_id=customer_id  # аргументы
        )
        return information_about_executor if information_about_executor else None  # Явный None
    except HTTPException as e:  # Ожидаемая HTTP-ошибка
        logger.error(  # лог
            f"HTTP ошибка при получении информации об исполнителе {executor_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"Неожиданная ошибка при получении информации об исполнителе {executor_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту


@router.get(
    "/information_about_execute_order/{user_id}/{order_id}",
    response_model=InformationAboutExecuteOrderRead,
)  # Информация об исполнении заказа для участника
async def get_information_about_execute_order_api(
    user_id: int,  # id участника заказа
    order_id: int,  # id заказа
    db: AsyncSession = Depends(get_db),  # сессия БД  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT участника
):
    ensure_same_user(current_user, user_id)  # Только свой user_id в path
    try:  # инфо об исполнении заказа
        return await get_information_about_execute_order(  # Статусы, даты, стороны
            db=db,  # сессия
            user_id=current_user.user_id,  # участник
            order_id=order_id,  # заказ
        )
    except HTTPException:  # Ошибки доступа/404
        raise  # Пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"Неожиданная ошибка information_about_execute_order "  # часть 1
            f"user_id={user_id} order_id={order_id}: {e}",  # часть 2
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500 клиенту

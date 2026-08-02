import logging  # Стандартное логирование

from fastapi import APIRouter, Depends, HTTPException, Query  # FastAPI: роутер, DI, ошибки, query
from sqlalchemy import select  # Конструктор SQL SELECT
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия SQLAlchemy


from cruds.estimate_graphic_works.create_estimate_graphic_works import (  # CRUD: создание сметы и графика
    add_material_for_work_into_estimate,
    add_work_into_estimate,
    add_work_into_graphic_works,
)
from cruds.estimate_graphic_works.delete_estimate_graphic_works import (  # CRUD: удаление из сметы и графика
    delete_work_from_estimate_for_order,
    delete_work_from_graphic_works_for_order,
)
from cruds.estimate_graphic_works.read_estimate_graphic_works import (  # CRUD: чтение сметы и графика
    get_full_estimate_for_order,
    get_works_estimate_for_order,
    get_works_from_graphic_works_for_order,
)
from cruds.estimate_graphic_works.update_estimate_graphic_works import (  # CRUD: обновление сметы и графика
    update_graphic_works,
    update_material_into_estimate_for_order,
    update_work_into_estimate_for_order,
)

from models.estimate_graphic_works_models import GraphicWork, WorkEstimate  # ORM-модели сметы и графика
from models.orders_models import ExecutorOrder, Order  # ORM-модели заказа и назначения
from schemas.estimate_graphic_works_schemas import (  # Pydantic-схемы сметы и графика
    FullEstimateResponse,
    GraphicWorksReadSchema,
    GraphicWorksSchema,
    MaterialEstimateReadSchema,
    MaterialEstimateSchema,
    WorkEstimateReadSchema,
    WorkEstimateSchema,
    WorkEstimateUpdateSchema,
)
from core.config import get_db  # Зависимость сессии БД
from core.auth import ensure_same_user, get_current_user  # Проверка пользователя и текущая сессия
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя

logger = logging.getLogger(__name__)  # Логгер модуля


router = APIRouter(prefix="", tags=["geography"])  # Роутер сметы и графика работ


async def ensure_can_read_order_estimate(  # Проверка права читать смету по заказу
    db: AsyncSession,
    current_user: UserCommonSchema,
    *,
    executor_user_id: int,
    order_id: int,
) -> None:
    """Исполнитель читает свою смету; заказчик — смету назначенного исполнителя по заказу."""
    if current_user.user_id == executor_user_id:  # Сам исполнитель — доступ разрешён
        return

    order = await db.get(Order, order_id)  # Загружаем заказ
    if not order:  # Заказ не найден
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order.customer_id != current_user.user_id:  # Не заказчик этого заказа
        raise HTTPException(status_code=403, detail="Access denied")

    assigned = await db.execute(
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    assigned_executor_id = assigned.scalar_one_or_none()
    if assigned_executor_id == executor_user_id:  # Заказчик смотрит смету назначенного исполнителя
        return

    estimate_exists = await db.execute(  # Есть ли смета исполнителя по этому заказу
        select(WorkEstimate.id)
        .where(
            WorkEstimate.user_id == executor_user_id,
            WorkEstimate.order_id == order_id,
        )
        .limit(1)
    )
    if estimate_exists.scalar_one_or_none():  # Смета существует — заказчику можно читать
        return

    raise HTTPException(status_code=403, detail="Access denied")  # Иначе запрет


@router.post("/add_work_into_estimate", response_model=WorkEstimateReadSchema)  # POST: работа в смету
async def add_work_into_estimate_api(
    work_estimate_schema: WorkEstimateSchema,  # Данные работы сметы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    ensure_same_user(current_user, work_estimate_schema.user_id)  # Только владелец сметы
    try:
        work_estimate = await add_work_into_estimate(  # Сохраняем работу в смету
            db=db, work_estimate_schema=work_estimate_schema
        )
        return work_estimate  # Возвращаем созданную запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post(  # POST: материал к работе в смете
    "/add_material_for_work_into_estimate", response_model=MaterialEstimateSchema
)
async def add_material_for_work_into_estimate_api(
    material_estimate_schema: MaterialEstimateSchema,  # Данные материала
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    try:
        material_estimate = await add_material_for_work_into_estimate(  # Сохраняем материал в смету
            db=db, material_estimate_schema=material_estimate_schema
        )
        return material_estimate  # Возвращаем созданную запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get(  # GET: полная смета заказа с материалами
    "/works_estimate_full/{user_id}/{order_id}", response_model=FullEstimateResponse
)
async def get_full_estimate_api(
    user_id: int,  # ID исполнителя из URL
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    await ensure_can_read_order_estimate(  # Проверяем право читать смету
        db,
        current_user,
        executor_user_id=user_id,
        order_id=order_id,
    )
    try:
        result = await get_full_estimate_for_order(db, user_id, order_id)  # Читаем полную смету
        return result  # Смета с работами и материалами
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"Ошибка получения полной сметы {user_id}/{order_id}: {str(e)}")  # Лог
        raise HTTPException(
            status_code=500, detail="Ошибка получения полной сметы с материалами"
        )


@router.post("/add_work_into_graphic_works", response_model=GraphicWorksSchema)  # POST: работа в график
async def add_work_into_graphic_works_api(
    work_graphic_works_schema: GraphicWorksSchema,  # Данные работы графика
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    if work_graphic_works_schema.user_id is not None:  # user_id передан явно
        ensure_same_user(current_user, work_graphic_works_schema.user_id)  # Проверяем совпадение
    else:
        work_graphic_works_schema.user_id = current_user.user_id  # Подставляем текущего пользователя
    try:
        work_graphic_works = await add_work_into_graphic_works(  # Сохраняем работу в график
            db=db, work_graphic_works_schema=work_graphic_works_schema
        )
        return work_graphic_works  # Возвращаем созданную запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get(  # GET: работы из графика по заказу
    "/works_from_graphic_works/{user_id}/{order_id}",
    response_model=list[GraphicWorksReadSchema],
)
async def get_works_from_graphic_works_api(
    user_id: int,  # ID исполнителя из URL
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    await ensure_can_read_order_estimate(  # Проверяем право читать график
        db,
        current_user,
        executor_user_id=user_id,
        order_id=order_id,
    )
    try:
        result = await get_works_from_graphic_works_for_order(db, user_id, order_id)  # Читаем график
        return result  # Список работ графика
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"Ошибка получения графика работ {user_id}/{order_id}: {str(e)}")  # Лог
        raise HTTPException(status_code=500, detail="Ошибка получения графика работ")


@router.get(  # GET: работы из сметы по заказу
    "/works_from_estimate_works/{user_id}/{order_id}",
    response_model=list[WorkEstimateReadSchema],
)
async def get_works_from_estimate_works_api(
    user_id: int,  # ID исполнителя из URL
    order_id: int,  # ID заказа из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    await ensure_can_read_order_estimate(  # Проверяем право читать смету
        db,
        current_user,
        executor_user_id=user_id,
        order_id=order_id,
    )
    try:
        result = await get_works_estimate_for_order(db, user_id, order_id)  # Читаем работы сметы
        return result  # Список работ сметы
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"Ошибка получения работ из сметы для заказа пользователя {user_id}/{order_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail="Ошибка получения работ из сметы"
        )


@router.put(  # PUT: обновление работы в смете
    "/update_work_into_estimate/{work_estimate_id}/{user_id}/{order_id}",
)
async def update_work_into_estimate_for_order_api(
    work_estimate_id: int,  # ID работы сметы из URL
    user_id: int,  # ID исполнителя из URL
    order_id: int,  # ID заказа из URL
    work_estimate_schema: WorkEstimateUpdateSchema,  # Новые данные работы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    ensure_same_user(current_user, user_id)  # Только владелец сметы
    try:

        await update_work_into_estimate_for_order(  # Обновляем работу в БД
            db,
            work_estimate_id=work_estimate_id,
            user_id=current_user.user_id,
            order_id=order_id,
            work_estimate_schema=work_estimate_schema,
        )
        # return result
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"Ошибка получения работы сметы: {str(e)}")  # Лог
        raise HTTPException(status_code=500, detail="Ошибка получения работы сметы")


@router.put(  # PUT: обновление материала в смете
    "/update_material_into_estimate/{material_estimate_id}",
    response_model=MaterialEstimateReadSchema,
)
async def update_material_into_estimate_for_order_api(
    material_estimate_id: int,  # ID материала из URL
    material_estimate_schema: MaterialEstimateSchema,  # Новые данные материала
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    try:
        result = await update_material_into_estimate_for_order(  # Обновляем материал в БД
            db,
            material_estimate_id,
            material_estimate_schema=material_estimate_schema,
        )
        return result  # Возвращаем обновлённую запись
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"Ошибка обновления материала сметы {material_estimate_id}: {str(e)}"
        )
        raise HTTPException(status_code=500, detail="Ошибка обновления материала сметы")


@router.put(  # PUT: обновление работы в графике
    "/update_work_into_graphic_works/{user_id}/{order_id}/{graphic_work_id}",
    response_model=GraphicWorksReadSchema,
)
async def update_work_into_graphic_works_for_order_api(
    user_id: int,  # ID исполнителя из URL
    order_id: int,  # ID заказа из URL
    graphic_work_id: int,  # ID работы графика из URL
    graphic_works: GraphicWorksSchema,  # Новые данные работы графика
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    ensure_same_user(current_user, user_id)  # Только владелец графика
    try:
        result = await update_graphic_works(  # Обновляем работу графика в БД
            db,
            user_id=current_user.user_id,
            order_id=order_id,
            graphic_work_id=graphic_work_id,
            graphic_works=graphic_works,
        )
        return result  # Возвращаем обновлённую запись
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"Ошибка получения работы сметы {user_id}/{order_id}: {str(e)}")  # Лог
        raise HTTPException(status_code=500, detail="Ошибка получения работы сметы")


# удаление работы из сметы пользователя для заказа
@router.delete("/delete_work_from_estimate/{user_id}/{order_id}/{work_estimate_id}")  # DELETE: работа из сметы
async def delete_work_from_estimate_for_order_api(
    user_id: int,  # ID исполнителя из URL
    order_id: int,  # ID заказа из URL
    work_estimate_id: int,  # ID работы сметы из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    ensure_same_user(current_user, user_id)  # Только владелец сметы
    try:
        result = await delete_work_from_estimate_for_order(  # Удаляем работу из сметы
            db, current_user.user_id, order_id, work_estimate_id
        )
        return result  # Результат удаления
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(f"Ошибка удаления работы сметы {user_id}/{order_id}: {str(e)}")  # Лог
        raise HTTPException(status_code=500, detail="Ошибка удаления работы сметы")


# удаление работы из графика работ пользователя для заказа
@router.delete("/delete_work_from_graphic_works/{user_id}/{order_id}/{graphic_work_id}")  # DELETE: работа из графика
async def delete_work_from_graphic_works_for_order_api(
    user_id: int,  # ID исполнителя из URL
    order_id: int,  # ID заказа из URL
    graphic_work_id: int,  # ID работы графика из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный исполнитель
):
    ensure_same_user(current_user, user_id)  # Только владелец графика
    try:
        result = await delete_work_from_graphic_works_for_order(  # Удаляем работу из графика
            db, current_user.user_id, order_id, graphic_work_id
        )
        return result  # Результат удаления
    except HTTPException:
        raise  # Пробрасываем как есть
    except Exception as e:  # Неожиданная ошибка
        logger.error(
            f"Ошибка удаления работы графика работ {user_id}/{order_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail="Ошибка удаления работы графика работ"
        )


# @router.get(
#     "/dates_graphic_work/{user_id}/{order_id}",
#     response_model=list[DateGraphicWorkSchema],
# )
# async def get_dates_graphic_works_for_order_api(
#     user_id: int, order_id: int, db: AsyncSession = Depends(get_db)
# ):
#     try:
#         result = await get_dates_graphic_works_for_order(db, user_id, order_id)
#         return result
#     except HTTPException:
#         raise  # Пробрасываем как есть
#     except Exception as e:
#         logger.error(
#             f"Ошибка получения дат из графика работ {user_id}/{order_id}: {str(e)}"
#         )
#         raise HTTPException(
#             status_code=500, detail="Ошибка получения дат из графика работ"
#         )


# @router.get(
#     "/works_from_graphic_works_for_date/{user_id}/{order_id}/{date}",
#     response_model=WorkFromGraphicWorksSchema,
# )
# async def get_works_from_graphic_works_for_date_api(
#     user_id: int, order_id: int,date:int, db: AsyncSession = Depends(get_db)
# ):
#     try:
#         result = await get_works_from_graphic_works_for_date(
#             db,
#             user_id,
#             order_id,
#             date,
#         )
#         return result
#     except HTTPException:
#         raise  # Пробрасываем как есть
#     except Exception as e:
#         logger.error(
#             f"Ошибка получения дат из графика работ {user_id}/{order_id}: {str(e)}"
#         )
#         raise HTTPException(
#             status_code=500, detail="Ошибка получения дат из графика работ"
#         )

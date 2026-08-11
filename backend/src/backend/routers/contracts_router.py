import logging  # Логирование ошибок договоров

from fastapi import APIRouter, Depends, HTTPException, Query  # Роутер, DI, ошибки, query
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.auth import get_current_user  # Текущий пользователь из JWT
from core.access import assert_can_view_contract  # Проверка доступа к договору
from cruds.contracts_crud import (  # CRUD договоров
    add_contract,  # Создание договора
    get_contract,  # Получение по order_id
    update_contract_subscribe_customer,  # Подпись заказчика
    update_contract_subscribe_executor,  # Подпись исполнителя
)
from schemas.contracts_schemas import ContractCreate  # Схема создания договора
from core.config import get_db  # Зависимость сессии БД
from models.users_models import User  # ORM пользователя (роль)
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя


logger = logging.getLogger(__name__)  # Логгер модуля


router = APIRouter(prefix="", tags=["geography"])  # Роутер договоров (тег geography)


@router.post("/add_contract")  # POST создание договора
async def add_contract_api(
    contract_schema: ContractCreate,  # Тело запроса
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный пользователь
):
    if current_user.user_id not in (  # Только заказчик или исполнитель
        contract_schema.customer_id,
        contract_schema.executor_id,
    ):
        raise HTTPException(status_code=403, detail="Access denied")  # Чужой договор
    try:
        contract = await add_contract(db=db, contract_schema=contract_schema)  # Создаём в БД
        # Отдаём полный ContractResponse (имена сторон), а не сырой ORM
        full = await get_contract(db=db, order_id=contract_schema.order_id)
        return full or contract
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("add_contract failed")
        raise HTTPException(status_code=400, detail=f"Ошибка сохранения договора: {e}") from e


@router.put("/subscribe_customer_contract/{order_id}")  # PUT подпись заказчика
async def add_subscribe_customer_contract_api(
    order_id: int,  # id заказа
    subscribe_customer: bool = Query(...),  # Флаг подписи
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    try:
        contract = await update_contract_subscribe_customer(  # Обновляем подпись в CRUD
            db=db, order_id=order_id, subscribe_customer=subscribe_customer
        )
        return contract  # Обновлённый договор
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # Ошибка доступа/валидации


@router.put("/subscribe_executor_contract/{order_id}")  # PUT подпись исполнителя
async def add_subscribe_customer_contract_api(
    order_id: int,  # id заказа
    subscribe_executor: bool = Query(...),  # Флаг подписи исполнителя
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    try:
        contract = await update_contract_subscribe_executor(  # Обновляем подпись исполнителя
            db=db, order_id=order_id, subscribe_executor=subscribe_executor
        )
        return contract  # Обновлённый договор
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # Ошибка из CRUD


@router.get("/contract/{order_id}")  # GET договор по заказу
async def get_contract_api(
    order_id: int,  # id заказа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    try:
        user_orm = await db.get(User, current_user.user_id)  # ORM для роли пользователя
        await assert_can_view_contract(  # Проверка права просмотра
            db,
            order_id=order_id,
            user_id=current_user.user_id,
            user_role=user_orm.role if user_orm else None,  # Роль или None
        )
        contract = await get_contract(db=db, order_id=order_id)  # Загрузка договора
        return contract  # Данные договора
    except HTTPException:
        raise  # Пробрасываем HTTP-ошибки как есть
    except Exception as e:
        raise HTTPException(status_code=500, detail="Ошибка получения договора") from e  # 500 прочим

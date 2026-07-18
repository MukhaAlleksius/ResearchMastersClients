import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from core.access import assert_can_view_contract
from cruds.contracts_crud import (
    add_contract,
    get_contract,
    update_contract_subscribe_customer,
    update_contract_subscribe_executor,
)
from schemas.contracts_schemas import ContractCreate
from core.config import get_db
from models.users_models import User
from schemas.users_schemas import UserCommonSchema


logger = logging.getLogger(__name__)


router = APIRouter(prefix="", tags=["geography"])


@router.post("/add_contract")
async def add_contract_api(
    contract_schema: ContractCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    if current_user.user_id not in (
        contract_schema.customer_id,
        contract_schema.executor_id,
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        contract = await add_contract(db=db, contract_schema=contract_schema)
        return contract
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.put("/subscribe_customer_contract/{order_id}")
async def add_subscribe_customer_contract_api(
    order_id: int,
    subscribe_customer: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        contract = await update_contract_subscribe_customer(
            db=db, order_id=order_id, subscribe_customer=subscribe_customer
        )
        return contract
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.put("/subscribe_executor_contract/{order_id}")
async def add_subscribe_customer_contract_api(
    order_id: int,
    subscribe_executor: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        contract = await update_contract_subscribe_executor(
            db=db, order_id=order_id, subscribe_executor=subscribe_executor
        )
        return contract
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/contract/{order_id}")
async def get_contract_api(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        user_orm = await db.get(User, current_user.user_id)
        await assert_can_view_contract(
            db,
            order_id=order_id,
            user_id=current_user.user_id,
            user_role=user_orm.role if user_orm else None,
        )
        contract = await get_contract(db=db, order_id=order_id)
        return contract
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Ошибка получения договора") from e

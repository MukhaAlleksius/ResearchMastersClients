from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.contracts_models import Contract
from models.orders_models import ExecutorOrder, Order, OrderResponseExecutor, StatusOrderCustomer
from models.users_models import User
from models.works_materials_models import CategoryWorkMaster
from schemas.users_schemas import UserCommonSchema


def is_user_blocked(user: User) -> bool:
    if not user:
        return True

    now = datetime.now(timezone.utc)
    if user.blocked_until:
        blocked_until = user.blocked_until
        if blocked_until.tzinfo is None:
            blocked_until = blocked_until.replace(tzinfo=timezone.utc)
        return blocked_until > now

    return bool(user.blocked)


def assert_user_not_blocked(user: User) -> None:
    if is_user_blocked(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт заблокирован",
        )


CATALOG_PUBLIC_STATUS = "В поиске исполнителя"


async def is_order_listed_in_catalog(db: AsyncSession, order_id: int) -> bool:
    result = await db.execute(
        select(StatusOrderCustomer.status).where(
            StatusOrderCustomer.order_id == order_id
        )
    )
    status_value = result.scalar_one_or_none()
    return status_value == CATALOG_PUBLIC_STATUS


async def user_can_view_order(
    db: AsyncSession,
    *,
    order_id: int,
    user_id: int,
    user_role: str | None = None,
) -> bool:
    if await is_order_listed_in_catalog(db, order_id):
        return True

    role = (user_role or "").lower()
    if role in {"admin", "moderator"}:
        return True

    order = await db.get(Order, order_id)
    if not order:
        return False
    if int(order.customer_id) == int(user_id):
        return True

    executor_result = await db.execute(
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    executor_id = executor_result.scalar_one_or_none()
    if executor_id is not None and int(executor_id) == int(user_id):
        return True

    response_result = await db.execute(
        select(OrderResponseExecutor.id)
        .where(
            OrderResponseExecutor.order_id == order_id,
            OrderResponseExecutor.executor_id == user_id,
        )
        .limit(1)
    )
    return response_result.scalar_one_or_none() is not None


async def assert_can_view_order(
    db: AsyncSession,
    *,
    order_id: int,
    user_id: int,
    user_role: str | None = None,
) -> None:
    if not await user_can_view_order(
        db, order_id=order_id, user_id=user_id, user_role=user_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому заказу",
        )


async def user_can_view_contract(
    db: AsyncSession,
    *,
    order_id: int,
    user_id: int,
    user_role: str | None = None,
) -> bool:
    role = (user_role or "").lower()
    if role in {"admin", "moderator"}:
        return True

    result = await db.execute(select(Contract).where(Contract.order_id == order_id))
    contract = result.scalar_one_or_none()
    if not contract:
        return False
    return user_id in {contract.customer_id, contract.executor_id}


async def assert_can_view_contract(
    db: AsyncSession,
    *,
    order_id: int,
    user_id: int,
    user_role: str | None = None,
) -> None:
    if not await user_can_view_contract(
        db, order_id=order_id, user_id=user_id, user_role=user_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к договору",
        )


async def is_public_executor(db: AsyncSession, user_id: int) -> bool:
    """Исполнитель с публичной витриной (есть специализации в каталоге)."""
    result = await db.execute(
        select(CategoryWorkMaster.id)
        .where(CategoryWorkMaster.master_id == user_id)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def assert_can_view_executor_profile(
    db: AsyncSession,
    *,
    user_id: int,
    current_user: UserCommonSchema | None,
) -> None:
    """Публичный профиль исполнителя или свой / админ."""
    if current_user and current_user.user_id == user_id:
        return

    if current_user:
        viewer = await db.get(User, current_user.user_id)
        role = (viewer.role if viewer else "") or ""
        if role.lower() in {"admin", "moderator"}:
            return

    if await is_public_executor(db, user_id):
        return

    if current_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к профилю пользователя",
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Требуется авторизация для просмотра этого профиля",
    )


async def assert_can_read_order(
    db: AsyncSession,
    *,
    order_id: int,
    current_user: UserCommonSchema | None,
) -> None:
    """Каталог (гости) или участник / админ заказа."""
    if await is_order_listed_in_catalog(db, order_id):
        return

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация для просмотра этого заказа",
        )

    user_orm = await db.get(User, current_user.user_id)
    await assert_can_view_order(
        db,
        order_id=order_id,
        user_id=current_user.user_id,
        user_role=user_orm.role if user_orm else None,
    )

"""Проверки доступа: блокировки, заказы, договоры, профили исполнителей."""

from datetime import datetime, timezone  # Время для проверки blocked_until

from fastapi import HTTPException, status  # 401/403
from sqlalchemy import select  # SELECT
from sqlalchemy.ext.asyncio import AsyncSession  # Сессия БД

from models.contracts_models import Contract  # Договор
from models.orders_models import ExecutorOrder, Order, OrderResponseExecutor, StatusOrderCustomer  # Заказы/статусы/отклики
from models.users_models import User  # Пользователь
from schemas.users_schemas import UserCommonSchema  # Текущий пользователь

# Статус заказа, при котором он виден всем в публичном каталоге
CATALOG_PUBLIC_STATUS = "В поиске исполнителя"  # Статус заказа в каталоге


def is_user_blocked(user: User) -> bool:
    """Проверяет, заблокирован ли пользователь (постоянно или до даты blocked_until)."""
    if not user:  # Нет объекта пользователя
        return True  # Считаем недоступным / «заблокированным»

    now = datetime.now(timezone.utc)  # Текущее время UTC
    if user.blocked_until:  # Есть временная блокировка до даты
        blocked_until = user.blocked_until  # До какой даты заблокирован
        if blocked_until.tzinfo is None:  # В БД могло лежать без таймзоны
            blocked_until = blocked_until.replace(tzinfo=timezone.utc)  # Считаем как UTC
        return blocked_until > now  # True, пока дата блокировки ещё в будущем

    return bool(user.blocked)  # Постоянный флаг blocked


def assert_user_not_blocked(user: User) -> None:
    """Бросает 403, если аккаунт заблокирован. Иначе ничего не делает."""
    if is_user_blocked(user):  # Проверка блокировки
        raise HTTPException(  # Запрет доступа
            status_code=status.HTTP_403_FORBIDDEN,  # 403 Forbidden
            detail="Аккаунт заблокирован",  # Текст для клиента
        )


async def is_order_listed_in_catalog(db: AsyncSession, order_id: int) -> bool:
    """True, если заказ в статусе «В поиске исполнителя» и доступен в каталоге."""
    result = await db.execute(  # Читаем статус заказчика по заказу
        select(StatusOrderCustomer.status).where(
            StatusOrderCustomer.order_id == order_id  # Фильтр по id заказа
        )
    )
    status_value = result.scalar_one_or_none()  # Строка статуса или None
    return status_value == CATALOG_PUBLIC_STATUS  # В каталоге только «В поиске»


async def user_can_view_order(
    db: AsyncSession,
    *,
    order_id: int,
    user_id: int,
    user_role: str | None = None,
) -> bool:
    """
    Может ли пользователь смотреть заказ.
    Да, если: заказ в каталоге, или viewer — admin/moderator,
    или заказчик, или назначенный исполнитель, или откликался на заказ.
    """
    if await is_order_listed_in_catalog(db, order_id):  # Публичный каталог — всем
        return True  # Доступ есть

    role = (user_role or "").lower()  # Роль в нижнем регистре
    if role in {"admin", "moderator"}:  # Админ / модератор видят всё
        return True

    order = await db.get(Order, order_id)  # Сам заказ из БД
    if not order:  # Заказа нет
        return False  # Смотреть нечего
    if int(order.customer_id) == int(user_id):  # Это заказчик этого заказа
        return True

    executor_result = await db.execute(  # Назначенный исполнитель заказа
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    executor_id = executor_result.scalar_one_or_none()  # id исполнителя или None
    if executor_id is not None and int(executor_id) == int(user_id):  # Текущий исполнитель
        return True

    response_result = await db.execute(  # Был ли отклик этого пользователя
        select(OrderResponseExecutor.id)
        .where(
            OrderResponseExecutor.order_id == order_id,  # Этот заказ
            OrderResponseExecutor.executor_id == user_id,  # Этот исполнитель
        )
        .limit(1)  # Достаточно одного совпадения
    )
    return response_result.scalar_one_or_none() is not None  # True, если откликался


async def assert_can_view_order(
    db: AsyncSession,
    *,
    order_id: int,
    user_id: int,
    user_role: str | None = None,
) -> None:
    """Бросает 403, если user_id не имеет права смотреть заказ."""
    if not await user_can_view_order(  # Нет прав на просмотр
        db, order_id=order_id, user_id=user_id, user_role=user_role
    ):
        raise HTTPException(  # Запрет
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
    """
    Может ли пользователь смотреть договор по заказу.
    Да для admin/moderator или сторон договора (заказчик / исполнитель).
    """
    role = (user_role or "").lower()  # Роль зрителя
    if role in {"admin", "moderator"}:  # Staff — полный доступ
        return True

    result = await db.execute(select(Contract).where(Contract.order_id == order_id))  # Ищем договор
    contract = result.scalar_one_or_none()  # Договор или None
    if not contract:  # Договора ещё нет
        return False
    return user_id in {contract.customer_id, contract.executor_id}  # Только стороны договора


async def assert_can_view_contract(
    db: AsyncSession,
    *,
    order_id: int,
    user_id: int,
    user_role: str | None = None,
) -> None:
    """Бросает 403, если нет доступа к договору заказа."""
    if not await user_can_view_contract(  # Нет прав на договор
        db, order_id=order_id, user_id=user_id, user_role=user_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к договору",
        )


async def assert_can_read_order(
    db: AsyncSession,
    *,
    order_id: int,
    current_user: UserCommonSchema | None,
) -> None:
    """
    Проверка чтения заказа для API.
    В каталоге — можно гостю; иначе нужна авторизация и права участника/админа.
    """
    if await is_order_listed_in_catalog(db, order_id):  # Заказ в каталоге
        return  # Гостю тоже можно

    if not current_user:  # Не в каталоге и гость
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация для просмотра этого заказа",
        )

    user_orm = await db.get(User, current_user.user_id)  # Роль для проверки прав
    await assert_can_view_order(  # Участник / staff
        db,
        order_id=order_id,
        user_id=current_user.user_id,
        user_role=user_orm.role if user_orm else None,
    )

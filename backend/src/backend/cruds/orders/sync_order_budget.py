"""Синхронизация и отображение orders.budget по договорённости сделки."""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.contracts_models import Contract
from models.estimate_graphic_works_models import WorkEstimate
from models.orders_models import ExecutorOrder, Order, OrderResponseExecutor

logger = logging.getLogger(__name__)


def _is_estimate_budget_type(budget_type: str | None) -> bool:
    return "сметн" in str(budget_type or "").lower()


def _is_fixed_budget_type(budget_type: str | None) -> bool:
    value = str(budget_type or "").lower()
    if "сметн" in value or "договорн" in value:
        return False
    return "фиксир" in value


def _normalize_currency(code: str | None) -> str:
    raw = str(code or "BYN").strip().lower()
    if raw in {"byn"}:
        return "BYN"
    if raw in {"руб.", "руб", "rub"}:
        return "RUB"
    if raw == "usd":
        return "USD"
    if raw == "eur":
        return "EUR"
    return str(code or "BYN").upper()


def _positive_amount(value) -> Decimal | None:
    if value is None:
        return None
    amount = Decimal(str(value))
    if amount <= 0:
        return None
    return amount


async def _estimate_works_total(
    db: AsyncSession, order_id: int, executor_id: int | None
) -> tuple[Decimal | None, str | None]:
    """Сумма работ сметы по заказу (исполнителя, если известен)."""
    filters = [WorkEstimate.order_id == order_id]
    if executor_id:
        filters.append(WorkEstimate.user_id == executor_id)

    result = await db.execute(
        select(
            func.coalesce(
                func.sum(WorkEstimate.quantity * WorkEstimate.cost_unit),
                0,
            ),
            func.max(WorkEstimate.currency),
        ).where(*filters)
    )
    row = result.one()
    total = row[0]
    currency = row[1]
    total_dec = _positive_amount(total)
    return total_dec, currency


class DealBudgetContext(NamedTuple):
    contract: Contract | None
    offer: OrderResponseExecutor | None
    budget_type: str | None
    executor_id: int | None


async def _load_deal_context(
    db: AsyncSession,
    order_id: int,
    *,
    preferred_executor_id: int | None = None,
) -> DealBudgetContext:
    contract = await db.scalar(
        select(Contract).where(Contract.order_id == order_id)
    )
    executor_link = await db.scalar(
        select(ExecutorOrder).where(ExecutorOrder.order_id == order_id)
    )
    executor_id = (
        preferred_executor_id
        or (contract.executor_id if contract else None)
        or (executor_link.executor_id if executor_link else None)
    )

    offer = None
    if executor_id:
        offer = await db.scalar(
            select(OrderResponseExecutor).where(
                OrderResponseExecutor.order_id == order_id,
                OrderResponseExecutor.executor_id == executor_id,
            )
        )

    budget_type = (
        (contract.budget_type if contract else None)
        or (offer.budget_type if offer else None)
    )
    return DealBudgetContext(
        contract=contract,
        offer=offer,
        budget_type=budget_type,
        executor_id=executor_id,
    )


async def resolve_order_display_budget(
    db: AsyncSession,
    order: Order,
    *,
    preferred_executor_id: int | None = None,
) -> tuple[Decimal | None, str, str | None]:
    """
    Сумма для карточки (по приоритету):
    1) сумма договора (договорная цена);
    2) сумма сметы, если смета уже ведётся;
    3) сумма из отклика исполнителя;
    4) бюджет заказчика;
    5) иначе None («Сумма неизвестна»).
    """
    ctx = await _load_deal_context(
        db, order.id, preferred_executor_id=preferred_executor_id
    )
    fallback_currency = _normalize_currency(order.currency)

    # 1. Договорная цена — если в договоре есть сумма
    if ctx.contract is not None:
        contract_amount = _positive_amount(ctx.contract.budget)
        if contract_amount is not None:
            return (
                contract_amount,
                _normalize_currency(ctx.contract.currency or fallback_currency),
                "Договорная цена",
            )

    # 2. Сметная цена — если смету уже вели (даже без договора)
    estimate_total, est_currency = await _estimate_works_total(
        db, order.id, ctx.executor_id
    )
    if estimate_total is not None:
        return (
            estimate_total,
            _normalize_currency(est_currency or fallback_currency),
            "Сметная цена",
        )

    # 3. Бюджет от исполнителя
    if ctx.offer is not None:
        offer_amount = _positive_amount(ctx.offer.proposed_price)
        if offer_amount is not None:
            return (
                offer_amount,
                _normalize_currency(ctx.offer.currency or fallback_currency),
                ctx.offer.budget_type or "Бюджет от исполнителя",
            )

    # 4. Бюджет заказчика
    # Если order.budget уже синхронизирован со сделкой, сюда попадём только
    # когда договора/сметы/отклика с суммой нет — тогда это и есть ориентир.
    customer_amount = _positive_amount(order.budget)
    if customer_amount is not None:
        return (
            customer_amount,
            fallback_currency,
            order.budget_type or "Бюджет от заказчика",
        )

    # 5. Никто не указал сумму
    return None, fallback_currency, None


async def sync_order_budget_from_deal(
    db: AsyncSession,
    order_id: int,
    *,
    commit: bool = False,
) -> None:
    """
    Обновляет budget заказа:
    - фиксированная договорённость → сумма договора / proposed_price;
    - сметная → сумма сметы (если уже есть);
    - иначе не трогаем (остаётся бюджет заказчика).
    """
    order = await db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        return

    ctx = await _load_deal_context(db, order_id)

    if _is_fixed_budget_type(ctx.budget_type):
        amount = None
        currency = None
        if ctx.contract is not None:
            amount = _positive_amount(ctx.contract.budget)
            currency = ctx.contract.currency
        if amount is None and ctx.offer is not None:
            amount = _positive_amount(ctx.offer.proposed_price)
            currency = ctx.offer.currency
        if amount is not None:
            order.budget = amount
            order.currency = _normalize_currency(currency or order.currency)
            order.budget_type = ctx.budget_type or order.budget_type
            if commit:
                await db.commit()
            else:
                await db.flush()
            logger.info(
                "order %s budget synced from fixed deal: %s %s",
                order_id,
                amount,
                order.currency,
            )
        return

    if _is_estimate_budget_type(ctx.budget_type):
        total, est_currency = await _estimate_works_total(
            db, order_id, ctx.executor_id
        )
        if total is not None:
            order.budget = total
            if est_currency:
                order.currency = _normalize_currency(est_currency)
            order.budget_type = ctx.budget_type or "Сметная цена"
            if commit:
                await db.commit()
            else:
                await db.flush()
            logger.info(
                "order %s budget synced from estimate: %s %s",
                order_id,
                total,
                order.currency,
            )
        return

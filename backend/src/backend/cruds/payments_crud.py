import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import PAYMENT_ALLOW_TEST, WEBPAY_API_URL
from cruds.notifications_crud import notify_payment_event
from models.orders_models import ExecutorOrder, Order, OrderResponseExecutor
from models.payments_models import ExecutorBankAccount, Payment
from models.users_models import User
from payments.constants import (
    COMMISSION_RATE,
    HELD_PAYMENT_STATUSES,
    LEGACY_RELEASED_STATUSES,
    PAYMENT_STATUS_ESCROW,
    PAYMENT_STATUS_PENDING,
    PAYMENT_STATUS_RELEASED,
)
from schemas.payments_schemas import (
    AdminPaymentListItem,
    AdminPaymentStats,
    AdminPaymentsResponse,
    ExecutorBankAccountSchema,
)

logger = logging.getLogger(__name__)

MOCK_WEBPAY_URL = WEBPAY_API_URL


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_payment_parts(executor_amount: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    commission = (executor_amount * Decimal(str(COMMISSION_RATE))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    total = executor_amount + commission
    return executor_amount, commission, total


async def get_order_for_payment(db: AsyncSession, order_id: int) -> Order:
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return order


async def resolve_executor_for_payment(
    db: AsyncSession,
    order_id: int,
    *,
    fallback_executor_id: Optional[int] = None,
    allow_fallback: bool = False,
) -> int:
    result = await db.execute(
        select(ExecutorOrder.executor_id).where(ExecutorOrder.order_id == order_id)
    )
    executor_id = result.scalar_one_or_none()
    if executor_id:
        return int(executor_id)

    response_result = await db.execute(
        select(OrderResponseExecutor.executor_id)
        .where(OrderResponseExecutor.order_id == order_id)
        .order_by(OrderResponseExecutor.created_at.desc())
        .limit(1)
    )
    response_executor_id = response_result.scalar_one_or_none()
    if response_executor_id:
        return int(response_executor_id)

    if allow_fallback and fallback_executor_id:
        return int(fallback_executor_id)

    raise HTTPException(
        status_code=400,
        detail=(
            "Исполнитель на заказ не назначен — укажите исполнителя "
            "или используйте тестовую оплату с выбранным исполнителем"
        ),
    )


async def get_executor_paid_total(db: AsyncSession, order_id: int) -> Decimal:
    result = await db.execute(
        select(func.coalesce(func.sum(Payment.executor_amount), 0)).where(
            Payment.order_id == order_id,
            Payment.status.in_(
                (*HELD_PAYMENT_STATUSES, *LEGACY_RELEASED_STATUSES)
            ),
        )
    )
    return _money(result.scalar_one())


async def add_executor_bank_account(
    db: AsyncSession,
    executor_id: int,
    executor_bank_account_schema: ExecutorBankAccountSchema,
):
    result = await db.execute(
        select(ExecutorBankAccount).where(
            ExecutorBankAccount.executor_id == executor_id
        )
    )

    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Счёт уже привязан")

    executor_bank_account = ExecutorBankAccount(
        bank_name=executor_bank_account_schema.bank_name,
        account_number=executor_bank_account_schema.account_number,
        inn=executor_bank_account_schema.inn,
        bank_bic=executor_bank_account_schema.bank_bic,
        bank_account=executor_bank_account_schema.bank_account,
        agreed_to_processing=executor_bank_account_schema.agreed_to_processing,
        executor_id=executor_id,
    )

    db.add(executor_bank_account)
    await db.commit()
    await db.refresh(executor_bank_account)
    return executor_bank_account


async def get_payment_order(
    db: AsyncSession, order_id: int, customer_id: int
) -> list[Payment]:
    try:
        result = await db.execute(
            select(Payment).where(
                and_(Payment.order_id == order_id, Payment.customer_id == customer_id)
            ).order_by(Payment.created_at.desc())
        )
        return list(result.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {str(e)}")


async def get_executor_order_all_payments(
    db: AsyncSession, executor_id: int, order_id: int
):
    try:
        result = await db.execute(
            select(Payment)
            .where(
                and_(Payment.executor_id == executor_id, Payment.order_id == order_id)
            )
            .order_by(Payment.created_at.desc())
        )
        return list(result.scalars().all())
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Ошибка при получении платежей исполнителя: %s", e)
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {str(e)}")


async def create_escrow_payment(
    db: AsyncSession,
    *,
    order_id: int,
    customer_id: int,
    executor_amount_raw: float,
    payment_method: str,
    fallback_executor_id: Optional[int] = None,
) -> tuple[Payment, Optional[str], bool]:
    method = (payment_method or "webpay").lower()
    is_test = method == "test"

    if is_test and not PAYMENT_ALLOW_TEST:
        raise HTTPException(status_code=403, detail="Тестовая оплата отключена")

    order = await get_order_for_payment(db, order_id)
    if int(order.customer_id) != int(customer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к оплате этого заказа")

    executor_id = await resolve_executor_for_payment(
        db,
        order_id,
        fallback_executor_id=fallback_executor_id,
        allow_fallback=is_test,
    )
    order_budget = _money(order.budget)
    if order_budget <= 0:
        raise HTTPException(status_code=400, detail="У заказа не указан бюджет")

    executor_amount = _money(executor_amount_raw)
    if executor_amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")

    already_paid = await get_executor_paid_total(db, order_id)
    remaining = order_budget - already_paid
    if executor_amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Сумма превышает остаток к оплате ({remaining} {order.currency or 'BYN'})",
        )

    executor_part, commission, total = calculate_payment_parts(executor_amount)
    payment_url: Optional[str] = None

    if is_test:
        transaction_id = f"TEST-{uuid.uuid4().hex[:12].upper()}"
        initial_status = PAYMENT_STATUS_ESCROW
    else:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    MOCK_WEBPAY_URL,
                    json={
                        "WebPayPid": f"order_{order_id}",
                        "Amount": str(total),
                    },
                )
                if not response.is_success:
                    raise HTTPException(
                        status_code=502,
                        detail=(
                            "Платёжный шлюз недоступен. Запустите mock_web_pay.py "
                            "на порту 8001 или используйте тестовую оплату."
                        ),
                    )
                payment_data = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Платёжный шлюз недоступен. Запустите mock_web_pay.py "
                    "на порту 8001 или используйте тестовую оплату."
                ),
            ) from exc

        transaction_id = payment_data["PaymentId"]
        payment_url = payment_data["PaymentUrl"]
        initial_status = PAYMENT_STATUS_PENDING

    payment = Payment(
        order_id=order_id,
        customer_id=customer_id,
        executor_id=executor_id,
        amount=total,
        executor_amount=executor_part,
        commission=commission,
        currency=order.currency or "BYN",
        payment_method=method,
        transaction_id=transaction_id,
        status=initial_status,
    )
    if is_test:
        payment.completed_at = func.now()

    db.add(payment)
    await db.flush()

    if is_test:
        await notify_payment_event(
            db,
            order_id=order_id,
            actor_user_id=customer_id,
            detail=(
                f"тестовая оплата {total} {payment.currency} "
                "зачислена в эскроу"
            ),
            recipient_id=executor_id,
        )
    else:
        await notify_payment_event(
            db,
            order_id=order_id,
            actor_user_id=customer_id,
            detail=f"инициирована оплата {total} {payment.currency} (ожидает подтверждения)",
            recipient_id=executor_id,
        )
    await db.commit()
    await db.refresh(payment)

    return payment, payment_url, is_test


async def confirm_payment_callback(
    db: AsyncSession,
    *,
    transaction_id: str,
    status: str,
) -> Optional[Payment]:
    result = await db.execute(
        select(Payment).where(Payment.transaction_id == transaction_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return None

    normalized = (status or "").lower()
    if normalized in {"paid", "succeeded", "success", PAYMENT_STATUS_ESCROW}:
        if payment.status == PAYMENT_STATUS_PENDING:
            payment.status = PAYMENT_STATUS_ESCROW
            payment.completed_at = func.now()
            await notify_payment_event(
                db,
                order_id=payment.order_id,
                actor_user_id=payment.customer_id,
                detail=(
                    f"оплата {payment.amount} {payment.currency} "
                    "зачислена в эскроу"
                ),
                recipient_id=payment.executor_id,
            )
    elif normalized in {"failed", "cancelled", "canceled"}:
        payment.status = "failed"

    await db.commit()
    await db.refresh(payment)
    return payment


async def release_payment_to_executor(
    db: AsyncSession,
    *,
    order_id: int,
    payment_id: int,
    customer_id: int,
) -> Payment:
    result = await db.execute(
        select(Payment).where(
            and_(Payment.order_id == order_id, Payment.id == payment_id)
        )
    )
    payment = result.scalar_one_or_none()

    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")

    if int(payment.customer_id) != int(customer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к этому платежу")

    if payment.status != PAYMENT_STATUS_ESCROW:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя перевести исполнителю: статус «{payment.status}»",
        )

    bank_result = await db.execute(
        select(ExecutorBankAccount).where(
            ExecutorBankAccount.executor_id == payment.executor_id
        )
    )
    bank_account = bank_result.scalar_one_or_none()
    if bank_account:
        payment.executor_bank_account_id = bank_account.id

    payment.status = PAYMENT_STATUS_RELEASED
    payment.payout_date = func.now()

    await notify_payment_event(
        db,
        order_id=order_id,
        actor_user_id=customer_id,
        detail=(
            f"исполнителю переведено {payment.executor_amount} "
            f"{payment.currency}"
        ),
        recipient_id=payment.executor_id,
    )
    await db.commit()
    await db.refresh(payment)
    return payment


def _user_display_name(user: User | None) -> str:
    if not user:
        return ""
    return f"{user.first_name or ''} {user.last_name or ''}".strip()


async def get_payments_for_admin(
    db: AsyncSession,
    *,
    status: Optional[str] = None,
) -> AdminPaymentsResponse:
    from sqlalchemy.orm import aliased

    Customer = aliased(User)
    Executor = aliased(User)

    stmt = (
        select(Payment, Order, Customer, Executor)
        .outerjoin(Order, Payment.order_id == Order.id)
        .outerjoin(Customer, Payment.customer_id == Customer.id)
        .outerjoin(Executor, Payment.executor_id == Executor.id)
        .order_by(Payment.created_at.desc())
    )
    if status and status != "all":
        stmt = stmt.where(Payment.status == status)

    result = await db.execute(stmt)
    rows = result.all()

    payments: list[AdminPaymentListItem] = []
    total_amount = Decimal("0")
    total_commission = Decimal("0")
    escrow_amount = Decimal("0")
    released_amount = Decimal("0")
    pending_count = 0
    escrow_count = 0
    released_count = 0

    for payment, order, customer, executor in rows:
        amount = _money(payment.amount)
        commission = _money(payment.commission)
        executor_amount = _money(payment.executor_amount)

        total_amount += amount
        total_commission += commission

        if payment.status == PAYMENT_STATUS_PENDING:
            pending_count += 1
        elif payment.status == PAYMENT_STATUS_ESCROW:
            escrow_count += 1
            escrow_amount += amount
        elif payment.status in (PAYMENT_STATUS_RELEASED, *LEGACY_RELEASED_STATUSES):
            released_count += 1
            released_amount += amount

        payments.append(
            AdminPaymentListItem(
                id=payment.id,
                order_id=payment.order_id,
                order_title=order.title if order else None,
                customer_id=payment.customer_id,
                customer_name=_user_display_name(customer) or f"ID {payment.customer_id}",
                executor_id=payment.executor_id,
                executor_name=_user_display_name(executor) or f"ID {payment.executor_id}",
                amount=float(amount),
                executor_amount=float(executor_amount),
                commission=float(commission),
                currency=payment.currency,
                status=payment.status,
                payment_method=payment.payment_method,
                transaction_id=payment.transaction_id,
                created_at=payment.created_at,
                completed_at=payment.completed_at,
                payout_date=payment.payout_date,
            )
        )

    stats = AdminPaymentStats(
        total_count=len(payments),
        total_amount=float(total_amount),
        total_commission=float(total_commission),
        escrow_amount=float(escrow_amount),
        released_amount=float(released_amount),
        pending_count=pending_count,
        escrow_count=escrow_count,
        released_count=released_count,
    )
    return AdminPaymentsResponse(stats=stats, payments=payments)

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import PAYMENT_CALLBACK_SECRET, get_db
from cruds.payments_crud import (
    add_executor_bank_account,
    confirm_payment_callback,
    create_escrow_payment,
    get_executor_order_all_payments,
    get_payment_order,
    get_payments_for_admin,
    release_payment_to_executor,
)
from core.auth import ensure_same_user, get_current_admin_user, get_current_user
from schemas.payments_schemas import (
    AdminPaymentsResponse,
    ExecutorBankAccountSchema,
    PaymentCreateRequest,
    PaymentCreateResponse,
    PaymentOut,
)
from schemas.users_schemas import UserCommonSchema

router = APIRouter(prefix="", tags=["payments"])

logger = logging.getLogger(__name__)


class CallbackSchema(BaseModel):
    payment_id: str
    status: str


def _payment_to_out(payment) -> PaymentOut:
    return PaymentOut(
        id=payment.id,
        order_id=payment.order_id,
        customer_id=payment.customer_id,
        executor_id=payment.executor_id,
        executor_bank_account_id=payment.executor_bank_account_id,
        amount=float(payment.amount),
        executor_amount=float(payment.executor_amount),
        commission=float(payment.commission),
        currency=payment.currency,
        status=payment.status,
        payment_method=payment.payment_method,
        transaction_id=payment.transaction_id,
        created_at=payment.created_at,
        completed_at=payment.completed_at,
        payout_date=payment.payout_date,
    )


@router.post("/order/{order_id}/pay_escrow", response_model=PaymentCreateResponse)
async def create_payment(
    order_id: int,
    body: PaymentCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    payment, payment_url, is_test = await create_escrow_payment(
        db,
        order_id=order_id,
        customer_id=current_user.user_id,
        executor_amount_raw=body.executor_amount,
        payment_method=body.payment_method,
        fallback_executor_id=body.executor_id,
    )
    return PaymentCreateResponse(
        payment_id=payment.id,
        payment_url=payment_url,
        amount=float(payment.amount),
        executor_amount=float(payment.executor_amount),
        commission=float(payment.commission),
        currency=payment.currency,
        status=payment.status,
        test_mode=is_test,
    )


@router.post("/order/{order_id}/payment/{payment_id}/pay_executor", response_model=PaymentOut)
async def pay_executor_for_order_api(
    order_id: int,
    payment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    payment = await release_payment_to_executor(
        db,
        order_id=order_id,
        payment_id=payment_id,
        customer_id=current_user.user_id,
    )
    return _payment_to_out(payment)


@router.post("/order/{order_id}/approve")
async def approve_order(
    order_id: int,
    payment_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    """Совместимость: подтверждение выполнения = выпуск эскроу."""
    from sqlalchemy import select
    from models.payments_models import Payment
    from payments.constants import PAYMENT_STATUS_ESCROW

    resolved_payment_id = payment_id
    if resolved_payment_id is None:
        result = await db.execute(
            select(Payment.id)
            .where(
                Payment.order_id == order_id,
                Payment.customer_id == current_user.user_id,
                Payment.status == PAYMENT_STATUS_ESCROW,
            )
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
        resolved_payment_id = result.scalar_one_or_none()
        if not resolved_payment_id:
            raise HTTPException(status_code=404, detail="Нет платежа в эскроу")

    payment = await release_payment_to_executor(
        db,
        order_id=order_id,
        payment_id=resolved_payment_id,
        customer_id=current_user.user_id,
    )
    return {
        "status": "released",
        "payment": _payment_to_out(payment),
    }


@router.post("/payment/callback")
async def payment_callback(
    callback: CallbackSchema,
    db: AsyncSession = Depends(get_db),
    x_payment_secret: Annotated[Optional[str], Header()] = None,
):
    if x_payment_secret != PAYMENT_CALLBACK_SECRET:
        raise HTTPException(status_code=403, detail="Недопустимый callback")

    payment = await confirm_payment_callback(
        db,
        transaction_id=callback.payment_id,
        status=callback.status,
    )
    if payment:
        logger.info(
            "Payment %s updated to %s", callback.payment_id, payment.status
        )
        return {"status": "ok", "updated": True, "payment_status": payment.status}

    logger.warning("Payment %s not found", callback.payment_id)
    return {"status": "ok", "updated": False}


@router.post("/executor/{executor_id}/bank-account")
async def add_executor_bank_account_api(
    executor_id: int,
    executor_bank_account_schema: ExecutorBankAccountSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, executor_id)
    return await add_executor_bank_account(
        db, executor_id, executor_bank_account_schema
    )


@router.get(
    "/payment_for_order/{order_id}/{customer_id}",
    response_model=list[PaymentOut],
)
async def get_payment_for_order_api(
    order_id: int,
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, customer_id)
    payments = await get_payment_order(
        db=db, order_id=order_id, customer_id=customer_id
    )
    return [_payment_to_out(p) for p in payments]


@router.get("/executor/{executor_id}/order/{order_id}/payments", response_model=list[PaymentOut])
async def get_executor_order_all_payments_api(
    executor_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, executor_id)
    payments = await get_executor_order_all_payments(
        db=db, executor_id=executor_id, order_id=order_id
    )
    return [_payment_to_out(p) for p in payments]


@router.get("/admin/payments", response_model=AdminPaymentsResponse)
async def get_admin_payments_api(
    status: Optional[str] = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    return await get_payments_for_admin(db, status=status)

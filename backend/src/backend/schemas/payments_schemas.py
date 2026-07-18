from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PaymentCreateRequest(BaseModel):
    executor_amount: float = Field(..., gt=0)
    payment_method: str = Field(default="test", max_length=50)
    executor_id: Optional[int] = Field(
        default=None,
        description="Для тестовой оплаты, если исполнитель ещё не назначен в БД",
    )


class PaymentCreateResponse(BaseModel):
    payment_id: int
    payment_url: Optional[str] = None
    amount: float
    executor_amount: float
    commission: float
    currency: str
    status: str
    test_mode: bool = False


class PaymentOut(BaseModel):
    id: int
    order_id: int
    customer_id: int
    executor_id: int
    executor_bank_account_id: Optional[int] = None
    amount: float
    executor_amount: float
    commission: float
    currency: str
    status: str
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    payout_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExecutorBankAccountSchema(BaseModel):
    id: Optional[int] = None
    executor_id: Optional[int] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    inn: Optional[str] = None
    bank_bic: Optional[str] = None
    bank_account: Optional[str] = None
    agreed_to_processing: Optional[bool] = None


class AdminPaymentStats(BaseModel):
    total_count: int
    total_amount: float
    total_commission: float
    escrow_amount: float
    released_amount: float
    pending_count: int
    escrow_count: int
    released_count: int


class AdminPaymentListItem(BaseModel):
    id: int
    order_id: int
    order_title: Optional[str] = None
    customer_id: int
    customer_name: str
    executor_id: int
    executor_name: str
    amount: float
    executor_amount: float
    commission: float
    currency: str
    status: str
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    payout_date: Optional[datetime] = None


class AdminPaymentsResponse(BaseModel):
    stats: AdminPaymentStats
    payments: list[AdminPaymentListItem]

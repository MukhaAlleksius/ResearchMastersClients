from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal


class ContractCreate(BaseModel):
    order_id: int
    customer_id: int
    executor_id: int
    address_work: str
    title_work: str
    name_work: str
    date_start_work: str
    date_end_work: str | None
    # При сметной цене сумма может быть неизвестна → null
    budget: Optional[Decimal] = Field(None, description="Сумма договора; null для сметной цены")
    currency: str = "BYN"
    budget_type: str | None = None
    subscribe_customer: bool = False
    subscribe_executor: bool = False


class ContractResponse(ContractCreate):
    id: int
    customer_name: str
    executor_name: str
    created_at: str  # "12.02.2026 21:09"

    class Config:
        from_attributes = True

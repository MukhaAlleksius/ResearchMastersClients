from pydantic import BaseModel, Field, field_validator
from typing import Optional
from decimal import Decimal

from core.future_dates import ensure_not_before_today, parse_user_date


class ContractCreate(BaseModel):
    order_id: int
    customer_id: int
    executor_id: int
    address_work: str
    title_work: str
    name_work: str
    date_start_work: str
    date_end_work: str | None = None
    # При сметной цене сумма может быть неизвестна → null
    budget: Optional[Decimal] = Field(None, description="Сумма договора; null для сметной цены")
    currency: str = "BYN"
    budget_type: str | None = None
    subscribe_customer: bool = False
    subscribe_executor: bool = False

    @field_validator("date_start_work")
    @classmethod
    def validate_start_not_past(cls, v: str) -> str:
        if cls.__name__ == "ContractResponse":
            return v
        raw = (v or "").strip()
        if not raw or not parse_user_date(raw):
            raise ValueError("Укажите дату начала работ")
        return ensure_not_before_today(raw, field_name="Дата начала работ") or raw

    @field_validator("date_end_work", mode="before")
    @classmethod
    def empty_end_to_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        raw = str(v).strip()
        if not raw or raw.lower() == "дата окончания":
            return None
        return raw

    @field_validator("date_end_work")
    @classmethod
    def validate_end_date(cls, v: str | None, info) -> str | None:
        if cls.__name__ == "ContractResponse" or not v:
            return v
        ensure_not_before_today(v, field_name="Дата окончания работ")
        start = parse_user_date(info.data.get("date_start_work"))
        end = parse_user_date(v)
        if start and end and end < start:
            raise ValueError("Дата окончания не может быть раньше даты начала")
        return v


class ContractResponse(ContractCreate):
    id: int
    customer_name: str
    executor_name: str
    created_at: str  # "12.02.2026 21:09"

    class Config:
        from_attributes = True

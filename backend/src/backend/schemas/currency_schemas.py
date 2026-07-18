from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CurrencyRateOut(BaseModel):
    code: str = Field(..., description="Код валюты (USD, EUR, RUB…)")
    name: str = Field(..., description="Название валюты")
    scale: int = Field(..., description="Количество единиц, за которое указан курс")
    official_rate: Decimal = Field(
        ..., description="Официальный курс НБРБ за scale единиц, BYN"
    )
    rate_per_unit: Decimal = Field(..., description="Курс за 1 единицу валюты, BYN")
    rate_date: date = Field(..., description="Дата установления курса")


class CurrencyRatesResponse(BaseModel):
    source: str = "nbrb"
    updated_at: datetime
    base_currency: str = "BYN"
    rates: list[CurrencyRateOut]


class CurrencyConvertRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    from_currency: str = Field(..., min_length=3, max_length=10)
    to_currency: str = Field(..., min_length=3, max_length=10)


class CurrencyConvertResponse(BaseModel):
    amount: Decimal
    from_currency: str
    to_currency: str
    result: Decimal
    rate: Decimal
    rate_date: date
    source: str = "nbrb"

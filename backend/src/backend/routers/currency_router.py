import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_db
from cruds.currency.nbrb_rates import (
    DEFAULT_CURRENCY_CODES,
    convert_currency,
    get_currency_rate,
    get_currency_rates_response,
    normalize_currency_code,
)
from schemas.currency_schemas import (
    CurrencyConvertResponse,
    CurrencyRateOut,
    CurrencyRatesResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/currency", tags=["currency"])


@router.get("/rates", response_model=CurrencyRatesResponse)
async def list_currency_rates(
    codes: str | None = Query(
        None,
        description="Коды через запятую (USD,EUR,RUB). По умолчанию основные валюты.",
    ),
    refresh: bool = Query(False, description="Принудительно обновить из НБРБ"),
    db: AsyncSession = Depends(get_db),
):
    selected_codes = DEFAULT_CURRENCY_CODES
    if codes:
        selected_codes = tuple(
            normalize_currency_code(part)
            for part in codes.split(",")
            if part.strip()
        )
        if not selected_codes:
            raise HTTPException(status_code=400, detail="Не указаны коды валют")

    return await get_currency_rates_response(
        db, codes=selected_codes, force_refresh=refresh
    )


@router.get("/rates/{code}", response_model=CurrencyRateOut)
async def get_single_currency_rate(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    return await get_currency_rate(db, code)


@router.get("/convert", response_model=CurrencyConvertResponse)
async def convert_currency_amount(
    amount: Decimal = Query(..., gt=0),
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    db: AsyncSession = Depends(get_db),
):
    return await convert_currency(db, amount, from_currency, to_currency)

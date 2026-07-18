import logging
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

import certifi
import httpx
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.currency import currency_crud
from cruds.currency.tz_utils import MINSK_TZ
from schemas.currency_schemas import (
    CurrencyConvertResponse,
    CurrencyRateOut,
    CurrencyRatesResponse,
)

logger = logging.getLogger(__name__)

NBRB_API_BASE = "https://api.nbrb.by/exrates"
DEFAULT_CURRENCY_CODES = ("USD", "EUR", "RUB")

CURRENCY_ALIASES = {
    "BYN": "BYN",
    "BYR": "BYN",
    "USD": "USD",
    "DOLLAR USA": "USD",
    "DOLLAR": "USD",
    "EUR": "EUR",
    "EURO": "EUR",
    "RUB": "RUB",
    "RUR": "RUB",
}


def normalize_currency_code(code: str) -> str:
    normalized = (code or "").strip().upper()
    return CURRENCY_ALIASES.get(normalized, normalized)


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _parse_nbrb_rate(raw: dict) -> CurrencyRateOut:
    scale = int(raw["Cur_Scale"])
    official_rate = Decimal(str(raw["Cur_OfficialRate"]))
    rate_per_unit = _quantize(official_rate / Decimal(scale))
    rate_date = datetime.fromisoformat(raw["Date"]).date()

    return CurrencyRateOut(
        code=raw["Cur_Abbreviation"],
        name=raw["Cur_Name"],
        scale=scale,
        official_rate=official_rate,
        rate_per_unit=rate_per_unit,
        rate_date=rate_date,
    )


def _nbrb_verify_options():
    yield certifi.where()
    # На некоторых Windows окружениях системные CA недоступны — fallback для dev.
    yield False


async def _request_nbrb_json(url: str, params: dict) -> list:
    last_exc = None
    verify_options = list(_nbrb_verify_options())

    for index, verify in enumerate(verify_options):
        try:
            async with httpx.AsyncClient(timeout=15.0, verify=verify) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                if verify is False:
                    logger.warning(
                        "NBRB: запрос выполнен без проверки SSL-сертификата (dev fallback)"
                    )
                return data
        except httpx.HTTPError as exc:
            last_exc = exc
            if index < len(verify_options) - 1:
                logger.warning("NBRB SSL/request failed, retry: %s", exc)
                continue
            break

    logger.error("NBRB API request failed: %s", last_exc)
    raise HTTPException(
        status_code=502,
        detail="Не удалось получить курсы валют от НБРБ",
    ) from last_exc


async def fetch_rates_from_nbrb() -> list[CurrencyRateOut]:
    """Загрузка курсов из API НБРБ (внешний источник, не CRUD)."""
    url = f"{NBRB_API_BASE}/rates"
    params = {"periodicity": 0}

    data = await _request_nbrb_json(url, params)

    if not isinstance(data, list):
        raise HTTPException(
            status_code=502,
            detail="Некорректный ответ API НБРБ",
        )

    return [_parse_nbrb_rate(item) for item in data]


async def sync_daily_rates_from_nbrb(
    db: AsyncSession,
    force_refresh: bool = False,
) -> datetime:
    """Синхронизация: раз в день — запрос к НБРБ + upsert в БД через currency_crud."""
    if not force_refresh and await currency_crud.has_rates_fetched_today(db):
        fetched_at = await currency_crud.get_latest_fetched_at(db)
        if fetched_at is not None:
            return fetched_at

    try:
        parsed_rates = await fetch_rates_from_nbrb()
        return await currency_crud.upsert_currency_rates(db, parsed_rates)
    except HTTPException as exc:
        fetched_at = await currency_crud.get_latest_fetched_at(db)
        if fetched_at is not None:
            logger.warning(
                "NBRB недоступен (%s), используем сохранённые курсы из БД",
                exc.detail,
            )
            return fetched_at
        raise


async def get_currency_rates_response(
    db: AsyncSession,
    codes: tuple[str, ...] | None = None,
    force_refresh: bool = False,
) -> CurrencyRatesResponse:
    await sync_daily_rates_from_nbrb(db, force_refresh=force_refresh)

    selected_codes = codes
    if selected_codes:
        selected_codes = tuple(normalize_currency_code(code) for code in selected_codes)

    rates, updated_at = await currency_crud.get_currency_rates(db, selected_codes)
    if not rates:
        raise HTTPException(
            status_code=404,
            detail="Курсы валют не найдены в базе данных",
        )

    return CurrencyRatesResponse(
        updated_at=updated_at or datetime.now(MINSK_TZ),
        rates=rates,
    )


async def get_currency_rate(db: AsyncSession, code: str) -> CurrencyRateOut:
    normalized = normalize_currency_code(code)
    if normalized == "BYN":
        return CurrencyRateOut(
            code="BYN",
            name="Белорусский рубль",
            scale=1,
            official_rate=Decimal("1"),
            rate_per_unit=Decimal("1"),
            rate_date=date.today(),
        )

    await sync_daily_rates_from_nbrb(db)
    rate = await currency_crud.get_currency_rate_by_code(db, normalized)
    if rate is None:
        raise HTTPException(
            status_code=404,
            detail=f"Курс для валюты {normalized} не найден",
        )
    return rate


async def convert_currency(
    db: AsyncSession,
    amount: Decimal,
    from_currency: str,
    to_currency: str,
) -> CurrencyConvertResponse:
    source_code = normalize_currency_code(from_currency)
    target_code = normalize_currency_code(to_currency)

    if source_code == target_code:
        return CurrencyConvertResponse(
            amount=amount,
            from_currency=source_code,
            to_currency=target_code,
            result=_quantize_money(amount),
            rate=Decimal("1"),
            rate_date=date.today(),
        )

    source_rate = None
    if source_code != "BYN":
        source_rate = await get_currency_rate(db, source_code)
        amount_in_byn = amount * source_rate.official_rate / Decimal(
            source_rate.scale
        )
        rate_date = source_rate.rate_date
        cross_rate = source_rate.rate_per_unit
    else:
        amount_in_byn = amount
        rate_date = date.today()
        cross_rate = Decimal("1")

    if target_code == "BYN":
        return CurrencyConvertResponse(
            amount=amount,
            from_currency=source_code,
            to_currency=target_code,
            result=_quantize_money(amount_in_byn),
            rate=cross_rate if source_code != "BYN" else Decimal("1"),
            rate_date=rate_date,
        )

    target_rate = await get_currency_rate(db, target_code)
    result = amount_in_byn * Decimal(target_rate.scale) / target_rate.official_rate
    effective_rate = _quantize(
        source_rate.rate_per_unit / target_rate.rate_per_unit
        if source_code != "BYN"
        else Decimal(target_rate.scale) / target_rate.official_rate
    )

    return CurrencyConvertResponse(
        amount=amount,
        from_currency=source_code,
        to_currency=target_code,
        result=_quantize_money(result),
        rate=effective_rate,
        rate_date=target_rate.rate_date,
    )


async def preload_nbrb_rates(db: AsyncSession) -> None:
    try:
        await sync_daily_rates_from_nbrb(db)
    except HTTPException as exc:
        logger.warning("Не удалось предзагрузить курсы НБРБ: %s", exc.detail)

import logging  # Логирование запросов к НБРБ
from datetime import date, datetime  # Даты курсов и ответов API
from decimal import Decimal, ROUND_HALF_UP  # Точные расчёты и округление

import certifi  # CA-сертификаты для HTTPS
import httpx  # Асинхронный HTTP-клиент
from fastapi import HTTPException  # HTTP-ошибки для клиента
from sqlalchemy.ext.asyncio import AsyncSession  # Сессия БД

from cruds.currency import currency_crud  # CRUD курсов в БД
from cruds.currency.tz_utils import MINSK_TZ  # Часовой пояс Минска
from schemas.currency_schemas import (
    CurrencyConvertResponse,  # Ответ конвертации
    CurrencyRateOut,  # Одна запись курса
    CurrencyRatesResponse,  # Список курсов с меткой обновления
)

logger = logging.getLogger(__name__)  # Логгер модуля

NBRB_API_BASE = "https://api.nbrb.by/exrates"  # Базовый URL API НБРБ
DEFAULT_CURRENCY_CODES = ("USD", "EUR", "RUB")  # Валюты по умолчанию

CURRENCY_ALIASES = {  # Нормализация кодов и синонимов валют
    "BYN": "BYN",
    "BYR": "BYN",  # Старый код → BYN
    "USD": "USD",
    "DOLLAR USA": "USD",
    "DOLLAR": "USD",
    "EUR": "EUR",
    "EURO": "EUR",
    "RUB": "RUB",
    "RUR": "RUB",  # Старый код рубля
}


def normalize_currency_code(code: str) -> str:  # Приведение кода валюты к каноническому виду
    normalized = (code or "").strip().upper()  # Обрезка и верхний регистр
    return CURRENCY_ALIASES.get(normalized, normalized)  # Алиас или как есть


def _quantize(value: Decimal) -> Decimal:  # Округление курса до 4 знаков
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _quantize_money(value: Decimal) -> Decimal:  # Округление суммы до копеек
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _parse_nbrb_rate(raw: dict) -> CurrencyRateOut:  # JSON НБРБ → Pydantic-схема
    scale = int(raw["Cur_Scale"])  # Номинал валюты
    official_rate = Decimal(str(raw["Cur_OfficialRate"]))  # Официальный курс
    rate_per_unit = _quantize(official_rate / Decimal(scale))  # Курс за 1 единицу
    rate_date = datetime.fromisoformat(raw["Date"]).date()  # Дата из ISO-строки

    return CurrencyRateOut(
        code=raw["Cur_Abbreviation"],
        name=raw["Cur_Name"],
        scale=scale,
        official_rate=official_rate,
        rate_per_unit=rate_per_unit,
        rate_date=rate_date,
    )


def _nbrb_verify_options():  # Варианты проверки SSL для httpx
    yield certifi.where()  # Сначала — доверенные CA из certifi
    # На некоторых Windows окружениях системные CA недоступны — fallback для dev.
    yield False  # Последняя попытка — без проверки сертификата


async def _request_nbrb_json(url: str, params: dict) -> list:  # GET к API НБРБ с retry по SSL
    last_exc = None  # Последняя ошибка для проброса
    verify_options = list(_nbrb_verify_options())  # Список режимов verify

    for index, verify in enumerate(verify_options):
        try:
            async with httpx.AsyncClient(timeout=15.0, verify=verify) as client:  # HTTP-сессия
                response = await client.get(url, params=params)  # Запрос к НБРБ
                response.raise_for_status()  # 4xx/5xx → исключение
                data = response.json()  # Парсим JSON
                if verify is False:
                    logger.warning(
                        "NBRB: запрос выполнен без проверки SSL-сертификата (dev fallback)"
                    )
                return data  # Успешный ответ
        except httpx.HTTPError as exc:
            last_exc = exc  # Запоминаем ошибку
            if index < len(verify_options) - 1:
                logger.warning("NBRB SSL/request failed, retry: %s", exc)
                continue  # Пробуем следующий verify
            break  # Все варианты исчерпаны

    logger.error("NBRB API request failed: %s", last_exc)
    raise HTTPException(
        status_code=502,
        detail="Не удалось получить курсы валют от НБРБ",
    ) from last_exc


async def fetch_rates_from_nbrb() -> list[CurrencyRateOut]:
    """Загрузка курсов из API НБРБ (внешний источник, не CRUD)."""
    url = f"{NBRB_API_BASE}/rates"  # Эндпоинт всех курсов
    params = {"periodicity": 0}  # Ежедневные курсы

    data = await _request_nbrb_json(url, params)  # Сырой JSON от НБРБ

    if not isinstance(data, list):
        raise HTTPException(
            status_code=502,
            detail="Некорректный ответ API НБРБ",
        )

    return [_parse_nbrb_rate(item) for item in data]  # Парсим каждую валюту


async def sync_daily_rates_from_nbrb(
    db: AsyncSession,
    force_refresh: bool = False,
) -> datetime:
    """Синхронизация: раз в день — запрос к НБРБ + upsert в БД через currency_crud."""
    if not force_refresh and await currency_crud.has_rates_fetched_today(db):  # Уже загружали сегодня
        fetched_at = await currency_crud.get_latest_fetched_at(db)
        if fetched_at is not None:
            return fetched_at  # Возвращаем время последней загрузки

    try:
        parsed_rates = await fetch_rates_from_nbrb()  # Запрос к внешнему API
        return await currency_crud.upsert_currency_rates(db, parsed_rates)  # Сохранение в БД
    except HTTPException as exc:
        fetched_at = await currency_crud.get_latest_fetched_at(db)  # Fallback на кэш в БД
        if fetched_at is not None:
            logger.warning(
                "NBRB недоступен (%s), используем сохранённые курсы из БД",
                exc.detail,
            )
            return fetched_at
        raise  # Нет кэша — пробрасываем ошибку


async def get_currency_rates_response(
    db: AsyncSession,
    codes: tuple[str, ...] | None = None,
    force_refresh: bool = False,
) -> CurrencyRatesResponse:
    await sync_daily_rates_from_nbrb(db, force_refresh=force_refresh)  # Актуализируем курсы

    selected_codes = codes
    if selected_codes:
        selected_codes = tuple(normalize_currency_code(code) for code in selected_codes)  # Нормализация кодов

    rates, updated_at = await currency_crud.get_currency_rates(db, selected_codes)  # Чтение из БД
    if not rates:
        raise HTTPException(
            status_code=404,
            detail="Курсы валют не найдены в базе данных",
        )

    return CurrencyRatesResponse(
        updated_at=updated_at or datetime.now(MINSK_TZ),  # Метка обновления
        rates=rates,
    )


async def get_currency_rate(db: AsyncSession, code: str) -> CurrencyRateOut:
    normalized = normalize_currency_code(code)  # Канонический код
    if normalized == "BYN":
        return CurrencyRateOut(  # BYN — базовая валюта, курс 1:1
            code="BYN",
            name="Белорусский рубль",
            scale=1,
            official_rate=Decimal("1"),
            rate_per_unit=Decimal("1"),
            rate_date=date.today(),
        )

    await sync_daily_rates_from_nbrb(db)  # Подтягиваем курсы при необходимости
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
    source_code = normalize_currency_code(from_currency)  # Исходная валюта
    target_code = normalize_currency_code(to_currency)  # Целевая валюта

    if source_code == target_code:
        return CurrencyConvertResponse(  # Конвертация не нужна
            amount=amount,
            from_currency=source_code,
            to_currency=target_code,
            result=_quantize_money(amount),
            rate=Decimal("1"),
            rate_date=date.today(),
        )

    source_rate = None
    if source_code != "BYN":
        source_rate = await get_currency_rate(db, source_code)  # Курс исходной валюты
        amount_in_byn = amount * source_rate.official_rate / Decimal(
            source_rate.scale
        )  # Сумма в BYN
        rate_date = source_rate.rate_date
        cross_rate = source_rate.rate_per_unit  # Курс за единицу к BYN
    else:
        amount_in_byn = amount  # Уже в BYN
        rate_date = date.today()
        cross_rate = Decimal("1")

    if target_code == "BYN":
        return CurrencyConvertResponse(  # Конвертация только в BYN
            amount=amount,
            from_currency=source_code,
            to_currency=target_code,
            result=_quantize_money(amount_in_byn),
            rate=cross_rate if source_code != "BYN" else Decimal("1"),
            rate_date=rate_date,
        )

    target_rate = await get_currency_rate(db, target_code)  # Курс целевой валюты
    result = amount_in_byn * Decimal(target_rate.scale) / target_rate.official_rate  # BYN → target
    effective_rate = _quantize(
        source_rate.rate_per_unit / target_rate.rate_per_unit
        if source_code != "BYN"
        else Decimal(target_rate.scale) / target_rate.official_rate
    )  # Эффективный кросс-курс

    return CurrencyConvertResponse(
        amount=amount,
        from_currency=source_code,
        to_currency=target_code,
        result=_quantize_money(result),
        rate=effective_rate,
        rate_date=target_rate.rate_date,
    )


async def preload_nbrb_rates(db: AsyncSession) -> None:  # Предзагрузка курсов при старте приложения
    try:
        await sync_daily_rates_from_nbrb(db)
    except HTTPException as exc:
        logger.warning("Не удалось предзагрузить курсы НБРБ: %s", exc.detail)

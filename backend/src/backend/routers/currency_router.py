import logging  # Логирование ошибок валютного роутера
from decimal import Decimal  # Точная сумма для конвертации

from fastapi import APIRouter, Depends, HTTPException, Query  # Роутер, DI, ошибки, query-параметры
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.config import get_db  # Зависимость сессии БД
from cruds.currency.nbrb_rates import (  # CRUD курсов НБРБ
    DEFAULT_CURRENCY_CODES,  # Валюты по умолчанию
    convert_currency,  # Конвертация суммы
    get_currency_rate,  # Курс одной валюты
    get_currency_rates_response,  # Список курсов для ответа API
    normalize_currency_code,  # Нормализация кода валюты
)
from schemas.currency_schemas import (  # Pydantic-схемы ответов
    CurrencyConvertResponse,  # Ответ конвертации
    CurrencyRateOut,  # Одна валюта
    CurrencyRatesResponse,  # Список курсов
)

logger = logging.getLogger(__name__)  # Логгер модуля

router = APIRouter(prefix="/currency", tags=["currency"])  # Роутер валют


@router.get("/rates", response_model=CurrencyRatesResponse)  # GET список курсов
async def list_currency_rates(
    codes: str | None = Query(  # Коды валют через запятую (опционально)
        None,
        description="Коды через запятую (USD,EUR,RUB). По умолчанию основные валюты.",
    ),
    refresh: bool = Query(False, description="Принудительно обновить из НБРБ"),  # Принудительное обновление
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    selected_codes = DEFAULT_CURRENCY_CODES  # По умолчанию — основные валюты
    if codes:  # Если переданы коды в query
        selected_codes = tuple(  # Список нормализованных кодов
            normalize_currency_code(part)  # Нормализуем каждый код
            for part in codes.split(",")  # Разбиваем строку по запятой
            if part.strip()  # Пропускаем пустые части
        )
        if not selected_codes:  # После фильтра ничего не осталось
            raise HTTPException(status_code=400, detail="Не указаны коды валют")  # 400 клиенту

    return await get_currency_rates_response(  # Возвращаем курсы из CRUD/кэша
        db, codes=selected_codes, force_refresh=refresh
    )


@router.get("/rates/{code}", response_model=CurrencyRateOut)  # GET курс одной валюты
async def get_single_currency_rate(
    code: str,  # Код валюты из path
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    return await get_currency_rate(db, code)  # Курс по коду


@router.get("/convert", response_model=CurrencyConvertResponse)  # GET конвертация суммы
async def convert_currency_amount(
    amount: Decimal = Query(..., gt=0),  # Сумма > 0
    from_currency: str = Query(..., alias="from"),  # Исходная валюта (query from)
    to_currency: str = Query(..., alias="to"),  # Целевая валюта (query to)
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    return await convert_currency(db, amount, from_currency, to_currency)  # Результат конвертации

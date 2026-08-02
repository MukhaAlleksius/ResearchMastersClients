import logging  # Логирование операций с курсами
from datetime import date, datetime, time, timedelta  # Даты и границы суток
from decimal import Decimal  # Точная арифметика для курсов

from sqlalchemy import func, select  # Агрегаты и SELECT-запросы
from sqlalchemy.dialects.postgresql import insert  # Upsert для PostgreSQL
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from cruds.currency.tz_utils import MINSK_TZ  # Часовой пояс Минска
from models.currency_models import CurrencyRate  # ORM-модель курса валюты
from schemas.currency_schemas import CurrencyRateOut  # Pydantic-схема ответа

logger = logging.getLogger(__name__)  # Логгер модуля


def today_minsk() -> date:  # Текущая дата по времени Минска
    return datetime.now(MINSK_TZ).date()  # Локальная дата в MINSK_TZ


def _day_bounds_minsk(day: date) -> tuple[datetime, datetime]:  # Начало и конец суток в MINSK_TZ
    start = datetime.combine(day, time.min, tzinfo=MINSK_TZ)  # 00:00:00 указанного дня
    return start, start + timedelta(days=1)  # Полуинтервал [start, start+1d)


def _model_to_schema(row: CurrencyRate) -> CurrencyRateOut:  # ORM → Pydantic
    return CurrencyRateOut(
        code=row.code,  # Код валюты (USD, EUR…)
        name=row.name,  # Название валюты
        scale=row.scale,  # Номинал (за сколько единиц курс)
        official_rate=Decimal(str(row.official_rate)),  # Официальный курс НБРБ
        rate_per_unit=Decimal(str(row.rate_per_unit)),  # Курс за 1 единицу
        rate_date=row.rate_date,  # Дата, на которую действует курс
    )


async def has_rates_fetched_today(db: AsyncSession) -> bool:
    """Проверка: загружали ли курсы из НБРБ сегодня (по времени Минска)."""
    day_start, day_end = _day_bounds_minsk(today_minsk())  # Границы текущих суток
    result = await db.execute(
        select(func.count())  # Считаем записи за сегодня
        .select_from(CurrencyRate)
        .where(CurrencyRate.fetched_at >= day_start, CurrencyRate.fetched_at < day_end)
    )
    return int(result.scalar() or 0) > 0  # True, если есть хотя бы одна запись


async def get_latest_fetched_at(db: AsyncSession) -> datetime | None:
    """READ — время последней загрузки курсов в БД."""
    result = await db.execute(select(func.max(CurrencyRate.fetched_at)))  # MAX(fetched_at)
    return result.scalar()  # None, если таблица пуста


async def get_currency_rates(
    db: AsyncSession,
    codes: tuple[str, ...] | None = None,
) -> tuple[list[CurrencyRateOut], datetime | None]:
    """READ — актуальные курсы (последняя rate_date в БД)."""
    latest_rate_date = await db.scalar(select(func.max(CurrencyRate.rate_date)))  # Самая свежая дата курсов
    if latest_rate_date is None:
        return [], None  # В БД ещё нет курсов

    query = select(CurrencyRate).where(CurrencyRate.rate_date == latest_rate_date)  # Курсы на последнюю дату
    if codes:
        query = query.where(CurrencyRate.code.in_(codes))  # Фильтр по кодам валют

    result = await db.execute(query.order_by(CurrencyRate.code))  # Сортировка по коду
    rows = result.scalars().all()  # Список ORM-объектов
    if not rows:
        return [], None  # На дату записей нет

    return [_model_to_schema(row) for row in rows], rows[0].fetched_at  # Схемы + время загрузки


async def get_currency_rate_by_code(
    db: AsyncSession,
    code: str,
) -> CurrencyRateOut | None:
    """READ — курс одной валюты на последнюю дату."""
    rates, _ = await get_currency_rates(db, codes=(code,))  # Переиспользуем общий запрос
    return rates[0] if rates else None  # Первый элемент или None


async def upsert_currency_rates(
    db: AsyncSession,
    rates: list[CurrencyRateOut],
    source: str = "nbrb",
) -> datetime:
    """CREATE / UPDATE — пакетное сохранение курсов (upsert по code + rate_date)."""
    fetched_at = datetime.now(MINSK_TZ)  # Метка времени загрузки

    for rate in rates:
        stmt = (
            insert(CurrencyRate)  # INSERT … ON CONFLICT
            .values(
                code=rate.code,
                name=rate.name,
                scale=rate.scale,
                official_rate=rate.official_rate,
                rate_per_unit=rate.rate_per_unit,
                rate_date=rate.rate_date,
                source=source,  # Источник данных (nbrb)
                fetched_at=fetched_at,
            )
            .on_conflict_do_update(  # Обновление при дубликате code+rate_date
                index_elements=["code", "rate_date"],
                set_={
                    "name": rate.name,
                    "scale": rate.scale,
                    "official_rate": rate.official_rate,
                    "rate_per_unit": rate.rate_per_unit,
                    "source": source,
                    "fetched_at": fetched_at,
                },
            )
        )
        await db.execute(stmt)  # Выполняем upsert одной валюты

    logger.info("Сохранено %s курсов валют, fetched_at=%s", len(rates), fetched_at)
    return fetched_at  # Время пакетной загрузки

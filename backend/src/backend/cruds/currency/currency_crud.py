import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from cruds.currency.tz_utils import MINSK_TZ
from models.currency_models import CurrencyRate
from schemas.currency_schemas import CurrencyRateOut

logger = logging.getLogger(__name__)


def today_minsk() -> date:
    return datetime.now(MINSK_TZ).date()


def _day_bounds_minsk(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=MINSK_TZ)
    return start, start + timedelta(days=1)


def _model_to_schema(row: CurrencyRate) -> CurrencyRateOut:
    return CurrencyRateOut(
        code=row.code,
        name=row.name,
        scale=row.scale,
        official_rate=Decimal(str(row.official_rate)),
        rate_per_unit=Decimal(str(row.rate_per_unit)),
        rate_date=row.rate_date,
    )


async def has_rates_fetched_today(db: AsyncSession) -> bool:
    """Проверка: загружали ли курсы из НБРБ сегодня (по времени Минска)."""
    day_start, day_end = _day_bounds_minsk(today_minsk())
    result = await db.execute(
        select(func.count())
        .select_from(CurrencyRate)
        .where(CurrencyRate.fetched_at >= day_start, CurrencyRate.fetched_at < day_end)
    )
    return int(result.scalar() or 0) > 0


async def get_latest_fetched_at(db: AsyncSession) -> datetime | None:
    """READ — время последней загрузки курсов в БД."""
    result = await db.execute(select(func.max(CurrencyRate.fetched_at)))
    return result.scalar()


async def get_currency_rates(
    db: AsyncSession,
    codes: tuple[str, ...] | None = None,
) -> tuple[list[CurrencyRateOut], datetime | None]:
    """READ — актуальные курсы (последняя rate_date в БД)."""
    latest_rate_date = await db.scalar(select(func.max(CurrencyRate.rate_date)))
    if latest_rate_date is None:
        return [], None

    query = select(CurrencyRate).where(CurrencyRate.rate_date == latest_rate_date)
    if codes:
        query = query.where(CurrencyRate.code.in_(codes))

    result = await db.execute(query.order_by(CurrencyRate.code))
    rows = result.scalars().all()
    if not rows:
        return [], None

    return [_model_to_schema(row) for row in rows], rows[0].fetched_at


async def get_currency_rate_by_code(
    db: AsyncSession,
    code: str,
) -> CurrencyRateOut | None:
    """READ — курс одной валюты на последнюю дату."""
    rates, _ = await get_currency_rates(db, codes=(code,))
    return rates[0] if rates else None


async def upsert_currency_rates(
    db: AsyncSession,
    rates: list[CurrencyRateOut],
    source: str = "nbrb",
) -> datetime:
    """CREATE / UPDATE — пакетное сохранение курсов (upsert по code + rate_date)."""
    fetched_at = datetime.now(MINSK_TZ)

    for rate in rates:
        stmt = (
            insert(CurrencyRate)
            .values(
                code=rate.code,
                name=rate.name,
                scale=rate.scale,
                official_rate=rate.official_rate,
                rate_per_unit=rate.rate_per_unit,
                rate_date=rate.rate_date,
                source=source,
                fetched_at=fetched_at,
            )
            .on_conflict_do_update(
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
        await db.execute(stmt)

    logger.info("Сохранено %s курсов валют, fetched_at=%s", len(rates), fetched_at)
    return fetched_at

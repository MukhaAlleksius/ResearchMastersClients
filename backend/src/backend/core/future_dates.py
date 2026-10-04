"""Разбор дат заказа: «в течение недели», «как можно скорее», календарная дата."""

from datetime import date, datetime, timedelta  # Сегодня, разбор строки, +7/+30 дней
from typing import Optional  # Дата может быть не задана

ASAP_DEADLINE = "Как можно скорее"  # Без автоснятия с каталога
WEEK_DEADLINE = "В течение недели"  # Размещение 7 дней с даты публикации
MONTH_DEADLINE = "В течение месяца"  # Размещение 30 дней

DEADLINE_PRESETS = {  # Эти три строки — не календарная дата, а готовые варианты
    ASAP_DEADLINE,
    WEEK_DEADLINE,
    MONTH_DEADLINE,
}

_DATE_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y")  # 2026-09-28 / 28.09.2026 / 28.09.26


def parse_user_date(value: Optional[str]) -> Optional[date]:
    """Превращает строку пользователя в date. Непонятный ввод → None."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in _DATE_FORMATS:  # Сначала короткие форматы день.месяц.год
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue  # Этот формат не подошёл — пробуем следующий
    iso_day = raw.replace("Z", "").split("T", 1)[0].split(" ", 1)[0]  # Обрезать время ISO
    if iso_day != raw:
        try:
            return datetime.strptime(iso_day[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    return None  # Не дата


def ensure_not_before_today(
    value: Optional[str],
    *,
    field_name: str = "Дата",
) -> Optional[str]:
    """Если это календарная дата в прошлом — ошибка. Пресеты («неделя») не трогаем."""
    parsed = parse_user_date(value)
    if parsed is None:
        return value  # Не дата — проверку пропускаем
    if parsed < date.today():
        raise ValueError(f"{field_name} не может быть раньше сегодняшней")
    return value


def listing_end_date(
    deadline: Optional[str],
    *,
    start_at: Optional[datetime] = None,
) -> Optional[date]:
    """Последний день в каталоге. None — автоснятие не применяется."""
    raw = str(deadline or "").strip()
    if not raw or raw == ASAP_DEADLINE:
        return None  # «Как можно скорее» — без срока снятия
    if raw == WEEK_DEADLINE:
        if start_at is None:
            return None  # Нет даты публикации — срок не посчитать
        return start_at.date() + timedelta(days=7)
    if raw == MONTH_DEADLINE:
        if start_at is None:
            return None
        return start_at.date() + timedelta(days=30)
    return parse_user_date(raw)  # Пользователь указал конкретный день


def is_listing_expired(
    deadline: Optional[str],
    *,
    start_at: Optional[datetime] = None,
    today: Optional[date] = None,
) -> bool:
    """True, если срок размещения (неделя / месяц / точная дата) уже прошёл."""
    end = listing_end_date(deadline, start_at=start_at)
    if end is None:
        return False  # Снимать нечего
    return (today or date.today()) > end  # Сегодня позже последнего дня

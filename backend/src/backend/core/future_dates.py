from datetime import date, datetime
from typing import Optional

DEADLINE_PRESETS = {
    "Как можно скорее",
    "В течение недели",
    "В течение месяца",
}

_DATE_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y")


def parse_user_date(value: Optional[str]) -> Optional[date]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def ensure_not_before_today(
    value: Optional[str],
    *,
    field_name: str = "Дата",
) -> Optional[str]:
    parsed = parse_user_date(value)
    if parsed is None:
        return value
    if parsed < date.today():
        raise ValueError(f"{field_name} не может быть раньше сегодняшней")
    return value

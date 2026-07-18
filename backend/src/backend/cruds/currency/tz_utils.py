from datetime import timedelta, timezone
from zoneinfo import ZoneInfo

try:
    MINSK_TZ = ZoneInfo("Europe/Minsk")
except Exception:
    # Fallback для окружений без tzdata (UTC+3 — Минск без DST с 2011 г.)
    MINSK_TZ = timezone(timedelta(hours=3))

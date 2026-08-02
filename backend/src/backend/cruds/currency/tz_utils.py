from datetime import timedelta, timezone  # Смещение и фиксированный UTC для fallback
from zoneinfo import ZoneInfo  # IANA-часовой пояс из tzdata

try:
    MINSK_TZ = ZoneInfo("Europe/Minsk")  # Основной часовой пояс приложения
except Exception:
    # Fallback для окружений без tzdata (UTC+3 — Минск без DST с 2011 г.)
    MINSK_TZ = timezone(timedelta(hours=3))  # Фиксированное смещение UTC+3

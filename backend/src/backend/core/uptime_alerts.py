"""Optional uptime alerting when /health is degraded."""  # Опциональные алерты, когда /health «болен»

from __future__ import annotations  # Отложенные аннотации

import logging  # Логи
import time  # Cooldown между алертами
from urllib import error, request  # HTTP POST на webhook без httpx

from core.config import HEALTH_ALERT_COOLDOWN_SECONDS, UPTIME_ALERT_WEBHOOK_URL  # URL и пауза между алертами

logger = logging.getLogger(__name__)  # Логгер модуля

_last_alert_at: float | None = None  # Когда отправили последний алерт (monotonic)


def maybe_send_health_alert(*, healthy: bool, detail: str) -> None:  # Шлёт webhook, если health упал
    global _last_alert_at  # Меняем модульную переменную cooldown

    if healthy or not UPTIME_ALERT_WEBHOOK_URL:  # Всё ок или webhook не настроен
        return  # Ничего не шлём

    now = time.monotonic()  # Сейчас
    if _last_alert_at is not None and now - _last_alert_at < HEALTH_ALERT_COOLDOWN_SECONDS:  # Ещё не прошёл cooldown
        return  # Не спамим

    payload = (  # JSON-тело для webhook (часто Slack/Discord-совместимый text)
        '{"text":"Fixer health check FAILED: '
        + detail.replace('"', "'")  # Экранируем кавычки в detail
        + '"}'
    ).encode("utf-8")  # Байты для HTTP body
    req = request.Request(  # Готовим HTTP-запрос
        UPTIME_ALERT_WEBHOOK_URL,  # Куда слать
        data=payload,  # Тело
        headers={"Content-Type": "application/json"},  # JSON
        method="POST",  # Метод POST
    )
    try:
        with request.urlopen(req, timeout=10):  # Отправляем, таймаут 10 с
            _last_alert_at = now  # Запоминаем время успешной отправки
            logger.warning("Uptime alert sent: %s", detail)  # Пишем в лог
    except (error.URLError, TimeoutError) as exc:  # Сеть/таймаут
        logger.error("Failed to send uptime alert: %s", exc)  # Ошибка отправки

"""Optional uptime alerting when /health is degraded."""

from __future__ import annotations

import logging
import time
from urllib import error, request

from core.config import HEALTH_ALERT_COOLDOWN_SECONDS, UPTIME_ALERT_WEBHOOK_URL

logger = logging.getLogger(__name__)

_last_alert_at: float | None = None


def maybe_send_health_alert(*, healthy: bool, detail: str) -> None:
    global _last_alert_at

    if healthy or not UPTIME_ALERT_WEBHOOK_URL:
        return

    now = time.monotonic()
    if _last_alert_at is not None and now - _last_alert_at < HEALTH_ALERT_COOLDOWN_SECONDS:
        return

    payload = (
        '{"text":"Fixer health check FAILED: '
        + detail.replace('"', "'")
        + '"}'
    ).encode("utf-8")
    req = request.Request(
        UPTIME_ALERT_WEBHOOK_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=10):
            _last_alert_at = now
            logger.warning("Uptime alert sent: %s", detail)
    except (error.URLError, TimeoutError) as exc:
        logger.error("Failed to send uptime alert: %s", exc)

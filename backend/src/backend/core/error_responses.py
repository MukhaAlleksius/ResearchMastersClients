"""Safe error payloads for API clients."""

from __future__ import annotations

from typing import Any

from core.config import IS_PRODUCTION

GENERIC_500_DETAIL = "Внутренняя ошибка сервера"


def public_exception_detail(exc: Exception) -> str:
    if IS_PRODUCTION:
        return GENERIC_500_DETAIL
    message = str(exc).strip()
    return message or GENERIC_500_DETAIL


def public_http_detail(status_code: int, detail: Any) -> Any:
    if IS_PRODUCTION and status_code >= 500:
        return GENERIC_500_DETAIL
    return detail

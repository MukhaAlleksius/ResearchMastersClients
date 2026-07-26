"""Safe error payloads for API clients."""

from __future__ import annotations

from typing import Any

from core.config import IS_PRODUCTION

GENERIC_500_DETAIL = "Внутренняя ошибка сервера"

FIELD_LABELS_RU = {
    "password": "Пароль",
    "email": "Email",
    "first_name": "Имя",
    "last_name": "Фамилия",
    "country": "Страна",
    "region": "Регион",
    "town": "Город",
    "title": "Название",
    "description": "Описание",
    "phone": "Телефон",
}


def public_exception_detail(exc: Exception) -> str:
    if IS_PRODUCTION:
        return GENERIC_500_DETAIL
    message = str(exc).strip()
    return message or GENERIC_500_DETAIL


def public_http_detail(status_code: int, detail: Any) -> Any:
    if IS_PRODUCTION and status_code >= 500:
        return GENERIC_500_DETAIL
    return detail


def _humanize_validation_msg(msg: str, ctx: dict | None = None) -> str:
    text = (msg or "").strip()
    lower = text.lower()
    ctx = ctx or {}

    if "at least" in lower and "character" in lower:
        min_len = ctx.get("min_length")
        if min_len is not None:
            return f"минимум {min_len} символов"
        return "слишком короткое значение"
    if "at most" in lower and "character" in lower:
        max_len = ctx.get("max_length")
        if max_len is not None:
            return f"максимум {max_len} символов"
        return "слишком длинное значение"
    if "field required" in lower or text == "Field required":
        return "обязательное поле"
    if "valid email" in lower:
        return "укажите корректный email"
    if "input should be a valid integer" in lower:
        return "ожидается целое число"
    if "input should be a valid number" in lower:
        return "ожидается число"
    return text


def format_validation_errors(errors: list[Any]) -> list[dict[str, Any]]:
    """Return validation errors with Russian field labels and clearer messages."""
    formatted: list[dict[str, Any]] = []
    for err in errors or []:
        if not isinstance(err, dict):
            formatted.append({"msg": str(err)})
            continue
        loc = err.get("loc") or ()
        parts = [p for p in loc if p not in ("body", "query", "path", "header")]
        field_key = str(parts[-1]) if parts else ""
        field = FIELD_LABELS_RU.get(field_key, field_key)
        msg = _humanize_validation_msg(str(err.get("msg") or ""), err.get("ctx"))
        item = {
            "type": err.get("type"),
            "loc": list(loc),
            "msg": f"{field}: {msg}" if field else msg,
            "input": err.get("input"),
        }
        if field_key:
            item["field"] = field_key
        formatted.append(item)
    return formatted

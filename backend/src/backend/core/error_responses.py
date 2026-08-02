"""Safe error payloads for API clients."""  # Безопасные тексты ошибок для клиентов API

from __future__ import annotations  # Отложенные аннотации

from typing import Any  # Произвольные типы в detail/ошибках

from core.config import IS_PRODUCTION  # В проде скрываем внутренности 500

GENERIC_500_DETAIL = "Внутренняя ошибка сервера"  # Общий текст 500 для продакшена

FIELD_LABELS_RU = {  # Англ. имена полей → русские подписи в ошибках валидации
    "password": "Пароль",
    "email": "Email",
    "first_name": "Имя",
    "last_name": "Фамилия",
    "country": "Страна",
    "region": "Регион",
    "town": "Город",
    "town_id": "Город",
    "title": "Название",
    "description": "Описание",
    "phone": "Телефон",
}


def public_exception_detail(exc: Exception) -> str:  # Текст для неожиданного 500
    if IS_PRODUCTION:  # В проде не светим traceback/сообщение
        return GENERIC_500_DETAIL  # Общая фраза
    message = str(exc).strip()  # В dev показываем текст исключения
    return message or GENERIC_500_DETAIL  # Или запасной текст, если пусто


def public_http_detail(status_code: int, detail: Any) -> Any:  # Фильтр detail у HTTPException
    if IS_PRODUCTION and status_code >= 500:  # Серверные ошибки в проде
        return GENERIC_500_DETAIL  # Прячем детали
    return detail  # Иначе отдаём как есть


def _humanize_validation_msg(msg: str, ctx: dict | None = None) -> str:  # Перевод типовых pydantic-сообщений
    text = (msg or "").strip()  # Исходное сообщение
    lower = text.lower()  # Для сравнения без регистра
    ctx = ctx or {}  # Контекст (min_length и т.д.)

    if "at least" in lower and "character" in lower:  # Слишком коротко
        min_len = ctx.get("min_length")  # Минимальная длина из контекста
        if min_len is not None:  # Есть число
            return f"минимум {min_len} символов"  # По-русски с числом
        return "слишком короткое значение"  # Без числа
    if "at most" in lower and "character" in lower:  # Слишком длинно
        max_len = ctx.get("max_length")  # Максимальная длина
        if max_len is not None:
            return f"максимум {max_len} символов"
        return "слишком длинное значение"
    if "field required" in lower or text == "Field required":  # Поле обязательно
        return "обязательное поле"
    if "valid email" in lower:  # Невалидный email
        return "укажите корректный email"
    if "input should be a valid integer" in lower:  # Не int
        return "ожидается целое число"
    if "input should be a valid number" in lower:  # Не число
        return "ожидается число"
    return text  # Иначе оставляем оригинал


def format_validation_errors(errors: list[Any]) -> list[dict[str, Any]]:  # Форматирует ошибки 422 для фронта
    """Return validation errors with Russian field labels and clearer messages."""
    formatted: list[dict[str, Any]] = []  # Результат
    for err in errors or []:  # Каждая ошибка pydantic
        if not isinstance(err, dict):  # Неожиданный формат
            formatted.append({"msg": str(err)})  # Кладём как строку
            continue
        loc = err.get("loc") or ()  # Путь к полю (body, field, ...)
        parts = [p for p in loc if p not in ("body", "query", "path", "header")]  # Убираем служебные части
        field_key = str(parts[-1]) if parts else ""  # Имя поля
        field = FIELD_LABELS_RU.get(field_key, field_key)  # Русская подпись или как есть
        msg = _humanize_validation_msg(str(err.get("msg") or ""), err.get("ctx"))  # Человекочитаемое сообщение
        item = {  # Объект ошибки для клиента
            "type": err.get("type"),  # Тип ошибки pydantic
            "loc": list(loc),  # Полный путь
            "msg": f"{field}: {msg}" if field else msg,  # «Поле: сообщение»
            "input": err.get("input"),  # Введённое значение
        }
        if field_key:  # Есть ключ поля
            item["field"] = field_key  # Дублируем для удобства фронта
        formatted.append(item)  # В список
    return formatted  # Готовый список ошибок

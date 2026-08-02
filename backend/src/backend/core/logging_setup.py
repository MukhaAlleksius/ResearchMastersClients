"""Application logging: levels, request access logs, Sentry."""  # Логи, access-логи запросов, Sentry

from __future__ import annotations  # Отложенные аннотации

import logging  # Стандартное логирование
import sys  # stdout для basicConfig
from typing import Mapping  # Тип словаря заголовков

SENSITIVE_HEADER_NAMES = frozenset(  # Заголовки, которые нельзя писать в лог целиком
    {
        "authorization",  # Bearer-токен
        "cookie",  # Куки
        "set-cookie",  # Set-Cookie
        "x-payment-secret",  # Секрет платежа
        "x-api-key",  # API-ключ
        "proxy-authorization",  # Proxy auth
        "x-csrf-token",  # CSRF
    }
)

ACCESS_LOGGER = "app.access"  # Имя логгера access-логов
REDACTED = "***"  # Заглушка вместо секрета


def resolve_log_level(name: str, *, is_production: bool) -> int:  # Строка уровня → константа logging
    normalized = (name or "").strip().upper()  # Нормализуем имя уровня
    if is_production and normalized == "DEBUG":  # DEBUG в проде нежелателен
        logging.getLogger(__name__).warning(
            "LOG_LEVEL=DEBUG is not recommended in production; using INFO"
        )
        normalized = "INFO"  # Понижаем до INFO
    return getattr(logging, normalized, logging.INFO)  # Неизвестное имя → INFO


def redact_header_value(name: str, value: str) -> str:  # Маскирует значение чувствительного заголовка
    if name.lower() in SENSITIVE_HEADER_NAMES:  # Заголовок из чёрного списка
        if not value:  # Пусто
            return REDACTED
        if name.lower() == "authorization" and value.lower().startswith("bearer "):  # Bearer …
            return "Bearer ***"  # Оставляем схему, прячем токен
        return REDACTED  # Полная маска
    return value  # Обычный заголовок без изменений


def redact_headers(headers: Mapping[str, str]) -> dict[str, str]:  # Маскирует весь словарь заголовков
    return {
        name: redact_header_value(name, value)  # По каждому заголовку
        for name, value in headers.items()
    }


def configure_logging(*, level_name: str, is_production: bool) -> None:  # Настройка root/uvicorn/sqlalchemy логов
    level = resolve_log_level(level_name, is_production=is_production)  # Числовой уровень

    root = logging.getLogger()  # Корневой логгер
    if not root.handlers:  # Ещё не настроен
        logging.basicConfig(  # Базовая конфигурация в stdout
            level=level,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            stream=sys.stdout,
        )
    else:  # Уже есть handlers (uvicorn и т.п.)
        root.setLevel(level)  # Только меняем уровень

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING if is_production else logging.INFO)  # Меньше шума access uvicorn в проде
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)  # Ошибки uvicorn
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)  # Не логируем каждый SQL на INFO


def init_sentry(  # Инициализация Sentry, если задан DSN
    *,
    dsn: str,
    environment: str,
    traces_sample_rate: float,
) -> None:
    if not dsn:  # DSN пустой
        return  # Sentry выключен

    try:
        import sentry_sdk  # SDK
        from sentry_sdk.integrations.fastapi import FastApiIntegration  # Интеграция FastAPI
        from sentry_sdk.integrations.logging import LoggingIntegration  # Логи → Sentry
        from sentry_sdk.integrations.starlette import StarletteIntegration  # Starlette
    except ImportError as exc:  # Пакет не установлен
        logging.getLogger(__name__).error(
            "SENTRY_DSN is set but sentry-sdk is not installed: %s", exc
        )
        return

    sentry_sdk.init(  # Старт SDK
        dsn=dsn,  # Куда слать
        environment=environment,  # dev/prod
        integrations=[  # Подключаемые интеграции
            FastApiIntegration(),
            StarletteIntegration(),
            LoggingIntegration(
                level=logging.INFO,  # С какого уровня логи уходят как breadcrumbs
                event_level=logging.ERROR,  # ERROR+ → события
            ),
        ],
        traces_sample_rate=traces_sample_rate,  # Доля performance-трейсов
        send_default_pii=False,  # Не слать PII по умолчанию
    )
    logging.getLogger(__name__).info("Sentry initialized for environment=%s", environment)  # Успех в лог


def client_ip(request) -> str:  # IP клиента из запроса
    forwarded = request.headers.get("x-forwarded-for")  # За прокси
    if forwarded:
        return forwarded.split(",")[0].strip()  # Первый IP в цепочке
    if request.client:
        return request.client.host  # Прямой IP
    return "-"  # Неизвестно


def should_log_access(path: str) -> bool:  # Нужен ли access-лог для пути
    return path not in {"/health", "/"}  # Health и корень не логируем на INFO


def log_request_start(request, *, verbose: bool) -> None:  # Лог входящего запроса
    access = logging.getLogger(ACCESS_LOGGER)  # Access-логгер
    if verbose:  # Подробный режим
        access.debug(  # DEBUG с заголовками (уже замаскированными)
            "Request %s %s ip=%s headers=%s",
            request.method,
            request.url.path,
            client_ip(request),
            redact_headers(dict(request.headers)),
        )
    elif should_log_access(request.url.path):  # Обычный режим для «интересных» путей
        access.info("Request %s %s ip=%s", request.method, request.url.path, client_ip(request))


def log_request_end(request, response, *, verbose: bool) -> None:  # Лог ответа
    access = logging.getLogger(ACCESS_LOGGER)
    status = response.status_code  # Код ответа
    path = request.url.path  # Путь

    if status >= 500:  # Серверная ошибка
        access.error("Response %s %s %s", status, request.method, path)
        return
    if status >= 400:  # Клиентская ошибка
        access.warning("Response %s %s %s", status, request.method, path)
        return

    if verbose:  # Успех в verbose
        access.debug("Response %s %s %s", status, request.method, path)
    elif should_log_access(path):  # Успех обычный
        access.info("Response %s %s %s", status, request.method, path)

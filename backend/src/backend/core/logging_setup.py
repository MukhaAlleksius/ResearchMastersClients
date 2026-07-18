"""Application logging: levels, request access logs, Sentry."""

from __future__ import annotations

import logging
import sys
from typing import Mapping

SENSITIVE_HEADER_NAMES = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-payment-secret",
        "x-api-key",
        "proxy-authorization",
        "x-csrf-token",
    }
)

ACCESS_LOGGER = "app.access"
REDACTED = "***"


def resolve_log_level(name: str, *, is_production: bool) -> int:
    normalized = (name or "").strip().upper()
    if is_production and normalized == "DEBUG":
        logging.getLogger(__name__).warning(
            "LOG_LEVEL=DEBUG is not recommended in production; using INFO"
        )
        normalized = "INFO"
    return getattr(logging, normalized, logging.INFO)


def redact_header_value(name: str, value: str) -> str:
    if name.lower() in SENSITIVE_HEADER_NAMES:
        if not value:
            return REDACTED
        if name.lower() == "authorization" and value.lower().startswith("bearer "):
            return "Bearer ***"
        return REDACTED
    return value


def redact_headers(headers: Mapping[str, str]) -> dict[str, str]:
    return {
        name: redact_header_value(name, value)
        for name, value in headers.items()
    }


def configure_logging(*, level_name: str, is_production: bool) -> None:
    level = resolve_log_level(level_name, is_production=is_production)

    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            stream=sys.stdout,
        )
    else:
        root.setLevel(level)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING if is_production else logging.INFO)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def init_sentry(
    *,
    dsn: str,
    environment: str,
    traces_sample_rate: float,
) -> None:
    if not dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError as exc:
        logging.getLogger(__name__).error(
            "SENTRY_DSN is set but sentry-sdk is not installed: %s", exc
        )
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
            LoggingIntegration(
                level=logging.INFO,
                event_level=logging.ERROR,
            ),
        ],
        traces_sample_rate=traces_sample_rate,
        send_default_pii=False,
    )
    logging.getLogger(__name__).info("Sentry initialized for environment=%s", environment)


def client_ip(request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "-"


def should_log_access(path: str) -> bool:
    return path not in {"/health", "/"}


def log_request_start(request, *, verbose: bool) -> None:
    access = logging.getLogger(ACCESS_LOGGER)
    if verbose:
        access.debug(
            "Request %s %s ip=%s headers=%s",
            request.method,
            request.url.path,
            client_ip(request),
            redact_headers(dict(request.headers)),
        )
    elif should_log_access(request.url.path):
        access.info("Request %s %s ip=%s", request.method, request.url.path, client_ip(request))


def log_request_end(request, response, *, verbose: bool) -> None:
    access = logging.getLogger(ACCESS_LOGGER)
    status = response.status_code
    path = request.url.path

    if status >= 500:
        access.error("Response %s %s %s", status, request.method, path)
        return
    if status >= 400:
        access.warning("Response %s %s %s", status, request.method, path)
        return

    if verbose:
        access.debug("Response %s %s %s", status, request.method, path)
    elif should_log_access(path):
        access.info("Response %s %s %s", status, request.method, path)

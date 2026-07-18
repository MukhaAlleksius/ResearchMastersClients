import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from core.config import (
    RATE_LIMIT_METHODS,
    RATE_LIMIT_PATHS,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW_SECONDS,
)

_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(request: Request) -> None:
    if request.method.upper() not in RATE_LIMIT_METHODS:
        return

    path = request.url.path.rstrip("/") or "/"
    if path not in RATE_LIMIT_PATHS:
        return

    now = time.monotonic()
    key = f"{_client_key(request)}:{path}"
    window = RATE_LIMIT_WINDOW_SECONDS
    bucket = _hits[key]

    while bucket and now - bucket[0] > window:
        bucket.popleft()

    if len(bucket) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов. Попробуйте позже.",
        )

    bucket.append(now)

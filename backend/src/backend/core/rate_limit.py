import time  # Монотонное время для окна лимита
from collections import defaultdict, deque  # Словарь с очередями меток запросов

from fastapi import HTTPException, Request, status  # HTTP-ошибки и объект запроса

from core.config import (  # Настройки rate limit
    RATE_LIMIT_METHODS,  # Какие HTTP-методы ограничивать
    RATE_LIMIT_PATHS,  # Какие пути ограничивать
    RATE_LIMIT_REQUESTS,  # Макс. число запросов в окне
    RATE_LIMIT_WINDOW_SECONDS,  # Длина окна в секундах
)

_hits: dict[str, deque[float]] = defaultdict(deque)  # Память: ключ клиента+пути → очередь timestamp'ов


def _client_key(request: Request) -> str:  # Идентификатор клиента для лимита
    forwarded = request.headers.get("x-forwarded-for")  # IP за прокси, если есть
    if forwarded:  # Заголовок присутствует
        return forwarded.split(",")[0].strip()  # Берём первый (реальный клиент)
    if request.client:  # Прямое соединение
        return request.client.host  # IP из сокета
    return "unknown"  # Запасной ключ


def check_rate_limit(request: Request) -> None:  # Проверяет лимит; при превышении кидает 429
    if request.method.upper() not in RATE_LIMIT_METHODS:  # Метод не в списке (например не POST)
        return  # Не ограничиваем

    path = request.url.path.rstrip("/") or "/"  # Нормализуем путь
    if path not in RATE_LIMIT_PATHS:  # Путь не защищён лимитом
        return  # Пропускаем

    now = time.monotonic()  # Текущее монотонное время
    key = f"{_client_key(request)}:{path}"  # Ключ = клиент + путь
    window = RATE_LIMIT_WINDOW_SECONDS  # Длина окна
    bucket = _hits[key]  # Очередь прошлых запросов этого ключа

    while bucket and now - bucket[0] > window:  # Удаляем устаревшие метки вне окна
        bucket.popleft()  # Выкидываем самый старый запрос

    if len(bucket) >= RATE_LIMIT_REQUESTS:  # Лимит уже исчерпан
        raise HTTPException(  # Отвечаем клиенту 429
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,  # Too Many Requests
            detail="Слишком много запросов. Попробуйте позже.",  # Текст ошибки
        )

    bucket.append(now)  # Фиксируем текущий запрос в окне

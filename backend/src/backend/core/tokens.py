"""JWT helpers with strict token type separation."""  # Хелперы JWT с разделением типов токенов

from __future__ import annotations  # Отложенные аннотации

from datetime import datetime, timedelta, timezone  # Время жизни токена

import jwt  # Кодирование/декодирование JWT
from fastapi import HTTPException, status  # Ошибки 401 при битом токене

from core.config import (  # Настройки подписи и сроков
    ACCESS_TOKEN_EXPIRE_MINUTES,  # Срок access-токена в минутах
    ALGORITHM,  # Алгоритм подписи (HS256)
    REFRESH_TOKEN_EXPIRE_DAYS,  # Срок refresh-токена в днях
    SECRET_KEY,  # Секрет для подписи
    TOKEN_TYPE_ACCESS,  # Метка типа access
    TOKEN_TYPE_EMAIL_VERIFY,  # Метка типа email_verify
    TOKEN_TYPE_REFRESH,  # Метка типа refresh
)

EMAIL_VERIFY_EXPIRE_HOURS = 48  # Срок ссылки подтверждения email — 48 часов


def _encode(payload: dict) -> str:  # Внутренняя упаковка payload в JWT-строку
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)  # Подписываем секретом


def create_access_token(*, subject: str, expires_delta: timedelta | None = None) -> str:  # Создаёт access JWT
    expire = datetime.now(timezone.utc) + (  # Время истечения в UTC
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)  # Свой срок или из конфига
    )
    return _encode(  # Кодируем payload
        {
            "sub": subject,  # Обычно email пользователя
            "exp": expire.timestamp(),  # Unix-время истечения
            "type": TOKEN_TYPE_ACCESS,  # Тип — access
        }
    )


def create_refresh_token(*, subject: str) -> str:  # Создаёт refresh JWT
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)  # Долгий срок
    return _encode(  # Кодируем
        {
            "sub": subject,  # Email / subject
            "exp": expire.timestamp(),  # Истечение
            "type": TOKEN_TYPE_REFRESH,  # Тип — refresh
        }
    )


def create_email_verification_token(*, subject: str) -> str:  # JWT для ссылки подтверждения почты
    expire = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)  # 48 часов
    return _encode(  # Кодируем
        {
            "sub": subject,  # Email
            "exp": expire.timestamp(),  # Истечение
            "type": TOKEN_TYPE_EMAIL_VERIFY,  # Тип — email_verify
        }
    )


def decode_token(token: str, *, expected_type: str) -> dict:  # Декодирует JWT и проверяет тип
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])  # Проверяем подпись и exp
    except jwt.PyJWTError as exc:  # Истёк / битая подпись / мусор
        raise HTTPException(  # Отдаём 401 клиенту
            status_code=status.HTTP_401_UNAUTHORIZED,  # Unauthorized
            detail="Invalid or expired token",  # Текст ошибки
        ) from exc  # Сохраняем цепочку исключений

    if payload.get("type") != expected_type:  # Тип токена не тот (например refresh вместо access)
        raise HTTPException(  # 401
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",  # Неверный тип
        )
    if not payload.get("sub"):  # Нет subject
        raise HTTPException(  # 401
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",  # Битый payload
        )
    return payload  # Валидный payload для вызывающего кода

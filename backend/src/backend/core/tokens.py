"""JWT helpers with strict token type separation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status

from core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_EMAIL_VERIFY,
    TOKEN_TYPE_REFRESH,
)

EMAIL_VERIFY_EXPIRE_HOURS = 48


def _encode(payload: dict) -> str:
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(*, subject: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return _encode(
        {
            "sub": subject,
            "exp": expire.timestamp(),
            "type": TOKEN_TYPE_ACCESS,
        }
    )


def create_refresh_token(*, subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return _encode(
        {
            "sub": subject,
            "exp": expire.timestamp(),
            "type": TOKEN_TYPE_REFRESH,
        }
    )


def create_email_verification_token(*, subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)
    return _encode(
        {
            "sub": subject,
            "exp": expire.timestamp(),
            "type": TOKEN_TYPE_EMAIL_VERIFY,
        }
    )


def decode_token(token: str, *, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    return payload

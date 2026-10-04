import pytest
from fastapi import HTTPException

from core.auth import is_public_route
from core.config import (
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_EMAIL_VERIFY,
    TOKEN_TYPE_PASSWORD_RESET,
    TOKEN_TYPE_REFRESH,
)
from core.tokens import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
)


def test_access_and_refresh_tokens_are_not_interchangeable():
    access = create_access_token(subject="user@example.com")
    refresh = create_refresh_token(subject="user@example.com")

    assert decode_token(access, expected_type=TOKEN_TYPE_ACCESS)["sub"] == "user@example.com"

    with pytest.raises(HTTPException) as exc:
        decode_token(refresh, expected_type=TOKEN_TYPE_ACCESS)
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException):
        decode_token(access, expected_type=TOKEN_TYPE_REFRESH)

    assert decode_token(refresh, expected_type=TOKEN_TYPE_REFRESH)["sub"] == "user@example.com"


def test_email_and_password_reset_tokens_are_not_interchangeable():
    verify = create_email_verification_token(subject="user@example.com")
    reset = create_password_reset_token(subject="user@example.com")

    assert decode_token(verify, expected_type=TOKEN_TYPE_EMAIL_VERIFY)["sub"] == "user@example.com"
    assert decode_token(reset, expected_type=TOKEN_TYPE_PASSWORD_RESET)["sub"] == "user@example.com"

    with pytest.raises(HTTPException):
        decode_token(verify, expected_type=TOKEN_TYPE_PASSWORD_RESET)
    with pytest.raises(HTTPException):
        decode_token(reset, expected_type=TOKEN_TYPE_EMAIL_VERIFY)
    with pytest.raises(HTTPException):
        decode_token(verify, expected_type=TOKEN_TYPE_ACCESS)


def test_email_auth_routes_are_public():
    assert is_public_route("POST", "/forgot-password") is True
    assert is_public_route("POST", "/reset-password") is True
    assert is_public_route("POST", "/resend-verification") is True
    assert is_public_route("GET", "/verify-email") is True
    assert is_public_route("POST", "/register") is True
    assert is_public_route("POST", "/token") is True

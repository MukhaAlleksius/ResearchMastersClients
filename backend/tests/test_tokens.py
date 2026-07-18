import pytest
from fastapi import HTTPException

from core.config import TOKEN_TYPE_ACCESS, TOKEN_TYPE_REFRESH
from core.tokens import create_access_token, create_refresh_token, decode_token


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

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.access import (
    assert_user_not_blocked,
    blocked_account_detail,
    clear_expired_block,
    is_user_blocked,
)


def _user(**overrides):
    data = {
        "blocked": False,
        "blocked_until": None,
        "block_reason": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def test_permanent_block_by_flag():
    user = _user(blocked=True, blocked_until=None)
    assert is_user_blocked(user) is True


def test_temporary_block_until_future():
    user = _user(
        blocked=True,
        blocked_until=datetime.now(timezone.utc) + timedelta(days=1),
    )
    assert is_user_blocked(user) is True


def test_temporary_block_until_expired():
    user = _user(
        blocked=True,
        blocked_until=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    assert is_user_blocked(user) is False


def test_not_blocked_user():
    user = _user(blocked=False, blocked_until=None)
    assert is_user_blocked(user) is False


def test_blocked_until_without_flag():
    user = _user(
        blocked=False,
        blocked_until=datetime.now(timezone.utc) + timedelta(hours=2),
    )
    assert is_user_blocked(user) is True


def test_blocked_account_detail_includes_reason_and_until():
    until = datetime.now(timezone.utc) + timedelta(days=1)
    user = _user(blocked=True, blocked_until=until, block_reason="Спам")
    detail = blocked_account_detail(user)
    assert detail["code"] == "account_blocked"
    assert detail["message"] == "Аккаунт заблокирован"
    assert detail["reason"] == "Спам"
    assert detail["blocked_until"]


def test_assert_user_not_blocked_raises_structured_403():
    user = _user(blocked=True, blocked_until=None, block_reason="Нарушение правил")
    with pytest.raises(HTTPException) as exc:
        assert_user_not_blocked(user)
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "account_blocked"
    assert exc.value.detail["reason"] == "Нарушение правил"
    assert exc.value.detail["blocked_until"] is None


def test_clear_expired_block_clears_reason():
    user = _user(
        blocked=True,
        blocked_until=datetime.now(timezone.utc) - timedelta(minutes=1),
        block_reason="старая причина",
    )
    assert clear_expired_block(user) is True
    assert user.blocked is False
    assert user.blocked_until is None
    assert user.block_reason is None

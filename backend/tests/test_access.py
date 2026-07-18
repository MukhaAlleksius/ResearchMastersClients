from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from core.access import is_user_blocked


def _user(**overrides):
    data = {
        "blocked": False,
        "blocked_until": None,
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

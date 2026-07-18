import pytest

from core.security import hash_password, verify_password


def test_hash_and_verify_password():
    stored = hash_password("secret-pass-123")
    ok, upgraded = verify_password("secret-pass-123", stored)
    assert ok is True
    assert upgraded is None


def test_verify_password_rejects_wrong_password():
    stored = hash_password("secret-pass-123")
    ok, upgraded = verify_password("wrong-password", stored)
    assert ok is False
    assert upgraded is None


def test_legacy_plain_password_upgrade():
    ok, upgraded = verify_password("legacy-plain", "legacy-plain")
    assert ok is True
    assert upgraded is not None
    assert upgraded.startswith("$2")

    ok_after, upgraded_after = verify_password("legacy-plain", upgraded)
    assert ok_after is True
    assert upgraded_after is None

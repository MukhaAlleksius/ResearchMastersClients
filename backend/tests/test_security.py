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


def test_assert_password_strength():
    from core.security import assert_password_strength

    assert assert_password_strength("secret12") == "secret12"
    with pytest.raises(ValueError):
        assert_password_strength("short1")
    with pytest.raises(ValueError):
        assert_password_strength("onlyletters")

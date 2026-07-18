import pytest

from core import error_responses


def test_public_http_detail_hides_500_in_production(monkeypatch):
    monkeypatch.setattr(error_responses, "IS_PRODUCTION", True)
    assert (
        error_responses.public_http_detail(500, "db password leaked")
        == error_responses.GENERIC_500_DETAIL
    )
    assert error_responses.public_http_detail(404, "Not found") == "Not found"


def test_public_http_detail_shows_500_in_development(monkeypatch):
    monkeypatch.setattr(error_responses, "IS_PRODUCTION", False)
    assert error_responses.public_http_detail(500, "db password leaked") == (
        "db password leaked"
    )


def test_public_exception_detail_hides_in_production(monkeypatch):
    monkeypatch.setattr(error_responses, "IS_PRODUCTION", True)
    assert (
        error_responses.public_exception_detail(RuntimeError("secret"))
        == error_responses.GENERIC_500_DETAIL
    )

import logging

from core.logging_setup import redact_header_value, redact_headers, resolve_log_level


def test_redact_authorization_header():
    assert redact_header_value("Authorization", "Bearer secret-token") == "Bearer ***"


def test_redact_cookie_header():
    assert redact_header_value("Cookie", "session=abc") == "***"


def test_redact_safe_header():
    assert redact_header_value("Content-Type", "application/json") == "application/json"


def test_resolve_log_level_forces_info_in_production():
    assert resolve_log_level("DEBUG", is_production=True) == logging.INFO


def test_resolve_log_level_keeps_debug_in_development():
    assert resolve_log_level("DEBUG", is_production=False) == logging.DEBUG


def test_redact_headers_mapping():
    result = redact_headers(
        {
            "Authorization": "Bearer x",
            "Accept": "application/json",
            "X-Payment-Secret": "pay-secret",
        }
    )
    assert result["Authorization"] == "Bearer ***"
    assert result["Accept"] == "application/json"
    assert result["X-Payment-Secret"] == "***"

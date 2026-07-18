import pytest
from fastapi import HTTPException
from starlette.requests import Request

from core import rate_limit as rate_limit_module
from core.rate_limit import check_rate_limit


def _request(method: str, path: str, client_host: str = "203.0.113.1") -> Request:
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "client": (client_host, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
        "query_string": b"",
    }
    return Request(scope)


def test_rate_limit_blocks_after_threshold(monkeypatch):
    monkeypatch.setattr(rate_limit_module, "RATE_LIMIT_REQUESTS", 2)
    monkeypatch.setattr(rate_limit_module, "RATE_LIMIT_WINDOW_SECONDS", 60)
    rate_limit_module._hits.clear()

    check_rate_limit(_request("POST", "/token"))
    check_rate_limit(_request("POST", "/token"))

    with pytest.raises(HTTPException) as exc:
        check_rate_limit(_request("POST", "/token"))
    assert exc.value.status_code == 429


def test_rate_limit_ignores_get_on_auth_paths():
    rate_limit_module._hits.clear()
    for _ in range(10):
        check_rate_limit(_request("GET", "/token"))

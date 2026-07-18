from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import app


def test_health_ok_when_database_available():
    with patch("main.check_connection", new=AsyncMock(return_value=True)):
        with TestClient(app) as client:
            response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": True}


def test_health_degraded_when_database_unavailable():
    with patch("main.check_connection", new=AsyncMock(return_value=False)):
        with TestClient(app) as client:
            response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": False}

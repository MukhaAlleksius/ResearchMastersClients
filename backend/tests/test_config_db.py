import os
import subprocess
import sys
from pathlib import Path

BACKEND_SRC = Path(__file__).resolve().parents[1] / "src" / "backend"


def _load_config_subprocess(extra_env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(
        {
            "SECRET_KEY": "test-secret",
            "DATABASE_URL": "postgresql+asyncpg://u:p@localhost:5432/db",
            "PUBLIC_API_URL": "http://localhost:8000",
            "PAYMENT_CALLBACK_SECRET": "test-payment-secret",
            "CORS_ORIGINS": "http://localhost:3000",
        }
    )
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, "-c", "import core.config as c; print(c.SQL_ECHO, c.AUTO_CREATE_DB)"],
        cwd=str(BACKEND_SRC),
        env=env,
        capture_output=True,
        text=True,
    )


def test_production_rejects_auto_create_db():
    result = _load_config_subprocess(
        {"ENVIRONMENT": "production", "AUTO_CREATE_DB": "true", "SQL_ECHO": "false"}
    )
    assert result.returncode != 0
    assert "AUTO_CREATE_DB must be false" in result.stderr


def test_production_forces_sql_echo_off():
    result = _load_config_subprocess(
        {"ENVIRONMENT": "production", "AUTO_CREATE_DB": "false", "SQL_ECHO": "true"}
    )
    assert result.returncode == 0
    assert result.stdout.strip() == "False False"


def test_development_allows_auto_create_db_and_sql_echo():
    result = _load_config_subprocess(
        {"ENVIRONMENT": "development", "AUTO_CREATE_DB": "true", "SQL_ECHO": "true"}
    )
    assert result.returncode == 0
    assert result.stdout.strip() == "True True"

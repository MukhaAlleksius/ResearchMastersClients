import logging
import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.env_loader import load_env_file

_logger = logging.getLogger(__name__)


def _load_dotenv() -> None:
    load_env_file()


def _env_bool(name: str, default: str) -> bool:
    return os.getenv(name, default).lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _require(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(
            f"Missing required environment variable {name}. "
            "Copy .env.example to .env in the project root and configure it."
        )
    return value


_load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

SECRET_KEY = _require("SECRET_KEY")
DATABASE_URL = _require("DATABASE_URL")
PUBLIC_API_URL = _require("PUBLIC_API_URL").rstrip("/")
GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"
TOKEN_TYPE_EMAIL_VERIFY = "email_verify"

_default_cors = (
    "http://localhost:3000,http://127.0.0.1:3000"
    if not IS_PRODUCTION
    else ""
)
CORS_ORIGINS = _env_list("CORS_ORIGINS", _default_cors)
if IS_PRODUCTION and not CORS_ORIGINS:
    raise RuntimeError("CORS_ORIGINS must be set in production")

SQL_ECHO = _env_bool("SQL_ECHO", "false" if IS_PRODUCTION else "true")
if IS_PRODUCTION and SQL_ECHO:
    _logger.warning("SQL_ECHO=true is ignored in production")
    SQL_ECHO = False

AUTO_CREATE_DB = _env_bool("AUTO_CREATE_DB", "false" if IS_PRODUCTION else "true")
if IS_PRODUCTION and AUTO_CREATE_DB:
    raise RuntimeError(
        "AUTO_CREATE_DB must be false in production. "
        "Apply schema changes with: alembic upgrade head"
    )
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO" if IS_PRODUCTION else "DEBUG").upper()
LOG_VERBOSE_REQUESTS = _env_bool("LOG_VERBOSE_REQUESTS", "false" if IS_PRODUCTION else "false")

SENTRY_DSN = (os.getenv("SENTRY_DSN") or "").strip()
SENTRY_TRACES_SAMPLE_RATE = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))

PAYMENT_CALLBACK_SECRET = _require("PAYMENT_CALLBACK_SECRET")
PAYMENT_CALLBACK_URL = (
    os.getenv("PAYMENT_CALLBACK_URL", f"{PUBLIC_API_URL}/payment/callback").rstrip("/")
)
PAYMENT_ALLOW_TEST = _env_bool(
    "PAYMENT_ALLOW_TEST", "false" if IS_PRODUCTION else "true"
)
WEBPAY_API_URL = (os.getenv("WEBPAY_API_URL") or "").strip()

RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "30"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_PATHS = {
    "/token",
    "/register",
    "/auth/google/register",
    "/payment/callback",
    "/refresh",
}
RATE_LIMIT_METHODS = {"POST"}

REQUIRE_EMAIL_VERIFICATION = _env_bool(
    "REQUIRE_EMAIL_VERIFICATION", "false" if not IS_PRODUCTION else "true"
)

UPTIME_ALERT_WEBHOOK_URL = (os.getenv("UPTIME_ALERT_WEBHOOK_URL") or "").strip()
HEALTH_ALERT_COOLDOWN_SECONDS = int(os.getenv("HEALTH_ALERT_COOLDOWN_SECONDS", "300"))

UPLOADS_FOLDER = os.getenv("UPLOADS_FOLDER", "uploads")
UPLOAD_DIR = os.getenv("AVATARS_DIR", "avatars")
PORTFOLIO_DIR = os.getenv("PORTFOLIO_DIR", "portfolio")

FILE_STORAGE_BACKEND = os.getenv("FILE_STORAGE_BACKEND", "local").lower()
S3_ENDPOINT_URL = (os.getenv("S3_ENDPOINT_URL") or "").strip()
S3_BUCKET = (os.getenv("S3_BUCKET") or "").strip()
S3_ACCESS_KEY = (os.getenv("S3_ACCESS_KEY") or "").strip()
S3_SECRET_KEY = (os.getenv("S3_SECRET_KEY") or "").strip()
S3_REGION = (os.getenv("S3_REGION") or "us-east-1").strip()
S3_USE_PATH_STYLE = _env_bool("S3_USE_PATH_STYLE", "true")

if FILE_STORAGE_BACKEND not in {"local", "s3"}:
    raise RuntimeError("FILE_STORAGE_BACKEND must be 'local' or 's3'")

if IS_PRODUCTION and FILE_STORAGE_BACKEND == "local":
    _logger.info(
        "FILE_STORAGE_BACKEND=local — mount persistent volumes for avatars/portfolio/uploads "
        "(see docker-compose.yml). For multiple backend instances use FILE_STORAGE_BACKEND=s3."
    )

os.makedirs(UPLOADS_FOLDER, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PORTFOLIO_DIR, exist_ok=True)

# Populated by core.database after engine creation.
async_session_maker: async_sessionmaker[AsyncSession] | None = None


async def get_db():
    if async_session_maker is None:
        raise RuntimeError("Database is not initialized")

    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

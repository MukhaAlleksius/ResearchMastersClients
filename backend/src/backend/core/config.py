import logging  # Логирование предупреждений конфига
import os  # Чтение переменных окружения

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # Типы сессии БД

from core.env_loader import load_env_file  # Загрузка .env

_logger = logging.getLogger(__name__)  # Логгер этого модуля


def _load_dotenv() -> None:  # Обёртка: подтянуть .env при импорте config
    load_env_file()  # Читает файл в os.environ


def _env_bool(name: str, default: str) -> bool:  # Читает bool из env (true/1/yes/on)
    return os.getenv(name, default).lower() in {"1", "true", "yes", "on"}  # True при «включённых» значениях


def _env_list(name: str, default: str) -> list[str]:  # Читает список через запятую
    raw = os.getenv(name, default)  # Сырая строка
    return [item.strip() for item in raw.split(",") if item.strip()]  # Список без пустых элементов


def _require(name: str) -> str:  # Обязательная переменная окружения
    value = (os.getenv(name) or "").strip()  # Значение без пробелов
    if not value:  # Не задана
        raise RuntimeError(  # Падаем при старте с понятной ошибкой
            f"Missing required environment variable {name}. "
            "Copy .env.example to .env in the project root and configure it."
        )
    return value  # Возвращаем значение


_load_dotenv()  # Сразу загружаем .env до чтения настроек ниже

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()  # Окружение: development/production/...
IS_PRODUCTION = ENVIRONMENT == "production"  # Флаг продакшена

SECRET_KEY = _require("SECRET_KEY")  # Секрет JWT (обязателен)
DATABASE_URL = _require("DATABASE_URL")  # URL PostgreSQL/asyncpg (обязателен)
PUBLIC_API_URL = _require("PUBLIC_API_URL").rstrip("/")  # Публичный базовый URL API без /
GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()  # Client ID Google OAuth (опционально)

ALGORITHM = "HS256"  # Алгоритм подписи JWT
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))  # Срок access-токена
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))  # Срок refresh-токена
TOKEN_TYPE_ACCESS = "access"  # Строка-тип access в JWT
TOKEN_TYPE_REFRESH = "refresh"  # Строка-тип refresh в JWT
TOKEN_TYPE_EMAIL_VERIFY = "email_verify"  # Строка-тип подтверждения email

_default_cors = (  # CORS по умолчанию только для локальной разработки
    "http://localhost:3000,http://127.0.0.1:3000"  # Фронт на 3000 порту
    if not IS_PRODUCTION  # В dev
    else ""  # В prod список должен быть явно в env
)
CORS_ORIGINS = _env_list("CORS_ORIGINS", _default_cors)  # Разрешённые origin'ы фронта
if IS_PRODUCTION and not CORS_ORIGINS:  # В проде без CORS нельзя стартовать
    raise RuntimeError("CORS_ORIGINS must be set in production")  # Жёсткая ошибка конфигурации

SQL_ECHO = _env_bool("SQL_ECHO", "false" if IS_PRODUCTION else "true")  # Лог SQL-запросов
if IS_PRODUCTION and SQL_ECHO:  # В проде echo нежелателен
    _logger.warning("SQL_ECHO=true is ignored in production")  # Предупреждение
    SQL_ECHO = False  # Принудительно выключаем

AUTO_CREATE_DB = _env_bool("AUTO_CREATE_DB", "false" if IS_PRODUCTION else "true")  # create_all при старте
if IS_PRODUCTION and AUTO_CREATE_DB:  # В проде схема только через alembic
    raise RuntimeError(  # Запрет опасной настройки
        "AUTO_CREATE_DB must be false in production. "
        "Apply schema changes with: alembic upgrade head"
    )
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO" if IS_PRODUCTION else "DEBUG").upper()  # Уровень логов
LOG_VERBOSE_REQUESTS = _env_bool("LOG_VERBOSE_REQUESTS", "false" if IS_PRODUCTION else "false")  # Подробные access-логи

SENTRY_DSN = (os.getenv("SENTRY_DSN") or "").strip()  # DSN Sentry (пусто = выкл.)
SENTRY_TRACES_SAMPLE_RATE = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))  # Доля трейсов

PAYMENT_CALLBACK_SECRET = _require("PAYMENT_CALLBACK_SECRET")  # Секрет callback платёжки
PAYMENT_CALLBACK_URL = (  # URL, куда платёжка шлёт callback
    os.getenv("PAYMENT_CALLBACK_URL", f"{PUBLIC_API_URL}/payment/callback").rstrip("/")
)
PAYMENT_ALLOW_TEST = _env_bool(  # Разрешить тестовые платежи
    "PAYMENT_ALLOW_TEST", "false" if IS_PRODUCTION else "true"
)
WEBPAY_API_URL = (os.getenv("WEBPAY_API_URL") or "").strip()  # URL API WebPay (если используется)

RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "30"))  # Макс. запросов в окне
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))  # Окно в секундах
RATE_LIMIT_PATHS = {  # Пути под rate limit
    "/token",  # Логин
    "/register",  # Регистрация
    "/auth/google/login",  # Google-вход
    "/auth/google/register",  # Google-регистрация
    "/payment/callback",  # Callback оплаты
    "/refresh",  # Обновление токена
}
RATE_LIMIT_METHODS = {"POST"}  # Лимит только на POST

REQUIRE_EMAIL_VERIFICATION = _env_bool(  # Требовать подтверждение email
    "REQUIRE_EMAIL_VERIFICATION", "false" if not IS_PRODUCTION else "true"
)

# Любой вошедший пользователь может пользоваться админ-API (удобно для Docker/тестов).
OPEN_ADMIN_ACCESS = _env_bool(  # Открытый админ-доступ без роли admin
    "OPEN_ADMIN_ACCESS", "true" if not IS_PRODUCTION else "false"
)

UPTIME_ALERT_WEBHOOK_URL = (os.getenv("UPTIME_ALERT_WEBHOOK_URL") or "").strip()  # Webhook алертов health
HEALTH_ALERT_COOLDOWN_SECONDS = int(os.getenv("HEALTH_ALERT_COOLDOWN_SECONDS", "300"))  # Пауза между алертами

UPLOADS_FOLDER = os.getenv("UPLOADS_FOLDER", "uploads")  # Папка общих загрузок
UPLOAD_DIR = os.getenv("AVATARS_DIR", "avatars")  # Папка аватаров
PORTFOLIO_DIR = os.getenv("PORTFOLIO_DIR", "portfolio")  # Папка портфолио

FILE_STORAGE_BACKEND = os.getenv("FILE_STORAGE_BACKEND", "local").lower()  # local или s3
S3_ENDPOINT_URL = (os.getenv("S3_ENDPOINT_URL") or "").strip()  # Endpoint S3-совместимого хранилища
S3_BUCKET = (os.getenv("S3_BUCKET") or "").strip()  # Имя бакета
S3_ACCESS_KEY = (os.getenv("S3_ACCESS_KEY") or "").strip()  # Access key
S3_SECRET_KEY = (os.getenv("S3_SECRET_KEY") or "").strip()  # Secret key
S3_REGION = (os.getenv("S3_REGION") or "us-east-1").strip()  # Регион
S3_USE_PATH_STYLE = _env_bool("S3_USE_PATH_STYLE", "true")  # Path-style addressing для MinIO и т.п.

if FILE_STORAGE_BACKEND not in {"local", "s3"}:  # Неизвестное значение
    raise RuntimeError("FILE_STORAGE_BACKEND must be 'local' or 's3'")  # Ошибка конфига

if IS_PRODUCTION and FILE_STORAGE_BACKEND == "local":  # В проде local допустим, но нужен volume
    _logger.info(  # Подсказка в лог
        "FILE_STORAGE_BACKEND=local — mount persistent volumes for avatars/portfolio/uploads "
        "(see docker-compose.yml). For multiple backend instances use FILE_STORAGE_BACKEND=s3."
    )

os.makedirs(UPLOADS_FOLDER, exist_ok=True)  # Создаём папку uploads если нет
os.makedirs(UPLOAD_DIR, exist_ok=True)  # Создаём папку avatars если нет
os.makedirs(PORTFOLIO_DIR, exist_ok=True)  # Создаём папку portfolio если нет

# Populated by core.database after engine creation.
async_session_maker: async_sessionmaker[AsyncSession] | None = None  # Фабрика сессий (заполняет database.py)


async def get_db():  # Dependency FastAPI: выдаёт сессию БД на запрос
    if async_session_maker is None:  # БД ещё не инициализирована
        raise RuntimeError("Database is not initialized")  # Ошибка старта/порядка импортов

    async with async_session_maker() as session:  # Открываем сессию
        try:
            yield session  # Отдаём эндпоинту
            await session.commit()  # Коммит при успехе
        except Exception:  # Любая ошибка в обработчике
            await session.rollback()  # Откат транзакции
            raise  # Пробрасываем ошибку дальше

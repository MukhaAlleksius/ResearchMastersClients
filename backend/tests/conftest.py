import os

# Minimal env for tests that import backend modules using core.config.
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test_user:test_password@localhost:5432/test_db",
)
os.environ.setdefault("PUBLIC_API_URL", "http://localhost:8000")
os.environ.setdefault("PAYMENT_CALLBACK_SECRET", "test-payment-callback-secret")

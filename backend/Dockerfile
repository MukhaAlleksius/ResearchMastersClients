# Базовый образ: официальный Python 3.12 (slim = компактный вариант Linux)
FROM python:3.12-slim

# Рабочая папка внутри контейнера. Дальнейшие команды выполняются здесь
WORKDIR /app

# Настройки Python/pip:
# PYTHONDONTWRITEBYTECODE — не создавать .pyc файлы
# PYTHONUNBUFFERED — сразу писать логи в консоль (удобно в Docker)
# PIP_NO_CACHE_DIR — не кэшировать пакеты pip (меньше размер образа)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Системные пакеты для сборки зависимостей и healthcheck:
# build-essential — компиляторы (нужны некоторым Python-пакетам)
# libjpeg-dev, zlib1g-dev — для работы с изображениями (Pillow и т.п.)
# curl — для проверки /health
# В конце удаляем кэш apt, чтобы образ был легче
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Сначала копируем только файлы зависимостей (для кэша Docker-слоёв)
COPY backend/pyproject.toml backend/poetry.lock* ./

# Устанавливаем Poetry, ставим зависимости проекта без отдельного venv,
# плюс gunicorn (сервер), boto3 (S3), sentry-sdk (мониторинг ошибок)
RUN pip install poetry \
    && poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-root \
    && pip install "gunicorn>=23.0.0,<24.0.0" "boto3>=1.35.0,<2.0.0" "sentry-sdk[fastapi]>=2.0.0,<3.0.0"

# Копируем весь код backend в контейнер (/app)
COPY backend/src/backend ./

# Делаем entrypoint-скрипт исполняемым (миграции + запуск gunicorn)
RUN chmod +x docker-entrypoint.sh

# Документируем, что приложение слушает порт 8000
EXPOSE 8000

# Значения по умолчанию для контейнера (можно переопределить в .env / compose)
ENV GUNICORN_WORKERS=4 \
    GUNICORN_TIMEOUT=120 \
    RUN_MIGRATIONS_ON_STARTUP=true \
    AUTO_CREATE_DB=false \
    SQL_ECHO=false

# Проверка живости контейнера: раз в 30с дергает /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# При старте контейнера запускается этот скрипт
# (сначала alembic migrate, потом gunicorn)
ENTRYPOINT ["./docker-entrypoint.sh"]

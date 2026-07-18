# Backend

FastAPI-сервер платформы Fixer / ResearchMastersClients.

Полная документация проекта: [../README.md](../README.md)

## Запуск

```bash
cd backend
poetry install
cd src/backend
poetry run uvicorn main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

## Mock WebPay

```bash
cd src/backend
poetry run python mock_web_pay.py
```

Порт **8001**. Callback шлёт на `http://localhost:8000/payment/callback`.

## Структура `src/backend/`

| Папка | Содержимое |
|-------|------------|
| `main.py` | FastAPI app, CORS, роутеры |
| `core/` | `config.py`, `database.py` |
| `models/` | SQLAlchemy-модели |
| `schemas/` | Pydantic DTO |
| `cruds/` | Бизнес-логика |
| `routers/` | HTTP API |
| `payments/` | Константы статусов оплаты |
| `alembic/` | Миграции |

## База данных

PostgreSQL. Строка подключения: `DATABASE_URL` в `.env`.

| Режим | Схема БД | SQL-логи |
|-------|----------|----------|
| **development** | `AUTO_CREATE_DB=true` → `create_all` при старте (удобно локально) | `SQL_ECHO=true` по умолчанию |
| **production** | только **Alembic** (`alembic upgrade head`); `AUTO_CREATE_DB=true` → ошибка при старте | `SQL_ECHO` всегда выключен |

Миграции:

```bash
cd src/backend
poetry run alembic upgrade head
```

В Docker backend при старте автоматически выполняется `alembic upgrade head` (`RUN_MIGRATIONS_ON_STARTUP=true`).

Бэкапы PostgreSQL: см. [../../deploy/DEPLOY.md](../../deploy/DEPLOY.md#postgresql-backups).

## Переменные окружения

- `PAYMENT_CALLBACK_SECRET` — секрет callback оплаты  
- `PAYMENT_ALLOW_TEST` — разрешить test-оплату (`true`/`false`)

## Зависимости

См. `pyproject.toml` (Poetry). Python ≥ 3.12.

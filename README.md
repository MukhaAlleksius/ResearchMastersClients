# ResearchMastersClients (Fixer)

Веб-платформа для связи **заказчиков** и **исполнителей**: публикация заказов, отклики, сметы, договоры, переписка, уведомления и оплата через **эскроу**.

| Часть | Стек |
|-------|------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), PostgreSQL, Alembic |
| Frontend | React 19, React Router 7, Create React App |

---

## Структура репозитория

```
ResearchMastersClients/
├── backend/
│   ├── Dockerfile              # prod: gunicorn + uvicorn workers
│   ├── pyproject.toml          # зависимости (Poetry)
│   ├── src/backend/
│   │   ├── main.py             # точка входа FastAPI, GET /health
│   │   ├── core/               # config, database
│   │   ├── models/             # SQLAlchemy-модели
│   │   ├── schemas/            # Pydantic-схемы
│   │   ├── cruds/              # бизнес-логика и запросы к БД
│   │   ├── routers/            # HTTP-эндпоинты
│   │   ├── payments/           # константы оплаты
│   │   ├── mock_web_pay.py     # mock платёжного шлюза (dev)
│   │   └── alembic/            # миграции БД
│   └── tests/
├── frontend/
│   ├── Dockerfile              # prod: npm build → nginx static
│   ├── src/
│   │   ├── App.js              # маршруты
│   │   ├── components/         # UI-компоненты
│   │   ├── hooks/
│   │   └── utils/api.js        # baseURL, fetchWithAuth
│   └── package.json
├── deploy/
│   ├── DEPLOY.md               # инструкция по prod-развёртыванию
│   ├── nginx/                  # reverse proxy (HTTP / HTTPS)
│   └── ssl/                    # TLS-сертификаты (не в git)
├── docker-compose.yml          # nginx + frontend + backend + PostgreSQL
├── docker-compose.prod.yml     # prod без локальной БД (managed PostgreSQL)
├── .github/workflows/ci.yml    # CI: тесты + сборка Docker
├── .env.example
└── README.md                   # этот файл
```

---

## Требования

- **Python** ≥ 3.12  
- **Node.js** ≥ 18 (для frontend)  
- **PostgreSQL** (локально или удалённо)  
- **Poetry** (рекомендуется) или pip для backend  

---

## Быстрый старт

### 1. База данных и конфигурация

Скопируйте шаблон переменных окружения и заполните реальные значения:

```bash
cp .env.example .env
```

Обязательные переменные в `.env`:

| Переменная | Назначение |
|------------|------------|
| `SECRET_KEY` | Секрет для JWT (сгенерируйте случайную строку) |
| `DATABASE_URL` | PostgreSQL, драйвер `asyncpg` |
| `PUBLIC_API_URL` | Публичный URL API (для ссылок на аватары и callback) |
| `PAYMENT_CALLBACK_SECRET` | Секрет заголовка `X-Payment-Secret` |

Пример `DATABASE_URL` для локальной разработки:

```
postgresql+asyncpg://USER:PASSWORD@localhost:5432/DATABASE
```

Файл `.env` не коммитится в git. Секреты и строки подключения задаются только через переменные окружения (`core/config.py`).

При старте приложения таблицы могут создаваться автоматически (`AUTO_CREATE_DB=true`, только dev). Для prod: `ENVIRONMENT=production`, `AUTO_CREATE_DB=false`, миграции Alembic:

```bash
cd backend/src/backend
alembic upgrade head
```

В Docker миграции применяются автоматически при старте backend.

### 2. Backend

```bash
cd backend
poetry install
cd src/backend
poetry run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API: http://localhost:8000  
Интерактивная документация (Swagger): http://localhost:8000/docs  

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

Приложение: http://localhost:3000  

Базовый URL API задаётся через `REACT_APP_API_URL` в `frontend/.env` (см. `frontend/.env.development`).

### 4. Mock WebPay (опционально, для теста redirect-оплаты)

```bash
cd backend/src/backend
poetry run python mock_web_pay.py
```

Mock-шлюз: http://localhost:8001  

---

## Переменные окружения

Все секреты и URL задаются в `.env` (см. `.env.example`). В коде нет захардкоженных паролей и `SECRET_KEY`.

| Переменная | Обязательна | Назначение |
|------------|-------------|------------|
| `SECRET_KEY` | да | JWT |
| `DATABASE_URL` | да | PostgreSQL (`asyncpg`) |
| `PUBLIC_API_URL` | да | Публичный URL API (аватары, callback) |
| `PAYMENT_CALLBACK_SECRET` | да | Секрет для `/payment/callback` |
| `PAYMENT_ALLOW_TEST` | нет | Разрешить `payment_method: "test"` |
| `PAYMENT_CALLBACK_URL` | нет | По умолчанию `${PUBLIC_API_URL}/payment/callback` |
| `WEBPAY_API_URL` | нет | URL prod/mock WebPay |

В prod: `ENVIRONMENT=production`, `PAYMENT_ALLOW_TEST=false`, уникальные секреты.

JWT-параметры в `backend/src/backend/core/config.py`:

- `ACCESS_TOKEN_EXPIRE_MINUTES` = 60 (по умолчанию)

---

## Аутентификация

1. **Регистрация:** `POST /register`  
2. **Вход:** `POST /token` → `access_token`, `refresh_token`  
3. **Обновление токена:** `POST /refresh` (Bearer refresh_token)  
4. **Защищённые запросы:** заголовок `Authorization: Bearer <access_token>`

На frontend токены хранятся в `localStorage` (`access_token`, `refresh_token`, `user_id`).  
Обёртка `fetchWithAuth` в `frontend/src/utils/api.js` автоматически обновляет access token.

---

## Основные модули backend

| Модуль | Роутеры / CRUD | Назначение |
|--------|----------------|------------|
| **Пользователи** | `users_router`, `users_crud` | регистрация, профиль, аватар, портфолио, контакты, география |
| **Заказы** | `routers/orders/*`, `cruds/orders/*` | создание заказов, статусы, отклики, назначение исполнителя, отмена |
| **Сметы** | `estimate_graphic_works_router` | график работ, смета по заказу |
| **Материалы/работы** | `works_materials_router` | прайсы работ и материалов |
| **Договоры** | `contracts_router` | создание и подписание договора заказчиком/исполнителем |
| **Переписка** | `conversations_router` | чаты по заказам |
| **Оплата** | `payments_router`, `payments_crud` | эскроу, выплата, счёт исполнителя |
| **Уведомления** | `notifications_router` | события по заказам, оплате, договорам |
| **География** | `geography_router` | страны, регионы, города |
| **Валюта** | `currency_router` | курсы НБРБ |
| **Аналитика** | `analitycs_router` | статистика для профиля |

---

## Основные модули frontend

| Путь | Компоненты | Назначение |
|------|------------|------------|
| `/home` | `HomePage` | главная страница |
| `/orders`, `/order/:slug` | каталог заказов | просмотр заказов, «Предложить услугу» |
| `/profile/*` | `ProfilePage` | личный кабинет |
| `/profile/orders` | `Orders` | заказы заказчика |
| `/profile/services` | `Services` | заказы исполнителя |
| `/profile/executor_bank_account` | `ExecutorBankAccount` | IBAN для выплат |
| `/admin/*` | `AdminLayout` | панель администратора |

Оплата в UI:

- заказчик: `Orders/CommonComponents/Payment/Payment.jsx`
- исполнитель: `Services/.../Payment/ExecutorPaumentStatus.jsx`

---

## Оплата и эскроу

### Модель

Платформа выступает посредником: деньги резервируются до подтверждения выполнения заказа.

```
pending → escrow → released
           ↑          ↑
      оплачено    переведено исполнителю
```

Комиссия платформы: **10%** (`payments/constants.py`, `COMMISSION_RATE`).

Пример: исполнителю 100 BYN → заказчик платит 110 BYN (100 + 10 комиссия).

### Таблицы БД

- **`payments`** — связь заказ ↔ заказчик ↔ исполнитель, суммы, статус, `transaction_id` шлюза  
- **`executor_bank_accounts`** — IBAN исполнителя для выплат  

### API оплаты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/order/{order_id}/pay_escrow` | Создать платёж (JWT заказчика) |
| POST | `/order/{order_id}/payment/{payment_id}/pay_executor` | Выпустить эскроу исполнителю |
| POST | `/order/{order_id}/approve` | Подтверждение выполнения (= release эскроу) |
| POST | `/payment/callback` | Callback от WebPay/mock (секрет в заголовке) |
| GET | `/payment_for_order/{order_id}/{customer_id}` | История платежей заказчика |
| GET | `/executor/{executor_id}/order/{order_id}/payments` | Платежи исполнителя по заказу |
| POST | `/executor/{executor_id}/bank-account` | Привязать счёт исполнителя |

### Тело запроса оплаты

```json
{
  "executor_amount": 100.0,
  "payment_method": "test",
  "executor_id": null
}
```

- **`test`** — мгновенный статус `escrow` (если `PAYMENT_ALLOW_TEST=true`), карта не нужна  
- **`webpay`** — redirect на шлюз, статус `pending` до callback  

### Тестовый сценарий

1. Войти как **заказчик**.  
2. Открыть заказ с **бюджетом** и **назначенным исполнителем**.  
3. Вкладка **«Оплата»** → **«Оплатить»** → статус **«В эскроу»**.  
4. **«Перевести исполнителю»** → **«Переведено»**.  

Исполнитель указывает IBAN: **Профиль → Счёт** (`/profile/executor_bank_account`).

---

## Ключевые эндпоинты (краткий справочник)

Полный список — в Swagger: http://localhost:8000/docs  

### Пользователи

- `POST /register`, `POST /token`, `POST /refresh`
- `GET /profile`, `POST /add_profile`
- `POST /upload_avatar`, `GET /avatar/{user_id}`

### Заказы

- `POST /add_order_user` — создать заказ
- `GET /orders_customer`, `GET /services_executor` — списки
- `GET /order/{order_id}` — карточка заказа
- `POST /add_order_response_executor` — отклик исполнителя
- `POST /add_executor_order` — назначить исполнителя
- `POST /add_status_order_customer`, `POST /add_status_order_executor` — смена статуса

### Уведомления

- `GET /notifications`
- `PATCH /notifications/{id}/read`
- `POST /notifications/read_all`

---

## Слои backend (как читать код)

```
HTTP-запрос
    → routers/*.py        # валидация, auth (get_current_user), HTTP-коды
    → cruds/*.py          # бизнес-логика, SQLAlchemy-запросы
    → models/*.py         # таблицы БД
    → schemas/*.py        # вход/выход API (Pydantic)
```

При добавлении функции:

1. модель (если нужна новая таблица)  
2. schema  
3. crud  
4. router + подключение в `main.py`  

---

## Статические файлы

- `uploads/`, `avatars/` — аватары пользователей  
- `portfolio/` — изображения портфолио (mount `/portfolio`)  

---

## Разработка

### Логи backend

Уровень задаётся в `.env`: `LOG_LEVEL=DEBUG` (dev) или `INFO`/`WARNING` (prod).  
Middleware пишет method, path, status и IP — **без** токенов в заголовках.

Опционально Sentry: `SENTRY_DSN=...` в `.env` (см. [deploy/DEPLOY.md](deploy/DEPLOY.md)).

### CORS

В dev разрешены все origin (`allow_origins=["*"]`). Для prod сузьте список в `main.py`.

### Тесты

```bash
cd backend
poetry run pytest
```

---

## Production (Docker)

Минимальный prod-стек: **nginx** → **frontend** (static) + **backend** (gunicorn/uvicorn) + **PostgreSQL**.

```bash
cp .env.example .env
# заполните SECRET_KEY, DATABASE_URL, PUBLIC_API_URL=http://localhost/api, POSTGRES_*
docker compose up -d --build
curl http://localhost/health
```

- Подробности: [deploy/DEPLOY.md](deploy/DEPLOY.md)
- Managed PostgreSQL: `docker compose -f docker-compose.prod.yml up -d --build`
- CI: GitHub Actions — тесты backend, сборка frontend, сборка Docker-образов

| URL (Docker) | Назначение |
|--------------|------------|
| http://localhost | React SPA |
| http://localhost/api/ | FastAPI API |
| http://localhost/health | Health-check (БД + приложение) |

---

## Планы интеграции (prod)

- [ ] Реальный **WebPay** вместо mock (redirect + callback)  
- [ ] Отключить test-оплату: `PAYMENT_ALLOW_TEST=false`  
- [ ] Банковская выплата на IBAN исполнителя после `released`  
- [ ] Автосвязка «заказ выполнен» → release эскроу  
- [x] Юридические страницы на сайте — см. [docs/LEGAL.md](docs/LEGAL.md), `/legal/*`  

---

## Юридические документы (для WebPay)

Публичные страницы на frontend (не README):

- `/legal/terms` — оферта  
- `/legal/privacy` — персональные данные  
- `/legal/payment` — оплата и возврат  
- `/legal/requisites` — реквизиты  

Реквизиты и контакты редактируются в `frontend/src/components/Content/Legal/legalConfig.js`.

---

## Контакты и название

В UI используется бренд **Fixer**. Репозиторий: **ResearchMastersClients**.
#   R e s e a r c h M a s t e r s C l i e n t s  
 
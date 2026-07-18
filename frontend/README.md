# Frontend

React-приложение платформы Fixer / ResearchMastersClients.

Полная документация проекта: [../README.md](../README.md)

## Запуск (development)

```bash
cd frontend
npm install
npm start
```

http://localhost:3000

URL API задаётся в `.env.development`:

```
REACT_APP_API_URL=http://localhost:8000
```

## API client

`src/utils/api.js`:

- `API.baseURL` / `getApiBaseUrl()` — из `REACT_APP_API_URL`
- `buildApiUrl(path)` — полный URL эндпоинта
- `apiFetch`, `fetchWithAuth` — запросы с JWT refresh

Не хардкодите `localhost:8000` в компонентах — используйте `buildApiUrl()`.

## Production build

```bash
cp .env.production.example .env.production   # при необходимости
npm run build
```

Переменные для prod — в `.env.production` (см. `.env.production.example`):

| Значение | Когда |
|----------|--------|
| `REACT_APP_API_URL=/api` | nginx на том же домене (docker compose) |
| `REACT_APP_API_URL=https://domain.by/api` | отдельный публичный URL API |

Артефакт `build/` раздаётся nginx (см. `frontend/Dockerfile`, `deploy/DEPLOY.md`).

## Основные маршруты

См. `src/App.js`:

- `/home` — главная
- `/orders` — каталог заказов
- `/profile/*` — личный кабинет (заказы, услуги, счёт, портфолио)
- `/admin/*` — админ-панель

## Структура `src/`

| Папка | Назначение |
|-------|------------|
| `components/Content/` | страницы и блоки контента |
| `components/Content/Profile/` | личный кабинет |
| `components/Modals/` | модальные окна (регистрация, вход) |
| `utils/api.js` | API client |

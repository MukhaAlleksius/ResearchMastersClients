# === Этап 1: сборка React-приложения ===
# Базовый образ Node.js 20 (alpine = лёгкий Linux)
# AS build — имя этапа, чтобы потом забрать из него результат
FROM node:20-alpine AS build

# Рабочая папка внутри контейнера
WORKDIR /app

# Копируем package.json и lock-файл (для кэша зависимостей)
COPY frontend/package.json frontend/package-lock.json ./

# Ставим зависимости строго по package-lock.json
RUN npm ci

# Копируем весь код frontend
COPY frontend/ ./

# URL API, который попадёт в сборку React (по умолчанию /api через nginx)
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL

# Google OAuth client id (кнопка «Войти через Google» в Docker-сборке)
ARG REACT_APP_GOOGLE_CLIENT_ID=
ENV REACT_APP_GOOGLE_CLIENT_ID=$REACT_APP_GOOGLE_CLIENT_ID

# Собираем production-версию сайта в папку /app/build
RUN npm run build

# === Этап 2: раздача готовой статитки через nginx ===
# Берём лёгкий nginx — Node для запуска готового сайта уже не нужен
FROM nginx:1.27-alpine

# Конфиг nginx для SPA (маршруты React, кэш и т.д.)
COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf

# Копируем только собранный сайт с этапа build (без node_modules и исходников)
COPY --from=build /app/build /usr/share/nginx/html

# Nginx слушает порт 80
EXPOSE 80

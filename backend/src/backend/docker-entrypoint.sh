#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS_ON_STARTUP:-true}" = "true" ]; then
  echo "Running Alembic migrations..."
  alembic upgrade head
fi

echo "Starting gunicorn..."
exec gunicorn main:app \
  -k uvicorn.workers.UvicornWorker \
  -w "${GUNICORN_WORKERS:-4}" \
  -b 0.0.0.0:8000 \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile -

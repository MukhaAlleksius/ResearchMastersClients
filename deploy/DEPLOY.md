# Production deployment

## Architecture

```
                    ┌─────────────┐
   HTTPS :443       │    nginx    │  reverse proxy + TLS (prod)
   HTTP  :80   ───► │             │  /      → frontend (static React)
                    │             │  /api/* → backend (FastAPI)
                    └──────┬──────┘  /health → backend health
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      ┌───────────────┐         ┌───────────────┐
      │   frontend    │         │    backend    │
      │  nginx:alpine │         │ gunicorn +    │
      │  static build │         │ uvicorn workers│
      └───────────────┘         └───────┬───────┘
                                        │
                                        ▼
                                ┌───────────────┐
                                │  PostgreSQL   │
                                │ (container or │
                                │  managed DB)  │
                                └───────────────┘
```

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Full stack: nginx + frontend + backend + PostgreSQL |
| `docker-compose.prod.yml` | nginx (HTTPS) + frontend + backend, **external DB** |
| `backend/Dockerfile` | FastAPI, gunicorn + UvicornWorker |
| `frontend/Dockerfile` | `npm run build` → nginx static |
| `deploy/nginx/reverse-proxy.conf` | HTTP reverse proxy (dev/staging) |
| `deploy/nginx/reverse-proxy-ssl.conf` | HTTPS + HTTP→HTTPS redirect |
| `.github/workflows/ci.yml` | Tests + Docker image build |

## Quick start (Docker, local PostgreSQL)

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```
2. Set production values in `.env`:
   - `ENVIRONMENT=production`
   - `SECRET_KEY` — random 64+ char string
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — for the `db` container
   - `DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@db:5432/DATABASE`
   - `PAYMENT_CALLBACK_SECRET` — unique secret
   - `PAYMENT_ALLOW_TEST=false`
   - `CORS_ORIGINS=http://localhost` (or your domain)
   - `PUBLIC_API_URL=http://localhost/api` (must match nginx `/api` prefix)
   - `GUNICORN_WORKERS=4` (optional)
3. Run migrations against the DB (before or after first `db` start):
   ```bash
   cd backend/src/backend
   alembic upgrade head
   ```
   In Docker this runs automatically on backend startup (`RUN_MIGRATIONS_ON_STARTUP=true`).
4. Start stack:
   ```bash
   docker compose up -d --build
   ```
5. Verify:
   ```bash
   curl -s http://localhost/health
   curl -s http://localhost/api/
   ```

App: http://localhost  
API: http://localhost/api  
Health: http://localhost/health (also `GET /api/health` on backend path)

## Managed PostgreSQL (production)

Use `docker-compose.prod.yml` when PostgreSQL runs on a separate host (RDS, Cloud SQL, etc.):

1. Set `DATABASE_URL` to the managed instance (host must be reachable from the backend container).
2. Do **not** rely on `POSTGRES_*` — there is no `db` service in this compose file.
3. Place TLS certs in `deploy/ssl/` (`fullchain.pem`, `privkey.pem`).
4. Set `PUBLIC_API_URL=https://your-domain.by/api` and `CORS_ORIGINS=https://your-domain.by`.
5. Start:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

## HTTPS / TLS

**Option A — certs on nginx (this repo):**

1. Obtain certificates (Let's Encrypt / certbot).
2. Copy to `deploy/ssl/fullchain.pem` and `deploy/ssl/privkey.pem`.
3. Use `docker-compose.prod.yml` (mounts `reverse-proxy-ssl.conf`).

**Option B — external load balancer:**

Keep `docker-compose.yml` on HTTP :80 internally; terminate TLS at AWS ALB, Cloudflare, etc. Set `X-Forwarded-Proto` and point `PUBLIC_API_URL` / `CORS_ORIGINS` to the public HTTPS URL.

## Health checks

| Endpoint | Response |
|----------|----------|
| `GET /health` | `200 {"status":"ok","database":true}` if DB reachable |
| | `503 {"status":"degraded","database":false}` if DB down |

Docker Compose healthchecks use this endpoint for `backend`, `nginx`, and `db` (via `pg_isready`).

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) on push/PR to `main`/`master`:

- backend: `pytest`
- frontend: `npm run build`
- docker: build backend and frontend images

Extend with deploy job (SSH, registry push, Kubernetes) as needed for your host.

## PostgreSQL backups

### Docker Compose (local `db` service)

The `db-backup` service runs `pg_dump` on a schedule (default: every 24h) and stores compressed dumps in the `postgres_backups` volume.

| Variable | Default | Meaning |
|----------|---------|---------|
| `BACKUP_INTERVAL_SECONDS` | `86400` | Seconds between backups |
| `BACKUP_RETENTION_DAYS` | `14` | Delete dumps older than N days |

Manual one-off backup:

```bash
docker compose exec db-backup /scripts/pg_backup.sh
```

Restore example:

```bash
gunzip -c backup.sql.gz | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Host script (without Docker): `deploy/scripts/pg_backup.sh` with `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

### Managed PostgreSQL

Use your provider's automated backups (RDS snapshots, Cloud SQL, etc.) and/or run `deploy/scripts/pg_backup.sh` from cron on a bastion with network access to the DB.

## Persistent volumes

| Volume | Mount | Content |
|--------|-------|---------|
| `postgres_data` | db | PostgreSQL data |
| `postgres_backups` | db-backup | `pg_dump` archives (`.sql.gz`) |
| `avatars_data` | backend `/app/avatars` | User avatars |
| `portfolio_data` | backend `/app/portfolio` | Portfolio images |
| `uploads_data` | backend `/app/uploads` | Uploads |

## File storage (avatars, portfolio, uploads)

### Single backend instance (Docker)

`docker-compose.yml` mounts **named volumes** — files survive container rebuilds:

| Volume | Path in container |
|--------|-------------------|
| `avatars_data` | `/app/avatars` |
| `portfolio_data` | `/app/portfolio` |
| `uploads_data` | `/app/uploads` |

Set in `.env` (or use compose defaults):

```
FILE_STORAGE_BACKEND=local
AVATARS_DIR=/app/avatars
PORTFOLIO_DIR=/app/portfolio
UPLOADS_FOLDER=/app/uploads
```

### Multiple backend instances (S3 / MinIO)

Use object storage so all replicas share the same files:

```
FILE_STORAGE_BACKEND=s3
S3_ENDPOINT_URL=http://minio:9000
S3_BUCKET=fixer-media
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_USE_PATH_STYLE=true
```

Local MinIO (optional profile):

```bash
# .env: FILE_STORAGE_BACKEND=s3, S3_* as above
docker compose --profile s3 up -d --build
```

MinIO console: http://localhost:9001

For AWS S3: set `S3_ENDPOINT_URL` empty, `S3_REGION`, IAM keys, and `S3_USE_PATH_STYLE=false`.

Portfolio URLs stay `/portfolio/...` — with `s3` backend files are served through FastAPI (not StaticFiles).

## Logging and error monitoring

| Variable | Dev | Prod |
|----------|-----|------|
| `LOG_LEVEL` | `DEBUG` | `INFO` or `WARNING` |
| `LOG_VERBOSE_REQUESTS` | `false` (optional `true` for redacted headers) | must stay `false` |

- Access logs: method, path, status, client IP — **never** raw `Authorization` / cookies.
- In production, `LOG_LEVEL=DEBUG` is automatically raised to `INFO`.
- Uvicorn access log noise is reduced in production.

**Sentry** (optional):

```env
SENTRY_DSN=https://key@o0.ingest.sentry.io/project
SENTRY_TRACES_SAMPLE_RATE=0.1
```

Unhandled 500 errors and logged exceptions are sent when `SENTRY_DSN` is set (`sentry-sdk` included in Docker image).

## Security hardening

| Feature | Config |
|---------|--------|
| Rate limit | `RATE_LIMIT_*` on POST `/token`, `/register`, `/refresh`, `/payment/callback` |
| JWT types | access and refresh are **not** interchangeable (`type` claim required) |
| Email verify | `REQUIRE_EMAIL_VERIFICATION=true` in prod; link logged in dev until SMTP is wired |
| Uploads | avatars/portfolio: extension + size + PIL format/resolution checks |
| Uptime | `GET /health` + optional `UPTIME_ALERT_WEBHOOK_URL`; external probe: `deploy/scripts/uptime_check.sh` |

After deploy, users with old JWT (without `type`) must log in again.

## Still manual before go-live

- WebPay prod credentials (`WEBPAY_API_URL`)
- Legal requisites in `frontend/src/components/Content/Legal/legalConfig.js`
- PostgreSQL backups and monitoring
- Error monitoring (Sentry or similar)
- Replace remaining hardcoded `http://localhost:8000` in frontend with `buildApiUrl()` / `API.baseURL`

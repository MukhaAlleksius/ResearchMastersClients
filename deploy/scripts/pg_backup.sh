#!/bin/sh
# PostgreSQL logical backup (pg_dump). Used by docker-compose db-backup service
# or manually: ./deploy/scripts/pg_backup.sh
set -eu

PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:?PGUSER is required}"
PGDATABASE="${PGDATABASE:?PGDATABASE is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/${PGDATABASE}_${TS}.sql.gz"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup started: ${OUT}"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" --no-owner --no-acl | gzip > "$OUT"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup finished: ${OUT} ($(du -h "$OUT" | cut -f1))"

find "$BACKUP_DIR" -name "${PGDATABASE}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Retention: removed backups older than ${RETENTION_DAYS} days"

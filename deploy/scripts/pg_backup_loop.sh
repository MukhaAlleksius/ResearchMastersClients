#!/bin/sh
# Loop wrapper for scheduled backups inside Docker.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
SCRIPT="/scripts/pg_backup.sh"

echo "PostgreSQL backup scheduler: interval=${INTERVAL}s retention=${BACKUP_RETENTION_DAYS:-14}d"

while true; do
  "$SCRIPT" || echo "Backup failed at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  sleep "$INTERVAL"
done

#!/bin/sh
# External uptime probe — run from cron or GitHub Actions.
# Example: HEALTH_URL=https://your-domain.by/health ./deploy/scripts/uptime_check.sh
set -eu

HEALTH_URL="${HEALTH_URL:-http://localhost/health}"
ALERT_WEBHOOK="${UPTIME_ALERT_WEBHOOK_URL:-}"

response="$(curl -fsS "$HEALTH_URL" 2>&1)" || {
  message="Health check failed for ${HEALTH_URL}"
  echo "$message" >&2
  if [ -n "$ALERT_WEBHOOK" ]; then
    payload=$(printf '{"text":"%s"}' "$message")
    curl -fsS -X POST -H "Content-Type: application/json" -d "$payload" "$ALERT_WEBHOOK" || true
  fi
  exit 1
}

echo "OK: $response"

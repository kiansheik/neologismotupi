#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-localhost}"
PORT="${2:-5432}"
USER_NAME="${3:-${USER:-postgres}}"
TIMEOUT="${4:-60}"

start_ts=$(date +%s)

echo "Waiting for PostgreSQL at ${HOST}:${PORT} as ${USER_NAME}..."
while ! pg_isready -h "$HOST" -p "$PORT" -U "$USER_NAME" >/dev/null 2>&1; do
  now_ts=$(date +%s)
  elapsed=$((now_ts - start_ts))
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "Timed out waiting for PostgreSQL after ${TIMEOUT}s"
    exit 1
  fi
  sleep 1
done

echo "PostgreSQL is ready."

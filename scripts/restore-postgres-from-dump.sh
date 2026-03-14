#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${API_ENV_FILE:-$ROOT_DIR/apps/api/.env}"
DUMP_FILE="${DUMP_FILE:-}"
DATABASE_URL_INPUT="${DATABASE_URL:-}"

if [[ -z "$DUMP_FILE" ]]; then
  echo "Usage: DUMP_FILE=/path/to/dump.sql.gz DATABASE_URL=postgresql://... make db-restore-dump"
  echo "Or set DATABASE_URL in $API_ENV_FILE"
  exit 1
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

if [[ -z "$DATABASE_URL_INPUT" && -f "$API_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV_FILE"
  set +a
  DATABASE_URL_INPUT="${DATABASE_URL:-}"
fi

if [[ -z "$DATABASE_URL_INPUT" ]]; then
  echo "DATABASE_URL is not set."
  exit 1
fi

PG_URL="${DATABASE_URL_INPUT/postgresql+asyncpg:/postgresql:}"

echo "Restoring $DUMP_FILE into database from DATABASE_URL"
if [[ "$DUMP_FILE" == *.gz ]]; then
  gunzip -c "$DUMP_FILE" | psql "$PG_URL"
else
  psql "$PG_URL" < "$DUMP_FILE"
fi
echo "Restore complete."

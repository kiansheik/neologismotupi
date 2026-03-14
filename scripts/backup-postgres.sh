#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${API_ENV_FILE:-$ROOT_DIR/apps/api/.env}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install PostgreSQL client tools first."
  exit 1
fi

if [[ -f "$API_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV_FILE"
  set +a
fi

DATABASE_URL="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is not set. Define it in apps/api/.env or export it before running."
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_FILE_BASENAME="${BACKUP_FILE_BASENAME:-nheenga}"

mkdir -p "$BACKUP_DIR"

PG_DUMP_URL="${DATABASE_URL/postgresql+asyncpg:/postgresql:}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUTPUT_FILE="$BACKUP_DIR/${BACKUP_FILE_BASENAME}_${TIMESTAMP}.sql.gz"

echo "Creating backup: $OUTPUT_FILE"
pg_dump --no-owner --no-privileges "$PG_DUMP_URL" | gzip > "$OUTPUT_FILE"

if [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  find "$BACKUP_DIR" -type f -name "${BACKUP_FILE_BASENAME}_*.sql.gz" -mtime +"$BACKUP_RETENTION_DAYS" -delete
fi

echo "Backup complete."

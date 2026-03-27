#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${API_ENV_FILE:-$ROOT_DIR/apps/api/.env}"
DUMP_FILE="${DUMP_FILE:-}"
DATABASE_URL_INPUT="${DATABASE_URL:-}"
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-$ROOT_DIR/backups/media}"
MEDIA_BACKUP_FILE="${MEDIA_BACKUP_FILE:-}"
MEDIA_BACKUP_FILE_BASENAME="${MEDIA_BACKUP_FILE_BASENAME:-nheenga_media}"
RESTORE_MEDIA="${RESTORE_MEDIA:-1}"

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

if [[ "$RESTORE_MEDIA" == "1" ]]; then
  if [[ -z "$MEDIA_BACKUP_FILE" ]]; then
    MEDIA_BACKUP_FILE="$(ls -t "$MEDIA_BACKUP_DIR"/"${MEDIA_BACKUP_FILE_BASENAME}"_*.tar.gz 2>/dev/null | head -n 1 || true)"
  fi

  if [[ -n "$MEDIA_BACKUP_FILE" && -f "$MEDIA_BACKUP_FILE" ]]; then
    if [[ -f "$API_ENV_FILE" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$API_ENV_FILE"
      set +a
    fi

    MEDIA_ROOT_INPUT="${MEDIA_ROOT:-media}"
    API_ENV_DIR="$(cd "$(dirname "$API_ENV_FILE")" && pwd)"
    if [[ "$MEDIA_ROOT_INPUT" = /* ]]; then
      MEDIA_ROOT_PATH="$MEDIA_ROOT_INPUT"
    else
      MEDIA_ROOT_PATH="$API_ENV_DIR/$MEDIA_ROOT_INPUT"
    fi

    mkdir -p "$MEDIA_ROOT_PATH"
    echo "Restoring media from $MEDIA_BACKUP_FILE to $MEDIA_ROOT_PATH"
    tar -xzf "$MEDIA_BACKUP_FILE" -C "$MEDIA_ROOT_PATH"
    echo "Media restore complete."
  else
    echo "No media backup found; skipping media restore."
  fi
fi

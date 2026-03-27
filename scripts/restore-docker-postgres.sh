#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${API_ENV_FILE:-$ROOT_DIR/apps/api/.env}"

LOCAL_CONTAINER="${LOCAL_CONTAINER:-nheenga-postgres}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-nheenga_dev}"
LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD:-}"

DUMP_FILE="${DUMP_FILE:-}"
DEFAULT_PROD_BACKUP_DIR="$ROOT_DIR/backups/prod-postgres"
DEFAULT_LOCAL_BACKUP_DIR="$ROOT_DIR/backups/postgres"
DEFAULT_PROD_MEDIA_DIR="$ROOT_DIR/backups/prod-media"
DEFAULT_LOCAL_MEDIA_DIR="$ROOT_DIR/backups/media"
BACKUP_DIR="${BACKUP_DIR:-}"
BACKUP_FILE_BASENAME="${BACKUP_FILE_BASENAME:-nheenga}"
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-}"
MEDIA_BACKUP_FILE="${MEDIA_BACKUP_FILE:-}"
MEDIA_BACKUP_FILE_BASENAME="${MEDIA_BACKUP_FILE_BASENAME:-nheenga_media}"
RESET_DB="${RESET_DB:-1}"
RESTORE_MEDIA="${RESTORE_MEDIA:-1}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found"
  exit 1
fi

if [[ -z "$DUMP_FILE" ]]; then
  if [[ -z "$BACKUP_DIR" ]]; then
    if ls -t "$DEFAULT_PROD_BACKUP_DIR"/"${BACKUP_FILE_BASENAME}"_*.sql* >/dev/null 2>&1; then
      BACKUP_DIR="$DEFAULT_PROD_BACKUP_DIR"
    else
      BACKUP_DIR="$DEFAULT_LOCAL_BACKUP_DIR"
    fi
  fi
  DUMP_FILE="$(ls -t "$BACKUP_DIR"/"${BACKUP_FILE_BASENAME}"_*.sql* 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$DUMP_FILE" ]]; then
  echo "Usage: DUMP_FILE=/path/to/dump.sql.gz make db-restore-docker"
  echo "Or place a backup in $DEFAULT_PROD_BACKUP_DIR or $DEFAULT_LOCAL_BACKUP_DIR to auto-select the latest."
  exit 1
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

docker_exec=(docker exec -i)
if [[ -n "$LOCAL_DB_PASSWORD" ]]; then
  docker_exec+=(-e "PGPASSWORD=$LOCAL_DB_PASSWORD")
fi
docker_exec+=("$LOCAL_CONTAINER")

psql_cmd=(psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -v ON_ERROR_STOP=1)

echo "Restoring $DUMP_FILE into container '$LOCAL_CONTAINER' database '$LOCAL_DB_NAME'"
if [[ "$RESET_DB" == "1" ]]; then
  echo "Resetting schema before restore (RESET_DB=1)"
  "${docker_exec[@]}" "${psql_cmd[@]}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
fi

if [[ "$DUMP_FILE" == *.gz ]]; then
  gunzip -c "$DUMP_FILE" | "${docker_exec[@]}" "${psql_cmd[@]}"
else
  "${docker_exec[@]}" "${psql_cmd[@]}" < "$DUMP_FILE"
fi

echo "Restore complete."

if [[ "$RESTORE_MEDIA" == "1" ]]; then
  if [[ -z "$MEDIA_BACKUP_FILE" ]]; then
    if [[ -z "$MEDIA_BACKUP_DIR" ]]; then
      if ls -t "$DEFAULT_PROD_MEDIA_DIR"/"${MEDIA_BACKUP_FILE_BASENAME}"_*.tar.gz >/dev/null 2>&1; then
        MEDIA_BACKUP_DIR="$DEFAULT_PROD_MEDIA_DIR"
      else
        MEDIA_BACKUP_DIR="$DEFAULT_LOCAL_MEDIA_DIR"
      fi
    fi
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

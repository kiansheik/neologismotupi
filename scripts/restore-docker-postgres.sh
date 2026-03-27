#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LOCAL_CONTAINER="${LOCAL_CONTAINER:-nheenga-postgres}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-nheenga_dev}"
LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD:-}"

DUMP_FILE="${DUMP_FILE:-}"
DEFAULT_PROD_BACKUP_DIR="$ROOT_DIR/backups/prod-postgres"
DEFAULT_LOCAL_BACKUP_DIR="$ROOT_DIR/backups/postgres"
BACKUP_DIR="${BACKUP_DIR:-}"
BACKUP_FILE_BASENAME="${BACKUP_FILE_BASENAME:-nheenga}"
RESET_DB="${RESET_DB:-1}"

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

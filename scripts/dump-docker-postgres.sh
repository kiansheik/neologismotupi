#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-nheenga-postgres}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-nheenga_dev}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/docker-postgres}"
BACKUP_FILE_BASENAME="${BACKUP_FILE_BASENAME:-nheenga_docker}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUTPUT_FILE="$BACKUP_DIR/${BACKUP_FILE_BASENAME}_${TIMESTAMP}.sql.gz"

echo "Dumping container '$LOCAL_CONTAINER' db '$LOCAL_DB_NAME' to $OUTPUT_FILE"
docker exec -i "$LOCAL_CONTAINER" pg_dump -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" --no-owner --no-privileges \
  | gzip > "$OUTPUT_FILE"

echo "Dump complete: $OUTPUT_FILE"

#!/usr/bin/env bash
set -euo pipefail

LOCAL_CONTAINER="${LOCAL_CONTAINER:-nheenga-postgres}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-nheenga_dev}"
LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found"
  exit 1
fi

docker_exec=(docker exec -it)
if [[ -n "$LOCAL_DB_PASSWORD" ]]; then
  docker_exec+=(-e "PGPASSWORD=$LOCAL_DB_PASSWORD")
fi
docker_exec+=("$LOCAL_CONTAINER")

exec "${docker_exec[@]}" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME"

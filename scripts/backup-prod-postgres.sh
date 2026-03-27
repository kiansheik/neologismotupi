#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-${1:-}}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/nheenga-neologismos}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/neologismotupi_ed25519}"

REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-$DEPLOY_PATH/backups/postgres}"
REMOTE_MEDIA_BACKUP_DIR="${REMOTE_MEDIA_BACKUP_DIR:-$DEPLOY_PATH/backups/media}"
REMOTE_BACKUP_SCRIPT="${REMOTE_BACKUP_SCRIPT:-$DEPLOY_PATH/scripts/backup-postgres.sh}"
REMOTE_API_ENV_FILE="${REMOTE_API_ENV_FILE:-$DEPLOY_PATH/apps/api/.env.production}"
REMOTE_COMPOSE_FILE="${REMOTE_COMPOSE_FILE:-$DEPLOY_PATH/deploy/docker-compose.remote.yml}"
REMOTE_STACK_ENV="${REMOTE_STACK_ENV:-$DEPLOY_PATH/deploy/env/stack.env}"
REMOTE_BACKUP_MODE="${REMOTE_BACKUP_MODE:-auto}" # auto | docker | host
BACKUP_FILE_BASENAME="${BACKUP_FILE_BASENAME:-nheenga}"
MEDIA_BACKUP_FILE_BASENAME="${MEDIA_BACKUP_FILE_BASENAME:-nheenga_media}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-$ROOT_DIR/backups/prod-postgres}"
LOCAL_MEDIA_BACKUP_DIR="${LOCAL_MEDIA_BACKUP_DIR:-$ROOT_DIR/backups/prod-media}"
SKIP_REMOTE_BACKUP="${SKIP_REMOTE_BACKUP:-0}"

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "Missing DEPLOY_HOST."
  echo "Usage: DEPLOY_HOST=<host> make db-backup-prod"
  exit 1
fi

if [[ -n "$SSH_IDENTITY" && ! -f "$SSH_IDENTITY" ]]; then
  echo "SSH identity not found: $SSH_IDENTITY"
  exit 1
fi

SSH_OPTS=(-p "$SSH_PORT")
SCP_OPTS=(-P "$SSH_PORT")
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
  SCP_OPTS+=(-i "$SSH_IDENTITY")
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

run_remote_backup() {
  local mode="$1"
  if [[ "$mode" == "docker" ]]; then
    echo "Triggering Docker-based backup on $REMOTE..."
    ssh "${SSH_OPTS[@]}" "$REMOTE" "bash -lc '
      set -euo pipefail
      cd \"$DEPLOY_PATH\"
      mkdir -p \"$REMOTE_BACKUP_DIR\"
      mkdir -p \"$REMOTE_MEDIA_BACKUP_DIR\"
      ts=\$(date -u +\"%Y%m%dT%H%M%SZ\")
      out=\"$REMOTE_BACKUP_DIR/${BACKUP_FILE_BASENAME}_\${ts}.sql.gz\"
      docker compose -f \"$REMOTE_COMPOSE_FILE\" --env-file \"$REMOTE_STACK_ENV\" exec -T postgres \
        bash -lc \"PGPASSWORD=\\\"\\\${POSTGRES_PASSWORD:-}\\\" pg_dump -U \\\"\\\${POSTGRES_USER}\\\" -d \\\"\\\${POSTGRES_DB}\\\" --no-owner --no-privileges\" \
        | gzip > \"\$out\"
      docker compose -f \"$REMOTE_COMPOSE_FILE\" --env-file \"$REMOTE_STACK_ENV\" exec -T api \
        sh -lc \"mkdir -p /app/media && tar -C /app -czf - media\" \
        > \"$REMOTE_MEDIA_BACKUP_DIR/${MEDIA_BACKUP_FILE_BASENAME}_\${ts}.tar.gz\"
      echo \"\$out\"
    '"
    return $?
  fi

  echo "Triggering host-based backup on $REMOTE..."
  ssh "${SSH_OPTS[@]}" "$REMOTE" "API_ENV_FILE='$REMOTE_API_ENV_FILE' bash -lc '$REMOTE_BACKUP_SCRIPT'"
}

if [[ "$SKIP_REMOTE_BACKUP" != "1" ]]; then
  case "$REMOTE_BACKUP_MODE" in
    docker)
      run_remote_backup "docker" || exit $?
      ;;
    host)
      run_remote_backup "host" || exit $?
      ;;
    auto)
      if ssh "${SSH_OPTS[@]}" "$REMOTE" "test -f '$REMOTE_COMPOSE_FILE' && command -v docker >/dev/null 2>&1"; then
        run_remote_backup "docker" || run_remote_backup "host"
      else
        run_remote_backup "host"
      fi
      ;;
    *)
      echo "REMOTE_BACKUP_MODE must be auto, docker, or host (got: $REMOTE_BACKUP_MODE)"
      exit 1
      ;;
  esac
fi

echo "Finding latest backup on $REMOTE..."
latest_remote="$(ssh "${SSH_OPTS[@]}" "$REMOTE" "ls -t '$REMOTE_BACKUP_DIR/${BACKUP_FILE_BASENAME}_'*.sql.gz 2>/dev/null | head -n 1")"
if [[ -z "$latest_remote" ]]; then
  echo "No backup files found in $REMOTE_BACKUP_DIR."
  exit 1
fi

mkdir -p "$LOCAL_BACKUP_DIR"
echo "Downloading $latest_remote to $LOCAL_BACKUP_DIR"
scp "${SCP_OPTS[@]}" "$REMOTE:$latest_remote" "$LOCAL_BACKUP_DIR/"

echo "Backup downloaded: $LOCAL_BACKUP_DIR/$(basename "$latest_remote")"

echo "Finding latest media backup on $REMOTE..."
latest_media_remote="$(ssh "${SSH_OPTS[@]}" "$REMOTE" "ls -t '$REMOTE_MEDIA_BACKUP_DIR/${MEDIA_BACKUP_FILE_BASENAME}_'*.tar.gz 2>/dev/null | head -n 1")"
if [[ -n "$latest_media_remote" ]]; then
  mkdir -p "$LOCAL_MEDIA_BACKUP_DIR"
  echo "Downloading $latest_media_remote to $LOCAL_MEDIA_BACKUP_DIR"
  scp "${SCP_OPTS[@]}" "$REMOTE:$latest_media_remote" "$LOCAL_MEDIA_BACKUP_DIR/"
  echo "Media backup downloaded: $LOCAL_MEDIA_BACKUP_DIR/$(basename "$latest_media_remote")"
else
  echo "No media backup files found in $REMOTE_MEDIA_BACKUP_DIR."
fi

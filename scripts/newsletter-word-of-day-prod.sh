#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-${1:-}}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/nheenga-neologismos}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/neologismotupi_ed25519}"

REMOTE_API_ENV_FILE="${REMOTE_API_ENV_FILE:-$DEPLOY_PATH/apps/api/.env.production}"
REMOTE_COMPOSE_FILE="${REMOTE_COMPOSE_FILE:-$DEPLOY_PATH/deploy/docker-compose.remote.yml}"
REMOTE_STACK_ENV="${REMOTE_STACK_ENV:-$DEPLOY_PATH/deploy/env/stack.env}"
REMOTE_RUN_MODE="${REMOTE_RUN_MODE:-auto}" # auto | docker | host

TO_EMAIL="${TO:-}"
ISSUE_DATE="${DATE:-}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "Missing DEPLOY_HOST."
  echo "Usage: DEPLOY_HOST=<host> make newsletter-word-of-day-prod TO=<email>"
  exit 1
fi

if [[ -n "$SSH_IDENTITY" && ! -f "$SSH_IDENTITY" ]]; then
  echo "SSH identity not found: $SSH_IDENTITY"
  exit 1
fi

SSH_OPTS=(-p "$SSH_PORT")
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

REMOTE_ARGS=()
if [[ -n "$TO_EMAIL" ]]; then
  REMOTE_ARGS+=(--to "$TO_EMAIL")
fi
if [[ -n "$ISSUE_DATE" ]]; then
  REMOTE_ARGS+=(--date "$ISSUE_DATE")
fi
if [[ "$DRY_RUN" == "1" ]]; then
  REMOTE_ARGS+=(--dry-run)
fi

REMOTE_ARGS_Q="$(printf '%q ' "${REMOTE_ARGS[@]}")"

run_remote_docker() {
  echo "Running Palavra do Dia on $REMOTE (docker)..."
  ssh "${SSH_OPTS[@]}" "$REMOTE" "bash -lc 'set -euo pipefail
    cd \"$DEPLOY_PATH\"
    docker compose -f \"$REMOTE_COMPOSE_FILE\" --env-file \"$REMOTE_STACK_ENV\" exec -T api \
      uv run python -m app.core.send_word_of_day ${REMOTE_ARGS_Q}
  '"
}

run_remote_host() {
  echo "Running Palavra do Dia on $REMOTE (host)..."
  ssh "${SSH_OPTS[@]}" "$REMOTE" "bash -lc 'set -euo pipefail
    cd \"$DEPLOY_PATH\"
    set -a; [ -f \"$REMOTE_API_ENV_FILE\" ] && . \"$REMOTE_API_ENV_FILE\"; set +a
    uv run python -m app.core.send_word_of_day ${REMOTE_ARGS_Q}
  '"
}

case "$REMOTE_RUN_MODE" in
  docker)
    run_remote_docker
    ;;
  host)
    run_remote_host
    ;;
  auto)
    if ssh "${SSH_OPTS[@]}" "$REMOTE" "test -f '$REMOTE_COMPOSE_FILE' && command -v docker >/dev/null 2>&1"; then
      run_remote_docker || run_remote_host
    else
      run_remote_host
    fi
    ;;
  *)
    echo "REMOTE_RUN_MODE must be auto, docker, or host (got: $REMOTE_RUN_MODE)"
    exit 1
    ;;
esac

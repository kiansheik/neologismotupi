#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

API_ENV_FILE="${API_ENV_FILE:-$ROOT_DIR/apps/api/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/docker-compose.remote.yml}"
STACK_ENV_FILE="${STACK_ENV_FILE:-$ROOT_DIR/deploy/env/stack.env}"
RUN_MODE="${RUN_MODE:-auto}" # auto | docker | host

TO_EMAIL="${TO:-}"
ISSUE_DATE="${DATE:-}"
DRY_RUN="${DRY_RUN:-0}"

ARGS=()
if [[ -n "$TO_EMAIL" ]]; then
  ARGS+=(--to "$TO_EMAIL")
fi
if [[ -n "$ISSUE_DATE" ]]; then
  ARGS+=(--date "$ISSUE_DATE")
fi
if [[ "$DRY_RUN" == "1" ]]; then
  ARGS+=(--dry-run)
fi

ARGS_Q="$(printf '%q ' "${ARGS[@]}")"

run_docker() {
  echo "Running Palavra do Dia (docker)..."
  cd "$ROOT_DIR"
  docker compose -f "$COMPOSE_FILE" --env-file "$STACK_ENV_FILE" exec -T api \
    uv run python -m app.core.send_word_of_day ${ARGS_Q}
}

run_host() {
  echo "Running Palavra do Dia (host)..."
  cd "$ROOT_DIR/apps/api"
  if [[ -f "$API_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$API_ENV_FILE"
    set +a
  fi
  uv run python -m app.core.send_word_of_day ${ARGS_Q}
}

case "$RUN_MODE" in
  docker)
    run_docker
    ;;
  host)
    run_host
    ;;
  auto)
    if [[ -f "$COMPOSE_FILE" ]] && command -v docker >/dev/null 2>&1; then
      run_docker || run_host
    else
      run_host
    fi
    ;;
  *)
    echo "RUN_MODE must be auto, docker, or host (got: $RUN_MODE)"
    exit 1
    ;;
esac

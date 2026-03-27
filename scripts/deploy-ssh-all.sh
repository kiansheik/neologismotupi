#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-${1:-}}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/nheenga-neologismos}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/neologismotupi_ed25519}"
DEPLOY_DB_DUMP="${DEPLOY_DB_DUMP:-}"
DEPLOY_SEED_CSV="${DEPLOY_SEED_CSV:-}"
DEPLOY_RESET_STACK="${DEPLOY_RESET_STACK:-0}"
DEPLOY_RESET_VOLUMES="${DEPLOY_RESET_VOLUMES:-0}"
DEPLOY_MODE="${DEPLOY_MODE:-full}"
DEPLOY_ID="${DEPLOY_ID:-}"
DEPLOY_API_URL="${DEPLOY_API_URL:-https://api.academiatupi.com}"
DEPLOY_SMOKE_RETRIES="${DEPLOY_SMOKE_RETRIES:-60}"
DEPLOY_SMOKE_SLEEP_SECONDS="${DEPLOY_SMOKE_SLEEP_SECONDS:-2}"
DEPLOY_SMOKE_ORIGIN="${DEPLOY_SMOKE_ORIGIN:-}"

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "Missing DEPLOY_HOST."
  echo "Usage: make deploy-ssh-all DEPLOY_HOST=<host-or-ip> [DEPLOY_USER=deploy] [DEPLOY_PATH=/srv/nheenga-neologismos]"
  exit 1
fi

if [[ -n "$DEPLOY_DB_DUMP" && ! -f "$DEPLOY_DB_DUMP" ]]; then
  echo "DEPLOY_DB_DUMP file not found: $DEPLOY_DB_DUMP"
  exit 1
fi

if [[ -n "$DEPLOY_SEED_CSV" && ! -f "$DEPLOY_SEED_CSV" ]]; then
  echo "DEPLOY_SEED_CSV file not found: $DEPLOY_SEED_CSV"
  exit 1
fi

if [[ "$DEPLOY_RESET_STACK" != "0" && "$DEPLOY_RESET_STACK" != "1" ]]; then
  echo "DEPLOY_RESET_STACK must be 0 or 1"
  exit 1
fi

if [[ "$DEPLOY_RESET_VOLUMES" != "0" && "$DEPLOY_RESET_VOLUMES" != "1" ]]; then
  echo "DEPLOY_RESET_VOLUMES must be 0 or 1"
  exit 1
fi

if [[ "$DEPLOY_RESET_VOLUMES" == "1" && "$DEPLOY_RESET_STACK" != "1" ]]; then
  echo "DEPLOY_RESET_VOLUMES=1 requires DEPLOY_RESET_STACK=1"
  exit 1
fi

if [[ "$DEPLOY_MODE" != "full" && "$DEPLOY_MODE" != "daily" ]]; then
  echo "DEPLOY_MODE must be either 'full' or 'daily' (got: $DEPLOY_MODE)"
  exit 1
fi

required_files=(
  "$ROOT_DIR/deploy/env/api.env"
  "$ROOT_DIR/deploy/env/postgres.env"
  "$ROOT_DIR/deploy/env/stack.env"
)

missing=0
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing required file: $f"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "Create deploy env files first:"
  echo "  cp deploy/env/api.env.example deploy/env/api.env"
  echo "  cp deploy/env/postgres.env.example deploy/env/postgres.env"
  echo "  cp deploy/env/stack.env.example deploy/env/stack.env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT_DIR/deploy/env/api.env"
# shellcheck disable=SC1091
source "$ROOT_DIR/deploy/env/postgres.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "deploy/env/api.env is missing DATABASE_URL"
  exit 1
fi

parsed_values="$(python3 - "$DATABASE_URL" <<'PY'
import sys
from urllib.parse import urlparse

url = sys.argv[1]
parsed = urlparse(url)
db_name = parsed.path.lstrip("/")
print(parsed.hostname or "")
print(parsed.username or "")
print(parsed.password or "")
print(db_name or "")
PY
)"
db_host="$(echo "$parsed_values" | sed -n '1p')"
db_user="$(echo "$parsed_values" | sed -n '2p')"
db_password="$(echo "$parsed_values" | sed -n '3p')"
db_name="$(echo "$parsed_values" | sed -n '4p')"

if [[ "$db_host" != "postgres" ]]; then
  echo "DATABASE_URL host must be 'postgres' for deploy-ssh-all (found: '$db_host')."
  echo "If your DB password contains special characters like '@' or '!', URL-encode it in DATABASE_URL."
  echo "Example password encoding:"
  echo "  python3 - <<'PY'"
  echo "from urllib.parse import quote"
  echo "print(quote('myP@ss!word', safe=''))"
  echo "PY"
  exit 1
fi

if [[ "${POSTGRES_USER:-}" != "$db_user" ]]; then
  echo "Mismatch: POSTGRES_USER ('$POSTGRES_USER') != DATABASE_URL user ('$db_user')."
  exit 1
fi

if [[ "${POSTGRES_PASSWORD:-}" != "$db_password" ]]; then
  echo "Mismatch: POSTGRES_PASSWORD does not match DATABASE_URL password."
  echo "If password has special characters, keep raw value in postgres.env and URL-encoded value in api.env."
  exit 1
fi

if [[ "${POSTGRES_DB:-}" != "$db_name" ]]; then
  echo "Mismatch: POSTGRES_DB ('$POSTGRES_DB') != DATABASE_URL db ('$db_name')."
  exit 1
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH_CMD=(ssh -i "$SSH_IDENTITY" -p "$SSH_PORT" "$REMOTE")

if [[ -z "$DEPLOY_ID" ]]; then
  git_sha="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo "no-git")"
  DEPLOY_ID="$(date -u +%Y%m%d%H%M%S)-${git_sha}"
fi

echo "Deploy mode: $DEPLOY_MODE"
echo "Deploy id: $DEPLOY_ID"

echo "Ensuring remote path exists: $DEPLOY_PATH"
"${SSH_CMD[@]}" "mkdir -p '$DEPLOY_PATH'"

if command -v rsync >/dev/null 2>&1; then
  echo "Syncing repository with rsync..."
  rsync -az --delete \
    -e "ssh -i $SSH_IDENTITY -p $SSH_PORT" \
    --exclude ".git/" \
    --exclude ".venv/" \
    --exclude "node_modules/" \
    --exclude "apps/web/node_modules/" \
    --exclude "apps/api/.venv/" \
    --exclude "apps/web/dist/" \
    --exclude "__pycache__/" \
    --exclude ".pytest_cache/" \
    --exclude ".mypy_cache/" \
    --exclude ".ruff_cache/" \
    --exclude "backups/" \
    "$ROOT_DIR/" "$REMOTE:$DEPLOY_PATH/"
else
  echo "rsync not found, falling back to tar over ssh..."
  tar -C "$ROOT_DIR" \
    --exclude ".git" \
    --exclude ".venv" \
    --exclude "node_modules" \
    --exclude "apps/web/node_modules" \
    --exclude "apps/api/.venv" \
    --exclude "apps/web/dist" \
    --exclude "__pycache__" \
    --exclude ".pytest_cache" \
    --exclude ".mypy_cache" \
    --exclude ".ruff_cache" \
    --exclude "backups" \
    -czf - . | "${SSH_CMD[@]}" "tar -C '$DEPLOY_PATH' -xzf -"
fi

echo "Running remote docker compose deployment..."
DB_DUMP_REMOTE_PATH=""
if [[ -n "$DEPLOY_DB_DUMP" ]]; then
  DB_DUMP_REMOTE_PATH="$DEPLOY_PATH/deploy/import.sql.gz"
  echo "Uploading DB dump to remote: $DB_DUMP_REMOTE_PATH"
  scp -i "$SSH_IDENTITY" -P "$SSH_PORT" "$DEPLOY_DB_DUMP" "$REMOTE:$DB_DUMP_REMOTE_PATH"
fi

SEED_CSV_REMOTE_PATH=""
if [[ -n "$DEPLOY_SEED_CSV" ]]; then
  SEED_CSV_REMOTE_PATH="$DEPLOY_PATH/deploy/seed.csv"
  echo "Uploading seed CSV to remote: $SEED_CSV_REMOTE_PATH"
  scp -i "$SSH_IDENTITY" -P "$SSH_PORT" "$DEPLOY_SEED_CSV" "$REMOTE:$SEED_CSV_REMOTE_PATH"
fi

"${SSH_CMD[@]}" "DEPLOY_PATH='$DEPLOY_PATH' DEPLOY_DB_DUMP_REMOTE='$DB_DUMP_REMOTE_PATH' DEPLOY_SEED_CSV_REMOTE='$SEED_CSV_REMOTE_PATH' DEPLOY_RESET_STACK='$DEPLOY_RESET_STACK' DEPLOY_RESET_VOLUMES='$DEPLOY_RESET_VOLUMES' DEPLOY_MODE='$DEPLOY_MODE' DEPLOY_ID='$DEPLOY_ID' bash -s" <<'EOF'
set -euo pipefail

cd "$DEPLOY_PATH"

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available on remote."
  exit 1
fi

COMPOSE_FILE="deploy/docker-compose.remote.yml"
ENV_FILE="deploy/env/stack.env"
ADMIN_DB="template1"

set -a
# shellcheck disable=SC1091
source deploy/env/postgres.env
set +a
export APP_RELEASE="${DEPLOY_ID:-unknown}"

if [[ "${DEPLOY_RESET_STACK:-0}" == "1" ]]; then
  echo "Reset flag enabled: removing previous containers and local images."
  DOWN_ARGS=(down --remove-orphans --rmi local)
  if [[ "${DEPLOY_RESET_VOLUMES:-0}" == "1" ]]; then
    echo "Volume reset enabled: removing volumes too."
    DOWN_ARGS+=(-v)
  fi
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "${DOWN_ARGS[@]}" || true
fi

if [[ "${DEPLOY_MODE:-full}" == "daily" ]]; then
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --pull api
else
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --pull
fi
"${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres

echo "Waiting for postgres to become ready..."
pg_ready=0
for _ in $(seq 1 60); do
  if "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$ADMIN_DB" </dev/null >/dev/null 2>&1; then
    pg_ready=1
    break
  fi
  sleep 2
done

if [[ "$pg_ready" -ne 1 ]]; then
  echo "Postgres did not become ready in time."
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=120 postgres || true
  exit 1
fi

DB_EXISTS="$("${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$ADMIN_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" </dev/null | tr -d '[:space:]')"
if [[ "$DB_EXISTS" != "1" ]]; then
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB" </dev/null
fi

if [[ -n "${DEPLOY_DB_DUMP_REMOTE:-}" && -f "${DEPLOY_DB_DUMP_REMOTE}" ]]; then
  echo "Restoring DB dump: ${DEPLOY_DB_DUMP_REMOTE}"
  if [[ "${DEPLOY_DB_DUMP_REMOTE}" == *.gz ]]; then
    gunzip -c "${DEPLOY_DB_DUMP_REMOTE}" | "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  else
    "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "${DEPLOY_DB_DUMP_REMOTE}"
  fi
fi

"${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm api uv run alembic upgrade head </dev/null
if [[ "${DEPLOY_MODE:-full}" == "daily" ]]; then
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d caddy
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps api
else
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d api caddy
fi
"${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d newsletter-scheduler

if [[ -n "${DEPLOY_SEED_CSV_REMOTE:-}" && -f "${DEPLOY_SEED_CSV_REMOTE}" ]]; then
  echo "Seeding database from CSV: ${DEPLOY_SEED_CSV_REMOTE}"
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api sh -lc "cat > /tmp/seed.csv" < "${DEPLOY_SEED_CSV_REMOTE}"
  "${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api sh -lc "SEED_CSV_PATH=/tmp/seed.csv uv run python -m app.core.seed" </dev/null
fi

"${DC[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
EOF

if [[ -n "$DEPLOY_API_URL" ]]; then
  API_BASE_URL="$DEPLOY_API_URL" \
  EXPECTED_RELEASE="$DEPLOY_ID" \
  RETRIES="$DEPLOY_SMOKE_RETRIES" \
  SLEEP_SECONDS="$DEPLOY_SMOKE_SLEEP_SECONDS" \
  SMOKE_ORIGIN="$DEPLOY_SMOKE_ORIGIN" \
    "$ROOT_DIR/scripts/smoke-api.sh"
fi

echo "Deploy complete."

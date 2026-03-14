#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
ENV_FILE="${API_ENV_FILE:-$API_DIR/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production env file: $ENV_FILE"
  echo "Create it from apps/api/.env.production.example first."
  exit 1
fi

cd "$API_DIR"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

uv run python - <<'PY'
from app.config import get_settings

get_settings.cache_clear()
settings = get_settings()

print("Production config validation passed.")
print(f"APP_ENV={settings.app_env}")
print(f"CORS_ORIGINS={','.join(settings.cors_origins)}")
print(f"SESSION_COOKIE_SECURE={settings.session_cookie_secure}")
print(f"SESSION_COOKIE_DOMAIN={settings.session_cookie_domain or '<host-only>'}")
PY

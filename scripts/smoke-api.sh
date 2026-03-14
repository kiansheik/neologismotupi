#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-${1:-}}"
EXPECTED_RELEASE="${EXPECTED_RELEASE:-}"
RETRIES="${RETRIES:-60}"
SLEEP_SECONDS="${SLEEP_SECONDS:-2}"

if [[ -z "$API_BASE_URL" ]]; then
  echo "Missing API_BASE_URL."
  echo "Usage: API_BASE_URL=https://api.example.com scripts/smoke-api.sh [https://api.example.com]"
  exit 1
fi

if ! [[ "$RETRIES" =~ ^[0-9]+$ ]] || [[ "$RETRIES" -lt 1 ]]; then
  echo "RETRIES must be a positive integer."
  exit 1
fi

if ! [[ "$SLEEP_SECONDS" =~ ^[0-9]+$ ]] || [[ "$SLEEP_SECONDS" -lt 1 ]]; then
  echo "SLEEP_SECONDS must be a positive integer."
  exit 1
fi

API_BASE_URL="${API_BASE_URL%/}"
HEALTH_URL="${API_BASE_URL}/healthz"
META_URL="${API_BASE_URL}/api/meta/statuses"
ENTRIES_URL="${API_BASE_URL}/api/entries?page=1&page_size=1"
TAGS_URL="${API_BASE_URL}/api/tags"

echo "Smoke check: ${HEALTH_URL}"
if [[ -n "$EXPECTED_RELEASE" ]]; then
  echo "Waiting for release: ${EXPECTED_RELEASE}"
fi

healthy=0
observed_release=""

for attempt in $(seq 1 "$RETRIES"); do
  payload="$(curl -sS --max-time 10 "$HEALTH_URL" || true)"

  parsed="$(python3 - "$payload" <<'PY'
import json
import sys

raw = sys.argv[1]
if not raw:
    print("0||")
    raise SystemExit(0)

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    print("0||")
    raise SystemExit(0)

ok = "1" if data.get("ok") is True else "0"
database = str(data.get("database", ""))
release = str(data.get("release", ""))
print(f"{ok}|{database}|{release}")
PY
)"

  IFS="|" read -r ok_flag db_state release_value <<<"$parsed"
  observed_release="$release_value"

  if [[ "$ok_flag" == "1" && "$db_state" == "ok" ]]; then
    if [[ -z "$EXPECTED_RELEASE" || "$release_value" == "$EXPECTED_RELEASE" ]]; then
      healthy=1
      break
    fi
  fi

  sleep "$SLEEP_SECONDS"
done

if [[ "$healthy" -ne 1 ]]; then
  echo "Health check failed."
  if [[ -n "$EXPECTED_RELEASE" ]]; then
    echo "Expected release: $EXPECTED_RELEASE"
    echo "Observed release: $observed_release"
  fi
  exit 1
fi

curl -fsS --max-time 10 "$META_URL" >/dev/null
curl -fsS --max-time 10 "$ENTRIES_URL" >/dev/null
curl -fsS --max-time 10 "$TAGS_URL" >/dev/null

echo "Smoke checks passed."

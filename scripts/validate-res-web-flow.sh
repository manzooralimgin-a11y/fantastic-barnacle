#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.dev/logs"
RUNTIME_FILE="$ROOT_DIR/.dev/runtime.json"
LOCAL_DEV_ADMIN_EMAIL="${LOCAL_DEV_ADMIN_EMAIL:-local-admin@gestronomy.app}"
LOCAL_DEV_ADMIN_PASSWORD="${LOCAL_DEV_ADMIN_PASSWORD:-LocalAdmin1234!}"

mkdir -p "$LOG_DIR"

wait_for_url() {
  local url="$1"
  local tries="${2:-120}"
  for ((i=0; i<tries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

stop_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$pid" >/dev/null 2>&1 || true
  done <<<"$pids"
}

cleanup() {
  for pid_var in REST_PID RESTAURANT_PID BACKEND_PID REDIS_PID; do
    local pid="${!pid_var:-}"
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup EXIT INT TERM

stop_port 6379
stop_port 8000
stop_port 3002

nohup redis-server --bind 0.0.0.0 --port 6379 >"$LOG_DIR/res-web-redis.log" 2>&1 &
REDIS_PID=$!
sleep 1

nohup /bin/zsh -lc "cd '$ROOT_DIR/backend' && exec env APP_ENV=development SECRET_KEY=phase12-local-secret BACKEND_URL=http://localhost:8000 FRONTEND_URL=http://localhost:3000 CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002 REDIS_URL=redis://127.0.0.1:6379/0 CELERY_BROKER_URL=redis://127.0.0.1:6379/1 CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/2 STARTUP_VALIDATION_ENFORCED=true STARTUP_VALIDATION_REQUIRE_REDIS=true STARTUP_VALIDATION_REQUIRE_MIGRATIONS=true ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000" >"$LOG_DIR/res-web-backend.log" 2>&1 &
BACKEND_PID=$!
wait_for_url "http://127.0.0.1:8000/health"

(
  cd "$ROOT_DIR/backend"
  LOCAL_ADMIN_EMAIL="$LOCAL_DEV_ADMIN_EMAIL" \
  LOCAL_ADMIN_PASSWORD="$LOCAL_DEV_ADMIN_PASSWORD" \
  LOCAL_ADMIN_FORCE_PASSWORD_RESET="false" \
  PYTHONPATH="$ROOT_DIR/backend" \
  ./.venv/bin/python scripts/seed.py >"$LOG_DIR/res-web-seed.log" 2>&1
)

(
  cd "$ROOT_DIR"
  LOCAL_ADMIN_EMAIL="$LOCAL_DEV_ADMIN_EMAIL" \
  LOCAL_ADMIN_PASSWORD="$LOCAL_DEV_ADMIN_PASSWORD" \
  PYTHONPATH="$ROOT_DIR/backend" \
  "$ROOT_DIR/backend/.venv/bin/python" scripts/dev-resolve-ids.py >"$RUNTIME_FILE"
)

RESTAURANT_ID="$("$ROOT_DIR/backend/.venv/bin/python" - "$RUNTIME_FILE" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], 'r', encoding='utf-8'))['restaurant_id'])
PY
)"

nohup /bin/zsh -lc "cd '$ROOT_DIR/res-web' && exec env VITE_PUBLIC_API_BASE_URL=http://localhost:8000/api VITE_RESTAURANT_ID=$RESTAURANT_ID npm run dev -- --host 127.0.0.1 --port 3002" >"$LOG_DIR/res-web-frontend.log" 2>&1 &
RESTAURANT_PID=$!
wait_for_url "http://127.0.0.1:3002/"

node "$ROOT_DIR/scripts/restaurant_e2e.mjs"

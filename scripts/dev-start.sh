#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT_DIR/.dev"
PID_DIR="$DEV_DIR/pids"
LOG_DIR="$DEV_DIR/logs"
RUNTIME_FILE="$DEV_DIR/runtime.json"
VALIDATE=0
KEEP_ALIVE=1
LOCAL_DEV_ADMIN_EMAIL="${LOCAL_DEV_ADMIN_EMAIL:-local-admin@gestronomy.app}"
LOCAL_DEV_ADMIN_PASSWORD="${LOCAL_DEV_ADMIN_PASSWORD:-LocalAdmin1234!}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --validate)
      VALIDATE=1
      shift
      ;;
    --once)
      KEEP_ALIVE=0
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$PID_DIR" "$LOG_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd lsof
require_cmd redis-server
require_cmd npm

wait_for_url() {
  local url="$1"
  local tries="${2:-120}"
  local delay="${3:-1}"
  for ((i=0; i<tries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

start_detached() {
  local name="$1"
  local logfile="$2"
  shift 2
  nohup /bin/zsh -lc "$*" </dev/null >"$logfile" 2>&1 &
  echo $! >"$PID_DIR/$name.pid"
}

stop_known_listener() {
  local port="$1"
  shift
  local patterns=("$@")
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    local command
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    local matched=0
    for pattern in "${patterns[@]}"; do
      if [[ "$command" == *"$pattern"* ]]; then
        matched=1
        break
      fi
    done
    if [[ "$matched" -eq 0 ]]; then
      echo "Port $port is in use by an unknown process: $command" >&2
      exit 1
    fi
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$pid" >/dev/null 2>&1 || true
  done <<<"$pids"
}

pid_is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

managed_service_running() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && pid_is_running "$pid"; then
      return 0
    fi
    rm -f "$pid_file"
  fi
  return 1
}

ensure_port_available() {
  local port="$1"
  if lsof -ti tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use by another process." >&2
    exit 1
  fi
}

start_redis() {
  if command -v redis-cli >/dev/null 2>&1 && redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    echo "Redis already running on 6379"
    return
  fi
  ensure_port_available 6379 redis
  nohup redis-server --bind 0.0.0.0 --port 6379 >"$LOG_DIR/redis.log" 2>&1 &
  echo $! >"$PID_DIR/redis.pid"
  if command -v redis-cli >/dev/null 2>&1; then
    for _ in {1..60}; do
      if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
        echo "Redis started on 6379"
        return
      fi
      sleep 1
    done
  fi
  echo "Redis failed to start" >&2
  exit 1
}

ensure_frontend_dependencies() {
  if [[ ! -x "$ROOT_DIR/frontend/node_modules/.bin/next" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$ROOT_DIR/frontend" && npm install)
  fi
}

start_backend() {
  stop_known_listener 8000 "uvicorn app.main:app"
  ensure_port_available 8000
  start_detached \
    backend \
    "$LOG_DIR/backend.log" \
    "cd '$ROOT_DIR/backend' && exec env APP_ENV=development SECRET_KEY=phase12-local-secret BACKEND_URL=http://localhost:8000 FRONTEND_URL=http://localhost:3000 CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002 REDIS_URL=redis://127.0.0.1:6379/0 CELERY_BROKER_URL=redis://127.0.0.1:6379/1 CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/2 STARTUP_VALIDATION_ENFORCED=true STARTUP_VALIDATION_REQUIRE_REDIS=true STARTUP_VALIDATION_REQUIRE_MIGRATIONS=true ./.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
  wait_for_url "http://localhost:8000/health" 120 1 || {
    echo "Backend failed to become healthy. See $LOG_DIR/backend.log" >&2
    exit 1
  }
  echo "Backend started on 8000"
}

seed_backend() {
  (
    cd "$ROOT_DIR/backend"
    LOCAL_ADMIN_EMAIL="$LOCAL_DEV_ADMIN_EMAIL" \
      LOCAL_ADMIN_PASSWORD="$LOCAL_DEV_ADMIN_PASSWORD" \
      LOCAL_ADMIN_FORCE_PASSWORD_RESET="true" \
      PYTHONPATH="$ROOT_DIR/backend" \
      ./.venv/bin/python scripts/seed.py >"$LOG_DIR/seed.log" 2>&1
  )
}

resolve_runtime() {
  (
    cd "$ROOT_DIR"
    LOCAL_ADMIN_EMAIL="$LOCAL_DEV_ADMIN_EMAIL" \
      LOCAL_ADMIN_PASSWORD="$LOCAL_DEV_ADMIN_PASSWORD" \
      PYTHONPATH="$ROOT_DIR/backend" \
      "$ROOT_DIR/backend/.venv/bin/python" scripts/dev-resolve-ids.py >"$RUNTIME_FILE"
  )
}

runtime_value() {
  local key="$1"
  python3 - "$RUNTIME_FILE" "$key" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
print(payload[sys.argv[2]])
PY
}

start_hotel() {
  stop_known_listener 3000 "node server.js"
  ensure_port_available 3000
  local property_id restaurant_id
  property_id="$(runtime_value property_id)"
  restaurant_id="$(runtime_value restaurant_id)"
  start_detached \
    hotel \
    "$LOG_DIR/hotel.log" \
    "cd '$ROOT_DIR/das-elb-hotel' && exec env HOST=0.0.0.0 PORT=3000 PUBLIC_SITE_URL=http://localhost:3000 PUBLIC_API_BASE_URL=http://localhost:8000/api PUBLIC_HOTEL_PROPERTY_ID=$property_id PUBLIC_RESTAURANT_ID=$restaurant_id npm run dev"
  wait_for_url "http://localhost:3000/" 120 1 || {
    echo "Hotel site failed to start. See $LOG_DIR/hotel.log" >&2
    exit 1
  }
  echo "Hotel site started on 3000"
}

start_frontend() {
  ensure_frontend_dependencies
  stop_known_listener 3001 "next-server" "next dev"
  ensure_port_available 3001
  local property_id
  property_id="$(runtime_value property_id)"
  start_detached \
    frontend \
    "$LOG_DIR/frontend.log" \
    "cd '$ROOT_DIR/frontend' && exec env BACKEND_URL=http://localhost:8000 NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_SAAS_BASE_URL=http://localhost:3001 NEXT_PUBLIC_HOTEL_PROPERTY_ID=$property_id NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next dev -p 3001 -H 0.0.0.0"
  wait_for_url "http://localhost:3001/login" 120 1 || {
    echo "Management SaaS failed to start. See $LOG_DIR/frontend.log" >&2
    exit 1
  }
  echo "Management SaaS started on 3001"
}

start_restaurant() {
  stop_known_listener 3002 "http.server 3002" "http.server --bind 0.0.0.0 -d dist"
  ensure_port_available 3002
  start_detached \
    restaurant \
    "$LOG_DIR/restaurant.log" \
    "cd '$ROOT_DIR/das-elb-rest' && env DAS_ELB_REST_API_URL=http://localhost:8000/api npm run build && exec python3 -m http.server 3002 --bind 0.0.0.0 -d dist"
  wait_for_url "http://localhost:3002/healthz" 120 1 || {
    echo "Restaurant app failed to start. See $LOG_DIR/restaurant.log" >&2
    exit 1
  }
  echo "Restaurant app started on 3002"
}

start_redis
start_backend
seed_backend
resolve_runtime

python3 - "$RUNTIME_FILE" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
payload.update(
    {
        "backend_url": "http://localhost:8000",
        "hotel_url": "http://localhost:3000",
        "frontend_url": "http://localhost:3001",
        "restaurant_url": "http://localhost:3002",
        "mcp_url": "http://localhost:8000/mcp/voicebooker/",
    }
)
json.dump(payload, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
PY

start_hotel
start_frontend
start_restaurant

cleanup() {
  "$ROOT_DIR/scripts/dev-stop.sh" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo
echo "Local stack is running:"
echo "  Backend:    http://localhost:8000"
echo "  Hotel:      http://localhost:3000"
echo "  SaaS:       http://localhost:3001"
echo "  Restaurant: http://localhost:3002"
echo "  MCP:        http://localhost:8000/mcp/voicebooker/"
echo "  Runtime:    $RUNTIME_FILE"
echo

if [[ "$VALIDATE" == "1" ]]; then
  "$ROOT_DIR/backend/.venv/bin/python" "$ROOT_DIR/scripts/dev-validate.py" --runtime "$RUNTIME_FILE"
fi

if [[ "$KEEP_ALIVE" == "1" ]]; then
  echo "Press Ctrl+C to stop the local stack."
  while true; do
    sleep 3600
  done
fi

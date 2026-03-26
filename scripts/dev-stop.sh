#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.dev/pids"

if [[ ! -d "$PID_DIR" ]]; then
  echo "No managed local stack is running."
  exit 0
fi

stop_pid_file() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [[ ! -f "$pid_file" ]]; then
    return
  fi
  local pid
  pid="$(cat "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    kill -9 "$pid" >/dev/null 2>&1 || true
    echo "Stopped $name ($pid)"
  fi
  rm -f "$pid_file"
}

for service in restaurant frontend hotel backend redis; do
  stop_pid_file "$service"
done

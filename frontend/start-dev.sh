#!/bin/bash
set -e

cd /home/runner/workspace/frontend

# Start Next.js dev server in a new process group so we can kill it cleanly
setsid npm run dev &
NEXT_PID=$!

# Forward SIGTERM/SIGINT to the entire Next.js process group
cleanup() {
  kill -- -$NEXT_PID 2>/dev/null || kill $NEXT_PID 2>/dev/null || true
  wait $NEXT_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT

# In background: wait for port 5000, then pre-warm Turbopack so the first
# real browser request is served from cache rather than triggering a cold
# 6-second compile that can time-out Replit's health check.
(
  TRIES=0
  until curl -sf http://localhost:5000 -o /dev/null -m 1 2>/dev/null || [ $TRIES -gt 40 ]; do
    sleep 0.5
    TRIES=$((TRIES + 1))
  done
  curl -s http://localhost:5000/login -o /dev/null -m 30 2>/dev/null || true
  curl -s http://localhost:5000/ -o /dev/null -m 30 2>/dev/null || true
) &

# Keep alive until Next.js exits
wait $NEXT_PID

#!/bin/bash
cd /home/runner/workspace/frontend

# ── 1. Release port 5000 if a previous process is still holding it ───────────
# Use SIGTERM first so Next.js can flush its Turbopack disk cache cleanly.
# SIGKILL (-9) interrupts the cache write and causes a 6-second cold
# re-initialization on the next dev-server start.
if grep -q ":1388 " /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
  pkill -TERM -f "next-server"  2>/dev/null || true
  pkill -TERM -f "next dev -p 5000" 2>/dev/null || true
  TRIES=0
  while grep -q ":1388 " /proc/net/tcp /proc/net/tcp6 2>/dev/null && [ $TRIES -lt 8 ]; do
    sleep 0.5; TRIES=$((TRIES + 1))
  done
  pkill -9 -f "next-server" 2>/dev/null || true
  sleep 0.3
fi

# ── 2. Build if the code has changed since the last production build ──────────
# `next start` (production mode) starts in < 500 ms with no Turbopack
# cold-compile, so Replit's health check always gets an instant HTTP 200.
# With `next dev` the first page compile after a code change takes 2–3 s,
# which races with the health-check timeout and causes the "crashed" banner.
CURRENT_COMMIT=$(git -C /home/runner/workspace rev-parse HEAD 2>/dev/null \
                 || date +%s)
LAST_COMMIT=$(cat .next/.build-commit 2>/dev/null || echo "")

if [ ! -f .next/BUILD_ID ] || [ "$CURRENT_COMMIT" != "$LAST_COMMIT" ]; then
  echo "==> Building production bundle (commit: ${CURRENT_COMMIT:0:8})…"
  npm run build
  echo "$CURRENT_COMMIT" > .next/.build-commit
  echo "==> Build complete."
fi

# ── 3. Start production server ────────────────────────────────────────────────
# Binds port 5000 instantly and serves pre-compiled pages — no cold compile.
exec npm start

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

# ── 2. Decide whether a production build is needed ────────────────────────────
CURRENT_COMMIT=$(git -C /home/runner/workspace rev-parse HEAD 2>/dev/null \
                 || date +%s)
LAST_COMMIT=$(cat .next/.build-commit 2>/dev/null || echo "")

NEEDS_BUILD=false
if [ ! -f .next/BUILD_ID ] || [ "$CURRENT_COMMIT" != "$LAST_COMMIT" ]; then
  NEEDS_BUILD=true
fi

# ── 3. If a build is needed, hold port 5000 open during it ───────────────────
# Replit's health-check fires as soon as the script starts.  Without something
# on port 5000, those requests time out and Replit declares the workflow
# "crashed" even though the build will complete and the real server will start.
# A tiny Node.js HTTP server returns HTTP 200 immediately during the build,
# keeping the health check happy.  It is killed as soon as `next build` exits.
if [ "$NEEDS_BUILD" = "true" ]; then
  node -e "
    const http = require('http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset=utf-8><title>Starting…</title>'
            + '<style>body{font-family:sans-serif;display:flex;align-items:center;'
            + 'justify-content:center;height:100vh;margin:0;background:#fdf8f0}'
            + 'p{color:#8b6f47;font-size:1.1rem}</style></head>'
            + '<body><p>Building application, please wait…</p></body></html>');
    });
    server.listen(5000, '0.0.0.0');
    process.on('SIGTERM', () => server.close());
    process.on('SIGINT',  () => server.close());
  " &
  PLACEHOLDER_PID=$!

  echo "==> Building production bundle (commit: ${CURRENT_COMMIT:0:8})…"
  npm run build
  BUILD_EXIT=$?

  # Tear down the placeholder server before starting the real one.
  kill "$PLACEHOLDER_PID" 2>/dev/null || true
  wait "$PLACEHOLDER_PID" 2>/dev/null || true

  if [ "$BUILD_EXIT" -ne 0 ]; then
    echo "==> Build failed (exit $BUILD_EXIT). Aborting." >&2
    exit "$BUILD_EXIT"
  fi

  echo "$CURRENT_COMMIT" > .next/.build-commit
  echo "==> Build complete."
fi

# ── 4. Start the production server ───────────────────────────────────────────
# Binds port 5000 in ~500 ms and serves pre-compiled pages — no cold compile.
exec npm start

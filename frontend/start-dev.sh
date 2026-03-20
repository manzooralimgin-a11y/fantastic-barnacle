#!/bin/bash
cd /home/runner/workspace/frontend

# ── 1. Free port 5000 immediately, then start placeholder ────────────────────
#
# We use SIGKILL here (not SIGTERM) because:
#   • The workflow runs `next start` (production mode).  There is no
#     incremental Turbopack cache being written — the production build is
#     written atomically by `next build` and then only READ by `next start`.
#     SIGKILL cannot corrupt anything.
#   • SIGTERM + grace-period leaves port 5000 dark for up to 4 seconds,
#     and Replit's health-check fires during that window → "crashed" banner.
#
# The placeholder HTTP server then holds port 5000 open and returns HTTP 200
# for the entire duration of `next build`, so the health-check never times out.

pkill -9 -f "next-server"    2>/dev/null || true
pkill -9 -f "next dev -p 5000" 2>/dev/null || true

# Wait (max 1 s) for the OS to release the socket.
TRIES=0
while grep -q ":1388 " /proc/net/tcp /proc/net/tcp6 2>/dev/null && [ $TRIES -lt 5 ]; do
  sleep 0.2; TRIES=$((TRIES + 1))
done

# Start placeholder immediately — port 5000 is held open from this point on.
node -e "
  const http = require('http');
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><meta charset=utf-8><title>Starting\u2026</title>'
          + '<style>body{font-family:sans-serif;display:flex;align-items:center;'
          + 'justify-content:center;height:100vh;margin:0;background:#fdf8f0}'
          + 'p{color:#8b6f47;font-size:1.1rem}</style></head>'
          + '<body><p>Building application, please wait\u2026</p></body></html>');
  });
  server.listen(5000, '0.0.0.0');
  process.on('SIGTERM', () => { server.close(); process.exit(0); });
  process.on('SIGINT',  () => { server.close(); process.exit(0); });
" &
PLACEHOLDER_PID=$!

# ── 2. Build if the commit has changed since the last production build ────────
CURRENT_COMMIT=$(git -C /home/runner/workspace rev-parse HEAD 2>/dev/null \
                 || date +%s)
LAST_COMMIT=$(cat .next/.build-commit 2>/dev/null || echo "")

if [ ! -f .next/BUILD_ID ] || [ "$CURRENT_COMMIT" != "$LAST_COMMIT" ]; then
  echo "==> Building production bundle (commit: ${CURRENT_COMMIT:0:8})…"
  npm run build
  BUILD_EXIT=$?

  if [ "$BUILD_EXIT" -ne 0 ]; then
    kill -9 "$PLACEHOLDER_PID" 2>/dev/null || true
    echo "==> Build failed (exit $BUILD_EXIT). Aborting." >&2
    exit "$BUILD_EXIT"
  fi

  echo "$CURRENT_COMMIT" > .next/.build-commit
  echo "==> Build complete."
fi

# ── 3. Hand off from placeholder to the real production server ────────────────
kill -9 "$PLACEHOLDER_PID" 2>/dev/null || true

exec npm start

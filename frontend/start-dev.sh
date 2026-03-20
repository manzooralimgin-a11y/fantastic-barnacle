#!/bin/bash
cd /home/runner/workspace/frontend

# Kill any leftover Next.js processes from a previous unclean shutdown.
# Without this, a fast Replit workflow restart leaves the old process holding
# port 5000, causing the new "next dev" to fail with EADDRINUSE.
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next dev -p 5000" 2>/dev/null || true

# Wait up to 3 seconds for port 5000 to be released.
TRIES=0
while grep -q ":1388 " /proc/net/tcp /proc/net/tcp6 2>/dev/null && [ $TRIES -lt 6 ]; do
  sleep 0.5
  TRIES=$((TRIES + 1))
done

# Pre-warm Turbopack in the background: once the dev server is listening,
# fetch /login and / so Turbopack compiles those routes before Replit's
# health-check fires.  Without pre-warming, a cold compile takes ~6 s and
# can time out Replit's health check, showing the "crashed" banner.
(
  TRIES=0
  until curl -sf http://localhost:5000 -o /dev/null -m 1 2>/dev/null || [ $TRIES -gt 40 ]; do
    sleep 0.5
    TRIES=$((TRIES + 1))
  done
  curl -s http://localhost:5000/login -o /dev/null -m 30 2>/dev/null || true
  curl -s http://localhost:5000/ -o /dev/null -m 30 2>/dev/null || true
) &

# Replace this shell with npm so Replit's SIGTERM goes straight to npm/Next.js
# and the workflow PID matches the process Replit is actually monitoring.
exec npm run dev

#!/bin/bash
set -e

# Ensure Python can find the app package (needed for alembic env.py)
export PYTHONPATH=/app

RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"
RUN_MASTER_SEED="${RUN_MASTER_SEED:-0}"
UVICORN_WORKERS="${UVICORN_WORKERS:-1}"
UVICORN_LOG_LEVEL="${UVICORN_LOG_LEVEL:-info}"
UVICORN_FORWARDED_ALLOW_IPS="${UVICORN_FORWARDED_ALLOW_IPS:-*}"

if [ "$RUN_MIGRATIONS" = "1" ]; then
  echo "Running database migrations..."
  alembic upgrade head
else
  echo "Skipping database migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)"
fi

if [ "$RUN_MASTER_SEED" = "1" ]; then
  echo "Running master data seed (idempotent)..."
  python -c "import asyncio; from migrate_master import migrate_master; asyncio.run(migrate_master())"
else
  echo "Skipping master data seed (RUN_MASTER_SEED=$RUN_MASTER_SEED)"
fi

echo "Starting Gestronomy API server..."
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "$UVICORN_WORKERS" \
  --log-level "$UVICORN_LOG_LEVEL" \
  --proxy-headers \
  --forwarded-allow-ips "$UVICORN_FORWARDED_ALLOW_IPS"

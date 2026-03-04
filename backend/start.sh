#!/bin/bash
set -e

# Ensure Python can find the app package (needed for alembic env.py)
export PYTHONPATH=/app

echo "Running database migrations..."
alembic upgrade head

echo "Starting Gestronomy API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

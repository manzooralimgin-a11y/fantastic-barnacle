#!/bin/bash
set -e

export PYTHONPATH=/app

CELERY_LOG_LEVEL="${CELERY_LOG_LEVEL:-INFO}"
CELERY_WORKER_CONCURRENCY="${CELERY_WORKER_CONCURRENCY:-4}"

echo "Starting Celery worker..."
exec celery -A app.shared.celery_app worker \
  --loglevel="${CELERY_LOG_LEVEL}" \
  --concurrency="${CELERY_WORKER_CONCURRENCY}"

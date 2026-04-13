#!/bin/bash
set -e

export PYTHONPATH=/app

CELERY_LOG_LEVEL="${CELERY_LOG_LEVEL:-INFO}"

echo "Starting Celery beat..."
exec celery -A app.shared.celery_app beat --loglevel="${CELERY_LOG_LEVEL}"

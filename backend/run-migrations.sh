#!/bin/bash
set -e

export PYTHONPATH=/app

echo "Running Alembic migrations..."
exec alembic upgrade head

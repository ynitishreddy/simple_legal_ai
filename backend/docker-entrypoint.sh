#!/bin/sh
set -e

# Ensure required storage directories exist
mkdir -p /app/data /app/uploads /app/temp

# Initialize database schema if not already present
echo "==> Verifying database schema initialization..."
python init_db.py

# Execute the container command (default: uvicorn)
echo "==> Starting application server..."
exec "$@"

#!/bin/bash
# CozyVTT Backend Startup Script
# Runs database migrations before starting the application

set -e

# If running as root (production Docker with bind mounts), fix ownership of
# mounted directories then drop to the unprivileged appuser via su-exec.
# This is needed because Docker bind mounts are owned by the host (usually root),
# which overrides the chown done in the Dockerfile image layer.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads/backups /app/logs
  chown -R appuser:appgroup /app/uploads /app/logs
  exec su-exec appuser "$0" "$@"
fi

echo "================================================"
echo "🏰 CozyVTT Backend Startup"
echo "================================================"

echo ""
echo "🔍 Checking database connection..."

# Parse DATABASE_URL to extract connection parameters for pg_isready
# Format: postgresql://user:password@host:port/dbname
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')

echo "   Host: $DB_HOST  Port: $DB_PORT  User: $DB_USER  DB: $DB_NAME"

# Wait for database to be ready (max 60 seconds)
MAX_RETRIES=30
RETRY_COUNT=0

until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Error: Database connection failed after $MAX_RETRIES attempts"
    echo "   Please check your DATABASE_URL and ensure PostgreSQL is running"
    pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
    exit 1
  fi
  echo "⏳ Waiting for database to be ready... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✅ Database connection successful"

echo ""
echo "🔄 Running database migrations..."

if npx prisma migrate deploy; then
  echo "✅ Migrations completed successfully"
else
  echo "❌ Error: Migration failed"
  echo "   Run 'docker exec -it cozyvtt-backend npx prisma migrate status' to diagnose"
  exit 1
fi

echo ""
echo "🚀 Starting CozyVTT backend..."
echo "================================================"
echo ""

exec "$@"

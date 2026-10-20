#!/bin/bash
# CozyVTT Backend Startup Script
# Runs database migrations before starting the application

set -e

# If running as root (production Docker with bind mounts), fix ownership of
# mounted directories then drop to the unprivileged appuser via su-exec.
# This is needed because Docker bind mounts are owned by the host (usually root),
# which overrides the chown done in the Dockerfile image layer. The backups
# mount is included: Docker creates a missing host directory as root, and the
# dashboard writes backups there as appuser.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads /app/logs /app/backups
  # The uploads and logs folders may be a NAS, CIFS or FUSE mount that
  # refuses an owner change; that is said, and the backend still starts. It
  # checks below, as appuser, that it can write to them.
  if ! chown -R appuser:appgroup /app/uploads 2>/dev/null; then
    echo "⚠️  Could not give the uploads folder to the backend user; if uploads fail, check the folder's owner." >&2
  fi
  if ! chown -R appuser:appgroup /app/logs 2>/dev/null; then
    echo "⚠️  Could not give the logs folder to the backend user; if no log files appear, check the folder's owner." >&2
  fi
  # Backups hold every credential on the instance: the directory is the
  # backend user's alone, on the host as in the container. The backups
  # folder may be a NAS or USB mount that refuses an owner or mode change;
  # that is said, and the backend still starts (the dashboard reports it if
  # it then cannot write there).
  if ! chown -R appuser:appgroup /app/backups 2>/dev/null; then
    echo "⚠️  Could not give the backups folder to the backend user; if backups fail, check the folder's owner." >&2
  fi
  if ! chmod 700 /app/backups 2>/dev/null; then
    echo "⚠️  Could not make the backups folder private (mode 700); its listing may be readable by other accounts." >&2
  fi
  exec su-exec appuser "$0" "$@"
fi

echo "================================================"
echo "🏰 CozyVTT Backend Startup"
echo "================================================"

# A backup or restore that was stopped part-way leaves its working copy of
# the database in /tmp, which is a volume in the Docker setup and outlives
# the container. Nothing is running yet, so any found now is a leftover.
if ! rm -rf /tmp/cozyvtt-db-* /tmp/cozyvtt-restore-* 2>/dev/null; then
  echo "⚠️  Could not remove a leftover backup or restore folder from /tmp; it holds a copy of the database." >&2
fi

# A folder the backend cannot write to fails every upload, or every log
# line, later; say so now, with the user ID the folder has to allow.
for dir in /app/uploads /app/logs; do
  if [ -d "$dir" ] && [ ! -w "$dir" ]; then
    echo "⚠️  The backend user (user ID $(id -u)) cannot write to $dir. Give that folder on the host to user ID $(id -u), or let that user write to it." >&2
  fi
done

echo ""
echo "🔍 Checking database connection..."

# Parse DATABASE_URL to extract connection parameters for pg_isready
# Format: postgresql://user:password@host:port/dbname
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
# The port is in the host part, between the @ and the first /; an address
# that names none uses 5432, as backup.sh reads it.
HOST_PORT="${DATABASE_URL#*://}"
HOST_PORT="${HOST_PORT%%/*}"
HOST_PORT="${HOST_PORT##*@}"
DB_PORT=5432
if [[ "$HOST_PORT" == *:* ]]; then DB_PORT="${HOST_PORT##*:}"; fi
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

# The project's own Prisma: npx writes to the home folder, which is read-only
# in the production image.
if ./node_modules/.bin/prisma migrate deploy; then
  echo "✅ Migrations completed successfully"
else
  echo "❌ Error: Migration failed"
  echo "   Run 'docker compose exec -u appuser backend ./node_modules/.bin/prisma migrate status' to diagnose"
  exit 1
fi

echo ""
echo "🚀 Starting CozyVTT backend..."
echo "================================================"
echo ""

exec "$@"

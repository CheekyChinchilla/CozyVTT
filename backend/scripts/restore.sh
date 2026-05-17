#!/bin/bash
# CozyVTT Database Restore Script
#
# Usage (Docker):
#   ./backend/scripts/restore.sh ./backups/cozyvtt_20260101_030000.sql.gz
#
# Usage (non-Docker, with explicit DATABASE_URL):
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
#     ./backend/scripts/restore.sh ./backups/cozyvtt_20260101_030000.sql.gz
#
# WARNING: This will DROP and recreate the target database.
#          All existing data will be lost. Make a backup first.

set -euo pipefail

BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh "${BACKUP_DIR:-./backups}"/cozyvtt_*.sql.gz 2>/dev/null || echo "  (none found in ./backups/)"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "❌ File not found: $BACKUP_FILE"
  exit 1
fi

# Parse DATABASE_URL if set, otherwise fall back to individual vars
if [[ -n "${DATABASE_URL:-}" ]]; then
  DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
  DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
  DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
  DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
  DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')
else
  DB_USER="${DB_USER:-cozyvtt}"
  DB_PASS="${DB_PASS:-}"
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5432}"
  DB_NAME="${DB_NAME:-cozyvtt}"
fi

echo "================================================"
echo "CozyVTT Database Restore"
echo "================================================"
echo "  Host:   $DB_HOST:$DB_PORT"
echo "  DB:     $DB_NAME"
echo "  User:   $DB_USER"
echo "  Source: $BACKUP_FILE"
echo ""
echo "⚠️  WARNING: This will DESTROY all existing data in '$DB_NAME'."
echo "   Make sure you have a current backup before proceeding."
echo ""
read -r -p "Type 'yes' to confirm: " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "🔄 Dropping and recreating database '$DB_NAME'..."

export PGPASSWORD="$DB_PASS"

# Drop and recreate — connect to postgres (maintenance DB) to do this
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres --no-password \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
  -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

echo "🔄 Restoring from $BACKUP_FILE..."

if gunzip -c "$BACKUP_FILE" | psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    -q; then
  echo "✅ Restore complete."
  echo ""
  echo "Next steps:"
  echo "  - Restart the backend:  docker compose restart backend"
  echo "  - Verify the app:       curl http://localhost/health"
else
  echo "❌ Restore failed. The database may be in a partial state."
  echo "   Re-run migrations manually: docker compose exec backend npx prisma migrate deploy"
  exit 1
fi

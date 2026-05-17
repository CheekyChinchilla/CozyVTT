#!/bin/bash
# CozyVTT Database Backup Script
#
# Usage (Docker):
#   ./backend/scripts/backup.sh
#
# Usage (non-Docker, with explicit DATABASE_URL):
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./backend/scripts/backup.sh
#
# The backup file is written to ./backups/ (created if it doesn't exist).
# Filename format: cozyvtt_YYYYMMDD_HHMMSS.sql.gz

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/cozyvtt_${TIMESTAMP}.sql.gz"

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
echo "CozyVTT Database Backup"
echo "================================================"
echo "  Host:   $DB_HOST:$DB_PORT"
echo "  DB:     $DB_NAME"
echo "  User:   $DB_USER"
echo "  Output: $BACKUP_FILE"
echo ""

mkdir -p "$BACKUP_DIR"

# Run pg_dump
if PGPASSWORD="$DB_PASS" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    | gzip > "$BACKUP_FILE"; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup complete: $BACKUP_FILE ($SIZE)"
else
  echo "❌ Backup failed"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Optional: purge backups older than BACKUP_RETAIN_DAYS (default: 30)
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
PRUNED=$(find "$BACKUP_DIR" -name "cozyvtt_*.sql.gz" -mtime +"$RETAIN_DAYS" -print -delete | wc -l)
if [[ $PRUNED -gt 0 ]]; then
  echo "🗑️  Pruned $PRUNED backup(s) older than ${RETAIN_DAYS} days"
fi

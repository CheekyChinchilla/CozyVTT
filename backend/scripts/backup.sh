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

# A dump holds every credential on the instance, so the file and the
# directory this creates are readable by the user running the script alone.
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/cozyvtt_${TIMESTAMP}.sql.gz"

# umask covers only what this creates. A folder that already exists, and the
# dumps an older version of this script wrote into it, kept whatever mode
# they had, usually readable by every account, so both are closed up here.
# A folder or file this user does not own is left as it is, with a warning:
# refusing the backup would be worse.
mkdir -p "$BACKUP_DIR"
if ! chmod 700 "$BACKUP_DIR" 2>/dev/null; then
  echo "⚠️  Could not make $BACKUP_DIR readable by $(id -un) alone; check who owns it."
fi
if ! find "$BACKUP_DIR" -maxdepth 1 -type f -name 'cozyvtt_*.sql.gz' -exec chmod 600 {} + 2>/dev/null; then
  echo "⚠️  Could not make every backup in $BACKUP_DIR readable by $(id -un) alone; check who owns them."
fi

# ------------------------------------------------------------------
# Docker deployments: run pg_dump inside the database container.
#
# This is the normal case and it used to fail. A Docker install has no
# reason to have postgresql-client on the host, and docker-compose.yml
# deliberately does not publish the database port — so `pg_dump -h localhost`
# had nothing to connect to and, more often, did not exist at all. Anyone
# following the upgrade instructions got "pg_dump: command not found" at
# exactly the moment they were told to protect their data.
#
# Setting DATABASE_URL skips this and connects directly, which is what a
# non-Docker install wants.
# ------------------------------------------------------------------
if [[ -z "${DATABASE_URL:-}" ]] && command -v docker >/dev/null 2>&1; then
  DB_SERVICE="${DB_SERVICE:-database}"
  if docker compose ps --status running --services 2>/dev/null | grep -qx "$DB_SERVICE"; then
    DB_USER="${DATABASE_USER:-cozyvtt}"
    DB_NAME="${DATABASE_NAME:-cozyvtt}"

    echo "================================================"
    echo "CozyVTT Database Backup"
    echo "================================================"
    echo "  Source: docker compose service '$DB_SERVICE'"
    echo "  DB:     $DB_NAME"
    echo "  User:   $DB_USER"
    echo "  Output: $BACKUP_FILE"
    echo ""

    if docker compose exec -T "$DB_SERVICE" \
        pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges \
          --exclude-table-data=public.session \
        | gzip > "$BACKUP_FILE"; then
      SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
      echo "✅ Backup complete: $BACKUP_FILE ($SIZE)"
    else
      echo "❌ Backup failed"
      rm -f "$BACKUP_FILE"
      exit 1
    fi

    RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
    PRUNED=$(find "$BACKUP_DIR" -name "cozyvtt_*.sql.gz" -mtime +"$RETAIN_DAYS" -print -delete | wc -l)
    if [[ $PRUNED -gt 0 ]]; then
      echo "🗑️  Pruned $PRUNED backup(s) older than ${RETAIN_DAYS} days"
    fi
    exit 0
  fi
fi

# Parse DATABASE_URL if set, otherwise fall back to individual vars.
# The address is scheme://user:password@host:port/name?options. A user name
# or password holding characters an address cannot carry as they are is
# percent-encoded in it (%40 for @), and is decoded here, as the backend
# decodes it. An address that names no port uses 5432. This block is the same
# in backup.sh and restore.sh; keepInStep.test.ts fails if they differ.
url_decode() {
  local s="${1//\\/\\\\}"
  printf '%b' "${s//%/\\x}"
}
if [[ -n "${DATABASE_URL:-}" ]]; then
  AUTHORITY="${DATABASE_URL#*://}"
  DB_NAME="${AUTHORITY#*/}"
  DB_NAME="${DB_NAME%%\?*}"
  AUTHORITY="${AUTHORITY%%/*}"
  HOST_PORT="${AUTHORITY##*@}"
  USER_INFO=""
  if [[ "$AUTHORITY" == *@* ]]; then USER_INFO="${AUTHORITY%@*}"; fi
  DB_USER=$(url_decode "${USER_INFO%%:*}")
  DB_USER="${DB_USER:-cozyvtt}"
  DB_PASS=""
  if [[ "$USER_INFO" == *:* ]]; then DB_PASS=$(url_decode "${USER_INFO#*:}"); fi
  DB_HOST="${HOST_PORT%%:*}"
  DB_PORT=5432
  if [[ "$HOST_PORT" == *:* ]]; then DB_PORT="${HOST_PORT##*:}"; fi
  # This script backs up and restores the public schema. An address ending in
  # ?schema=<name> keeps CozyVTT's data in a schema of its own, which the
  # Admin Dashboard's Create Backup and Restore handle.
  DB_SCHEMA=public
  if [[ "$DATABASE_URL" == *\?* ]]; then
    IFS='&' read -ra DB_OPTIONS <<< "${DATABASE_URL#*\?}"
    for option in ${DB_OPTIONS[@]+"${DB_OPTIONS[@]}"}; do
      if [[ "$option" == schema=* ]]; then DB_SCHEMA=$(url_decode "${option#schema=}"); fi
    done
  fi
  if [[ -n "$DB_SCHEMA" && "$DB_SCHEMA" != public ]]; then
    echo "❌ DATABASE_URL names the database schema \"$DB_SCHEMA\", and this script works"
    echo "   with the public schema only. Nothing was changed. Use Create Backup and"
    echo "   Restore in the Admin Dashboard, which keep to the schema DATABASE_URL names."
    exit 1
  fi
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

# Run pg_dump
# --no-owner --no-privileges: the dump then restores under whatever database
# user the instance it lands on has, instead of insisting on the name used here.
# --exclude-table-data=public.session: login sessions stay out, so a restore
# cannot sign back in a device that was signed out since the backup was made.
if PGPASSWORD="$DB_PASS" pg_dump \
    --no-owner --no-privileges \
    --exclude-table-data=public.session \
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

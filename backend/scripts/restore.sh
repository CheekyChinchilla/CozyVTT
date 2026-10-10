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
# WARNING: This replaces everything in the target database with the backup.
#          Make a backup first (./backend/scripts/backup.sh).
#
# The restore is all or nothing. The file is checked before the database is
# touched, and the load runs as one transaction that is undone entirely if any
# statement fails, so a backup that cannot be applied leaves the existing data
# as it was.

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

# A truncated or corrupted archive is the cheapest thing to catch.
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "❌ $BACKUP_FILE is not a complete gzip archive. Nothing was changed."
  echo "   The file is truncated or corrupted. Try another backup."
  exit 1
fi

# ------------------------------------------------------------------
# Prepare the file psql loads, and refuse anything that is not a backup.
#
# This mirrors what the Admin Dashboard's restore does (backend/src/utils/
# pgRestore.ts explains each rule). The dump is written to a temporary file
# first, never streamed straight into psql: a check that stopped a stream
# halfway would hand psql a cut-short file, which is the exact thing being
# guarded against.
#
# The prepared file opens with psql's restricted mode under a key the backup
# cannot know, so psql refuses every backslash command in it, then replaces
# the public schema so a backup from an older CozyVTT applies cleanly. The
# dump follows, without the lines this server would reject or that name the
# database user of the instance the backup came from (SET transaction_timeout,
# ALTER ... OWNER TO, GRANT, REVOKE) and without the dump's own \restrict
# lines. Table rows (COPY blocks) are copied through untouched. The file ends
# by emptying the login sessions, in the same transaction as the load: every
# backup made before sessions were left out of backups carries them, and
# restoring one would sign back in whoever had not yet expired, including
# sign-ins ended since by a password change or a removed account.
#
# Outside its rows, the dump must end with pg_dump's closing line, create the
# User and _prisma_migrations tables, and hold nothing but SQL: a psql
# command, a COPY that is not table data, or a transaction statement means
# it is not a backup pg_dump wrote, and it is refused before anything runs.
# ------------------------------------------------------------------
# The whole backup is unpacked into this working file, so its folder needs
# room for all of it; TMPDIR moves it somewhere with more.
SCRATCH="${TMPDIR:-/tmp}"
if ! PREPARED=$(mktemp "$SCRATCH/cozyvtt-restore.XXXXXX"); then
  echo "❌ Could not create a working file in $SCRATCH. Nothing was changed."
  echo "   Point TMPDIR at a folder you can write to, for example:"
  echo "   TMPDIR=/var/tmp $0 $BACKUP_FILE"
  exit 1
fi
trap 'rm -f "$PREPARED"' EXIT
RESTRICT_KEY=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
# The same statement as RESTORE_TRAILER in backend/src/utils/pgRestore.ts;
# keepInStep.test.ts fails if they differ. A very old backup has no session table.
RESTORE_TRAILER=$(cat <<'SQL'
DO $$ BEGIN IF to_regclass('public.session') IS NOT NULL THEN DELETE FROM public.session; END IF; END $$;
SQL
)

echo "🔍 Checking $BACKUP_FILE..."
set +e
gunzip -c "$BACKUP_FILE" | LC_ALL=C awk -v key="$RESTRICT_KEY" -v trailer="$RESTORE_TRAILER" '
  BEGIN {
    print "\\restrict " key
    print "SET client_min_messages = warning;"
    print "DROP SCHEMA public CASCADE;"
    print "CREATE SCHEMA public;"
    in_copy = 0; complete = 0; has_user = 0; has_migrations = 0; refused = ""
  }
  {
    line = $0
    sub(/\r$/, "", line)
    if (in_copy) {
      if (line == "\\.") in_copy = 0
      print; next
    }
    if (line ~ /^COPY .* FROM stdin;$/) { in_copy = 1; print; next }
    if (line ~ /^COPY /) { refused = "it runs a COPY that is not table data: " line; exit }
    if (line ~ /^\\(un)?restrict /) next
    if (line ~ /^\\/) { refused = "it runs a psql command: " line; exit }
    if (toupper(line) ~ /^(BEGIN|START TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE TRANSACTION)([^A-Z0-9_]|$)/) {
      refused = "it takes control of the transaction the restore runs in: " line; exit
    }
    if (line == "-- PostgreSQL database dump complete") complete = 1
    if (line ~ /^SET transaction_timeout = /) next
    # TODO(restore): this pattern backtracks on a long crafted line (mawk took
    # 12 s on two 100 KB lines). Match it in one pass, as isOwnershipStatement
    # in backend/src/utils/pgRestore.ts now does; awk has no lookahead, so
    # check the closing semicolon and find the first " OWNER TO " with index().
    if (line ~ /^ALTER [A-Z][A-Z ]* .+ OWNER TO .+;$/) next
    if (line ~ /^(GRANT|REVOKE) /) next
    if (line == "CREATE TABLE public.\"User\" (") has_user = 1
    if (line == "CREATE TABLE public._prisma_migrations (") has_migrations = 1
    print
  }
  END {
    if (refused == "") {
      if (in_copy) refused = "it stops partway through a table'"'"'s rows, so it was cut short"
      else if (!complete) refused = "it does not end the way a complete pg_dump backup does, so it was cut short or is not a pg_dump backup"
      else if (!has_user || !has_migrations) refused = "it does not create the User and _prisma_migrations tables, so it is not a CozyVTT backup"
    }
    if (refused != "") {
      print "❌ This file cannot be restored because " refused ". Nothing was changed." > "/dev/stderr"
      exit 3
    }
    print trailer
  }
' > "$PREPARED"
CHECK=("${PIPESTATUS[@]}")
set -e
# 3 is the check's own refusal, whose reason is printed above.
if [[ "${CHECK[1]}" -eq 3 ]]; then
  exit 1
fi
# The trailer is the last thing written, so a file that does not end with it
# was cut short. awk's status alone does not say: busybox awk, the one on
# Alpine, exits 0 when its writes fail.
TRAILER_LINES=$(printf '%s\n' "$RESTORE_TRAILER" | wc -l | tr -d ' ')
if [[ "${CHECK[0]}" -ne 0 || "${CHECK[1]}" -ne 0 ]] \
    || [[ "$(tail -n "$TRAILER_LINES" "$PREPARED")" != "$RESTORE_TRAILER" ]]; then
  echo "❌ Could not write the unpacked backup to $SCRATCH. Nothing was changed."
  echo "   The whole backup is unpacked there before anything is loaded, so the folder"
  echo "   needs room for all of it. If the messages above say no space is left, run it"
  echo "   again with TMPDIR pointing at a folder with more room, for example:"
  echo "   TMPDIR=/var/tmp $0 $BACKUP_FILE"
  exit 1
fi

confirm_or_abort() {
  echo "⚠️  WARNING: This will REPLACE all existing data in '$DB_NAME' with the backup."
  echo "   Make sure you have a current backup before proceeding."
  echo ""
  if [[ "${RESTORE_ASSUME_YES:-}" != "yes" ]]; then
    read -r -p "Type 'yes' to confirm: " CONFIRM
    [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 0; }
  fi
}

report_failure() {
  echo "❌ Restore failed. Your existing data is unchanged: the load is undone as a whole when any part of it fails."
  echo "   The reason is in the messages above. If it says 'invalid command \\restrict', psql is too old:"
  echo "   the restore needs PostgreSQL 13.22, 14.19, 15.14, 16.10, 17.6 or 18"
  echo "   (on Docker: docker compose pull database && docker compose up -d database)."
}

# ------------------------------------------------------------------
# Docker deployments: run psql inside the database container.
#
# Same reason as backup.sh — a Docker install has no postgresql-client on the
# host and the database port is deliberately not published, so the direct
# connection below had nothing to reach. Setting DATABASE_URL skips this.
# ------------------------------------------------------------------
if [[ -z "${DATABASE_URL:-}" ]] && command -v docker >/dev/null 2>&1; then
  DB_SERVICE="${DB_SERVICE:-database}"
  if docker compose ps --status running --services 2>/dev/null | grep -qx "$DB_SERVICE"; then
    DB_USER="${DATABASE_USER:-cozyvtt}"
    DB_NAME="${DATABASE_NAME:-cozyvtt}"

    echo "================================================"
    echo "CozyVTT Database Restore"
    echo "================================================"
    echo "  Target: docker compose service '$DB_SERVICE'"
    echo "  DB:     $DB_NAME"
    echo "  User:   $DB_USER"
    echo "  Source: $BACKUP_FILE"
    echo ""
    confirm_or_abort

    echo ""
    echo "🔄 Restoring from $BACKUP_FILE..."
    # -q and -o keep the dump's own chatter off the screen; errors still show.
    if docker compose exec -T "$DB_SERVICE" \
        psql -U "$DB_USER" -d "$DB_NAME" -q -o /dev/null \
        -v ON_ERROR_STOP=1 --single-transaction < "$PREPARED"; then
      echo "✅ Restore complete. Every sign-in has ended, so everyone signs in again."
      echo ""
      echo "Next steps:"
      echo "  - Restart the backend now:  docker compose restart backend"
      echo "    It brings an older backup up to this version and ends the game connections"
      echo "    still open, which keep the identity and role they had before the restore"
      echo "    until the backend restarts."
      echo "  - Verify the app:           curl http://localhost:PORT/health"
      echo "    where PORT is HTTP_PORT from your .env (80 if it is not set)."
      exit 0
    else
      report_failure
      exit 1
    fi
  fi
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
confirm_or_abort

echo ""
echo "🔄 Restoring from $BACKUP_FILE..."

export PGPASSWORD="$DB_PASS"

if psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    -q -o /dev/null \
    -v ON_ERROR_STOP=1 \
    --single-transaction < "$PREPARED"; then
  echo "✅ Restore complete. Every sign-in has ended, so everyone signs in again."
  echo ""
  echo "Next steps:"
  echo "  - Bring an older backup up to this version:  cd backend && npx prisma migrate deploy"
  echo "  - Restart the backend now. That ends the game connections still open, which keep"
  echo "    the identity and role they had before the restore until the backend restarts."
  echo "  - Verify the app:                            curl http://localhost:PORT/health"
  echo "    where PORT is the backend's PORT setting (4000 if it is not set)."
else
  report_failure
  exit 1
fi

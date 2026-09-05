# Database Migrations

## Overview

CozyVTT uses Prisma for database management and migrations. Database migrations are automatically run when the backend container starts.

## Automatic Migrations (Default)

When you start CozyVTT with Docker Compose, the backend container will automatically:

1. Wait for the PostgreSQL database to be ready
2. Run all pending migrations using `npx prisma migrate deploy`
3. Start the application

This ensures that your database schema is always up-to-date.

## Manual Migration Commands

If you need to run migrations manually, you can use these commands:

### Inside Docker Container

```bash
# Enter the backend container
docker exec -it cozyvtt-backend bash

# Run migrations
npx prisma migrate deploy

# View migration status
npx prisma migrate status
```

### Local Development

```bash
cd backend

# Create a new migration (development only)
npm run prisma:migrate

# Deploy migrations to production database
npx prisma migrate deploy

# View migration status
npx prisma migrate status

# Open Prisma Studio to view database
npm run prisma:studio
```

## Migration Files

Migration files are located in `backend/prisma/migrations/`. Each migration is stored in a timestamped folder with SQL files.

`backend/prisma/migrations/` is the authoritative list — the folder names are in
order and `npx prisma migrate status` tells you what a given database has
applied. The ones below are called out because they are the ones people ask
about; the list is not exhaustive.

- `20260211040616_init` - Initial database schema
- `20260211043730_add_system_settings` - System settings table for setup wizard
- `20260215000000_add_password_reset` - Password reset tokens
- `20260220041038_add_game_system_support` - Game system support for characters
- `20260902204427_add_personal_notes` - `PersonalNote` table for per-user
  Markdown notes. Purely additive: one `CREATE TABLE` with two foreign keys and
  an index, and no `ALTER` on any existing table, so upgrading cannot touch
  data you already have. New installs and upgrades both start with it empty.

## Data migrations (one-off scripts)

Some changes move data around inside the JSON columns rather than altering the
schema. Prisma does not run these — they are scripts you run once, by hand, and
they are safe to run again.

| Script | What it does |
|---|---|
| `npm run migrate:sheet-fields` | Moves character sheets onto the fields the app reads. See below. |
| `npm run migrate:characters` | Earlier character data migration. |
| `npm run migrate:avatar-scope` | Moves AVATAR assets from GLOBAL to USER scope. |

### `migrate:sheet-fields`

The built-in character templates had been written against an older shape, so
sheets created from them hold content in fields nothing displays: a D&D 5e
Fighter's features, its armour and weapon proficiencies, a Pathfinder 2e
character's strikes and class features.

Reading is already fixed for D&D 5e — those sheets display correctly with no
migration at all. **Pathfinder 2e sheets need this script** to show their
strikes and class features, and running it also tidies the 5e duplicates away
so the same fact is not stored twice.

```bash
# Report what would change, without writing anything
docker compose exec backend npm run migrate:sheet-fields -- --dry-run

# Apply
docker compose exec backend npm run migrate:sheet-fields
```

Safe to run more than once — a sheet already converted is skipped. Each
character is written in its own transaction, so an interruption cannot leave one
half-converted, and nothing is removed until its content has been merged into
the field that replaces it. Text a player typed is moved verbatim and never
parsed. Take a backup first anyway, as with any data change.

## Troubleshooting

### "Table does not exist" Error

If you see errors like "The table `public.SystemSettings` does not exist", it means migrations haven't been run. This can happen if:

1. You're setting up CozyVTT for the first time
2. You manually created the database without running migrations
3. The migration script failed

**Solution:**
```bash
# Stop all containers
docker-compose down

# Rebuild and restart (migrations will run automatically)
docker-compose up --build

# Or run migrations manually:
docker exec -it cozyvtt-backend npx prisma migrate deploy
```

### Migration Conflicts

If you have migration conflicts (usually during development), you may need to reset the database:

```bash
# WARNING: This will delete all data!
docker-compose down -v  # Remove volumes
docker-compose up --build  # Fresh start with migrations
```

### Checking Migration Status

To see which migrations have been applied:

```bash
docker exec -it cozyvtt-backend npx prisma migrate status
```

## Creating New Migrations

When you modify the Prisma schema (`backend/prisma/schema.prisma`), create a new migration:

```bash
cd backend
npm run prisma:migrate
# Follow the prompts to name your migration
```

This will:
1. Generate a new migration file
2. Apply it to your development database
3. Regenerate the Prisma client

## Production Deployment

For production deployments, always use `prisma migrate deploy` instead of `prisma migrate dev`:

```bash
npx prisma migrate deploy
```

This command:
- ✅ Applies pending migrations
- ✅ Does not create new migrations
- ✅ Does not prompt for input
- ✅ Safe for production use

The startup script (`scripts/start.sh`) uses `migrate deploy` to ensure safe, automatic migrations in production.

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

Current migrations:
- `20260211040616_init` - Initial database schema
- `20260211043730_add_system_settings` - System settings table for setup wizard
- `20260215000000_add_password_reset` - Password reset tokens
- `20260220041038_add_game_system_support` - Game system support for characters

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

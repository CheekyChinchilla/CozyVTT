# Database Migrations

## Overview

CozyVTT uses Prisma for database management and migrations. Database migrations are automatically run when the backend container starts.

## Automatic Migrations (Default)

When you start CozyVTT with Docker Compose, the backend container will automatically:

1. Wait for the PostgreSQL database to be ready
2. Run all pending migrations using `npx prisma migrate deploy`
3. Start the application

This ensures that your database schema is always up-to-date.

A restore from the Admin Dashboard also runs `prisma migrate deploy` once the
backup has loaded, so a backup taken on an older release is brought up to the
running version without a restart. If that step fails the restore reports it
and asks for a backend restart, which runs the same command.

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
- `20260910195739_add_dice_macros` - `DiceMacro` table for a player's saved
  dice rolls in one campaign. Additive in the same way: one `CREATE TABLE`, an
  index and two foreign keys, with no `ALTER` on anything existing.
- `20260911215959_add_campaign_documents` - `CampaignDocument` table linking a
  document asset to a campaign, so a DM can share a rulebook with one table
  without making it visible to the whole instance. One `CREATE TABLE`, three
  indexes and three foreign keys. Nothing existing is altered.
- `20260917003045_add_map_fog_enabled` - `Map.fogEnabled`, a boolean defaulting to `true`.
  One `ALTER TABLE ... ADD COLUMN` with a default, so every existing map keeps
  fog of war exactly as it was; only maps created afterwards start with it off.
- `20260917005458_add_map_global_illumination` - `Map.globalIllumination`, a boolean defaulting
  to `true`. Same shape: one `ALTER TABLE ... ADD COLUMN` with a default. Every
  existing lit map keeps showing players everything in line of sight, as it
  always did; new maps start with it off so lights and darkvision decide.
- `20260917013238_add_map_exploration` - `Map.explorationEnabled` (boolean, default `true`)
  and a new `MapExploration` table holding what each player has explored on a
  map, one row per map and user, cascading on delete of either. One `ALTER
  TABLE ... ADD COLUMN` with a default, one `CREATE TABLE`, two indexes and two
  foreign keys. Nothing existing is altered; the table starts empty.
- `20260928120000_keep_rolls_and_uploads_of_deleted_accounts` - `Asset.uploadedById`
  and `DiceRoll.userId` become nullable, and their foreign keys change from
  refusing a user's deletion to setting the column to null, as
  `Message.userId` already did. Two `DROP NOT NULL` and the two foreign keys
  dropped and re-added in one transaction. No row is changed or removed; it
  only lets an account with rolls or uploads be deleted.

## Data migrations (one-off scripts)

Some changes move data around inside the JSON columns rather than altering the
schema. Prisma does not run these — they are scripts you run once, by hand, and
they are safe to run again. Each ends with exit status 0 when it succeeds and 1
when it fails, so a wrapper can tell the two apart.

| Script | What it does |
|---|---|
| `npm run migrate:sheet-fields` | Moves character sheets onto the fields the app reads. See below. |
| `npm run migrate:characters` | Guesses a game system for characters stored before game systems existed. Not for a current instance; see below. |
| `npm run migrate:avatar-scope` | Moves AVATAR assets from GLOBAL to USER scope. |
| `npm run validate:characters` | Changes nothing. Lists the characters the server would refuse when next saved. See below. |

The `npm run` forms need a development checkout. In the production image run
the compiled file instead, as shown for `migrate:sheet-fields` below:
`node dist/scripts/<name>.js` with the same options.

### `migrate:sheet-fields`

The built-in character templates had been written against an older shape, so
sheets created from them hold content in fields nothing displays: a D&D 5e
Fighter's features, its armour and weapon proficiencies, a Pathfinder 2e
character's strikes and class features.

Reading is already fixed for D&D 5e: those sheets display correctly with no
migration at all. **Pathfinder 2e sheets need this script** to show their
strikes and class features, and running it also tidies the 5e duplicates away
so the same fact is not stored twice.

The same transforms, in `src/utils/sheetFieldMigrations.ts`, run on every
character the API creates or saves, before the sheet is validated. Validation
drops a field the schema does not declare, so without them the first save of
such a sheet would lose the content this script exists to move. A sheet that
is saved is therefore moved already, and the script finds nothing to do for
it.

```bash
# Report what would change, without writing anything
docker compose exec backend node dist/scripts/migrate-sheet-fields.js --dry-run

# Apply
docker compose exec backend node dist/scripts/migrate-sheet-fields.js
```

The production image has no `src/` and no `ts-node`, so `npm run
migrate:sheet-fields` (which runs the TypeScript source) works only in a
development checkout. Outside Docker, run the compiled file from `backend/`
after `npm run build`.

What it does with each older field:

- **D&D 5e.** The template's `features` are added to Features & Traits; a
  feature already there by name is filled in or skipped, and one whose text
  differs is added beside it. The flat `proficiencies` list and `languages`
  are added to the proficiency list (and the languages to the Languages box).
  The loose `personalityTraits`, `ideals`, `bonds` and `flaws` fill empty
  personality boxes; where a box already holds other text, the older text is
  added after it as a new paragraph. `allies` fills an empty Allies name, or is
  added after the description.
- **Pathfinder 2e.** `attacks` are added after the character's own strikes,
  skipping any with the name of one already there. `specialAbilities` are
  added to the class features. Top-level `senses`, `resistances` and
  `immunities` are added to the lists inside `perception` and `hp`.
- **Call of Cthulhu 7e.** `player` becomes `playerName` when that is empty.

An older field is removed only once everything in it is in the new place,
whether it was there already or has just been added. A field holding
something with nowhere to go, such as a second player name when `playerName`
already holds a different one, or an entry with no name or that is not text,
is left where it is, and the report lists that character under "keep something in an older
field". Text a player typed is moved verbatim and never parsed. The report
gives each changed character's name, game system and id, with a line for each
change.

It is safe to run while people are playing, and safe to run more than once.
Each character is written in its own transaction: the row is locked, read
again and migrated from that fresh copy, so a save or a hit point change made
since the run started is kept, and an interruption cannot leave a sheet
half-converted. A character already converted is skipped. The command ends
with exit status 1 if it fails part-way, or if a character changed while it
was being written and was left for the next run; run it again. Take a backup
first anyway, as with any data change.

Saving a character in the app applies the same moves, so a sheet saved before
the script runs is moved already. The one difference is a field with nowhere
to go: the script keeps it, but a save cannot, because the server stores only
the fields the sheet declares.

### `migrate:characters`

Written for characters stored before CozyVTT recorded a game system. On any
current instance a character with no game system is a **Flexible** character
on purpose, and giving it one would stop it fitting its Flexible campaign, so
the script previews by default and is careful when told to apply:

```bash
npm run migrate:characters               # preview: lists every guess, changes nothing
npm run migrate:characters -- --execute  # apply the guesses marked as applied
```

It guesses from the shape of the sheet, with high, medium or low confidence.
Only a **high-confidence** guess is applied, and only to a character in no
campaign or in a campaign of that same game system. A character in a Flexible
campaign, or in a campaign of another system, is listed and left alone, and
medium and low guesses are only ever listed. Each change is printed with the
character's id, so it can be undone by hand.

### `validate:characters`

Checks every character against its game system's rules the way a save does,
after moving older fields as a save does, and lists each one the server would
refuse, with its id and the fields at fault. Nothing is written.

```bash
npm run validate:characters                          # every character
npm run validate:characters -- --system DND_5E       # one game system; dnd5e works too
npm run validate:characters -- --verbose             # every error for every character
npm run validate:characters -- --export              # also write validation-report.json
```

It ends with exit status 0 when every character passes, and 1 when one does
not, when an option is not understood, or when it cannot run. To fix a listed
character, open it in the Character Editor and save it: the message names the
field.

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

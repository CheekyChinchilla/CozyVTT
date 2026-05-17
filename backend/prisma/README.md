# CozyVTT Database Schema

Prisma schema and migrations for CozyVTT. PostgreSQL 14+.

## Models

The schema is in [`schema.prisma`](./schema.prisma) — 16 models grouped by domain:

**User & auth**
- `User` — accounts with optional MFA
- `PasswordResetToken` — short-lived (1h) reset tokens

**Campaigns & membership**
- `Campaign` — game-system, vibe settings, spirit-layer config, status
- `CampaignMembership` — join table with role (DM/PLAYER/SPECTATOR)
- `CampaignInvitation` — pending/accepted/declined invites
- `Session` — live game sessions with full state snapshots

**Game content**
- `Character` — flexible JSON-backed character sheets, optionally bound to a campaign + game system
- `Map` — base + spirit layer, tokens, walls, lights, fog, annotations
- `CreatureTemplate` — SRD bestiary + custom creatures (campaign-scoped or global)
- `CreatureFavorite` — DM's per-campaign starred creatures
- `TokenTemplate` — reusable token configurations copyable across campaigns

**Assets & messages**
- `Asset` — file metadata (the actual files live in `backend/uploads/`); scoped GLOBAL / USER / CAMPAIGN
- `Message` — chat history (player, DM, system, dice rolls, character actions)
- `DiceRoll` — historical dice rolls with breakdowns

**Platform**
- `SystemLog` — admin-visible audit log
- `SystemSettings` — singleton row holding instance-wide config (theme, branding, registration policy, upload limits)

## Enums

| Enum | Values |
|---|---|
| `PlatformRole` | `ADMIN`, `USER` |
| `CampaignStatus` | `PREPARATION`, `ACTIVE`, `PAUSED`, `INACTIVE`, `COMPLETED`, `ARCHIVED` |
| `CampaignRole` | `DM`, `PLAYER`, `SPECTATOR` |
| `GameSystem` | `DND_5E`, `PATHFINDER_2E`, `SHADOWRUN_6E`, `CALL_OF_CTHULHU_7E` |
| `AssetType` | `MAP`, `TOKEN`, `AUDIO`, `AVATAR`, `DOCUMENT`, `OTHER` |
| `AssetScope` | `GLOBAL`, `USER`, `CAMPAIGN` |
| `MessageType` | `PLAYER`, `DM`, `SYSTEM`, `DICE_ROLL`, `CHARACTER_ACTION` |
| `LogLevel` | `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `DECLINED` |

Note: `AssetType` includes `DOCUMENT` and `OTHER`, but the upload route rejects them — only MAP / TOKEN / AUDIO / AVATAR are accepted from clients. The two extra values are reserved for future use.

## Important constraints

- **Email uniqueness** — `User.email` unique index, case-folded to lowercase before insert
- **One DM per user per campaign** — enforced by application logic, not DB constraint, because the DM role is part of the membership row
- **Cascade deletions** — deleting a campaign cascades to its memberships, maps, sessions, messages, dice rolls, creature templates, token templates, and (campaign-scoped) assets
- **Soft references** — `Character.campaignId` uses `SetNull` so deleting a campaign doesn't kill the player's character

## JSON columns

Several models use Prisma's `Json` type for flexibility:

| Model.field | Shape |
|---|---|
| `Campaign.vibeSettings` | Vibe periods with color/audio config |
| `Map.tokens` | Array of token objects (position, image, HP, conditions, stat block, etc.) |
| `Map.annotations` | Drawings, markers, fog state |
| `Map.wallSegments` | Wall geometry (`WallSegment[]`) |
| `Map.lights` | Light sources (`LightSource[]`) |
| `Map.fogData` | Fog-of-war reveal state |
| `Character.data` | Per-game-system sheet (validated by Zod at the route layer) |
| `Message.metadata` | Optional context (e.g. character ID for character actions) |
| `DiceRoll.breakdown` | Full roll math — individual dice, kept/dropped, modifiers |
| `Session.savedState` | Game state snapshot for resume |
| `SystemLog.context` | Free-form context object |
| `User.preferences` | Per-user theme + font choice |
| `TokenTemplate.statBlock` | NPC stat block (`NpcStatBlock`) |

## Commands

```bash
# Generate the Prisma Client into node_modules (after schema edits)
npx prisma generate

# Create + apply a new migration in dev
npx prisma migrate dev --name <descriptive_name>

# Apply pending migrations (production — runs automatically on container start)
npx prisma migrate deploy

# Open Prisma Studio (web UI for browsing rows)
npx prisma studio

# Nuke the local dev DB and re-seed from scratch (DESTRUCTIVE)
npx prisma migrate reset
```

## Migration strategy

- **Always** create migrations via `prisma migrate dev`. Never hand-edit migrations in version control.
- **Production deployments** run `npx prisma migrate deploy` on backend startup — this only applies migrations that haven't run on the target DB. It never modifies existing migration history.
- The `migrations/` directory is **tracked in git**. Every PR that touches `schema.prisma` should also commit the generated migration file alongside it.
- Migrations are forward-only. There's no `prisma migrate down`. To "revert," write a new migration that undoes the previous change.

## Security notes

- **No raw queries with user input.** All DB access goes through Prisma, which parameterizes for us. SQL injection is not a vector.
- **Password hashing happens at the application layer**, not the database. Argon2id; see `backend/src/services/auth.ts`.
- **MFA backup codes are hashed** before storage (`backend/src/services/mfa.ts`). Plaintext is shown to the user exactly once at setup.
- **Session data is stored via `express-session` + `connect-pg-simple`**, in its own `session` table (managed by the session middleware, not this schema).
- **File paths are stored relatively** (e.g. `uploads/maps/global/<uuid>.png`), never absolute. Path-traversal mitigation lives at the upload layer.

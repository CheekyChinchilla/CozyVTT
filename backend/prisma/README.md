# CozyVTT Database Schema

Prisma schema and migrations for CozyVTT. PostgreSQL 14+, Prisma 7. The
command-line tools read their settings, the database address included, from
[`../prisma.config.ts`](../prisma.config.ts); the app's client connects
through the `pg` driver (`src/config/prismaClient.ts`).

## Models

The schema is in [`schema.prisma`](./schema.prisma) — 23 models grouped by domain:

**User & auth**
- `User` — accounts with optional MFA, which an administrator must turn on within 7 days
- `PasswordResetToken` — password reset links (1 hour) and admin invitation links (7 days), stored as the SHA-256 of the token (`services/passwordResetTokens.ts`)
- `LoginSession` — the `session` table where `connect-pg-simple` keeps sign-ins. `@@ignore` leaves it out of the Prisma client; the session store and `services/sessionStore.ts` read and write it with SQL of their own. Its migration, `20261015032229_add_login_session_table`, uses `IF NOT EXISTS`, so on an instance whose backend already made the table it changes nothing

**Campaigns & membership**
- `Campaign` — game-system, vibe settings, spirit-layer config, status, and whether players may draw on the map (`playersMayDraw`, default on)
- `CampaignMembership` — join table with role (DM/PLAYER/SPECTATOR)
- `CampaignInvitation` — pending/accepted/declined invites
- `Session` — live game sessions with full state snapshots

**Game content**
- `Character` — flexible JSON-backed character sheets, optionally bound to a campaign + game system
- `Map` — base + spirit layer, tokens, walls, lights, fog, annotations; per-map switches for fog of war, Global Illumination and explored memory (`fogEnabled`, `globalIllumination`, `explorationEnabled`, all default on so existing maps keep their behaviour)
- `MapExploration` — one player's explored cells on one map; never read when deciding which tokens to send
- `MapDrawing` — one drawing on one map (a stroke, a shape or a text label): its kind, colours, width and points in whole map pixels from the top-left, who drew it (`authorId`, null once their account is deleted) and who is sent it (`audience`, `ALL` or `DM`). It goes with its map. `layer` is `MARKUP` for everything drawn so far; `GROUND`, `pattern` and `stamp` are kept for DM-drawn map art and not accepted yet
- `CreatureTemplate` — SRD bestiary + custom creatures (campaign-scoped or global). `source` says which; `createdById` is the author, null for SRD creatures and once the author's account is deleted
- `CreatureFavorite` — DM's per-campaign starred creatures
- `TokenTemplate` — reusable token configurations copyable across campaigns
- `CharacterTemplate` — shareable starter sheets any signed-in user can copy
- `PersonalNote` — a player's own Markdown notes for one campaign. **Private to
  the author, the DM included** — every route scopes its query by the session's
  own user id, and a note that is not yours answers 404 rather than 403 so the
  response cannot confirm the id exists. Not to be confused with
  `Session.notes`, which the whole campaign reads.
- `DiceMacro` — a player's saved dice rolls for one campaign, shown as buttons in
  the dice panel. **Private to whoever saved them**, scoped and answered exactly
  the way `PersonalNote` is. The `expression` column is checked against the real
  dice parser when it is written, so a stored macro is always one that can be
  rolled — see `validators/diceMacros.ts`
- `CampaignDocument` — shares a `DOCUMENT` asset with one campaign. A document
  is private to its uploader until linked; the link is what lets that
  campaign's members read it, and `canReadAsset` in `services/permissions.ts`
  is where that is decided. Deleting the campaign removes the link and keeps the
  document; deleting the asset removes every link to it

**Assets & messages**
- `Asset` — file metadata (the actual files live in `backend/uploads/`); scoped GLOBAL / USER / CAMPAIGN. When the uploader's account is deleted, `uploadedById` becomes null on the uploads that stay (those in a campaign or the global library, and personal ones still in use or shared into a campaign); the avatar and every other personal upload are deleted, row and file (`services/accountDeletion.ts`)
- `Message` — chat history (player, DM, system, dice rolls, character actions, whispers). A `WHISPER` is for one member, named in `recipientId`; when that account is deleted the column becomes null and the whisper stays
- `DiceRoll` — historical dice rolls with breakdowns; `userId` becomes null when the roller's account is deleted, and the roll stays

**Platform**
- `SystemLog` — admin-visible audit log. The admin MFA rule also reads its rows: the policy's start date and each administrator's 7-day restart are lines there (`services/adminMfaPolicy.ts`)
- `SystemSettings` — singleton row holding instance-wide config (setup state, instance name and timezone, registration policy, theme and branding, campaign export size limit; upload limits come from the environment)

## Enums

| Enum | Values |
|---|---|
| `PlatformRole` | `ADMIN`, `USER` |
| `CampaignStatus` | `PREPARATION`, `ACTIVE`, `PAUSED`, `INACTIVE`, `COMPLETED`, `ARCHIVED` |
| `CampaignRole` | `DM`, `PLAYER`, `SPECTATOR` |
| `GameSystem` | `DND_5E`, `PATHFINDER_2E`, `SHADOWRUN_6E`, `CALL_OF_CTHULHU_7E` |
| `AssetType` | `MAP`, `TOKEN`, `AUDIO`, `AVATAR`, `DOCUMENT`, `OTHER` |
| `AssetScope` | `GLOBAL`, `USER`, `CAMPAIGN` |
| `MessageType` | `PLAYER`, `DM`, `SYSTEM`, `DICE_ROLL`, `CHARACTER_ACTION`, `WHISPER` |
| `LogLevel` | `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `DECLINED` |
| `DrawingAudience` | `ALL`, `DM` |
| `DrawingLayer` | `MARKUP`, `GROUND` |

Note: `AssetType` includes `OTHER`, but the upload route rejects it — only MAP / TOKEN / AUDIO / AVATAR / DOCUMENT are accepted from clients. `OTHER` is reserved for future use.

## Important constraints

- **Email uniqueness** — `User.email` unique index, case-folded to lowercase before insert
- **One DM per campaign** — enforced in `routes/campaigns.ts`, not by a constraint, because the DM role is a value in the membership row. The database enforces one membership per user per campaign (`@@unique([userId, campaignId])`)
- **Cascade deletions** — deleting a campaign removes its memberships, invitations, maps (and their explored memory and drawings), sessions, messages, dice rolls, creature templates and favourites, token templates, personal notes, dice macros and document links. Its campaign-scoped assets are kept: the delete route turns each into its uploader's USER asset first, and `Asset.campaignId` is `SetNull`
- **Unbounded text is bounded by the validator, not the column** — `PersonalNote.content` is `TEXT`, which Postgres would let grow to a gigabyte. The 100,000-character limit lives in `validators/personalNotes.ts` so the column never has to change if it is revisited, and the list endpoint does not select the column at all
- **Soft references** — `Character.campaignId` uses `SetNull` so deleting a campaign doesn't kill the player's character
- **Deleting a user** keeps their chat messages, dice rolls, the uploads that stay (see `Asset` above), their published character templates and the creatures they made, with the user column set to null. Whispers sent to them stay too, with `Message.recipientId` set to null, and so does what they drew on maps, with `MapDrawing.authorId` set to null. `Campaign.ownerId` still refuses the deletion: `services/accountDeletion.ts` passes a campaign they own to its sitting DM first, and refuses while they hold the DM seat of any campaign, owned or not, or own one with nobody in the seat. It also refuses the instance's only admin

## JSON columns

Several models use Prisma's `Json` type for flexibility:

| Model.field | Shape |
|---|---|
| `Campaign.vibeSettings` | Vibe periods with color/audio config |
| `Map.tokens` | Array of token objects (position, image, HP, conditions, stat block, etc.) |
| `Map.annotations` | Unused, always `[]`, and never sent to members; drawings are rows of `MapDrawing`, which a campaign archive carries under each map file's `drawings` (fog is `Map.fogData`) |
| `Map.wallSegments` | Wall geometry (`WallSegment[]`) |
| `Map.lights` | Light sources (`LightSource[]`) |
| `Map.fogData` | Fog-of-war reveal state |
| `MapDrawing.points` | `[[x, y], ...]` in whole map pixels from the map's top-left corner |
| `MapExploration.explored` | One player's explored cells on one map, in the fog grid's shape; never read when deciding which tokens to send |
| `Character.data` | Per-game-system sheet (validated by Zod at the route layer) |
| `Message.metadata` | Optional context (e.g. character ID for character actions) |
| `DiceRoll.breakdown` | Full roll math — individual dice, kept/dropped, modifiers |
| `Session.savedState` | Game state snapshot for resume |
| `SystemLog.context` | Free-form context object |
| `User.preferences` | Per-user theme + font choice |
| `TokenTemplate.statBlock` | NPC stat block (`NpcStatBlock`) |
| `TokenTemplate.size`, `CreatureTemplate.size` | Footprint in squares (`{ width, height }`) |
| `TokenTemplate.hp` | `{ current, max, temp }`, or null |
| `CreatureTemplate.statBlock` | The creature's stat block |
| `CharacterTemplate.data` | A published template's sheet, validated as a character's is |
| `SystemSettings.customThemeColors` | The instance's custom theme colours |

## Commands

```bash
# Generate the Prisma Client into node_modules (after schema edits)
npx prisma generate

# Create + apply a new migration in dev; it no longer generates the client,
# so run prisma generate after it
npx prisma migrate dev --name <descriptive_name>

# Apply pending migrations (production — runs automatically on container start)
npx prisma migrate deploy

# Open Prisma Studio (web UI for browsing rows)
npx prisma studio

# Drop the local dev DB and rebuild it from the migrations (DESTRUCTIVE).
# It no longer seeds or generates: run npx prisma db seed (prisma/seed.ts,
# which seeds nothing yet) and npx prisma generate after it
npx prisma migrate reset
```

## Migration strategy

- Create schema migrations with Prisma's own tooling (`prisma migrate dev`, or `prisma migrate diff` where `migrate dev` refuses to run; `docs/DEVELOPMENT.md` shows both). A migration that changes rows is written by hand in SQL, and has to be safe to run twice and safe to fail half-way: `20260417000000_migrate_light_bright_dim`, which rewrites every map's lights, and `20261015033738_creature_template_author_set_null`, which clears the author of each creature whose author's account was already deleted, are the two so far. Never edit a migration that has shipped: a database that already ran it would no longer match the file.
- **Production deployments** run `npx prisma migrate deploy` on backend startup — this only applies migrations that haven't run on the target DB. It never modifies existing migration history.
- The `migrations/` directory is **tracked in git**. Every PR that touches `schema.prisma` should also commit the generated migration file alongside it.
- Migrations are forward-only. There's no `prisma migrate down`. To "revert," write a new migration that undoes the previous change.

## Security notes

- **No raw queries with user input.** The application's queries go through Prisma, and its raw SQL only as tagged `$queryRaw` and `$executeRaw` templates, which parameterize; nothing outside the tests uses the `Unsafe` forms. The exceptions are the session store (`connect-pg-simple`, with its own `pg` pool) and backup and restore (`pg_dump` and `psql`).
- **Password hashing happens at the application layer**, not the database. Argon2id; see `backend/src/services/auth.ts`.
- **MFA backup codes are hashed** with Argon2id before storage (`backend/src/utils/backupCodes.ts`). Plaintext is shown to the user exactly once, at setup or when they regenerate them.
- **Session data is stored via `express-session` + `connect-pg-simple`**, in the `session` table (`LoginSession` above). The session middleware reads and writes it and makes it if it is missing; the schema describes it so that the migrations make it and `prisma db push` keeps it. Before 1.5.3 no migration made it, so `prisma migrate dev` reported drift on a database the backend had run against and offered to reset it, and `prisma db push` offered to drop the table; on a database that has applied every migration, neither does.
- **File paths are stored relatively** (e.g. `uploads/maps/global/<uuid>.png`) while `UPLOAD_DIR` is relative, as it is by default. Path-traversal mitigation lives at the upload layer.

# CozyVTT — API Reference

This document covers the CozyVTT REST API and WebSocket event protocol.

The backend also ships a full **OpenAPI 3.0 specification** at `backend/docs/API_DOCUMENTATION.yaml`. Load it into [Swagger UI](https://swagger.io/tools/swagger-ui/) or [Redoc](https://redocly.github.io/redoc/) for interactive documentation with request/response schemas.

---

## Table of Contents

1. [Authentication](#authentication)
2. [REST API Overview](#rest-api-overview)
3. [Auth Endpoints](#auth-endpoints)
4. [Campaign Endpoints](#campaign-endpoints)
5. [Token Template Endpoints](#token-template-endpoints)
6. [Campaign Export & Import Endpoints](#campaign-export--import-endpoints)
7. [Character Endpoints](#character-endpoints)
8. [Map & Token Endpoints](#map--token-endpoints)
9. [Creature Endpoints](#creature-endpoints)
10. [Asset Endpoints](#asset-endpoints)
11. [Invitation Endpoints](#invitation-endpoints)
12. [User & Admin Endpoints](#user--admin-endpoints)
13. [Config Endpoint](#config-endpoint)
14. [Setup Endpoint](#setup-endpoint)
15. [WebSocket Events](#websocket-events)
16. [Error Responses](#error-responses)
17. [Rate Limits](#rate-limits)

---

## Authentication

CozyVTT uses **session-based authentication**. The session cookie is set on login and must be included in every subsequent request (browsers do this automatically with `credentials: 'include'`).

### Session Cookie

- **Cookie name:** `cozyvtt.sid` (configured by `SESSION_SECRET`)
- **Flags:** `httpOnly`, `secure` (in production), `sameSite: lax`
- **Duration:** 24 hours standard; 30 days with "remember me"

### Error Responses for Unauthenticated Requests

```json
{
  "error": "Authentication required"
}
```
HTTP status: `401 Unauthorized`

### Error Responses for Insufficient Permissions

```json
{
  "error": "Forbidden"
}
```
HTTP status: `403 Forbidden`

---

## Scope of this document

This is a hand-written guide, not a complete catalogue. It covers the endpoints
people ask about most, with worked examples; it does **not** cover every route,
and it has drifted before — twelve endpoints in it described paths that no
longer exist, and were removed rather than corrected.

For the complete, checked list of every route the server mounts, see
[`backend/docs/API_DOCUMENTATION.yaml`](../backend/docs/API_DOCUMENTATION.yaml).
That file is verified against the code by `scripts/spec-coverage.py`, so it
cannot silently fall behind the way this one did.

These routes are also not a public API: they are not versioned and they carry no
compatibility promise, so any of them may change shape in a point release.

A program can still call them. There are no API keys or service accounts, but
signing in with a user's own email and password returns a session cookie that
authenticates both these routes and the Socket.io connection. A script doing
that is acting as that user, with exactly that user's permissions — see
[Authentication](#authentication) below.

## REST API Overview

All endpoints are prefixed with `/api`. Requests and responses use JSON (`Content-Type: application/json`) unless noted otherwise (file uploads use multipart/form-data).

### Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:4000` |
| Production | `https://your-domain.com` |

---

## Auth Endpoints

### `POST /api/auth/login`

Authenticate a user and create a session.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "your-password",
  "rememberMe": false
}
```

**Response (success):**
```json
{
  "user": {
    "id": "cuid...",
    "email": "user@example.com",
    "displayName": "Merric Thorngage",
    "platformRole": "USER",
    "mfaEnabled": false,
    "mustChangePassword": false
  }
}
```

**Response (MFA required):**
```json
{
  "mfaRequired": true
}
```
HTTP status: `200 OK` — client must follow up with `POST /api/auth/mfa/verify-login`.

---

### `POST /api/auth/logout`

Destroy the current session.

**Response:**
```json
{ "message": "Logged out successfully" }
```

---

### `POST /api/auth/register`

Create a new user account. Only available when `allowRegistration` is enabled in system settings.

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "displayName": "Gandalf the Gray"
}
```

**Response (success):**
```json
{
  "user": { ... }
}
```

**Response (pending approval):**
```json
{
  "pendingApproval": true,
  "message": "Account created. An administrator must approve your account before you can log in."
}
```

---

### `GET /api/auth/me`

Get the currently authenticated user.

**Response:**
```json
{
  "id": "cuid...",
  "email": "user@example.com",
  "displayName": "Merric Thorngage",
  "platformRole": "USER",
  "bio": "Professional dungeon delver.",
  "mfaEnabled": true,
  "isGlobalAssetManager": false,
  "mustChangePassword": false,
  "createdAt": "2025-01-15T12:00:00.000Z"
}
```

---

### `POST /api/auth/change-password`

Change the authenticated user's password.

**Request:**
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456!"
}
```

---

### `DELETE /api/auth/account`

Permanently delete the authenticated user's account and all associated data.

**Request:**
```json
{
  "password": "your-current-password",
  "confirmation": "DELETE"
}
```

---

### `GET /api/auth/appearance`

Returns the instance's appearance settings. **No authentication required** — the login page needs this to render the correct theme.

**Response:**
```json
{
  "themeId": "cozy-default",
  "customThemeColors": null,
  "fontId": "default",
  "customLogoUrl": null,
  "customFaviconUrl": null,
  "customMascotUrl": null
}
```

---

## Campaign Endpoints

### `GET /api/campaigns`

List all campaigns the authenticated user is a member of.

**Response:**
```json
[
  {
    "id": "cuid...",
    "name": "The Lost Mines",
    "description": "A classic starter adventure.",
    "gameSystem": "DND_5E",
    "status": "ACTIVE",
    "role": "DM",
    "createdAt": "2025-02-01T10:00:00.000Z"
  }
]
```

---

### `POST /api/campaigns`

Create a new campaign. The authenticated user becomes the DM.

**Request:**
```json
{
  "name": "Curse of Strahd",
  "description": "Gothic horror in Barovia.",
  "gameSystem": "DND_5E"
}
```

---

### `GET /api/campaigns/:id`

Get a single campaign's details. The embedded `maps` and `characters` arrays contain **metadata only** (id, name, and summary fields) — not full map token/wall/fog/light blobs or full character sheets. Fetch those on demand via `GET /api/campaigns/:campaignId/maps/:id` and `GET /api/characters/:id`.

---

### `PUT /api/campaigns/:id`

Update campaign properties (DM only).

**Request:** Partial campaign fields.

---

### `GET /api/campaigns/:id/characters`

Get all characters assigned to this campaign, with their assigned players.

**Response:**
```json
{
  "roster": [
    {
      "characterId": "cuid...",
      "characterName": "Elara Moonwhisper",
      "gameSystem": "DND_5E",
      "userId": "cuid...",
      "userDisplayName": "Alice"
    }
  ]
}
```

---

### `GET /api/campaigns/:id/messages`

Get chat history for a campaign. Supports cursor-based pagination.

**Query params:**
- `limit` — number of messages to return (default: 50, max: 100)
- `before` — message ID to paginate before (for "load more" scrollback)

### `POST /api/campaigns/:campaignId/invite`

Invite a user to the campaign. **Requires DM role.**

**Body:**
- `userId` *(required)* — the user to invite; they must already have an account
- `sendEmail` *(optional, default `false`)* — whether to email them as well. Only an explicit `true` counts
- `expiresInDays` *(optional)* — invitation lifetime; omitted means it does not expire

**Response `201`:** `{ message, invitation, emailSent }`

The invitation is created whether or not an email goes out — it is what the invitee accepts from, on their dashboard. `emailSent` reports what actually happened: it is `false` when the caller did not ask, when the instance has no SMTP configured, and when the send failed. A failed send is logged and does not fail the request, because the invitation already exists by that point. This is deliberately unlike `POST /api/admin/users/invite`, which refuses outright without SMTP because there an email is the only way in.

### `DELETE /api/campaigns/:campaignId/messages/join-leave`

Remove the legacy "X has joined / has left the campaign" system messages from a campaign's chat. **Requires DM role.**

**Response `200`:** `{ message, deleted }` — `deleted` is the row count, `0` when there was nothing to clear.

These messages are no longer written: they fired on every socket authentication and every disconnect, so a page load, a refresh or a brief network drop each added a permanent row, and presence in the roster now conveys the same thing. Rows already in the database are deliberately **not** removed on upgrade — a chat log is a record of a session — so this is how a DM clears the backlog deliberately.

Matching is on `metadata.action` (`user.joined` / `user.left`), **not** on the message text: the wording is display copy that could change or be translated, while the action tag is what the writer meant. Other system messages and the conversation itself are untouched.

### `GET /api/campaigns/:campaignId/dice-rolls`

Roll history for a campaign, newest first. **Requires campaign membership.**

**Query params:**
- `limit` — rolls to return (default: 50, max: 100)
- `offset` — rolls to skip (default: 0)

**Response `200`:** `{ rolls, pagination }`, each roll `{ id, userId, userName, characterName, expression, result, breakdown, purpose, secret, timestamp }`.

**Visibility is enforced here, not in the client.** A DM receives every roll in the campaign. Anyone else receives public rolls plus their *own* secret rolls, and never another user's — matching what the live `dice.rolled` socket event delivers. Filtering client-side would still have put the rolls on the wire, so the rule lives in the query.

Rolls made before the DM last cleared the history are excluded (see `Campaign.rollHistoryClearedAt`). They remain in the table: clearing hides rolls from this endpoint rather than deleting them, so the secret-roll audit trail survives an accidental Clear.

Note that rolls made while a session is **paused** are evaluated client-side and never persisted, so they never appear here.

---

## Token Template Endpoints

All token template endpoints are scoped under a campaign and require DM role.

### `GET /api/campaigns/:campaignId/token-templates`

List all token templates for a campaign.

**Query params:**
- `search` — filter by name (optional)
- `type` — filter by token type: `npc`, `player`, `object` (optional)

---

### `GET /api/campaigns/:campaignId/token-templates/:id`

Get a single token template by ID.

---

### `POST /api/campaigns/:campaignId/token-templates`

Create a new token template.

**Request:**
```json
{
  "name": "Goblin Archer",
  "imageUrl": "/api/assets/tokens/uuid",
  "type": "npc",
  "disposition": "hostile",
  "displayMode": "pog",
  "size": { "width": 1, "height": 1 },
  "hp": { "current": 12, "max": 12, "temp": 0 },
  "showHpBar": true,
  "notes": "Ranged attacker",
  "statBlock": { ... },
  "sightRadius": 12
}
```

---

### `PUT /api/campaigns/:campaignId/token-templates/:id`

Update an existing token template. Accepts partial fields.

---

### `DELETE /api/campaigns/:campaignId/token-templates/:id`

Delete a token template.

---

### `POST /api/campaigns/:campaignId/token-templates/from-token`

Save a token from the map as a new template. Accepts the same body as create, but typically populated from an existing token's properties.

---

### `POST /api/campaigns/:campaignId/token-templates/:id/copy-to/:targetCampaignId`

Copy a token template to another campaign. Requires DM role in both the source and target campaigns.

**Response:**
```json
{
  "message": "Template copied successfully",
  "template": { ... }
}
```

---

## Campaign Export & Import Endpoints

### `GET /api/campaigns/:campaignId/export`

Export a campaign as a `.cozyvtt` ZIP archive. Requires DM role. Rate limited to 1 per 5 minutes per user.

**Query params:**
- `includeAudio` — `true` to include audio assets (default: `false`)
- `includeTokens` — `false` to exclude tokens on maps (default: `true`)

**Response:** Binary ZIP file with `Content-Type: application/zip` and `Content-Disposition: attachment`.

---

### `POST /api/campaigns/import/preview`

Upload a `.cozyvtt` archive and return its manifest preview without creating anything. Requires authentication.

**Request:** `multipart/form-data` with field `file` containing the archive.

**Response:**
```json
{
  "preview": {
    "formatVersion": 1,
    "exportedAt": "2026-04-18T12:00:00.000Z",
    "exportedFrom": "CozyVTT v1.3.0",
    "campaignName": "The Lost Mines",
    "gameSystem": "DND_5E",
    "mapCount": 5,
    "tokenCount": 42,
    "creatureCount": 12,
    "tokenTemplateCount": 8,
    "assetCount": 20,
    "includesAudio": false,
    "totalSizeBytes": 52428800
  }
}
```

---

### `POST /api/campaigns/import`

Import a `.cozyvtt` archive and create a new campaign. Requires authentication. Rate limited to 1 per 5 minutes per user.

**Request:** `multipart/form-data` with fields:
- `file` — the `.cozyvtt` archive (required)
- `campaignName` — override the campaign name (optional, string)
- `importTokens` — `false` to skip token import (optional, default `true`)

**Response:**
```json
{
  "message": "Campaign imported successfully",
  "campaignId": "uuid",
  "campaignName": "The Lost Mines",
  "mapCount": 5,
  "tokenCount": 42,
  "creatureCount": 12,
  "tokenTemplateCount": 8
}
```

---

## Character Endpoints

### `GET /api/characters`

List all characters owned by the authenticated user.

---

### `POST /api/characters`

Create a new character.

**Request:**
```json
{
  "name": "Thorin Ironforge",
  "gameSystem": "DND_5E",
  "data": {
    "name": "Thorin Ironforge",
    "class": "Fighter",
    "level": 1
  }
}
```

---

### `GET /api/characters/:id`

Get a single character. Returns full character data including the JSON sheet data.

---

### `PUT /api/characters/:id`

Save character data. Accepts partial data — only provided fields are updated.

**Request:**
```json
{
  "data": {
    "name": "Thorin Ironforge",
    "hitPoints": { "current": 10, "maximum": 12 }
  },
  "tokenImageUrl": "https://..."
}
```

---

### `DELETE /api/characters/:id`

Delete a character. Only the owner can delete.

---

### `POST /api/characters/:id/assign`

Assign a character to a campaign.

**Request:**
```json
{ "campaignId": "cuid..." }
```

---

## Map & Token Endpoints

### `GET /api/campaigns/:id/maps`

List all maps in a campaign.

---

### `POST /api/campaigns/:id/maps`

Create a new map (DM only).

**Request:**
```json
{
  "name": "Goblin Cave Level 1",
  "assetId": "cuid-of-map-asset"
}
```

---

## Character Template Endpoints

Shareable starter sheets, mounted under `/api/character-templates`.

> **Not the same as `GET /api/characters/templates/:gameSystem/:templateName`.**
> That route serves the *hardcoded* starter presets compiled into the backend
> (`blank`, `fighter`, and so on). The endpoints below are user-published
> templates stored in the database.

**Visibility is not filtered.** Every template is readable by every
authenticated user — that is the point of the feature. What varies is who may
write:

| Operation | Who |
|---|---|
| List, get | any authenticated user |
| Create | any authenticated user |
| Update, delete | the author, a platform admin, or a user with `templateEditor` |

`templateEditor` is a boolean on `User`, granted by an admin through
`PUT /api/users/:id` in the same way as `globalAssetManager`. It defaults to
`false`, and is read fresh on each request rather than cached in the session, so
revoking it takes effect immediately.

### `GET /api/character-templates`

Query parameters: `search` (name contains, case-insensitive), `gameSystem` (a
`GameSystem` value, or `flexible` for system-agnostic templates), `mine`
(`true` to return only your own), `limit` (max 100, default 50), `offset`.

**Response:** `{ templates, total, limit, offset }`. Each template includes
`createdBy: { id, displayName }` — never the author's email.

### `GET /api/character-templates/:id`

### `POST /api/character-templates`

```json
{
  "name": "Novice Fighter",
  "description": "A straightforward melee character",
  "gameSystem": "DND_5E",
  "tokenImageUrl": "/api/assets/tokens/uuid",
  "data": { }
}
```

- `name` is required; `gameSystem` may be null for a flexible template.
- `data` is validated against the game system's schema exactly as a character's
  is. A flexible template accepts free-form JSON, matching `Character`.
- **`tokenImageUrl` must reference a `GLOBAL` asset.** A template is visible to
  everyone, so a `USER`- or `CAMPAIGN`-scoped image would 403 for other readers
  and show as broken. A non-global asset returns `400` with an explanation.

### `PUT /api/character-templates/:id`

Accepts `name`, `description`, `tokenImageUrl`, `data`. An empty body returns
`400`. `gameSystem` is fixed at creation, as it is for a character — the sheet
data is only meaningful against the system it was built for.

### `DELETE /api/character-templates/:id`

### Creating a character from a template

There is no dedicated endpoint. The client reads the template and posts its
`data`, `gameSystem` and `tokenImageUrl` to `POST /api/characters` — the
resulting character belongs to whoever made the request, not to the template's
author.

---

## Creature Endpoints

All creature endpoints are mounted under `/api/campaigns/:campaignId/creatures`.

**`imageUrl` on create, update and duplicate** accepts either a bare asset id or a full
`/api/assets/tokens/:id` path, and is stored normalised to the full path — the same treatment
characters, maps and map tokens already receive. Send `""` to clear it. Rows written before this
normalisation may still hold a bare id, so clients should tolerate both when reading.

### `GET /api/campaigns/:id/creatures`

List creature templates available in this campaign (SRD + campaign-specific custom creatures). Any campaign member can list.

**Query params:**
- `search` — Filter by name (case-insensitive partial match)
- `source` — Filter by `srd` or `custom`
- `cr` — Filter by challenge rating
- `gameSystem` — Filter by game system
- `limit` — Results per page (default: 50, max: 100)
- `offset` — Pagination offset (default: 0)

**Response:**
```json
{
  "creatures": [ ... ],
  "total": 325,
  "limit": 50,
  "offset": 0
}
```

---

### `GET /api/campaigns/:id/creatures/:creatureId`

Get a single creature template. Any campaign member can view.

---

### `POST /api/campaigns/:id/creatures`

Create a new custom creature template (DM only).

**Request:**
```json
{
  "name": "Fire Elemental (Custom)",
  "statBlock": { "ac": 13, "hpMax": 102, ... },
  "challengeRating": "5",
  "creatureType": "elemental",
  "size": { "width": 2, "height": 2 },
  "disposition": "hostile",
  "displayMode": "pog"
}
```

---

### `PUT /api/campaigns/:id/creatures/:creatureId`

Update a custom creature template (DM only). Cannot edit SRD creatures — returns `403`.

Accepts any subset of the create fields; an empty body returns `400`.

---

### The `statBlock` object

One shape shared by every game system, with system-specific fields left optional.
Used by creature templates, token templates and map tokens alike. Validated on
every write — see [Stat block validation](#stat-block-validation).

| Field | Type | Notes |
|---|---|---|
| `ac` | number | Required. 0–99 |
| `speed` | string | Required |
| `abilities` | object | Required. `str`/`dex`/`con`/`int`/`wis`/`cha`, each 0–30. Ability **scores** (D&D 5e's model) |
| `hpMax`, `hitDice` | number, string | Optional |
| `attributeModifiers` | object | Optional. Same six keys, each −10 to +20. Ability **modifiers**, for systems that print modifiers instead of scores (Pathfinder 2e) |
| `challengeRating` | string | Optional. `"0"`, `"1/8"`, `"1/4"`, `"1/2"`, `"1"`–`"30"`. In D&D 5e this determines the proficiency bonus |
| `level` | number | Optional, −1 to 30. Creature level, for systems that rate by level rather than CR |
| `savingThrows` | object | Optional. Keys to **final totals**, each −50 to +50 |
| `skills` | object | Optional. Same shape as `savingThrows` |
| `proficiencies` | object | Optional. Why each total is what it is — see below |
| `gameSystem` | string | Optional |

`savingThrows` and `skills` keys are **not enumerated**, because the stat block is
shared across systems: D&D 5e uses the six ability keys (`str`…`cha`), Pathfinder
2e uses `fortitude`/`reflex`/`will`, and skills may be canonical camelCase
(`sleightOfHand`) or a custom name. Which keys are *offered* is a client concern.

**`proficiencies`** — all optional:

```json
{
  "proficiencies": {
    "bonusOverride": 4,
    "saves":  { "wis": "proficient" },
    "skills": { "perception": "expertise", "stealth": "custom" }
  }
}
```

- Levels are `"none"`, `"proficient"`, `"expertise"` or `"custom"`.
- `bonusOverride` (0–9) replaces the proficiency bonus that would be derived from
  Challenge Rating.
- `"custom"` marks a total that is set explicitly rather than derived.

The totals in `savingThrows` and `skills` remain the values that are displayed and
rolled; `proficiencies` records the reasoning behind them. **The whole object is
optional and stat blocks written before it existed are fully valid** — absent
metadata means the stored totals are taken as given.

### Stat block validation

Enforced on every creature, token-template and campaign-import write:

- Save and skill bonuses: integers, −50 to +50, at most 60 entries per record.
  The range is a cross-system backstop against absurd data, not a rules check —
  Pathfinder 2e modifiers legitimately exceed +30 at high level, so a bound
  fitted to D&D 5e would reject real creatures.
- Ability scores: integers 0–30. Attribute modifiers: −10 to +20.
- Unknown top-level keys are preserved, so older stat blocks survive a round trip.

Failures return `400` with `{ "error": "Validation Error", "message": "..." }`.

---

### `DELETE /api/campaigns/:id/creatures/:creatureId`

Delete a custom creature template (DM only). Cannot delete SRD creatures — returns `403`.

---

### `POST /api/campaigns/:id/creatures/:creatureId/duplicate`

Duplicate any creature (including SRD) as a new custom creature in this campaign (DM only). The duplicate gets `source: 'custom'` and `(Custom)` appended to the name.

**Response:** `201` with the new creature template.

---

### `GET /api/campaigns/:id/creatures/favorites/list`

List the current user's favorited creatures in this campaign. Any campaign member can list their own favorites.

**Response:**
```json
{
  "favoriteIds": ["uuid-1", "uuid-2"],
  "creatures": [ ... ]
}
```

---

### `POST /api/campaigns/:id/creatures/:creatureId/favorite`

Toggle favorite for the current user in this campaign. If already favorited, removes the favorite; otherwise, adds it.

**Response:**
```json
{ "favorited": true }
```

---

### `GET /api/campaigns/:id/creatures/seed/status`

Check whether SRD creatures have been seeded. Any campaign member can check.

**Response:**
```json
{
  "seeded": true,
  "count": 325,
  "seedInProgress": false
}
```

---

### `POST /api/campaigns/:id/creatures/seed`

Seed SRD creatures from Open5e (DM only). Safe to call multiple times — existing SRD creatures are not duplicated. Returns `409` if seeding is already in progress.

SRD creatures stored before hit points were tracked are updated in place with `hpMax` and `hitDice`; only those missing keys are added, and custom creatures are never modified.

**Response:**
```json
{
  "message": "SRD creature seeding complete",
  "fetched": 322,
  "created": 0,
  "updated": 322,
  "skipped": 0,
  "alreadyExisted": 322
}
```

---

## Asset Endpoints

### `GET /api/assets`

List assets accessible to the authenticated user (Global + their own User scope + Campaign scope for their campaigns).

**Query params:**
- `type` — filter by `MAP`, `TOKEN`, `AUDIO`, `AVATAR`
- `scope` — filter by `GLOBAL`, `USER`, `CAMPAIGN`
- `search` — search by name or tags
- `campaignId` — required when filtering by `CAMPAIGN` scope
- `sort` — `date` (default), `name`, `size`
- `page` — pagination page (default: 1)
- `limit` — items per page (default: 25)

---

### `POST /api/assets/upload`

Upload a new asset. Uses `multipart/form-data`.

**Form fields:**
- `file` — the file (required)
- `type` — `MAP`, `TOKEN`, `AUDIO`, or `AVATAR` (required)
- `scope` — `GLOBAL`, `USER`, or `CAMPAIGN` (required)
- `name` — display name (required)
- `campaignId` — required when `scope` is `CAMPAIGN`
- `tags` — comma-separated list of tags (optional)

---

### `GET /api/assets/:id`

Get a single asset's metadata.

---

### `GET /api/assets/avatars/:userId`

Get the current avatar for a user. Returns the image file directly.

---

### `DELETE /api/assets/:id`

Delete an asset and its files from disk.

Who may delete depends on the asset's scope:

| Scope | Who may delete |
|---|---|
| `GLOBAL` | A platform admin, or the uploader if they hold `globalAssetManager`. The permission covers your own global uploads — it does not let you remove another manager's |
| `USER` | The owner, or a platform admin |
| `CAMPAIGN` | The uploader, that campaign's DM, or a platform admin |

`globalAssetManager` is read from the database on each request rather than the
session, so revoking it takes effect immediately.

---

## Invitation Endpoints

### `GET /api/invitations`

List pending invitations for the authenticated user.

---

### `POST /api/invitations/:id/accept`

Accept a campaign invitation and optionally assign characters.

**Request:**
```json
{ "characterIds": ["cuid-1", "cuid-2"] }
```

---

### `POST /api/invitations/:id/decline`

Decline a campaign invitation.

---

## User & Admin Endpoints

### `GET /api/users` *(Admin only)*

List all users on the platform.

---

### `POST /api/admin/users` *(Admin only)*

Create a new user account with a generated temporary password. The account is flagged
`mustChangePassword`, so that password can only be used to set a real one.

**Request:**
```json
{
  "email": "newplayer@example.com",
  "displayName": "New Player",
  "platformRole": "USER"
}
```

**Response:**
```json
{
  "message": "User created. Sign-in details were emailed to newplayer@example.com.",
  "user": { "id": "…", "email": "newplayer@example.com", "…": "…" },
  "emailSent": true
}
```

`temporaryPassword` is included **only when `emailSent` is false** — that is, when SMTP is not configured or delivery failed and the admin has no other way to hand it over. When the welcome email went out, the password is withheld so the admin never holds a working credential for another account.

---

### `POST /api/admin/users/invite` *(Admin only)*

Invite a user by email. The account is created **without a usable password**; the emailed link is the only way in, and it expires in **7 days**. Nothing password-related is returned.

Requires SMTP — returns `503` when it isn't configured. If the email fails to send, the account is rolled back rather than left unreachable (`502`).

**Request:**
```json
{
  "email": "newplayer@example.com",
  "displayName": "New Player",
  "platformRole": "USER"
}
```

**Response:**
```json
{
  "message": "Invitation sent to newplayer@example.com",
  "user": { "id": "…", "email": "newplayer@example.com", "…": "…" },
  "expiresInDays": 7
}
```

The recipient opens `/accept-invite?token=…` and sets a password, which is completed through `POST /api/auth/reset-password` — invitations and resets share the same token machinery.

---

### `POST /api/admin/users/:id/resend-invite` *(Admin only)*

Issue a fresh invitation link, invalidating any outstanding one. Requires SMTP (`503` otherwise).

**Response:**
```json
{
  "message": "Invitation resent to newplayer@example.com",
  "expiresInDays": 7
}
```

---

### `PUT /api/users/:id` *(Admin only)*

Update a user's platform role or approval status.

---

### `POST /api/users/:id/reset-password` *(Admin only)*

Generate a temporary password for a user. The account is flagged `mustChangePassword`, and **any
sessions the user currently has open are signed out** — otherwise they would keep browsing on the
old session and the forced change would only apply at their next login.

**Response:**
```json
{
  "message": "Password reset successfully.",
  "temporaryPassword": "Temp-abc123"
}
```

---

### `DELETE /api/users/:id` *(Admin only)*

Delete a user account and all associated data.

---

### `GET /api/users/:id/preferences`

Get the user's per-user appearance preferences (theme + font). Returns an empty object if the user has not customized any preferences yet — clients should fall back to the system defaults from `GET /api/auth/appearance`.

**Authorization:** users can fetch their own preferences; admins can fetch any user's.

**Response:**
```json
{
  "preferences": {
    "themeId": "obsidian-night",
    "fontId": "medieval",
    "customThemeColors": null
  }
}
```

---

### `PUT /api/users/:id/preferences`

Partial-merge update of the user's preferences. Send any subset of fields — the server merges them into the stored JSON blob.

**Authorization:** users can update their own preferences; admins can update any user's.

**Allowed fields:**
- `themeId` — one of the 16 preset theme ids (`cozy-default`, `obsidian-night`, etc.) or the sentinel `"custom"`
- `customThemeColors` — `{ primary, accent, background, text }` as `#RRGGBB`; required when `themeId === "custom"`, ignored otherwise (frontend sends `null` to clear)
- `fontId` — one of the 8 font ids (`default`, `medieval`, `elegant`, `modern`, `handwritten`, `clean`, `scholarly`, `gothic`)

**Request:**
```json
{
  "themeId": "obsidian-night",
  "fontId": "medieval"
}
```

**Response:**
```json
{
  "message": "Preferences updated successfully",
  "preferences": { "themeId": "obsidian-night", "fontId": "medieval" }
}
```

Unknown fields are stripped silently. Empty payloads are rejected with `400 Bad Request`.

---

### `GET /api/admin/stats` *(Admin only)*

Get platform statistics (user count, active campaigns, storage usage, etc.).

---

### `GET /api/admin/settings` *(Admin only)*

Get system configuration settings.

---

### `PUT /api/admin/settings` *(Admin only)*

Update system configuration settings.

---

### `GET /api/admin/backups` *(Admin only)*

List available database backups.

---

### `POST /api/admin/backups` *(Admin only)*

Create a new database backup (pg_dump).

---

### `DELETE /api/admin/backups/:filename` *(Admin only)*

Delete a database backup file.

---

### `POST /api/admin/backups/restore` *(Admin only)*

Restore a database backup. **Destructive — overwrites all current data.**

---

## Config Endpoint

### `GET /api/config`

Public. Returns the upload limits the server enforces, derived from the `MAX_<TYPE>_SIZE_MB` environment variables, and whether the instance can send email. The SPA reads these at runtime, so changing a limit takes a restart rather than a frontend rebuild.

**Response:**
```json
{
  "uploadLimits": {
    "MAP": 52428800,
    "TOKEN": 5242880,
    "AUDIO": 20971520,
    "AVATAR": 2097152
  },
  "maxUploadBytes": 52428800,
  "smtp": { "configured": true }
}
```

Sizes are in bytes. `maxUploadBytes` is the largest configured limit — the cap applied while parsing an upload, before the asset type is known. See [Upload Size Limits](DEPLOYMENT.md#upload-size-limits) for the environment variables and the matching reverse-proxy setting.

`smtp.configured` is a bare boolean and deliberately nothing more — the host, port, username and TLS mode stay on the admin-only `GET /api/admin/config`. It exists so the campaign invite dialog can disable its "also email them" option on an instance with no mail server, which a campaign DM could not otherwise discover, since a DM is not necessarily a platform admin.

---

## Setup Endpoint

### `GET /api/setup/status`

Check whether the setup wizard has been completed.

**Response:**
```json
{ "setupComplete": false }
```

---

## WebSocket Events

Described in one place rather than three:
[`backend/docs/WEBSOCKET_DOCUMENTATION.md`](../backend/docs/WEBSOCKET_DOCUMENTATION.md)
— the connection and authentication handshake, a worked example of the
token-movement flow, and a generated inventory of every event the server
listens for or emits.

## Error Responses

All error responses follow this shape:

```json
{
  "error": "Short error title",
  "message": "Human-readable description of what went wrong."
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request — validation error; `message` contains details |
| `401` | Unauthenticated — no active session |
| `403` | Forbidden — insufficient permissions |
| `404` | Not found |
| `409` | Conflict — e.g., email already in use |
| `429` | Rate limit exceeded |
| `500` | Server error — check server logs |
| `502` | Upstream failure — e.g., an invitation email could not be delivered |
| `503` | Feature unavailable — e.g., an email-dependent endpoint with no SMTP configured |

### Password change required

Accounts an admin created, or whose password an admin reset, must set a new password before doing
anything else. Until they do, **every endpoint except the ones needed to change it** returns:

```json
{
  "error": "Password Change Required",
  "code": "PASSWORD_CHANGE_REQUIRED",
  "message": "You must set a new password before continuing."
}
```

Status `403`. Still reachable while in this state: `POST /api/auth/change-password`,
`POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/ping`, `GET /api/auth/appearance`, and
`GET /api/config`. WebSocket connections are refused on the same basis.

Clients should route on `code`, not the message — the web app redirects to its change-password screen
when it sees it.

---

## Rate Limits

| Endpoint Group | Limit | Window | Counts |
|----------------|-------|--------|--------|
| Login, password reset, MFA | 5 requests | 15 minutes | Failures only |
| Register | 10 requests | 1 hour | Every request |
| Forgot password | 5 requests | 15 minutes | Every request |
| File upload | 30 requests | 1 minute | Every request |
| General API | 300 requests | 1 minute | Every request |
| Dice rolls (WebSocket) | 30 rolls | 1 minute | Every roll |
| Token movement (WebSocket) | 60 events | 1 second | Every event |

The **Counts** column matters. Where only failures count, signing in correctly
never uses up the allowance — otherwise a household sharing one address could
lock itself out by logging in normally. Where every request counts, the success
is the thing being limited: sending a password-reset email, or creating an
account.

Chat messages are not on this list because they are limited per campaign rather
than globally: a DM can switch on a cooldown of between 1 and 300 seconds
between messages, and it is **off by default**.

The upload and general-API limits are configurable with the
`ASSET_UPLOAD_RATE_LIMIT` and `RATE_LIMIT_MAX_REQUESTS` environment variables;
the rest are fixed.

Rate limit responses return HTTP `429` with a `Retry-After` header indicating when the limit resets.

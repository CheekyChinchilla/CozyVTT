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
HTTP status: `200 OK` — client must follow up with `POST /api/mfa/verify-login`.

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

Get a single campaign's details. The embedded `maps` and `characters` arrays contain **metadata only** (id, name, and summary fields) — not full map token/wall/fog/light blobs or full character sheets. Fetch those on demand via `GET /api/maps/:id` and `GET /api/characters/:id`.

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
    "exportedFrom": "CozyVTT v1.1.2",
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

### `DELETE /api/characters/:id/assign`

Unassign a character from its current campaign.

---

### `GET /api/characters/templates/:gameSystem`

Get character templates for a given game system.

**URL example:** `GET /api/characters/templates/DND_5E`

**Response:**
```json
{
  "templates": [
    {
      "id": "DND_5E_blank",
      "name": "Blank Character",
      "description": "Empty character sheet",
      "data": { ... }
    },
    {
      "id": "DND_5E_example",
      "name": "Example Hero",
      "description": "A pre-filled example character",
      "data": { ... }
    }
  ]
}
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

### `PUT /api/maps/:id`

Update a map's properties or token list (DM only).

---

### `DELETE /api/maps/:id`

Delete a map. Cannot delete the currently active map.

---

### `POST /api/maps/:id/tokens`

Place a new token on a map (DM only).

**Request:**
```json
{
  "name": "Goblin Archer",
  "tokenType": "NPC",
  "assetId": "cuid...",
  "imageUrl": "/api/assets/tokens/uuid",
  "position": { "x": 5, "y": 3 },
  "hp": { "current": 7, "maximum": 7 },
  "size": { "width": 1, "height": 1 },
  "disposition": "hostile",
  "displayMode": "pog",
  "statBlock": { "ac": 15, "hpMax": 7, ... },
  "creatureTemplateId": "cuid...",
  "spiritLayer": false
}
```

Additional fields:
- `imageUrl` — Token image URL (use `/api/assets/tokens/:id` format). Set to `""` to clear.
- `displayMode` — `"pog"`, `"top-down"`, or `"full-art"`
- `statBlock` — Game-system-agnostic NPC stat block (AC, HP, attacks, etc.)
- `creatureTemplateId` — Links the token to a creature template for library integration

---

## Creature Endpoints

All creature endpoints are mounted under `/api/campaigns/:campaignId/creatures`.

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

### `GET /api/assets/:id/file`

Serve the asset file. Returns the binary file with appropriate Content-Type.

---

### `GET /api/assets/avatars/:userId`

Get the current avatar for a user. Returns the image file directly.

---

### `PUT /api/assets/:id`

Update asset metadata (name, tags, scope).

---

### `DELETE /api/assets/:id`

Delete an asset and its files from disk.

---

## Invitation Endpoints

### `GET /api/invitations`

List pending invitations for the authenticated user.

---

### `POST /api/campaigns/:id/invitations`

Invite a user to a campaign (DM only).

**Request:**
```json
{ "email": "player@example.com" }
```

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

### `GET /api/users/profile`

Get the authenticated user's profile.

---

### `PUT /api/users/profile`

Update display name and bio.

**Request:**
```json
{
  "displayName": "Merric Thorngage",
  "bio": "Professional dungeon delver."
}
```

---

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

### `GET /api/admin/backups/:filename` *(Admin only)*

Download a database backup file.

---

### `DELETE /api/admin/backups/:filename` *(Admin only)*

Delete a database backup file.

---

### `POST /api/admin/backups/restore` *(Admin only)*

Restore a database backup. **Destructive — overwrites all current data.**

---

## Config Endpoint

### `GET /api/config`

Public. Returns the upload limits the server enforces, derived from the `MAX_<TYPE>_SIZE_MB` environment variables. The SPA reads these at runtime, so changing a limit takes a restart rather than a frontend rebuild.

**Response:**
```json
{
  "uploadLimits": {
    "MAP": 52428800,
    "TOKEN": 5242880,
    "AUDIO": 20971520,
    "AVATAR": 2097152
  },
  "maxUploadBytes": 52428800
}
```

Sizes are in bytes. `maxUploadBytes` is the largest configured limit — the cap applied while parsing an upload, before the asset type is known. See [Upload Size Limits](DEPLOYMENT.md#upload-size-limits) for the environment variables and the matching reverse-proxy setting.

---

## Setup Endpoint

### `GET /api/setup/status`

Check whether the setup wizard has been completed.

**Response:**
```json
{ "setupComplete": false }
```

---

### `POST /api/setup/complete`

Complete the first-time setup wizard. Only works when setup has not been completed.

**Request:**
```json
{
  "adminEmail": "admin@example.com",
  "adminPassword": "StrongPassword123!",
  "adminDisplayName": "The Admin",
  "instanceName": "The Hearthstone Tavern",
  "timezone": "America/New_York",
  "allowRegistration": false
}
```

---

## WebSocket Events

CozyVTT uses Socket.io for real-time communication. See `backend/docs/WEBSOCKET_DOCUMENTATION.md` for protocol-level details.

### Connection Sequence

```
Client → Server: socket.connect()
Server → Client: emit('connected')
Client → Server: emit('authenticate', { campaignId })
Server → Client: emit('authenticated')   ← connection ready
```

### Client → Server Events

| Event | Payload | Notes |
|-------|---------|-------|
| `authenticate` | `{ campaignId }` | Must be first event after `connected` |
| `sync.request` | `{ lastEventId? }` | Request current campaign state |
| `token.move.start` | `{ tokenId, position }` | Begin drag |
| `token.move` | `{ tokenId, position }` | Throttled 60fps during drag |
| `token.move.end` | `{ tokenId, position }` | End drag (persists position) |
| `dice.roll` | `{ expression, isSecret }` | Roll dice |
| `dice.clearHistory` | — | DM only — clear roll history |
| `chat.message` | `{ content, type }` | Send a chat message |
| `session.start` | `{ notes? }` | DM — start a session |
| `session.pause` | — | DM — pause session |
| `session.end` | `{ saveState }` | DM — end session |
| `map.change` | `{ mapId }` | DM — switch active map |
| `spirit_layer.toggle` | `{ enabled }` | DM — toggle spirit layer |
| `spirit_layer.token.toggle` | `{ mapId, tokenId, visible }` | DM — toggle token spirit visibility |
| `spirit_layer.style_change` | `{ style }` | DM — change spirit layer style |
| `atmosphere.effect.set` | `{ effect }` | DM — set visual atmosphere effect |
| `atmosphere.audio.set` | `{ assetId, volume, loop }` | DM — set ambient audio |
| `vibe.update` | `{ periodId }` | DM — update vibe tracker |
| `character.hp.update` | `{ tokenId, current, maximum, temp? }` | Update a token's HP |
| `initiative.add` | `{ tokenId, mapId }` | DM — add a map token as a combatant |
| `initiative.remove` | `{ tokenId }` | DM — remove combatant |
| `initiative.set` | `{ tokenId, mapId, value }` | DM — set initiative value (persisted on the token) |
| `initiative.roll` | `{ tokenId, mapId, expression, characterName? }` | DM — roll initiative; also emits `dice.rolled` |
| `initiative.reorder` | `{ orderedTokenIds }` | DM — reorder combatants |
| `initiative.start` | — | DM — start combat |
| `initiative.next` | — | DM — advance to next turn |
| `initiative.end` | — | DM — end combat |
| `initiative.request_state` | — | Request current initiative state (any role) |
| `map.ping` | `{ mapId, x, y }` | Point at a map location (any role). Coordinates are map pixels, not grid cells. Rate limited to 10 per 10s per user; excess is dropped silently |
| `light:add` | `{ mapId, light: LightSource }` | DM — place a light source |
| `light:update` | `{ mapId, light: LightSource }` | DM — update light properties |
| `light:remove` | `{ mapId, lightId }` | DM — delete a light source |
| `lights:replace` | `{ mapId, lights: LightSource[] }` | DM — bulk-replace all lights |
| `lights:request` | `{ mapId }` | Request current light sources |
| `ping` | — | Heartbeat |

---

### Server → Client Events

| Event | Payload | Who receives it |
|-------|---------|----------------|
| `connected` | — | Connecting client |
| `authenticated` | — | Connecting client (on auth success) |
| `sync.state` | Full campaign state | Requesting client |
| `token.moved` | `{ tokenId, position, userId }` | All campaign members |
| `dice.rolled` | `{ expression, result, rolls, userId, userName, type }` | All campaign members |
| `dice.rolled.secret` | Same as above | DM only |
| `dice.historyCleared` | — | All campaign members |
| `chat.message` | `{ content, type, userId, userName, timestamp }` | All campaign members |
| `chat.system` | `{ content, metadata, timestamp }` | All campaign members |
| `map.changed` | `{ mapId, mapData }` | All campaign members (filtered per-client) |
| `session.started` | `{ sessionId, startedAt }` | All campaign members |
| `session.paused` | — | All campaign members |
| `session.ended` | `{ message }` | All campaign members |
| `session.resumed` | — | All campaign members |
| `spirit_layer.toggled` | `{ enabled }` | All campaign members |
| `spirit_layer.token.toggled` | `{ tokenId, visible }` | All campaign members |
| `spirit_layer.style_changed` | `{ style }` | All campaign members |
| `atmosphere.effect.updated` | `{ effect }` | All campaign members |
| `atmosphere.audio.updated` | `{ assetId, volume, loop, url }` | All campaign members |
| `vibe.updated` | `{ periodId, period }` | All campaign members |
| `character.hp.updated` | `{ tokenId, current, maximum, temp }` | All campaign members |
| `initiative.state` | Full `CombatState` object | All campaign members |
| `map.pinged` | `{ mapId, x, y, userId }` | All campaign members (including the sender) |
| `light:added` | `{ mapId, light: LightSource }` | All campaign members |
| `light:updated` | `{ mapId, light: LightSource }` | All campaign members |
| `light:removed` | `{ mapId, lightId }` | All campaign members |
| `lights:replaced` | `{ mapId, lights: LightSource[] }` | All campaign members |
| `pong` | — | Pinging client |
| `error` | `{ message }` | Sending client |

#### CombatState Object

Held in memory per campaign and re-broadcast in full on every mutation — clients replace their copy
rather than patching it. Not persisted: combat resets when the server restarts, though the per-token
`initiative` values survive in the map's token data.

```json
{
  "active": true,
  "round": 2,
  "currentTokenId": "uuid",
  "combatants": [
    {
      "tokenId": "uuid",
      "name": "Goblin",
      "imageUrl": "/uploads/tokens/goblin.png",
      "initiative": 14,
      "hp": { "current": 5, "max": 7, "temp": 0 },
      "type": "npc",
      "disposition": "hostile"
    }
  ]
}
```

`currentTokenId` identifies the acting combatant; clients use it to highlight both the tracker row
and the token on the map. It is `null` before combat starts.

#### Map Ping

Nothing is persisted — the ping is broadcast and forgotten, and each client expires its own copy
after ~1.6s. Only the sender's `userId` is on the wire: clients already hold the campaign roster, so
they resolve the display name and derive the identity colour locally rather than costing a database
round-trip on a gesture people will repeat.

Pings are **not** filtered by visibility. Unlike token rendering, a ping marks a location the sender
deliberately chose to point at, so it renders for every member regardless of fog or lighting.

#### LightSource Object

```json
{
  "id": "uuid",
  "x": 320,
  "y": 480,
  "brightRadius": 4,
  "dimRadius": 8,
  "color": "#ffcc66",
  "enabled": true
}
```

- `brightRadius` — grid squares of full visibility (strong glow)
- `dimRadius` — grid squares of reduced visibility (faint glow); must be >= `brightRadius`
- `color` — hex color (6-digit, e.g. `#ffcc66`)
- `enabled` — `false` = extinguished (hidden from players, DM still sees icon)

---

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

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Login / Register | 5 requests | 15 minutes |
| Password reset | 3 requests | 1 hour |
| File upload | 20 requests | 1 minute |
| General API | 300 requests | 1 minute |
| Dice rolls (WebSocket) | 30 events | 1 minute |
| Chat messages (WebSocket) | 10 events | 1 minute |
| Token movement (WebSocket) | 60 events | 1 second |

Rate limit responses return HTTP `429` with a `Retry-After` header indicating when the limit resets.

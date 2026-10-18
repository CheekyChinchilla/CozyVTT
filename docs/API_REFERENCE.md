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
14. [Setup Endpoints](#setup-endpoints)
15. [WebSocket Events](#websocket-events)
16. [Error Responses](#error-responses)
17. [Rate Limits](#rate-limits)

---

## Authentication

CozyVTT uses **session-based authentication**. The session cookie is set on login and must be included in every subsequent request (browsers do this automatically with `credentials: 'include'`).

### Session Cookie

- **Cookie name:** `cozyvtt.sid`, always. It is signed with `SESSION_SECRET`, which does not change the name
- **Flags:** `httpOnly` and `sameSite: lax`. `Secure` is added only when the request reached the server over HTTPS, directly or through a proxy that sends `X-Forwarded-Proto: https`, so an install served over plain HTTP sends the cookie without it. The bundled nginx passes that header on only from a proxy listed in `NGINX_TRUSTED_PROXIES` in `.env`
- **Duration:** the session ends after `SESSION_MAX_AGE` (default 1 hour) with no request, and every request starts that count again. With "remember me" the window is `REMEMBER_ME_MAX_AGE` (default 30 days). Every session also ends `REMEMBER_ME_MAX_AGE` after it was made, however active, with 401 "Your sign-in has reached its 30-day limit. Sign in again." and `code: "SIGN_IN_EXPIRED"`; an account keeps at most 20 live sessions, and each sign-in ends those beyond 20 that are due to end soonest

### Error Responses for Unauthenticated Requests

```json
{
  "error": "Unauthorized",
  "message": "You must be logged in to access this resource"
}
```
HTTP status: `401 Unauthorized`

A sign-in that is still waiting for its two-factor code gets the same body with the message `MFA verification required. Please complete MFA login.`, and one that has reached its 30-day limit adds `"code": "SIGN_IN_EXPIRED"`. Act on the status code and on `code`; the wording of `message` can change.

### Error Responses for Insufficient Permissions

```json
{
  "error": "Forbidden",
  "message": "You are not a member of this campaign"
}
```
HTTP status: `403 Forbidden`. `message` says what was missing, for example `This action requires Dungeon Master (DM) role`.

---

## Scope of this document

This is a hand-written guide, not a complete catalogue. It covers the endpoints
people ask about most, with worked examples; it does **not** cover every route,
and it has drifted before — twelve endpoints in it described paths that no
longer exist, and were removed rather than corrected.

For the complete, checked list of every route the server mounts, see
[`backend/docs/API_DOCUMENTATION.yaml`](../backend/docs/API_DOCUMENTATION.yaml).
That file is verified against the code by `scripts/spec-coverage.py`, so it
cannot silently fall behind the way this one did. It is also the place to look
up the fields of a request or a response: the examples here are shortened to
show the shape. For seven of them a backend test
(`backend/src/routes/__tests__/apiReferenceShapes.e2e.test.ts`) checks that
every field shown is one the route sends: the 401 for an unauthenticated
request, `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/campaigns`,
`GET /api/campaigns/:id/characters`, `GET /api/assets` and
`GET /api/setup/status`. The other examples are not checked.

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
  "message": "Login successful",
  "user": {
    "id": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93",
    "email": "user@example.com",
    "displayName": "Merric Thorngage",
    "platformRole": "USER",
    "mfaEnabled": false,
    "mustChangePassword": false
  },
  "mustChangePassword": false
}
```

**Response (MFA required):**
```json
{
  "mfaRequired": true,
  "message": "MFA verification required. Please enter your TOTP code."
}
```
HTTP status: `200 OK` — client must follow up with `POST /api/auth/mfa/verify-login` within 5 minutes, sending the code as `token`: exactly six digits, with nothing before, after or between them, or it is answered as a wrong code.

**A script that keeps sending a wrong password locks the account.** Ten wrong
passwords in an hour for one email address, counted from every address together,
make this route answer `429` for that email, with any password and from any
address, until the oldest of the ten is an hour old. A script or bridge that is
left running after the account's password was changed keeps adding wrong
passwords, so the lock never lifts for as long as it runs, and the person cannot
sign in on any device. A browser that is already signed in carries on. Stop
the script first. Then either wait out the hour, or set a new password, which
lifts the lock at once: use **Forgot password?** on the sign-in page, ask an administrator for
a temporary password, or change it from a browser that is still signed in. Give
the script the new password before it runs again, and have it stop on a `401`
from this route in place of trying again.

---

### `POST /api/auth/logout`

Destroy the current session. Any open game connection made under that sign-in is
dropped with it; another sign-in of the same account (another device) is untouched.

**Response:**
```json
{ "message": "Logout successful" }
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
  "message": "User registered successfully",
  "user": { ... }
}
```

**Response (pending approval):**
```json
{
  "pendingApproval": true,
  "message": "Registration submitted. Your account is pending admin approval."
}
```

`displayName` is cleaned before it is stored: control and invisible formatting characters are removed (bar the joiners and flag tags that emoji and some scripts need), it is put in Unicode NFC, and angle brackets and surrounding spaces are removed. It must then be 1 to 50 characters; one left empty is refused with `400` "Display name is required".

---

### `GET /api/auth/me`

Get the currently authenticated user. `mfaBackupCodesRemaining` is how many
MFA backup codes the account has left (`null` with MFA off); only the count is
sent. `adminMfaDeadline` is set only for an administrator without MFA.

With no sign-in it answers `401` with the message `Not authenticated`. A sign-in
that has reached its 30-day limit is answered `401` with `code: "SIGN_IN_EXPIRED"`
and ended, as on every route that needs a sign-in.

**Response:**
```json
{
  "user": {
    "id": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93",
    "email": "user@example.com",
    "displayName": "Merric Thorngage",
    "platformRole": "USER",
    "bio": "Professional dungeon delver.",
    "mfaEnabled": true,
    "mfaBackupCodesRemaining": 7,
    "globalAssetManager": false,
    "templateEditor": false,
    "mustChangePassword": false,
    "adminMfaDeadline": null,
    "createdAt": "2025-01-15T12:00:00.000Z"
  }
}
```

---

### `POST /api/auth/change-password`

Change the authenticated user's password. Every other sign-in of the account is
signed out, open game connections included; the session making the change stays.
A reset through the emailed link (`POST /api/auth/reset-password`) signs out
every sign-in, since nobody is signed in to keep. Either way, the account's
unused reset and invitation links stop working, and a link sets the password
once even when two requests carry it at the same moment.

**Request:**
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456!"
}
```

A wrong `currentPassword` answers `401`. Ten wrong passwords in 15 minutes for the account, counted together with `DELETE /api/auth/account` and a change of your own email, answer `429` "Too many wrong passwords, please try again later" until the oldest is 15 minutes old.

---

### `DELETE /api/auth/account`

Permanently delete the authenticated user's account, with their memberships,
characters, notes and dice macros, their avatar, and every personal (`USER`
scope) upload that nothing names and no campaign shares, row and file. Chat
messages, dice rolls, campaign uploads, shared documents and personal uploads
something still names stay, with no owner, as do the character templates they
published and the token templates and creatures they made.
Every sign-in of the account ends, on every device, and any open game connection
of the account is dropped. The instance's only admin is
refused with `409` until another user has been promoted to admin, and so is
anyone who sits as DM of a campaign, whether or not they own it, or owns one
with nobody in the DM seat, until they hand the seat on or delete it.

**Request:**
```json
{
  "password": "your-current-password"
}
```

---

### `GET /api/auth/appearance`

Returns the instance's appearance settings, with its name, which the browser tab shows. **No authentication required** — the login page needs this to render the correct theme.

**Response:**
```json
{
  "instanceName": "CozyVTT",
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

**Response:** an object with a `campaigns` list. Each campaign carries its own
fields, its `owner` and every member in `memberships`, and two fields about the
caller: `userRole` (`DM`, `PLAYER` or `SPECTATOR`; there is no `role` here) and
`characterIds`, the characters they bring to it. Emails are never included. The
example is shortened; the OpenAPI file has the full shapes.

```json
{
  "campaigns": [
    {
      "id": "8d3f6b2a-1c4e-4f7a-b9d2-3e5a7c9f1b04",
      "name": "The Lost Mines",
      "description": "A classic starter adventure.",
      "gameSystem": "DND_5E",
      "status": "ACTIVE",
      "ownerId": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93",
      "owner": { "id": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93", "displayName": "Merric Thorngage", "avatarUrl": null },
      "memberships": [
        {
          "userId": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93",
          "role": "DM",
          "characterIds": [],
          "joinedAt": "2025-02-01T10:00:00.000Z",
          "user": { "id": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93", "displayName": "Merric Thorngage", "avatarUrl": null }
        }
      ],
      "userRole": "DM",
      "characterIds": [],
      "createdAt": "2025-02-01T10:00:00.000Z"
    }
  ]
}
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

Get a single campaign's details. The embedded `maps` and `characters` arrays contain **metadata only** (id, name, and summary fields) — not full map token/wall/fog/light blobs or full character sheets. Fetch those on demand via `GET /api/campaigns/:campaignId/maps/:id` and `GET /api/characters/:id`. As with the map list, a player or spectator is given only the map the campaign is currently showing.

---

### `PUT /api/campaigns/:id`

Update campaign properties (DM only). Every field is optional and is validated when present: `name` (1–200 characters), `description` (up to 5000, or `null` to clear), `status`, `gameSystem` (or `null`), `vibeSettings`, `spiritLayerEnabled`, `spiritLayerStyle`, `chatCooldownEnabled`, `chatCooldownSeconds` (1–300). A bad value is a `400` whose `message` describes the first problem found. Most name the field; a value of the wrong type for `name` or `description`, a `spiritLayerStyle` over 100 characters and most `vibeSettings` problems get a generic message such as "Invalid input: expected string, received number".

**Request:** Partial campaign fields.

---

### `GET /api/campaigns/:id/characters`

The campaign's roster: one entry for every member, with the characters that
member brings to the campaign. A member with no character has an empty
`characters` list. `hp` is `null` for a character whose sheet has no hit
points to read.

**Response:**
```json
{
  "roster": [
    {
      "userId": "2b7e9c41-6d8a-4f3e-a5c1-9f0d2e4b6a87",
      "userName": "Alice",
      "userAvatar": null,
      "role": "PLAYER",
      "joinedAt": "2025-02-01T10:00:00.000Z",
      "characters": [
        {
          "id": "c4a1e8f2-7b3d-4e9a-8c6f-1d2b5a7e9f30",
          "name": "Elara Moonwhisper",
          "tokenImageUrl": null,
          "gameSystem": "DND_5E",
          "userId": "2b7e9c41-6d8a-4f3e-a5c1-9f0d2e4b6a87",
          "hp": { "current": 24, "max": 31, "temp": 0 }
        }
      ]
    }
  ]
}
```

---

### `GET /api/campaigns/:id/messages`

Get chat history for a campaign, newest first. Paging is by keyset, so new
messages arriving while someone scrolls back cannot shift the window.

**Query params:**
- `limit` — number of messages to return (default: 50, max: 100)
- `cursor` — from the previous response's `pagination.nextCursor`. Omit for the
  newest page. It is opaque; do not build one.

**Response `200`:** `{ messages, pagination }`, where `pagination` is
`{ limit, hasMore, nextCursor }`. Follow `nextCursor` until `hasMore` is false to
reach the first message in the campaign.

Dice rolls are not chat messages and never appear here — see
`GET /api/campaigns/:id/dice-rolls`, which is the only path that applies the
secret-roll rules.

### `GET|POST /api/campaigns/:campaignId/macros`

A player's saved dice rolls for one campaign. **Requires campaign membership.**

`GET` returns your own macros, **oldest first** — that is the order they appear
as buttons, and people aim at those without looking, so an edit must not move
one. `POST` takes `{ name, expression }`.

**They are private to whoever saved them, the DM included.** Every query is
scoped by the session's own user id; a macro belonging to someone else answers
`404` rather than `403`, so the reply cannot be used to confirm an id exists.

The expression is **rolled once when it is saved** and the result discarded. An
expression that merely looks like dice — `2d6+`, `dddd` — is refused at that
point rather than becoming a button that fails every time it is pressed. Limited
to 50 per campaign per player.

### `GET|PUT|DELETE /api/campaigns/:campaignId/macros/:macroId`

Read, edit or delete one of your own. `PUT` accepts `name`, `expression` or both;
a body changing neither is refused so a mistake is visible. A new expression is
checked exactly as it was on creation, so an edit cannot leave a macro
unrollable.


### `GET /api/campaigns/left`, `GET /api/campaigns/left/:campaignId`, `GET /api/campaigns/left/:campaignId/notes` and `GET /api/campaigns/left/:campaignId/notes/:noteId`

Removing a member keeps their personal notes and dice macros, but the notes and
macros routes above answer only members. `GET /api/campaigns/left` lists the
campaigns you are no longer in and still have notes or macros in, by name, each
with your note titles (newest edit first, no text) and your macros.
`GET /api/campaigns/left/:campaignId` returns `campaign` (`id`, `name`), your
note titles and your `macros` in one such campaign, and answers `404` ("You
have not left that campaign, or have no notes or dice macros in it") for a
campaign you are a member of or have nothing in.
`GET /api/campaigns/left/:campaignId/notes/:noteId` returns one `note` with its
`content`, and answers `404` ("Note not found") for a note that is not yours or
is in a campaign you are a member of. `GET /api/campaigns/left/:campaignId/notes`
returns all your `notes` in that campaign with their `content`, newest edit
first, in one answer that can run to tens of megabytes (the Download button
uses it); it is limited to 60 an hour, answering `429` past that, and gives the
`404` of the campaign's own answer. The lists never carry note text. All four
are read only and return nothing of anyone else's. Deleting the campaign
deletes the notes and macros.

### `GET|POST /api/campaigns/:campaignId/documents`

The rulebooks and handouts a campaign's members can read. **`GET` requires
campaign membership; `POST` requires the DM role.**

`GET` returns every document the campaign can see: those uploaded or written
with `CAMPAIGN` scope inside it, and those a DM has shared from elsewhere. Each
item carries the asset fields plus `linkedAt`, `linkedBy` and a `shared`
boolean, which is what tells the two apart, so the client knows whether
"unshare" is a thing it can offer. A `canEdit` boolean says whether the
caller passes the rule for deleting the document, which is the rule
`PUT /api/assets/documents/:id/content` applies, so the client offers Edit only
then. That route edits only plain text and Markdown, so a PDF cannot be edited
whatever `canEdit` says.

`POST` takes `{ assetId }` and shares an existing document. Two checks, in
order. The asset must be of type `DOCUMENT` **and readable by the DM making the
request**, or the answer is `404`; that stops sharing from becoming a way to
hand a campaign somebody else's private file by guessing an id. Then it must be
**the DM's own upload, or `GLOBAL`**, or the answer is `403` with a message
saying so; that stops a document shared into one campaign from being passed on
by a member of it who runs another. An admin may share anything. Sharing the
same document twice is a no-op, not an error.

### `DELETE /api/campaigns/:campaignId/documents/:assetId`

Stop sharing a document with the campaign. **Requires DM role.** The document
itself is untouched; the campaign's members simply stop being able to read it.
Answers `200` with a message, or `404` if that document was not shared with
this campaign. A document that is `CAMPAIGN`-scoped inside the campaign has no
link to remove; delete the asset instead.

### `POST /api/campaigns/:campaignId/invite`

Invite a user to the campaign. **Requires DM role.**

**Body:**
- `userId` *(required)* — the user to invite. They must already have an account, approved by an administrator if the instance asks for approval; an unknown or unapproved account answers `404` "User not found"
- `sendEmail` *(optional, default `false`)* — whether to email them as well. Only an explicit `true` counts
- `expiresInDays` *(optional)* — a whole number of days, at most 365. Omitted, `null`, zero or negative means it does not expire; anything else answers `400`

**Response `201`:** `{ message, invitation, emailSent }`

The invitation is created whether or not an email goes out — it is what the invitee accepts from, on their dashboard. `emailSent` reports what actually happened: it is `false` when the caller did not ask, when the instance has no SMTP configured, and when the send failed. A failed send is logged and does not fail the request, because the invitation already exists by that point. This is deliberately unlike `POST /api/admin/users/invite`, which refuses outright without SMTP because there an email is the only way in.

Each DM may make 20 invitations an hour that ask for an email, counted whether or not the email then goes out. A request with `sendEmail: true` past that, on an instance with SMTP configured, answers `429` and creates no invitation; the same request without `sendEmail` goes through. Requests without an email, and invitations refused with `400` or `404`, are not counted.

### `PUT /api/campaigns/:campaignId/dm`

Hand the Dungeon Master role to another member of the campaign. **Requires the
sitting DM, the campaign owner, or a platform admin.**

**Body:**
- `userId` *(required)* — the member who should become DM. They must already be in the campaign; any role qualifies, including a spectator

**Response `200`:** `{ message, memberships }` — the full membership list, so a client can re-derive everyone's role in one step

The named member becomes `DM` and the sitting DM becomes `PLAYER`, in a single
transaction: a campaign is never observable with two DMs or none. A campaign
still has exactly one DM — the seat moves rather than being shared. Of two
hand-overs at the same moment, the second sees the first, and a role change or
removal of a member who has just been handed the seat is refused as for any DM.

**The campaign's owner does not change.** Ownership and the DM role are separate
facts, which is what allows an owner to hand the game to a co-DM or to an
automated account and remain at the table as an ordinary player. Deleting the
campaign stays with the owner, and so does handing the DM seat on, so an owner
sitting as a player can take the seat back; the owner also cannot be removed
from the campaign. Everything else a DM does follows the role.

Rejected with `400` if `userId` is not a user id ("A campaign member must be
named by their user id") or names the sitting DM ("That member is already the
Dungeon Master"), `404` if the campaign does not exist ("Campaign not found",
checked before the caller is) or the named user is not a member ("That user is
not a member of this campaign"), and `403` if the caller is none of the three
above ("Only the DM, the campaign owner, or an admin can transfer the DM role").
Note the generic role endpoint still refuses to change a DM's role or create a
second one — this is the only supported way to move the seat, so that there is
one atomic path rather than two.

### `DELETE /api/campaigns/:campaignId/messages/join-leave`

Remove the legacy "X has joined / has left the campaign" system messages from a campaign's chat. **Requires DM role.**

**Response `200`:** `{ message, deleted }` — `deleted` is the row count, `0` when there was nothing to clear.

These messages are no longer written: they fired on every socket authentication and every disconnect, so a page load, a refresh or a brief network drop each added a permanent row, and presence in the roster now conveys the same thing. Rows already in the database are deliberately **not** removed on upgrade — a chat log is a record of a session — so this is how a DM clears the backlog deliberately.

Matching is on `metadata.action` (`user.joined` / `user.left`), **not** on the message text: the wording is display copy that could change or be translated, while the action tag is what the writer meant. Other system messages and the conversation itself are untouched.

### `GET /api/campaigns/:campaignId/dice-rolls`

Roll history for a campaign, newest first; rolls with the same timestamp are ordered by id, so the order is the same on every request. Paging is by offset: a roll made while someone pages back moves the older rolls down by one, so the next page repeats one. **Requires campaign membership.**

**Query params:**
- `limit` — rolls to return (default: 50, max: 100)
- `offset` — rolls to skip (default: 0)

**Response `200`:** `{ rolls, pagination }`, each roll `{ id, userId, userName, characterName, expression, result, breakdown, purpose, secret, timestamp }`.

**Visibility is enforced here, not in the client.** A DM receives every roll in the campaign. Anyone else receives public rolls plus their *own* secret rolls, and never another user's — matching what the live `dice.rolled` socket event delivers. Filtering client-side would still have put the rolls on the wire, so the rule lives in the query.

Rolls made before the DM last cleared the history are excluded (see `Campaign.rollHistoryClearedAt`). They remain in the table: clearing hides rolls from this endpoint rather than deleting them, so the secret-roll audit trail survives an accidental Clear.

In the web client, a player's rolls while the session is **paused** are made in their own browser and never sent, so they never appear here. The DM's rolls are sent as usual, and the server takes a `dice.roll` whatever the session's state, so a script's rolls while paused are kept and listed.

---

## Token Template Endpoints

All token template endpoints are scoped under a campaign and require DM role.

### `GET /api/campaigns/:campaignId/token-templates`

List this campaign's token templates, ordered by name, a page at a time.

**Query params:**
- `search` — filter by name (optional)
- `type` — filter by token type: `npc`, `player`, `object` (optional; any other value is ignored)
- `limit` — templates per page (default 50, at most 100)
- `offset` — templates to skip (default 0)

**Response:** `{ templates, total, limit, offset }`, where `total` counts every match.

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

**Response:** `201` with the new token template itself, in the target campaign and created by you, in the same shape as `GET /api/campaigns/:campaignId/token-templates/:id`.

---

## Campaign Export & Import Endpoints

### `GET /api/campaigns/:campaignId/export`

Export a campaign as a `.cozyvtt` ZIP archive. Requires DM role. Each user may export 20 campaigns an hour, and run one archive operation (export, import or preview) at a time; a request past either answers `429` with a `message` saying so.

**Query params:**
- `includeAudio` — `true` to include audio assets (default: `false`): the tracks of the campaign's atmosphere periods and its ambient track. An import plays the imported copies.
- `includeTokens` — `false` to exclude tokens on maps (default: `true`)

**Response:** Binary ZIP file with `Content-Type: application/zip` and `Content-Disposition: attachment`, sent as it is made (no `Content-Length`). A campaign whose files would make an archive over 500 MB, the most an import accepts, answers `422` with `error: "Export Too Large"` and a `message` giving the size.

---

### `POST /api/campaigns/import/preview`

Upload a `.cozyvtt` archive and return its manifest preview without creating anything. Requires authentication. Each user may preview 20 archives an hour, one archive operation at a time; past either answers `429`.

**Request:** `multipart/form-data` with field `file` containing the archive, at most 500 MB; a larger one answers `413`. The bundled nginx gives this route and the import 512 MB, apart from `NGINX_MAX_BODY_SIZE`, and five minutes to answer.

**Response:**
```json
{
  "preview": {
    "formatVersion": 1,
    "exportedAt": "2026-04-18T12:00:00.000Z",
    "exportedFrom": "CozyVTT v1.5.3",
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

Import a `.cozyvtt` archive and create a new campaign. Requires authentication; any signed-in user may import, and becomes the new campaign's DM. Each user may import 20 campaigns an hour, one archive operation at a time; past either answers `429`.

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
  "mapCount": 4,
  "tokenCount": 42,
  "creatureCount": 12,
  "tokenTemplateCount": 8,
  "warnings": ["Map \"Cellar\": shortened the notes of 1 token to 5,000 characters."],
  "skipped": [{ "kind": "map", "name": "Vast", "reason": "Map width must be a whole number from 1 to 500 squares" }]
}
```

The counts are of what was created. Everything is held to what the app's own routes store: text over its limit is cut to it and described in `warnings`, and anything that cannot be stored is left out on its own. A map, token, creature, token template or asset left out is listed in `skipped` (`kind` is `map`, `token`, `creature`, `tokenTemplate` or `asset`). Walls, doors and lights left out are counted in `warnings`, and so is a map picture or spirit layer picture that was not uploaded as a map picture: the picture is still imported into the campaign's assets, and its map arrives without it. A map is left out whole when its file is missing, it nests more than 32 levels deep, it is not a map at all, or its size is outside the map limits. The import is all or nothing: a refused archive answers `400` with the reason, a failure of the server's own answers `500`, and either way nothing is kept.

---

## Character Endpoints

### `GET /api/characters`

List all characters owned by the authenticated user, newest first, each with
its `campaign` (`{ id, name }` or null) and without its sheet: `data` is left
out. `GET /api/characters/:id` returns one character with its sheet.

---

### `POST /api/characters`

Create a new character. One account may own at most 1,000 characters, copies
included; past that this answers `400` with "You already have 1000 characters,
the most one account can. Delete one you no longer need to make room."

**Request:**
```json
{
  "name": "Thorin Ironforge",
  "gameSystem": "DND_5E",
  "data": {
    "class": "Fighter",
    "level": 1,
    "race": "Dwarf",
    "proficiencyBonus": 2,
    "stats": {
      "strength": { "score": 16, "modifier": 3 },
      "dexterity": { "score": 12, "modifier": 1 },
      "constitution": { "score": 16, "modifier": 3 },
      "intelligence": { "score": 10, "modifier": 0 },
      "wisdom": { "score": 12, "modifier": 1 },
      "charisma": { "score": 8, "modifier": -1 }
    }
  }
}
```

`name` is written into the sheet's `characterName` (`investigatorName` in Call of Cthulhu), and your display name into `playerName`, before the sheet is checked. A D&D 5e sheet needs at least the fields above; a sheet that does not pass answers `400` with `validationErrors`, as on `PUT`.

---

### `GET /api/characters/:id`

Get a single character, with its sheet in `data`, its `campaign` (`{ id, name }` or null) and its owner as `user` (`{ id, displayName, avatarUrl }`). The owner may always read it, and so may any member of its campaign while the owner is still a member there; anyone else gets `403`. On a Call of Cthulhu sheet the Keeper's Notes (`notes`) are sent only to the DM of the character's campaign, and are left out for everyone else, its owner included.

---

### `PUT /api/characters/:id`

Save a character. Every field is optional, but `data` is the **whole sheet**: it replaces the stored one. For a character with a game system it is checked against that system's sheet first, and a field the sheet does not define is dropped. A Flexible character's sheet (no game system) must be an object whose `sections` are laid out as the Flexible sheet's are; keys beside `sections` are kept. Either way a sheet that does not pass answers `400` with `validationErrors`, each giving the `path` of a field and what is wrong with it, and nothing is saved. On a Call of Cthulhu sheet, a save by anyone but the DM of the character's campaign keeps the stored `notes` (Keeper's Notes), whatever it sends for them.

Send `updatedAt` exactly as `GET /api/characters/:id` gave it, and the save is refused with **409 Conflict** if the character has changed since (another save, or hit points changed at the table). Nothing is written; load the character again and make the change on the new version. Leave `updatedAt` out and the save is made whatever changed in between. A successful save returns the character with its new `updatedAt`.

**Request:**
```json
{
  "data": {
    "characterName": "Thorin Ironforge",
    "hp": { "current": 10, "maximum": 12, "temporary": 0 }
  },
  "updatedAt": "2026-09-28T08:15:02.117Z"
}
```

(The `data` above is cut short; a real D&D 5e sheet also needs `class`, `level`, `race`, `proficiencyBonus` and `stats`.)

---

### `DELETE /api/characters/:id`

Delete a character. Only the owner can delete.

---

### `POST /api/characters/:id/assign`

Assign a character to a campaign.

**Request:**
```json
{ "campaignId": "8d3f6b2a-1c4e-4f7a-b9d2-3e5a7c9f1b04" }
```

---

## Map & Token Endpoints

### `GET /api/campaigns/:id/maps`

List the campaign's maps. The DM gets every map. Anyone else gets only the map the campaign is currently showing, or an empty list when it is showing none: a map the DM has prepared stays theirs until they switch the table to it.

---

### `POST /api/campaigns/:id/maps`

Create a new map (DM only).

**Request:**
```json
{
  "name": "Goblin Cave Level 1",
  "imageUrl": "uuid-of-map-asset",
  "width": 30,
  "height": 20,
  "gridSize": 70
}
```

`width` and `height` are in grid squares, each a whole number from 1 to 500; anything else answers `400`. `name` may be at most 200 characters once trimmed, or the request answers `400`. `gridSize` (pixels per square, 10 to 500) and `feetPerSquare` (1 to 100) are optional, and a value outside those ranges is replaced with the default (50 and 5). `PUT /api/campaigns/:id/maps/:mapId` applies the same limits but answers `400` instead of using a default; a name or size equal to the one already stored is accepted as it is.

`imageUrl` and the optional `spiritLayerUrl` may not name an asset of another kind: one that is not a map picture (type `MAP`), whatever folder an address gives, answers `400` with `The map image must be a map picture from the asset library.` or `The spirit layer image must be a map picture from the asset library.` An address naming no existing asset is stored as sent. An asset the caller may not read answers `403` first. `PUT /api/campaigns/:id/maps/:mapId` checks a new picture or spirit layer the same way, and accepts the address already stored, sent back unchanged.

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
`createdBy: { id, displayName }` — never the author's email. Each leaves out
its sheet (`data`), which a page of 100 would otherwise carry 100 times.

### `GET /api/character-templates/:id`

One template, with its sheet in `data`. Fetch this before copying a template
into a character or editing it.

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

(`data` stands for a whole sheet here. It is checked as sent: the template's `name` is not copied into it, so a D&D 5e template's `data` needs `characterName`, `class`, `level`, `race`, `proficiencyBonus` and `stats`, and `{}` answers `400`.)

- `name` is required; `gameSystem` may be null for a flexible template.
- `data` is validated against the game system's schema exactly as a character's
  is, and stored as the schema returns it, so a field the sheet does not define
  is dropped. Fields from a sheet written before 1.3.0 are moved to where the
  sheet reads them first, as they are for a character. A flexible template's
  `data` must be an object laid out as a Flexible sheet, as a Flexible
  character's must; anything else answers `400` with `validationErrors`.
- **`tokenImageUrl` must reference a `GLOBAL` asset.** A template is visible to
  everyone, so a `USER`- or `CAMPAIGN`-scoped image would 403 for other readers
  and show as broken. A non-global asset returns `400` with an explanation.
- One account may author at most 500 templates. Past that the request answers
  `400`: "You have already published 500 character templates, the most one
  account can. Delete one you no longer need to make room."

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

**`imageUrl` on create and update** accepts a bare asset id, stored as `/api/assets/tokens/:id`, or
an asset's own `/api/assets/<kind>/:id` address, stored as sent. Anything else, an address on another
site included, answers `403`, as does an asset the DM may not read unless this campaign already uses
that exact address. Send `""` or `null` to clear it. Duplicating a creature stores a bare id it copies
as the full path. Rows written before this normalisation may still hold a bare id, so clients should
tolerate both when reading.

### `GET /api/campaigns/:id/creatures`

List creature templates available in this campaign (SRD + campaign-specific custom creatures). DM only: a template carries the DM's notes, stat block and hit points.

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

Get a single creature template. DM only.

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
- Up to 20 unknown top-level keys are preserved, so older stat blocks survive a
  round trip; more than 20 answers `400`.
- The whole stat block, as stored, may be at most 64 KB (65,536 characters of
  JSON); a larger one answers `400`.

Failures return `400` with `{ "error": "Validation Error", "message": "..." }`.
A campaign import applies the same limits but does not refuse: it cuts text and
lists over them down to them, leaves a stat block it cannot store off a token or
template, and leaves out a creature whose stat block it cannot store, saying so
in its `warnings` and `skipped`.

---

### `DELETE /api/campaigns/:id/creatures/:creatureId`

Delete a custom creature template (DM only). Cannot delete SRD creatures — returns `403`.

---

### `POST /api/campaigns/:id/creatures/:creatureId/duplicate`

Duplicate a creature of this campaign, or an SRD creature, as a new custom creature in this campaign (DM only); a creature of another campaign answers `404`. The duplicate gets `source: 'custom'` and ` (Custom)` appended to the name.

**Response:** `201` with the new creature template.

---

### `GET /api/campaigns/:id/creatures/favorites/list`

List the current user's favorited creatures in this campaign. DM only, like the library it points into.

**Response:**
```json
{
  "favoriteIds": ["uuid-1", "uuid-2"],
  "creatures": [ ... ]
}
```

---

### `POST /api/campaigns/:id/creatures/:creatureId/favorite`

Toggle favorite for the current user in this campaign (DM only). If already favorited, removes the favorite; otherwise, adds it.

**Response:**
```json
{ "favorited": true }
```

---

### `GET /api/campaigns/:id/creatures/seed/status`

Check whether SRD creatures have been seeded, and whether you may run the import. Any campaign member can check.

**Response:**
```json
{
  "srdCount": 325,
  "customCount": 4,
  "seedInProgress": false,
  "canSeed": false
}
```

`srdCount` counts the SRD creatures on the whole server, `customCount` the custom creatures this campaign's library shows, and `canSeed` is `true` for a platform administrator alone.

---

### `POST /api/campaigns/:id/creatures/seed`

Seed SRD creatures from Open5e. Administrators only: anyone else, a campaign's DM included, gets `403` with "Only an administrator can import the SRD creatures, because every campaign on this server shares them. Ask an administrator to import them." The campaign in the address plays no part, and the creatures appear in every campaign's library. Safe to call multiple times; existing SRD creatures are not duplicated. Returns `409` if seeding is already in progress, and `502`, having written nothing, when Open5e cannot be read, does not answer a page within 15 seconds, or answers something the import will not follow; the `message` says which. A creature whose stat block the Creature Library would refuse is left out and counted in `rejected`.

SRD creatures stored before hit points were tracked are updated in place with `hpMax` and `hitDice`; only those missing keys are added, and custom creatures are never modified.

**Response:**
```json
{
  "message": "SRD creature seeding complete",
  "fetched": 322,
  "created": 0,
  "updated": 322,
  "skipped": 0,
  "alreadyExisted": 322,
  "rejected": 0
}
```

---

## Asset Endpoints

### `GET /api/assets`

List assets accessible to the authenticated user (Global + their own User scope + Campaign scope for their campaigns).

**Query params:**
- `type` — filter by `MAP`, `TOKEN`, `AUDIO`, `AVATAR`, `DOCUMENT`. With no `type`, documents are left out: they have their own page in the app, and a rulebook does not belong among map thumbnails
- `scope` — filter by `GLOBAL`, `USER`, `CAMPAIGN`
- `search` — part of the asset's name, in any capitals. Tags are not searched
- `campaignId` — list one campaign's library. You must be a member (`403` otherwise)
- `page` — pagination page (default: 1)
- `limit` — items per page (default: 50, at most 100)

The newest upload comes first. There is no sort order to ask for. An
administrator can also send `uploadedBy`, a user id to list one person's
uploads or `none` to list the uploads of deleted accounts, and `usable=true`
to see only what they could put on a map. Anyone else's `uploadedBy` is
ignored.

Each asset carries a `canChange` boolean: whether the caller may delete it,
move it out of its scope, or rewrite it if it is a text or Markdown
document, by the rule those routes apply, so the client offers those
controls only then.

**Response:** the assets, shortened here, and the page they are on.

```json
{
  "assets": [
    {
      "id": "9a6c3e1f-4b2d-4d8e-b7a5-0c3f1e9d2b68",
      "type": "TOKEN",
      "scope": "USER",
      "uploadedById": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93",
      "campaignId": null,
      "filename": "b7e4d2c1-9a8f-4b3e-8d6c-2f1e0a9b8c7d.png",
      "originalName": "goblin.png",
      "mimeType": "image/png",
      "fileSize": 18432,
      "name": "Goblin",
      "description": null,
      "tags": [],
      "createdAt": "2025-02-01T10:00:00.000Z",
      "uploadedBy": { "id": "5f0c2a8e-3b1d-4c7a-9e2f-6a4b8d1c0e93", "displayName": "Merric Thorngage" },
      "campaign": null,
      "canChange": true
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
}
```

---

### `POST /api/assets/upload`

Upload a new asset. Uses `multipart/form-data`.

**Form fields:**
- `file` — the file (required)
- `type` — `MAP`, `TOKEN`, `AUDIO`, `AVATAR` or `DOCUMENT` (required)
- `scope` — `GLOBAL`, `USER`, or `CAMPAIGN` (optional; `USER` when left out)
- `name` — display name, at most 200 characters (optional; the file's own name, cut to 200 characters, when left out)
- `description` — at most 1,000 characters (optional)
- `campaignId` — required when `scope` is `CAMPAIGN`
- `tags` — comma-separated list of tags, at most 50 of at most 50 characters each (optional)

A `name`, `description` or `tags` over its limit, or sent more than once, is refused with `400` and a message naming the field, and the file is not kept.

A request may carry at most 100 text fields. A field name is at most 100 bytes, a field's value at most 16 KB, and a name written like `a[b][c]` may go no more than five levels deep, with no number above 1000 between the brackets. The other upload routes share these limits: the campaign import and its preview, the Universal VTT import and a backup restore. A body that breaks them is refused with `400` and `error: "Upload Error"` (`"Invalid Backup"` on a restore), and so is one that is cut off or malformed, on every route but the restore.

---

### `GET /api/assets/:id`

Get a single asset's metadata.

---

### `GET /api/assets/audio/:id`

Stream an audio file, with HTTP range requests supported so a browser can seek.

Read access is the shared `canReadAsset` rule: `GLOBAL` for anyone signed in,
`CAMPAIGN` for that campaign's members, `USER` for its uploader, **plus anyone
in a campaign that is currently playing this track** as its atmosphere, while
its uploader is a member of that campaign too. That
last clause is what lets a DM play a track from their personal library, since
the sound is fetched by each player's browser rather than relayed by the server.
It covers that one track and lasts only while it is set. Anyone else gets `404`,
not `403`.

The `Content-Type` comes from the file's validated extension, never from the
type declared at upload, and the response carries `X-Content-Type-Options:
nosniff`.

One byte range is served: `bytes=0-`, `bytes=1000-1999` or `bytes=-500` (the
last 500 bytes) answer `206` with `Content-Range`, and an end past the file is
cut to it. A range starting past the end answers `416` with
`Content-Range: bytes */<size>`. Several ranges, or a malformed header, are
ignored and the whole file is sent with `200`.

---

### `GET /api/assets/avatars/:userId`

Get the current avatar for a user. Returns the image file directly, or `404`
while the user's `avatarUrl` is null, whatever pictures are stored. Uploading
an avatar does not set `avatarUrl`; the web client sets it with
`PUT /api/users/:id` straight after the upload.

---

### `GET /api/assets/documents/:id`

Serve a document's file: a PDF, or the text of a `.txt` or `.md`. The reader
overlay and the "open in a new tab" link both use this URL.

Who may read it is one rule, `canReadAsset`, shared with the other routes that
serve an asset's file: a `GLOBAL` document is readable by everyone signed in; a
`USER` one by its uploader and by the members of any campaign it is shared
with; a `CAMPAIGN` one by that campaign's members. Anyone else gets `404`, not
`403`, so the reply cannot confirm the id exists.

The response is built not to be trusted by the browser. `Content-Type` comes
from the validated extension, never from the type the uploader declared;
Markdown and text are sent as `text/plain`, so nothing is ever rendered as
HTML; and the response carries `X-Content-Type-Options: nosniff` with a
`default-src 'none'; sandbox` Content-Security-Policy. Documents are stored
unchanged and the server never parses them.

A PDF is cached like any other asset, immutable under its id. Text and
Markdown are not, because they can be edited in place: they come back
`Cache-Control: private, no-cache` with an ETag that changes when the file
does, so a reader revalidates every time and gets a `304` when nothing has
changed.

---

### `POST /api/assets/documents`

Write a text or Markdown document without uploading a file.

**Body:**
- `name` *(required)* — up to 200 characters
- `format` *(required)* — `txt` or `md`
- `content` *(required)* — the text, up to 900 KB; must be UTF-8 plain text, with no NUL, DEL or other ASCII control character except tab, line feed, form feed and carriage return
- `scope` *(optional, default `USER`)* — `GLOBAL`, `USER` or `CAMPAIGN`
- `campaignId` — required when `scope` is `CAMPAIGN`
- `description` *(optional)*

Scope is decided by the same rule as an upload: `GLOBAL` needs a platform
admin or `globalAssetManager`, `CAMPAIGN` needs that campaign's DM. The result
is an ordinary asset of type `DOCUMENT`, and it counts against the upload
rate limit, since it creates a file on disk exactly as an upload does.

---

### `PUT /api/assets/documents/:id/content`

Replace the text of a `.txt` or `.md` document. **Whoever may delete it**:
for a campaign's own document, its uploader while still a member, the
campaign's DM, or a platform admin; for a global document, a platform admin or
its uploader while they still manage global assets; for a personal document,
its uploader or a platform admin. Anyone else gets `404`. A PDF answers `400`: only text and
Markdown can be edited in place. Takes `{ content }` under the same limits as
creation. Readers see the new text the next time they open it; there is no
live refresh.

---

### `DELETE /api/assets/:id`

Delete an asset and its files from disk.

Who may delete depends on the asset's scope:

| Scope | Who may delete |
|---|---|
| `GLOBAL` | A platform admin, or the uploader if they hold `globalAssetManager`. The permission covers your own global uploads — it does not let you remove another manager's |
| `USER` | The owner, or a platform admin |
| `CAMPAIGN` | The uploader while still a member of that campaign, its DM, or a platform admin |

`globalAssetManager` is read from the database on each request rather than the
session, so revoking it takes effect immediately.

While a map, a token, a character, a character template, a creature, a token
template, a campaign's atmosphere track or the sound of one of a campaign's
times of day still uses the asset, the route
answers `409` with `code: "ASSET_IN_USE"` and a `usage` list, and deletes
nothing. Send `?force=true` to delete it anyway. Names in the list are limited to
what the caller may see: an admin sees everything, anyone else sees only the
campaigns they are the DM of, their own characters and shared character
templates, and the rest is counted without names.

---

## Invitation Endpoints

### `GET /api/invitations`

List pending invitations for the authenticated user.

---

### `POST /api/invitations/:id/accept`

Accept a campaign invitation and optionally assign characters.

**Request:**
```json
{ "characterIds": ["c4a1e8f2-7b3d-4e9a-8c6f-1d2b5a7e9f30", "e9b2d4f6-0a1c-4b3e-9d5f-7a8c2e4b6d18"] }
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

The address is trimmed and lowercased, and one holding `<` or `>` is refused with `400`.
`displayName` is checked as sign-up checks it (1 to 50 characters once invisible characters,
angle brackets and surrounding spaces are removed and it is put in Unicode NFC, or `400` with
the reason; the joiners and flag tags emoji and some scripts need are kept) and defaults to the
part of the address before `@`. An address already in use answers `409`.

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

The address and display name are checked as for `POST /api/admin/users`: an address holding `<` or `>`, or a display name sign-up would refuse, answers `400`, and an address already in use answers `409`.

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

Issue a fresh invitation link, invalidating any outstanding one. Requires SMTP (`503` otherwise). Only for an account nobody has signed in to yet; one that has signed in is refused with `409`, and `POST /api/users/:id/send-reset-link` sends it a reset link instead.

**Response:**
```json
{
  "message": "Invitation resent to newplayer@example.com",
  "expiresInDays": 7
}
```

---

### `PUT /api/users/:id`

Update a user. Anyone may change their own `displayName`, `email`, `avatarUrl`
and `bio`; an admin may change anyone's, and only an admin may set
`platformRole`, `globalAssetManager` and `templateEditor` (403 otherwise).
Changing `platformRole` signs the user out everywhere, because the role is
carried in the session; it is written to the admins' activity log, and a user
made an admin has 7 days to set up two-factor authentication. Setting it to `USER` for the instance's only admin is
refused with `409`. There is no approval field to set here.

`displayName` is cleaned as registration cleans it (invisible characters, angle
brackets and surrounding spaces removed, Unicode NFC) and must then be 1 to 50
characters of text; one left empty is refused with `400` "Display name is
required", and one that is too long or not text with `400` too.

`avatarUrl` must be `/api/assets/avatars/<id>` for the user being updated,
which is what the web client sets after uploading the picture, or `null` to
clear it. Anything else is refused with `400`. `null` also deletes the user's
avatar pictures, keeping any that a map, token or anything else still uses.

Changing **your own** `email` needs `currentPassword` in the same request (`400`
without it, `401` when it is wrong); an admin changing someone else's does not.
A wrong one counts against 10 wrong passwords per 15 minutes for the account,
shared with `POST /api/auth/change-password` and `DELETE /api/auth/account`,
then `429` "Too many wrong passwords, please try again later". An address
another account has is refused with `400` "Email already in use".
When the address changes, any unused password-reset or invitation link for the
account stops working, and the old address is emailed a notice if the instance
has SMTP configured.

---

### `POST /api/users/:id/reset-password` *(Admin only)*

Generate a temporary password for a user. The account is flagged `mustChangePassword`, and **any
sessions the user currently has open are signed out** — otherwise they would keep browsing on the
old session and the forced change would only apply at their next login. Any reset or invitation
link the user has not used stops working. An admin naming their own id is refused with `400`: they
change their own password with `POST /api/auth/change-password`, which asks for the current one.

**Response:**
```json
{
  "message": "Password reset successfully",
  "temporaryPassword": "aB3d-Ef9h-Jk2m-Np4q",
  "mustChangePassword": true
}
```

---

### `DELETE /api/users/:id` *(Admin only)*

Delete a user account. Their memberships, characters, notes and dice macros go with it, and so do their avatar and the personal uploads nothing names and no campaign shares (removed just after the answer is sent); their chat messages, dice rolls, other uploads, published character templates, token templates and creatures stay with no owner. A campaign they own passes to its sitting DM.

**409** while they sit in the DM seat of any campaign, whether or not they own it, or own a campaign whose DM seat is empty. The body lists each such campaign and its other members, so the admin can hand the DM seat over (`PUT /api/campaigns/:id/dm`, which an admin may call for any campaign) or delete the campaign, then try again. The instance's only admin is refused with `409` too, with no list:

```json
{
  "error": "Conflict",
  "message": "This user runs \"Friday Game\". Hand each one's DM seat to another member, or delete it, then delete the user.",
  "campaigns": [
    { "id": "…", "name": "Friday Game", "members": [{ "userId": "…", "displayName": "Bob", "role": "PLAYER" }] }
  ]
}
```

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
- `customThemeColors` — `{ primary, accent, background, text }`, each `#RRGGBB`, or `null` to clear. The server stores it whatever `themeId` is and does not require it for `"custom"`; the web client sends it with `"custom"`. Another key inside it is refused with `400`
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

### `GET /api/admin/health` *(Admin only)*

Whether the database answers and the live-connection server is running, for the
dashboard's status card: `{ status, services: { api, database, websocket }, connections }`,
with `status` `healthy` only when every part is `ok`. Always `200`; the public
`GET /health` is the one for uptime monitors.

---

### `GET /api/admin/settings` *(Admin only)*

Get system configuration settings.

---

### `PUT /api/admin/settings` *(Admin only)*

Update system configuration settings.

`themeId` and `fontId` must name one of the app's themes (or `custom`) and
fonts, and `customThemeColors` is `{ primary, accent, background, text }` as
`#RRGGBB`, or `null` to clear it: the same rules as a user's own preferences.
The instance theme is painted for every visitor, the sign-in page included, so
anything else is refused with `400` and nothing is changed.

`customLogoUrl`, `customFaviconUrl` and `customMascotUrl` name a path this
instance serves, such as `/default-logo.png`. An address on another host is
refused with `400`: the app page allows images from its own origin only, and an
outside image would have every visitor's browser contact that host before they
sign in. Branding is changed by replacing the files in `frontend/public/` and
rebuilding.

---

### `GET /api/admin/backups` *(Admin only)*

List the instance backups in the backups folder, newest first.

---

### `POST /api/admin/backups` *(Admin only)*

Create a new backup: a ZIP holding a `pg_dump` of the database and every uploaded file.
Refused with `409` while a restore takes its upload or writes its safety backup, and with
`503` while the restore replaces the database. Backups are never deleted automatically.

---

### `DELETE /api/admin/backups/:filename` *(Admin only)*

Delete a backup file.

---

### `POST /api/admin/backups/restore` *(Admin only)*

Restore the instance from a backup archive. **Destructive: it replaces the whole database**
and copies the archive's uploaded files over the existing ones. A backup of the database as
it was is written to the backup list first, and the response names it as `safetyBackup`.

One restore runs at a time: a second sent while the first takes its upload or writes that
backup answers `409`. A refused file answers `400` (not named `.zip`, not a ZIP archive,
more than 100,000 entries, or not a complete CozyVTT backup) or `413` (over 4 GB, or
unpacking to more than 10 GiB), with the reason. While the database is being replaced,
live connections are closed and every other API request, a second restore included,
answers `503` with `Retry-After: 60` until the restore ends.

---

## Config Endpoint

### `GET /api/config`

Public. Returns the upload limits the server enforces, derived from the `MAX_<TYPE>_SIZE_MB` environment variables, and whether the instance can send email. The SPA reads these at runtime, so a changed limit takes effect when the backend next starts with it, with no frontend rebuild. Under Docker that is `docker compose up -d`: a plain restart keeps the environment the container was created with.

**Response:**
```json
{
  "uploadLimits": {
    "MAP": 52428800,
    "TOKEN": 5242880,
    "AUDIO": 20971520,
    "AVATAR": 2097152,
    "DOCUMENT": 52428800
  },
  "maxUploadBytes": 52428800,
  "smtp": { "configured": true }
}
```

Sizes are in bytes. `maxUploadBytes` is the largest configured limit — the cap applied while parsing an upload, before the asset type is known. See [Upload Size Limits](DEPLOYMENT.md#upload-size-limits) for the environment variables and the matching reverse-proxy setting.

`smtp.configured` is a bare boolean and deliberately nothing more — the host, port, username and TLS mode stay on the admin-only `GET /api/admin/config`. It exists so the campaign invite dialog can disable its "also email them" option on an instance with no mail server, which a campaign DM could not otherwise discover, since a DM is not necessarily a platform admin.

---

## Setup Endpoints

### `GET /api/setup/status`

Check whether the setup wizard has been completed. Public.

**Response:**
```json
{ "setupCompleted": false, "hasUsers": false, "needsSetup": true }
```

### `POST /api/setup/init`

Run the wizard: create the first administrator, apply the instance settings and mark setup complete, in one step, then sign the administrator in. Public, but it needs the setup token the backend printed in its log at start (or `SETUP_TOKEN`), as `setupToken` in the body; without it, or with the wrong one, the answer is `403 Forbidden` before the rest of the body is read. Once setup is complete, a call with the right token answers `400 Setup Already Completed`; without a token it still answers `403` first. The full request and every answer are in the OpenAPI document.

---

## WebSocket Events

Described in one place rather than three:
[`backend/docs/WEBSOCKET_DOCUMENTATION.md`](../backend/docs/WEBSOCKET_DOCUMENTATION.md)
— the connection and authentication handshake, a worked example of the
token-movement flow, and a generated inventory of every event the server
listens for or emits.

## Error Responses

Most errors are JSON in this shape:

```json
{
  "error": "Short error title",
  "message": "Human-readable description of what went wrong."
}
```

Not all of them. The invitation routes (`/api/invitations/...`) send `message`
alone, except the `400` `Validation Error` for a malformed `characterIds` on
accept and the shared `401`, and the character check (`GET /api/characters/:id/validate`) answers with
`isValid` and a list of `errors`. Some errors add a `code` for a program to act on, such as
`PASSWORD_CHANGE_REQUIRED`, `MFA_ENROLMENT_REQUIRED` and `SIGN_IN_EXPIRED`. Read the status code first, then `code` if there is
one, then `message`.

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
| `503` | Feature unavailable — e.g., an email-dependent endpoint with no SMTP configured. Every endpoint also answers `503` with `Retry-After: 60` while a backup restore replaces the database |

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

### Two-factor authentication required for administrators

An administrator account must use two-factor authentication. One without it has 7 days to set it
up, given as `adminMfaDeadline` on the `user` that `GET /api/auth/me` and the sign-in replies return
(`null` for everyone else). The 7 days run from the latest of when the rule started on the instance,
the account's creation, its promotion to admin, and an administrator's **Reset MFA** on it. Past the
deadline, every endpoint except `POST /api/auth/mfa/setup`, `POST /api/auth/mfa/verify`,
`POST /api/auth/change-password`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/ping`,
`GET /api/auth/appearance` and `GET /api/config` returns:

```json
{
  "error": "MFA Required",
  "code": "MFA_ENROLMENT_REQUIRED",
  "message": "Administrator accounts must use two-factor authentication. Set it up to continue."
}
```

Status `403`. The live-table connection is refused too: the handshake, and any `authenticate`
on a connection opened before the deadline, answer `error` "Unauthorized" and close the connection.
A script signed in as an administrator stops at the deadline until two-factor
authentication is set up on the account, and then has to send a code at every sign-in.

---

## Rate Limits

| Endpoint Group | Limit | Window | Counts |
|----------------|-------|--------|--------|
| Login, password reset, MFA changes | 5 wrong answers | 15 minutes | Wrong passwords, wrong codes and bad reset links only |
| Login, per account (from every address) | 10 wrong passwords | 1 hour | Wrong passwords only; each lock is noted in the admins' activity log |
| Two-factor code at sign-in | 5 wrong codes per address, and 5 per account | 15 minutes | Wrong codes and backup codes only |
| Checking the code when turning two-factor on | 5 failures | 15 minutes | Every answer that is not a success |
| Change password, delete account, change own email (per account) | 10 wrong passwords | 15 minutes | Wrong current passwords only |
| Register | 10 requests | 1 hour | Every request |
| Forgot password | 5 requests | 15 minutes | Every request |
| File upload, a new typed document, Universal VTT map import (per user) | 30 requests | 1 minute | Every request |
| Campaign import, import preview, campaign export | 20 of each, per user | 1 hour | Every request but one refused for overlapping another; also one of the three at a time per user |
| Invitation emails (per DM) | 20 invitations that ask for an email | 1 hour | Invitations created with `sendEmail: true` on an instance with SMTP, whether or not the email goes out; a refused invitation is not counted |
| All the notes of a campaign you have left (per user) | 60 requests | 1 hour | Every request |
| General API | 300 requests | 1 minute | Every request |
| Dice rolls (WebSocket) | 50 rolls, and 200 | 1 second, and 1 minute | Every roll |
| Chat messages (WebSocket) | 50 messages, and 300 | 1 second, and 1 minute | Every message |
| Token drag frames (WebSocket) | 150 events | 1 second | Every event |
| Picking a token up, putting it down (WebSocket) | 30 events each | 1 second | Every event |

The **Counts** column matters. Where only wrong answers count, signing in
correctly never uses up the allowance, and neither does being refused: a
household sharing one address could otherwise lock itself out by logging in
normally. Correct passwords arriving together from one address all pass this
limit. Wrong passwords are also counted per account: 10 in an hour for one email,
from every address together, then that email is refused with 429 for an hour and
the admins' activity log gets a line; an email with no account is counted and
answered the same, and a new password (a reset link, an administrator's temporary
password or a password change) clears the account's count at once. That covers the password step of a sign-in only: the two-factor code step
(`POST /api/auth/mfa/verify-login`) keeps its own limit of 5 wrong codes per 15
minutes per address, and 5 per 15 minutes per account from any address, and it
too counts only wrong codes. Where every request counts, the success
is the thing being limited: sending a password-reset email, or creating an
account.

On top of the chat limit, a DM can switch on a cooldown of between 1 and 300
seconds between messages for their campaign; it is **off by default**. The
WebSocket limits are counted per user, across every connection they have open,
and are set well above what a busy table sends. The other live table events have
limits of their own, listed in the WebSocket guide.

Every limit counted per address counts a client that connects over IPv6 by its
/56 network: every address that shares its first 56 bits shares one allowance.

The upload, campaign-archive and general-API limits are configurable with the
`ASSET_UPLOAD_RATE_LIMIT`, `CAMPAIGN_ARCHIVE_RATE_LIMIT` and
`RATE_LIMIT_MAX_REQUESTS` environment variables; the rest are fixed.

Rate limit responses return HTTP `429` with a `Retry-After` header giving the
seconds until the limit resets. Where only wrong answers count, a request that
has waited 15 seconds behind others still being checked answers `429` "Other
attempts are still being checked. Please try again in a moment." with
`Retry-After: 5`, and is not counted. The one-at-a-time refusals (a second campaign
import, preview or export while one of yours is running, and a second Universal
VTT map import while one is running) also answer `429`, with no `Retry-After`:
send the request again once the first has finished. The WebSocket limits are not
HTTP responses: an event past its limit is dropped, or answered with one `error`
event, as the WebSocket guide lists.

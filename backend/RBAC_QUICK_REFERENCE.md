# RBAC Quick Reference Guide

_Last verified against the code on 2026-09-18._

## Middleware Cheat Sheet

### Import Statement
```typescript
import { authenticated, adminOnly, campaignMember, campaignDM, campaignDMOrPlayer } from '../middleware/compose';
import { AuthenticatedRequest } from '../middleware/rbac';
```

### Route Protection Patterns

#### 1. Authenticated User Only
```typescript
router.get('/api/profile', authenticated, handler);
```

#### 2. Admin Only
```typescript
router.get('/api/admin/users', adminOnly, handler);
```

#### 3. Campaign Member (Any Role)
```typescript
router.get('/api/campaigns/:campaignId', campaignMember, handler);
// Access: req.campaignMembership.role, req.campaignMembership.characterIds
```

#### 4. Campaign DM Only
```typescript
router.put('/api/campaigns/:campaignId/settings', campaignDM, handler);
```

#### 5. Campaign DM or Player (Excludes Spectators)
```typescript
router.post('/api/campaigns/:campaignId/chat', campaignDMOrPlayer, handler);
```

---

## Permission Helper Functions

### Import Statement
```typescript
import {
  canEditCharacter,
  canControlToken,
  canManageMaps,
  canToggleSpiritLayer,
  canDeleteCampaign,
  // ... other helpers
} from '../services/permissions';
```

### Common Patterns

#### Check Character Edit Permission
```typescript
const hasPermission = await canEditCharacter(
  userId,
  characterId,
  campaignId,
  platformRole
);

if (!hasPermission) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

#### Who may act on a token

```typescript
// The DM; a player the token names in controlledBy; never a spectator.
if (!canControlToken(role, token.controlledBy, userId)) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

`canControlToken` is synchronous and takes the role you already hold (from
`req.campaignMembership` or `socket.role`). It is the one rule for
`PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId` and for the three
`token.move*` socket events, so the two channels cannot disagree. The spectator
clause matters: `controlledBy` is set once and is not cleared when someone is
demoted, so a spectator can still hold a token from their time as a player.

#### Which token fields a player may change

`PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId` is mounted on
`campaignMember`, so the route guard alone does **not** decide this. A player who
controls the token may change only where it is and what it is doing:

| A player controlling the token may set | Everything else is DM-only |
|---|---|
| `position`, `rotation`, `conditions` | `hp`, `showHpBar`, `notes`, `initiative`, `type`, `disposition`, `visible`, `name`, `imageUrl`, `layer`, `controlledBy`, `displayMode`, `statBlock`, `creatureTemplateId`, `metadata`, `sightRadius`, `size` |

`size` and `sightRadius` are DM-only because both decide what the server sends
that player: a token always sees half its own footprint, so a player who could
enlarge their token would enlarge their sight.

The DM-only list is `restrictedFields` in `routes/maps.ts`. **Adding a token field
means adding it there too** unless a player is meant to write it — the list is
deny-based, so a new field is player-writable by default. That is how `metadata`
came to be writable by any campaign member: it was added to the token shape and
never added to the list.

#### Check Campaign Deletion Permission
```typescript
const canDelete = await canDeleteCampaign(userId, campaignId, platformRole);

if (!canDelete) {
  return res.status(403).json({ error: 'Only owner or admin can delete' });
}
```

---

## Request Type for TypeScript

### AuthenticatedRequest
```typescript
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';

router.get('/:campaignId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  // Type-safe access
  const userId = req.session.userId!;
  const role = req.campaignMembership!.role;
  const characterIds = req.campaignMembership!.characterIds;
  const campaignId = req.campaignMembership!.campaignId;
});
```

---

## Response Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 401 | Unauthorized | User not logged in |
| 403 | Forbidden | User logged in but lacks permission |
| 404 | Not Found | Resource doesn't exist |
| 400 | Bad Request | Invalid input data |
| 500 | Internal Server Error | Unexpected error |

---

## Common Middleware Combinations

### Pattern 1: Simple Authenticated Route
```typescript
router.get('/api/resource', authenticated, handler);
```

### Pattern 2: Admin-Only Route
```typescript
router.delete('/api/admin/resource', adminOnly, handler);
```

### Pattern 3: Campaign Member Route
```typescript
router.get('/api/campaigns/:campaignId/data', campaignMember, handler);
```

### Pattern 4: DM-Only Campaign Route
```typescript
router.put('/api/campaigns/:campaignId/maps', campaignDM, handler);
```

### Pattern 5: Complex Permission Check
```typescript
router.put('/api/characters/:characterId', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.session.userId!;
  const platformRole = req.session.platformRole!;
  const { characterId } = req.params;
  const { campaignId } = req.body;

  const hasPermission = await canEditCharacter(userId, characterId, campaignId, platformRole);

  if (!hasPermission) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ... proceed with update
});
```

---

## Per-user permission flags

Four booleans on `User` gate things the role system does not. None is carried in
the session, so each is read from the database at the point of use — do not
assume `req.session` knows about them.

| Flag | Default | What it gates |
|---|---|---|
| `globalAssetManager` | `false` | Uploading or managing GLOBAL-scope assets. Checked in `routes/assets.ts` alongside `platformRole === 'ADMIN'`; either is sufficient. |
| `templateEditor` | `false` | Publishing, editing and deleting shared character sheets (`/api/character-templates`). Checked in `routes/characterTemplates.ts`; platform ADMIN also passes. |
| `mustChangePassword` | `false` | When true, **every** endpoint returns 403 with `code: PASSWORD_CHANGE_REQUIRED` except `POST /api/auth/change-password`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/ping`, `GET /api/auth/appearance` and `GET /api/config`. WebSocket connections are refused on the same basis. Set when an admin creates an account or resets a password. |
| `isApproved` | `true` | Sign-in. An unapproved account authenticates but is refused at `routes/auth.ts`. New registrations are created unapproved when the instance requires approval. |

## Reading an asset: access follows use

The five asset-serving routes (`/api/assets/maps/:id`, `/tokens/:id`,
`/documents/:id`, `/audio/:id`, `/avatars/:userId`) decide read access from the
asset's **scope**. `GLOBAL` is readable by anyone signed in, `CAMPAIGN` by that
campaign's members, and `USER` by its uploader.

Scope alone is not enough for maps and tokens, because an asset can be *used*
somewhere its scope does not describe. A DM picking a map out of their own
library — which the picker offers, listing personal assets with no campaign
filter — leaves every player at that table 403ing on the battlemap. So
`routes/assets.ts` funnels the two image routes, the audio route, the document
route and `/:id/download` through one `canReadAssetFile`, which is
`canReadAsset` in `services/permissions.ts`. Beyond scope it asks two more
questions: `assetUsedInUserCampaign(assetId, userId)`, true when a map layer, a
token placed on a map, a character, a creature template, a token template, or
the track recorded in a campaign's `atmosphereAudio` setting, in one of the
caller's campaigns, points at that asset; and `documentSharedWithUser`, true
when a DM has linked the document to a campaign the caller belongs to
(`CampaignDocument`). The linking route runs the same `canReadAsset` against
the DM first, so a link can only ever grant what the DM could already read,
and then requires the document to be the DM's own or `GLOBAL`, so a document
shared into one campaign cannot be passed on by a member who runs another.

Three things this deliberately does **not** do:

- **It does not re-scope the asset.** `Asset.scope` carries a single
  `campaignId`, and one map is commonly shared by several campaigns at once, so
  promoting it on use would break the others.
- **It grants read only.** Deleting and editing are decided by their own routes
  and are unchanged — seeing the battlemap must not mean being able to delete it.
- **It does not cover avatars.** Those have their own reference path and were
  left alone.

### Atmosphere audio

The DM picks a track and the server broadcasts its URL; it does not relay the
sound. Every player's browser then fetches
`GET /api/assets/audio/:id` with that player's own session, so the read rule is
what decides whether the table hears anything, and a personal track was silent
for everyone but the DM until `assetUsedInUserCampaign` learned about it.

Two consequences to keep in mind when touching this:

- **Setting a track is an act of sharing, not of reading.** It makes the file
  readable by every member of the campaign for as long as it is set, so the
  socket handler (`websocket/handlers/atmosphere.ts`) checks `canReadAsset` for
  the DM before storing it, and deliberately passes `isAdmin` as `false`: a
  platform admin may read any file, but opening one to a table is a different
  act, and a track meant for a table belongs in the global library.
- **The grant is exactly one track, and it ends when the track does.** Nothing
  lets a member list or browse the DM's audio, and clearing the setting makes
  the file private again.
- **That handler is the only thing allowed to write the setting.** It lives in
  `Campaign.vibeSettings`, which the two campaign settings routes and campaign
  import also write, and none of those can tell whether the caller may read the
  asset an id names. They all go through `preserveAtmosphereAudio`
  (`utils/vibe-presets.ts`), which keeps whatever is stored and discards the
  caller's value, so a settings update neither opens a file nor stops the
  music. An import starts with no track at all.

### Documents

Documents are assets of type `DOCUMENT`, so everything above applies, plus:

- **Where one may be placed is one decision.** `canPlaceAssetAtScope(userId,
  type, scope, campaignId)` answers for both the multipart upload and
  `POST /api/assets/documents`: `GLOBAL` needs a platform admin or
  `globalAssetManager`, `CAMPAIGN` needs that campaign's DM, `USER` needs
  nothing. It returns `{ allowed, status, message }` so both routes refuse
  with the same wording, and on a yes it returns the `campaignId` the asset may
  be filed under, `null` for anything not campaign-scoped. **Store that, not the
  request's.** `Asset.campaignId` decides which campaign lists an asset, so a
  personal upload naming a campaign would otherwise put a row in that
  campaign's library without anyone there asking for it.
- **Editing is the uploader's or an admin's.** `PUT /documents/:id/content`
  checks `uploadedById` against the session, not `canReadAsset`; being able to
  read a shared rulebook must not mean being able to rewrite it for the table.
- **Sharing and unsharing are the DM's** (`campaignDM` on the link routes),
  and sharing is limited to the DM's own documents and global ones. A DM may
  read a document shared with a table they play at; they may not re-share it.
  Unlinking revokes read for the whole campaign at once.
- **Refusals are `404`, not `403`**, on the serving, edit and link routes, so
  no reply confirms that a private id exists.

Two things to get right when adding a check of this kind:

- **Read the flag, do not trust the session.** `templateEditor` and
  `globalAssetManager` are deliberately not session fields, so a permission
  change takes effect immediately rather than after the next sign-in. This is
  also why changing one does not sign anybody out: there is nothing stale to
  clear.
- **Branch on `code`, not on the message.** The password-change gate answers with
  a machine-readable `code`; clients route on that, and changing the wording must
  not change behaviour.

### Platform role is the one thing the session carries

`requireAdmin` reads `req.session.platformRole`, which is written at login and
never re-read, so a demotion leaves the person holding admin over their open
session. Sessions roll on every response and the client sends a keepalive, so
one that stays in use does not expire on its own.

`PUT /api/users/:id` therefore calls `destroyUserLoginSessions(id)` when the role
actually changes, and `DELETE /api/users/:id` calls it too, because the session
outlives the row it points at and nothing checks the user still exists. The same
helper ends a user's other sessions on a self-service password change and on
disabling MFA, with `exceptSessionId` keeping the device making the request
signed in.

The alternative, re-reading the role from the database on every request the way
`loadCampaignMembership` does for campaign roles, would also work and is the
more thorough fix if this ever needs revisiting.

---

## Campaign Membership Data

After using `campaignMember`, `campaignDM`, or `campaignDMOrPlayer` middleware:

```typescript
req.campaignMembership = {
  role: 'DM' | 'PLAYER' | 'SPECTATOR',
  characterIds: string[],
  campaignId: string
}
```

---

## Ownership is not the DM role

Two separate facts, and they are only the same person by default:

| Fact | Where it lives | Moves? |
| --- | --- | --- |
| Campaign owner | `Campaign.ownerId` | No — a DM transfer leaves it alone |
| DM | `CampaignMembership.role === 'DM'` | Yes — see below |

Decide **"is this user the DM?"** from the membership, never from `ownerId`.
Reading ownership works right up until the seat moves, and then it refuses the
actual DM and keeps privileges with someone who no longer runs the game. In
socket handlers that means `socket.role`; in routes, `req.campaignMembership`
or the `campaignDM` middleware.

`ownerId` gates exactly one thing — deleting the campaign (`canDeleteCampaign`),
which is deliberate: the destructive power stays with whoever created it.

### Transferring the DM role

`PUT /api/campaigns/:campaignId/dm` with `{ userId }` promotes a member and
demotes the sitting DM in one transaction, so the one-DM rule is never caught
half-applied. Allowed for the sitting DM, the campaign owner, or a platform
admin — `canTransferDM` in `services/permissions.ts`.

It does **not** use the `campaignDM` middleware, which loads the caller's
membership first and refuses a non-member, shutting out an admin who is not at
the table.

The generic role route still refuses to touch a DM or mint a second one. That is
intentional: transferring is the only supported way to move the seat, so there is
one atomic path rather than two.

### Membership changes under open sockets

`socket.role` and `socket.campaignId` are read once, when the socket
authenticates, and trusted by every gated handler after that. Anything that
changes a membership therefore has to reach live connections, or the person
keeps what they had until they reload. Three routes do, and all three are
best-effort so a socket layer that is down cannot fail a change already written:

| Route | Helper |
|---|---|
| `PUT /api/campaigns/:id/dm` | `applyRoleToLiveSockets(userId, campaignId, role)` for both seats |
| `PUT /api/campaigns/:id/members/:userId/role` | `applyRoleToLiveSockets(userId, campaignId, role)` |
| `DELETE /api/campaigns/:id/members/:userId` | `clearCampaignFromLiveSockets(userId, campaignId)` |

`clearCampaignFromLiveSockets` clears the cached campaign and role and leaves the
room, so the socket can neither act nor listen. Clearing `campaignId` is what
stops it acting: every handler refuses a socket that is not authenticated to a
campaign. A socket belongs to one campaign, so somebody playing elsewhere in
another tab is untouched.

REST needs no equivalent for campaign roles; its middleware reads the membership
per request. Platform role is a different matter, see below.

---

## Error Response Format

```typescript
// 401 Unauthorized
{
  "error": "Unauthorized",
  "message": "You must be logged in to access this resource"
}

// 403 Forbidden
{
  "error": "Forbidden",
  "message": "You do not have permission to access this resource"
}

// 404 Not Found
{
  "error": "Not Found",
  "message": "Campaign not found"
}
```

---

## Testing Checklist

When implementing a new protected route:

- ✅ Test with no authentication (should return 401)
- ✅ Test with wrong role (should return 403)
- ✅ Test with correct role (should succeed)
- ✅ Test with Admin role (should succeed if Admin override applies)
- ✅ Test with non-member (should return 403)
- ✅ Test with campaign member but wrong role (should return 403)

---

## Common Gotchas

### 1. Middleware Order Matters
```typescript
// ✅ CORRECT - loadCampaignMembership runs after requireAuth
router.get('/', authenticated, loadCampaignMembership, requireDM, handler);

// ❌ WRONG - loadCampaignMembership runs before auth check
router.get('/', loadCampaignMembership, requireAuth, requireDM, handler);
```

### 2. Use Composed Middleware
```typescript
// ✅ CORRECT - Use pre-composed middleware
router.get('/', campaignDM, handler);

// ❌ VERBOSE - Manual composition (works but verbose)
router.get('/', requireAuth, loadCampaignMembership, requireDM, handler);
```

### 3. Campaign ID Location
```typescript
// campaignId can come from:
req.params.campaignId  // URL parameter
req.body.campaignId    // Request body

// loadCampaignMembership checks both locations
```

### 4. TypeScript Types
```typescript
// ✅ CORRECT - Use AuthenticatedRequest
router.get('/', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  const role = req.campaignMembership!.role;  // TypeScript knows this exists
});

// ❌ WRONG - Using generic Request
router.get('/', campaignMember, async (req: Request, res: Response) => {
  const role = req.campaignMembership.role;  // TypeScript error!
});
```

---

**Quick Summary:**
1. Use `authenticated` for routes requiring login
2. Use `adminOnly` for admin-only routes
3. Use `campaignMember`, `campaignDM`, or `campaignDMOrPlayer` for campaign routes
4. Use permission helpers (`canEdit*`, `canManage*`, etc.) for complex logic
5. Always check permissions server-side, never trust client
6. Use `AuthenticatedRequest` type for TypeScript autocomplete

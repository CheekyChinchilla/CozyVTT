# RBAC Quick Reference Guide

_Last verified against the code on 2026-10-13: the files and helpers it names exist (a backend test checks that), and every section was read against the routes and middleware except these, which were spot-checked: what a player is sent of a token, the map broadcasts, copies and exports, the atmosphere audio import and the socket room fan-out. Re-date it only after reading those the same way._

## Middleware Cheat Sheet

### Before the route guards

`createApp` (`app.ts`) puts every `/api` request through these gates before a
router sees it, in this order (see `docs/ARCHITECTURE.md`, Request Flow):

1. The origin check: `403` for a change a browser sent from another site (`middleware/originCheck.ts`)
2. The restore gate: `503` while a restore replaces the database (`middleware/restoreGate.ts`)
3. The session lookup
4. The setup gate: until setup has run, `403` "Setup Required" for everything but `/health` and `/api/setup/*`; `POST /api/setup/init` also asks for the setup token (`middleware/setup.ts`, `routes/setup.ts`)
5. The general rate limiter: `429` past `RATE_LIMIT_MAX_REQUESTS` a minute per address, an IPv6 address counted by its /56 network
6. The password-change gate (`middleware/passwordChange.ts`), then the admin MFA gate (`middleware/adminMfa.ts`); both are described below

### Import Statement
```typescript
import { authenticated, adminOnly, campaignMember, campaignDM, campaignDMOrPlayer } from '../middleware/compose';
import { AuthenticatedRequest } from '../middleware/rbac';
```

### Route Protection Patterns

#### 1. Authenticated User Only
```typescript
router.get('/api/campaigns', authenticated, handler);
```

#### 2. Admin Only
```typescript
router.get('/api/campaigns/admin/all', adminOnly, handler);
```

#### 3. Campaign Member (Any Role)
```typescript
router.get('/api/campaigns/:campaignId', campaignMember, handler);
// Access: req.campaignMembership.role, req.campaignMembership.characterIds
```

#### 4. Campaign DM Only
```typescript
router.put('/api/campaigns/:campaignId', campaignDM, handler);
```

`src/routes/__tests__/campaignRoleGuards.e2e.test.ts` lists every route that
is the DM's alone and every route any member may use, and fails when a
route's guard differs from its list, so a new campaign route, or a guard
changed from `campaignDM` to `campaignMember`, needs that list changed too.
It then checks that each DM-only route refuses players and spectators (403),
and that every listed route refuses members of other campaigns (403) and
callers who are not signed in (401). A campaign route with neither guard must
decide in its handler and be named in that file.

#### Characters in a campaign
Any member may read a character assigned to the campaign, and the DM may edit
it, only while its owner is still a member (`ownerStillIn` in
`routes/characters.ts`). Removing a member takes their characters out of the
campaign in the same transaction; a character left naming a campaign by a
removal from before that is its owner's alone, and its saves are not sent to
that campaign. The socket's hit point and hit dice events ask the same
(`characterInCampaign` in `utils/characterCampaign.ts`).

Only the owner assigns a character to a campaign (`POST
/api/characters/:id/assign` with a `campaignId`). The owner, or the DM of the
campaign the character is in, may take it out of that campaign (the same route
with `campaignId` null); it stays with its owner.

The top-level `notes` of a `CALL_OF_CTHULHU_7E` sheet, which the editor calls
Keeper's Notes, belong to the Keeper: the DM of the character's campaign alone
reads and writes them, and the owner only when they are that DM; a character
in no campaign has no Keeper (`utils/keeperNotes.ts`). Every reply that carries a sheet, and
`character.updated`, passes it through `characterForReader`, which leaves the
field out for anyone else. A save by anyone else keeps the stored notes
(`sheetKeepingKeeperNotes`), and a create by anyone but the Keeper drops
them. They are cleared when the character enters another campaign, by
`POST /api/characters/:id/assign` or by accepting an invitation with it, and
a copy has none.

#### 5. Campaign DM or Player (Excludes Spectators)
`campaignDMOrPlayer` is defined in `middleware/compose.ts` and no route uses it
today. Where spectators are refused, the handler does it: `dice.roll` (socket)
through `canRollDice`, token control through `canControlToken`, and doors
through `canToggleDoor` (`wall:update`: the DM may change any wall; a player
may open or close an unlocked door and nothing else, the segment's position
and size they send being ignored, on a lit map only a door one of their
tokens can see, and under manual fog only one beside a square revealed to
them, or the answer is "You cannot see that door"). Anyone but the
DM is sent a locked door as `door-closed`, and no light that is off.
Chat is a socket event (`chat.message`)
and spectators may send it. `character.hp.update`, `character.hitdice.spend`
and `PUT /api/characters/:id` refuse a spectator outright, even for a
character they own, because a token bound to it follows the sheet on every
screen. The token-image sync that route runs repaints tokens only where the
editor may: the owner's change reaches every campaign bound to the character
except one where the owner is a spectator, and a DM's change to a player's
character reaches only the campaigns that DM runs. `controlledBy` may only name a player
(`canHoldTokens`): a token cannot be created for or handed to a spectator, a
spectator's character is placed with no controller, and what a spectator is
sent never treats a token as theirs (`viewerIdFor` in `utils/spirit-layer.ts`),
nor does crossing into the spirit realm, which `getSpiritVisibility` counts
for players only.

---

## Permission Helper Functions

### Import Statement
```typescript
import {
  canControlToken,
  canMoveTokensNow,
  canReadMap,
  canDeleteCampaign,
  canTransferDM,
  canRollDice,
  // ... other helpers
} from '../services/permissions';
```

### Common Patterns

#### Who may edit a character

`PUT /api/characters/:id` decides this in the route (`routes/characters.ts`), from the
character's own campaign, never from one the caller sends:

1. Load the character, then the caller's membership in **the character's** `campaignId`.
2. A spectator is refused outright, even for a character they own.
3. Otherwise the owner may edit, and so may the DM of that campaign, but only while the
   owner is still a member (`ownerStillIn`). A platform admin has no right here of their own.

**Do not copy `canEditCharacter` from `services/permissions.ts`.** No route calls it, and it
disagrees with the route on all three points: it lets any admin edit, it takes the campaign
id from the caller (so the DM of any campaign of their own could name it and edit any
character), and it does not refuse a spectator who owns the character.

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
`token.move*` socket events, so the two channels cannot disagree. Beside it,
`canMoveTokensNow(role, campaign.status)` holds a player's move while the
session is paused or has ended (`PAUSED`, `INACTIVE`), on the same four paths;
the DM moves tokens at any time. The spectator
clause matters: `controlledBy` is set once and is not cleared when someone is
demoted, so a spectator can still hold a token from their time as a player.
Such a token is nobody's for what the spectator is sent, too: the
per-recipient filters ask `viewerIdFor(role, userId)`, which is undefined for
anyone but a player, so they get no hit points, darkvision or obscured
identity from it and no sight on a lit map.

`controlledBy` is the whole of what makes a token a player's, on the server
and in the client alike; a token bound to one of their characters is not theirs
by that alone. A token created with a `characterId` and no `controlledBy` is
given the character's owner as controller, provided the character belongs to
the campaign and its owner is a `PLAYER` member of it (`canHoldTokens`). A
character owned by the DM or a spectator gives its token no controller.

#### Which token fields a player may change

`PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId` is mounted on
`campaignMember`, so the route guard alone does **not** decide this. A player who
controls the token may change only where it is and what it is doing:

| A player controlling the token may set | Everything else is DM-only |
|---|---|
| `position`, `rotation`, `conditions` | `hp`, `showHpBar`, `notes`, `initiative`, `type`, `disposition`, `visible`, `name`, `imageUrl`, `layer`, `controlledBy`, `displayMode`, `statBlock`, `creatureTemplateId`, `metadata`, `sightRadius`, `size`, `obscured` |

`size` and `sightRadius` are DM-only because both decide what the server sends
that player: a token always sees half its own footprint, so a player who could
enlarge their token would enlarge their sight.

The DM-only list is `restrictedFields` in `routes/maps.ts`. **Adding a token field
means adding it there too** unless a player is meant to write it — the list is
deny-based, so a new field is player-writable by default. That is how `metadata`
came to be writable by any campaign member: it was added to the token shape and
never added to the list.

#### Which token fields a player is sent

What a player *receives* of a token is decided on the server too, in
`tokenForRecipient` (`utils/spirit-layer.ts`), which every send to a non-DM
goes through: the map fetch, the token update's reply, `map.changed`,
`token:appeared` and the initiative order (`initiative.state`). The client
has display rules for some of these, but a display rule protects nothing,
since whatever reaches the browser can be read there.

| Sent to a player | Only when |
|---|---|
| `notes`, `statBlock` | never |
| `hp` | the player controls the token, or its `showHpBar` is on |
| `sightRadius`, `creatureTemplateId` | the player controls the token |
| the identity of an `obscured` token: name, picture, conditions, metadata, HP, disposition, character and template links, controller, kind, facing, initiative and display mode (`utils/tokenMask.ts` builds the masked token from a list of what may be known) | the player controls the token |
| everything else on a token they may see at all | always |
| a token's move events (`token.move.start`, `token.moved`, `token:appeared`) | the map fetch would send them the token (visible, on a plane they can see), and on a lit map they could see it when the drag began |

`fogData` on a map is DM-only likewise (`filterMapData`); `spiritLayerUrl` goes
to a player only while they can see the spirit layer (crossed over, or the DM
has revealed it to everyone), and the campaign overview blanks it on the same
rule. **A new token field a player must not read goes into
`tokenForRecipient`**, for the same reason a new field a player must not
write goes into `restrictedFields`.

#### Check Campaign Deletion Permission
```typescript
const canDelete = await canDeleteCampaign(userId, campaignId, platformRole);

if (!canDelete) {
  return res.status(403).json({ error: 'Forbidden', message: 'Only the campaign owner or admin can delete this campaign' });
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
| 409 | Conflict | The request conflicts with what is stored now: the last admin, a DM seat that stops an account deletion, an asset still in use, a character changed since it was loaded, an email address already taken, a backup, restore or SRD import already running, a fog operation while fog is off |
| 429 | Too Many Requests | A rate limit: the general `/api` limiter or a route's own |
| 500 | Internal Server Error | Unexpected error |
| 503 | Service Unavailable | A restore is replacing the database (the restore gate), email is needed and SMTP is not set up, or a Universal VTT import could not start or finish in time |

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
router.post('/api/campaigns/:campaignId/maps', campaignDM, handler);
```

### Pattern 5: Complex Permission Check
When the rule depends on the record, load it first and take the campaign from the record, never from the request:
```typescript
router.put('/api/characters/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.session.userId!;
  const character = await prisma.character.findUnique({ where: { id: req.params.id } });
  if (!character) return res.status(404).json({ error: 'Not Found', message: 'Character not found' });

  // The caller's role in the character's own campaign
  const membership = character.campaignId
    ? await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: character.campaignId } },
      })
    : null;
  if (membership?.role === 'SPECTATOR') {
    return res.status(403).json({ error: 'Forbidden', message: 'Spectators cannot edit a character in this campaign' });
  }
  const allowed =
    character.userId === userId ||
    (membership?.role === 'DM' && character.campaignId !== null && (await ownerStillIn(character.userId, character.campaignId)));
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to edit this character' });
  }

  // ... proceed with update
});
```

---

## Per-user permission flags

Four booleans on `User` gate things the role system does not. `globalAssetManager`
and `templateEditor` are not carried in the session, so each is read from the
database at the point of use; do not assume `req.session` knows about them.
`mustChangePassword` is copied into the session at sign-in and the gate trusts
that copy (it reads the database only for a session from before the field
existed), and `isApproved` is read at sign-in only.

| Flag | Default | What it gates |
|---|---|---|
| `globalAssetManager` | `false` | Placing an asset at GLOBAL scope (an upload, `POST /api/assets/documents`, a move to GLOBAL): a platform ADMIN or a user with the flag (`canPlaceAssetAtScope`). Deleting a global asset, moving it out of the library or rewriting a global document: an ADMIN, or its uploader while they keep the flag (`mayChangeAsset`, `services/permissions.ts`). |
| `templateEditor` | `false` | Editing and deleting other people's shared character sheets (`PUT` and `DELETE /api/character-templates/:id`). Any signed-in user may publish one and edit or delete their own. Checked in `routes/characterTemplates.ts` (`canModifyTemplate`); platform ADMIN also passes. |
| `mustChangePassword` | `false` | When true, **every** endpoint returns 403 with `code: PASSWORD_CHANGE_REQUIRED` except `POST /api/auth/change-password`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/ping`, `GET /api/auth/appearance` and `GET /api/config`. WebSocket connections are refused on the same basis. Set when an admin creates an account or resets a password. |
| `isApproved` | `true` | Sign-in. An unapproved account authenticates but is refused at `routes/auth.ts`. New registrations are created unapproved when the instance requires approval. |

## Reading a map: the current one

`canReadMap(role, mapId, campaign.currentMapId)` in `services/permissions.ts`:
the DM may read any map of the campaign; a player or spectator only the one the
campaign is showing. It gates `GET /api/campaigns/:campaignId/maps` (a player's
list holds the current map alone), `GET .../maps/:id` and its `walls` and
`lights` (404 for any other map), the `maps` array of
`GET /api/campaigns/:campaignId`, and the `walls:request`, `lights:request`,
`fog:request_state` and `exploration:request` socket events (answered with
nothing). It gates writes too: a player's `PUT .../maps/:id/tokens/:tokenId`
(404), `token.move.start`, `token.move` and `token.move.end`, a door
toggled with `wall:update`, `exploration:reveal` and `initiative.roll`
(answered with `error`, frames dropped) all refuse
any map but the current one, even a token the player controls on it. And it
gates what is broadcast: a map's live wall, light, fog, settings, ping and
explored-memory-reset events, and the DM's editing notice, go through
`emitToMapReaders` in `websocket/utils.ts`, which sends them to the whole
campaign for the current map and to the DM's sockets for any other. A map the
DM has prepared but not switched to is therefore the DM's alone, tokens left
visible on it included.

## Reading an asset: access follows use

Putting an asset *into* a campaign's library, by uploading at CAMPAIGN scope or
by moving one there (`PATCH /api/assets/:id/scope`), is the DM's
(`canPlaceAssetAtScope`); a player may add token art, since they upload their
own character's, and a spectator adds nothing. Every route that stores a
reference to an asset checks it with `canReferenceAsset` first: map create and
update (image and spirit layer), token create and update, token and creature
templates, and a character's `tokenImageUrl`. So pointing at an asset never
grants the right to read it. A map's picture and spirit layer must also be
an asset uploaded as a map picture (`isMapPicture`, asked by the map routes
after `canReferenceAsset`). An update may send back the address already
stored even if it can no longer be read, and an address naming an asset that
does not exist is accepted, since it grants nothing. So is a picture a record
of the same campaign already stores (a copy: Duplicate, Save as Template,
placing from a template), since the read grant turns on a reference existing
in the campaign and another one there grants no one anything; a copy into a
different campaign is checked in full. The check never counts a
platform admin's right to read any file: a stored reference shows the asset
to the whole table, so an admin who is a campaign's DM may reference only what
they could read as that DM. An address on this server must be exactly an
asset's own (`/api/assets/<kind>/<id>`): any other same-origin path is
refused, since every viewer's browser would request it with their own
session, and because an address the check read as naming nothing was read
differently by the exports. The campaign export and a map's UVTT export
include only the asset files their caller may read. A map's use counts
for a player only while it is the campaign's current map (`canReadMap`): the
artwork and token art of a prepared map stay the DM's until they switch to it.
The list and detail
responses select the public fields only; `filePath` and `thumbnailPath` are the
server's. A map's spirit-layer image is listed to a member, and served, only
when that member may see the spirit plane there (`getSpiritVisibility`), which
is what the map itself does with it.

The asset-serving routes (`/api/assets/maps/:id`, `/tokens/:id`,
`/documents/:id`, `/audio/:id` and `/:id/download`) decide read access from the
asset's **scope**; `/avatars/:userId` serves a user's avatar to anyone signed
in. `GLOBAL` is readable by anyone signed in, `CAMPAIGN` by that
campaign's members, and `USER` by its uploader. A `CAMPAIGN` asset with no
campaign recorded (the foreign key nulls it when a campaign row goes) is read
as a `USER` one, so a way of removing campaigns that forgets to turn their
assets personal first cannot open them to everyone.

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
shared into one campaign cannot be passed on by a member who runs another. A
DM who is a platform admin passes both checks, so may share any document.

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

Three things to keep in mind when touching this:

- **Setting a track is an act of sharing, not of reading.** It makes the file
  readable by every member of the campaign for as long as it is set, so the
  socket handler (`websocket/handlers/atmosphere.ts`) checks `canReadAsset` for
  the DM before storing it, and deliberately passes `isAdmin` as `false`: a
  platform admin may read any file, but opening one to a table is a different
  act, and a track meant for a table belongs in the global library.
- **The grant is exactly one track, and it ends when the track does.** Nothing
  lets a member list or browse the DM's audio, and clearing the setting makes
  the file private again.
- **Only the shared setter stores a track id a client chose.**
  `setCampaignAmbientAudio` (`services/atmosphereAudio.ts`) makes the check
  above, and both that handler and the vibe switch go through it. The setting
  lives in `Campaign.vibeSettings`, which the two campaign settings routes and
  campaign import also write. The settings routes cannot tell whether the
  caller may read the asset an id names, so they go through
  `preserveAtmosphereAudio` (`utils/vibe-presets.ts`), which keeps whatever is
  stored and discards the caller's value: a settings update neither opens a
  file nor stops the music. Campaign import discards the archive's id too, and
  sets the track only to the copy of that sound file it has just imported, an
  asset of the new campaign uploaded by the importer (`remapAtmosphereAudio` in
  `services/campaignImporter.ts`), or to no track when the archive does not
  hold the file.

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
- **Editing follows the delete rule.** `PUT /documents/:id/content` asks
  `mayChangeAsset`, not `canReadAsset`; being able to read a shared rulebook
  must not mean being able to rewrite it for the table. `mayChangeAsset` is the
  one rule for deleting an asset, moving it out of its scope and editing a
  document: a campaign's own asset is its uploader's while still a member, the
  campaign's DM's and an admin's; a global one an admin's, or its uploader's
  while they keep `globalAssetManager`; a personal one its uploader's and an
  admin's. A campaign asset with no campaign recorded is an admin's alone.
- **Sharing and unsharing are the DM's** (`campaignDM` on the link routes),
  and sharing is limited to the DM's own documents and global ones, unless the
  DM is a platform admin, who may share any document. A DM may read a document
  shared with a table they play at; they may not re-share it. Unlinking
  revokes read for the whole campaign at once.
- **Refusals are `404`, not `403`**, on the serving and edit routes, and on
  the link route for a document the DM cannot read, so no reply confirms that
  a private id exists. A document the DM can read but may not share is refused
  with `403`.

Two things to get right when adding a check of this kind:

- **Read the flag, do not trust the session.** `templateEditor` and
  `globalAssetManager` are deliberately not session fields, so a permission
  change takes effect immediately rather than after the next sign-in. This is
  also why changing one does not sign anybody out: there is nothing stale to
  clear.
- **Branch on `code`, not on the message.** The password-change gate answers with
  a machine-readable `code`; clients route on that, and changing the wording must
  not change behaviour.

### What only an admin can reach

- **Assets with no uploader.** `uploadedById` is set to null when the uploader's
  account is deleted, and a null uploader grants no one anything through
  `assetUsedInUserCampaign`. A `USER` asset in that state is movable and
  deletable by platform admins alone, and readable by them alone, except a
  document still shared into a campaign, which that campaign's members go on
  reading. `GET /api/assets?uploadedBy=none` lists every asset with no
  uploader, campaign assets among them; like any `uploadedBy` value it is
  honoured for admins only and ignored for everyone else.
- **Leftover files.** `GET /api/admin/orphaned-files` lists files in the
  uploads folder's asset folders that no asset row names, and
  `DELETE /api/admin/orphaned-files` deletes the ones named in its body that
  still are, at that moment (`services/orphanedFiles.ts`). Both sit in
  `routes/adminStorage.ts`, mounted under `/api/admin` and guarded by
  `requireAuth` and `requireAdmin`, as every `/api/admin` route is. A player
  gets `403`, someone signed out `401`. Files changed in the last hour are left
  out. The delete looks each name up in a fresh scan, so a name outside the
  asset folders reaches nothing, and writes what it deleted to the activity
  log.
- **The SRD creature import.** `POST /api/campaigns/:campaignId/creatures/seed`
  fills the creature library every campaign shares and fetches from Open5e on
  every run, so it is guarded by `requireAuth` and a platform admin check in
  `routes/creatures.ts`, not by `campaignDM`: any user can be the DM of a
  campaign of their own. The campaign in the address plays no part, and an
  admin need not be a member of it. Anyone else gets `403` ("Only an
  administrator can import the SRD creatures…"). `GET …/creatures/seed/status`
  stays open to campaign members and says in `canSeed` whether the caller may
  run it. The command-line seed script needs shell access to the server.

### Platform role: the session's copy, re-read only for admins

`requireAdmin` reads `req.session.platformRole`, which is written at login.
Only `middleware/adminMfa.ts` re-reads it: on every request of a signed-in
administrator it reads the account and refreshes the session's copy, so a
demoted administrator loses the admin guards on their next request even if
ending their sessions failed. Nothing re-reads the role of anyone else.
Sessions roll on every response and the client sends a keepalive, so one that
stays in use ends only `REMEMBER_ME_MAX_AGE` (30 days) after it was made: the
guards then answer 401 with `code: SIGN_IN_EXPIRED` and destroy it
(`middleware/auth.ts`, `services/signedIn.ts`), `GET /api/auth/me` answers it
the same way (`withinSignInLimitOr401`), and the socket handshake refuses it
too. An account keeps at most 20 sign-ins (`capLoginSessions`).

`PUT /api/users/:id` therefore also calls `destroyUserLoginSessions(id)` when the role
actually changes, and `DELETE /api/users/:id` and `DELETE /api/auth/account` call
it too, because the session outlives the row it points at and nothing checks that
the user still exists on a non-admin's REST requests. The same
helper ends a user's other sessions on a self-service password change and on
turning MFA on or off, with `exceptSessionId` keeping the device making the
request signed in.

Re-reading the role from the database on every request, the way
`loadCampaignMembership` does for campaign roles, would make ending the sessions
unnecessary; `adminMfa.ts` does it only for administrators.

### The instance keeps an admin

`isOnlyAdmin(userId)` (`services/platformAdmins.ts`) counts the admins other
than that user. `DELETE /api/auth/account` refuses an admin for whom it is true,
and `PUT /api/users/:id` refuses setting `platformRole` to `USER` on such an
admin, both with `409` and a message to promote someone first. Nothing else
grants `ADMIN` once setup has run (the first-user rule needs an empty
instance), so an instance that lost its last admin could not get one back.
`DELETE /api/users/:id` asks it too: the admin calling it is normally the
admin who remains, but not when that admin is being demoted at the same
moment.

Deleting an account is also refused, with `409`, while it holds the DM seat
of any campaign, owned or not, or owns a campaign with nobody in the DM seat
(`deleteAccount` in `services/accountDeletion.ts`). The answer names those
campaigns, and the admin route's adds each one's other members, so the seat
can be handed on first. A campaign the account owns while someone else is its
DM passes to that DM, and the documents the account shared into a campaign
stay shared, the share passing to the campaign's DM, or to its owner when the
seat is empty.

Each of the three asks inside the serializable transaction that makes its
write (`inSerializableTransaction`, `utils/serializable.ts`; the account
deletions through `deleteAccount`). Two admins removed at the same moment
would otherwise each count the other and both go ahead; PostgreSQL refuses
one of two overlapping serializable transactions, which runs again, sees the
other's write and is refused with the `409`. Only serializable transactions
are checked against each other, so any new path that takes an admin away has
to ask the same way.

`PUT /api/users/:id` reads the account again inside that transaction when the
request sets `platformRole` to `USER`, and decides there whether it takes the
admin role away. The read the route makes first can be behind a promotion that
landed since, and a demotion judged from it would skip the check, the sign-out
and the activity log line. Its logging compares against the row as written.

### What a session alone cannot change

A session cookie can be stolen, so anything that decides who can sign in from
then on also asks for the current password:

| Change | Route | Password field |
|---|---|---|
| Password | `POST /api/auth/change-password` | `currentPassword` |
| Own email address | `PUT /api/users/:id` with `email`, when `:id` is the caller | `currentPassword` |
| Start MFA enrolment | `POST /api/auth/mfa/setup` | `password` |
| Turn MFA off | `POST /api/auth/mfa/disable` | `password`, and a current code in `token`; refused (403) for an admin |
| Regenerate backup codes | `POST /api/auth/mfa/backup-codes` | `password` |
| Delete own account | `DELETE /api/auth/account` | `password` |

An `ADMIN` account must have MFA on. Its 7-day deadline is counted from the
latest of the policy start, the account's `createdAt`, its promotion and a
Reset MFA by another admin; all but `createdAt` are activity-log rows
(`services/adminMfaPolicy.ts`). Until the deadline nothing is refused, and
`GET /api/auth/me` and the sign-in reply carry `adminMfaDeadline` for the
banner. Past it, `middleware/adminMfa.ts` answers 403 with
`code: MFA_ENROLMENT_REQUIRED` to every `/api` request except
`POST /api/auth/mfa/setup` and `POST /api/auth/mfa/verify` and the paths the
password-change gate allows (`change-password`, `logout`, `me`, `ping`,
`appearance` and `/api/config`). On every admin request it re-reads the role
from the database into the session. A database error lets the request
through, so a passing fault does not lock every admin out. The live
connection applies the same deadline (`pastAdminMfaDeadline`): the socket
handshake and every `authenticate` (`websocket/auth.ts`) refuse such an admin
with `Unauthorized` and close the connection, and a database error while the
deadline is checked lets the connection through there too.

The admin reset routes, `POST /api/users/:id/reset-password` and
`POST /api/admin/users/:id/reset-mfa`, ask for no password because the admin
does not have the target's. They refuse the caller's own id (400), so a stolen
admin session cannot use them to get round the two rows above for its own
account. Wrong passwords on `POST /api/auth/change-password`, `DELETE /api/auth/account` and the own-email change are limited to 10 per 15 minutes per
account (`passwordCheckLimiter`); the two-factor routes in the table keep their
per-address limiters (`credentialLimiter` on `POST /api/auth/mfa/setup`, disable
and backup codes; `mfaSetupLimiter` on enrolment's code step,
`POST /api/auth/mfa/verify`), with no per-account count.

An admin changing someone else's email gives no password, since they do not
have it. The email check runs before the new address is looked up, so a
session without the password cannot use it to learn which addresses have
accounts. A new address also voids the account's unused reset and invitation
links (`voidOutstandingResetLinks`), and the old address is sent a notice when
SMTP is configured.

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
| Campaign owner | `Campaign.ownerId` | Only when the owner's account is deleted, to the sitting DM; a DM transfer leaves it alone |
| DM | `CampaignMembership.role === 'DM'` | Yes — see below |

Decide **"is this user the DM?"** from the membership, never from `ownerId`.
Reading ownership works right up until the seat moves, and then it refuses the
actual DM and keeps privileges with someone who no longer runs the game. In
socket handlers that means `socket.role`; in routes, `req.campaignMembership`
or the `campaignDM` middleware.

`ownerId` decides three things. Only the owner (or an admin) may delete the
campaign (`canDeleteCampaign`), which is deliberate: the destructive power
stays with whoever created it. The owner may always hand the DM seat on
(`canTransferDM`). And the owner cannot be removed from the campaign
(`DELETE /api/campaigns/:campaignId/members/:userId` answers `400`), since
only the DM can add a membership and the owner could not get back in.

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
keeps what they had until they reload. The routes below do, and all of them
are best-effort so a socket layer that is down cannot fail a change already
written:

| Route | Helper |
|---|---|
| `PUT /api/campaigns/:id/dm` | `applyRoleToLiveSockets(userId, campaignId, role)` for both seats |
| `PUT /api/campaigns/:id/members/:userId/role` | `applyRoleToLiveSockets(userId, campaignId, role)`, then `campaign.role.changed` to the campaign so every open page, the member's own included, updates its controls |
| `DELETE /api/campaigns/:id/members/:userId` | `clearCampaignFromLiveSockets(userId, campaignId)` |
| `DELETE /api/campaigns/:id` | `clearDeletedCampaignFromLiveSockets(campaignId)` for every socket in the room, then the combat state is cleared |

The routes below end a sign-in's live sockets along with it, through `endLiveSockets(userId, reason, { exceptSessionId?, onlySessionId? })` (`websocket/utils.ts`), beside `destroyUserLoginSessions`; a restore ends every socket on the instance through `endEveryLiveSocket`. Nothing else does. A socket's sign-in is checked against the session store when it connects and again on every `authenticate` (`socketSessionIsLive` in `websocket/auth.ts`), which refuses with `Unauthorized` and closes the connection once the sign-in has ended or its administrator is past the two-factor deadline; so a session that expires from inactivity leaves an open socket in the campaign it is already in until it disconnects or asks to join a campaign again.

| Route | Which sockets end |
|---|---|
| `POST /api/users/:id/reset-password`, `DELETE /api/users/:id`, `PUT /api/users/:id` (platform role changed) | every socket of that user |
| `POST /api/auth/reset-password` (emailed link) | every socket of that user; this route now also destroys their login sessions |
| `POST /api/auth/change-password`, `POST /api/auth/mfa/verify` (MFA turned on), `POST /api/auth/mfa/disable` | every socket but those of the sign-in making the change |
| `POST /api/auth/logout` | the sockets of that sign-in only |
| `DELETE /api/auth/account` | every socket of that user; its login sessions on every device end too |
| `POST /api/admin/backups/restore` | every socket on the instance, and the in-memory combat state is dropped |

Each socket is sent `campaign.access.revoked` with reason `signed-out` and a sentence saying why as its `message` (such as "You signed out." or "The instance is being restored from a backup. Sign in again once it has finished."), then disconnected. A socket records the login session it was opened under (`sessionId`, set at the handshake) so a sign-in can be singled out.

`clearCampaignFromLiveSockets` clears the cached campaign and role and leaves the
room, so the socket can neither act nor listen. Clearing `campaignId` is what
stops it acting: every handler refuses a socket that is not authenticated to a
campaign. A socket belongs to one campaign, so somebody playing elsewhere in
another tab is untouched. `authenticate` keeps a socket in one campaign room:
it handles the events one at a time per socket and leaves every other campaign
room on each success, and every fan-out that walks a room and reads each
socket's role goes through `campaignSockets`, which skips a socket whose
`campaignId` is not that room. A fan-out that awaits anything between that
fetch and reading the roles filters again with `stillInCampaign` right before
it sends, and a drag's frames, whose recipients are decided once per drag, go
only to those still in the room, so a socket that switches campaigns mid-way
is not sent the old campaign's view under its new role.

REST needs no equivalent for campaign roles; its middleware reads the membership
per request. Platform role is a different matter, see above.

### A removed member's own notes and macros

Removing a member deletes none of their `PersonalNote` or `DiceMacro` rows, and
every notes and macros route asks for membership. Four read-only routes,
guarded by `authenticated` alone, let the author still read their own
(`routes/leftCampaigns.ts`): `GET /api/campaigns/left` lists the campaigns the
caller has no membership in and still has notes or macros in,
`GET /api/campaigns/left/:campaignId` returns their note titles and macros in
one such campaign, `GET /api/campaigns/left/:campaignId/notes/:noteId`
returns one note with its text, and `GET /api/campaigns/left/:campaignId/notes`
returns all their notes in that campaign with their text, for the Download
button. Every query is scoped to the session's user id and to a campaign the
caller has no membership in, so a member is answered `404` and uses the member
routes. The last three answer `404` where the caller has nothing, so they
reveal nothing about a campaign they were never in. The lists carry titles
only. A campaign can hold 200 notes of 100,000 characters each, so the
download is written out ten notes at a time and is limited to 60 requests an
hour per user (`middleware/leftNotesDownloadLimiter.ts`, `429` past it).
Nothing lets a non-member change them. Rejoining puts them back behind the
member routes, and deleting the campaign cascades them away.

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
- ✅ Test with a platform admin who is not a member: the campaign guards refuse them (403). Only a few routes let an admin through without a seat at the table, such as handing the DM seat on, deleting a campaign, reading any asset and the SRD import, and each one says so
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
`loadCampaignMembership` reads the campaign from `req.params.campaignId` only.
A `campaignId` in the request body or the query string is ignored, so a
request cannot pick which campaign it is checked against. A guarded route
needs `:campaignId` in its own path, or in the path it is mounted at with a
router created as `Router({ mergeParams: true })`; without it, the guard
answers 400 "Campaign ID is required".

```typescript
// ✅ CORRECT - campaignId in the route path
router.get('/:campaignId/notes', campaignMember, handler);

// ✅ CORRECT - campaignId in the mount path, read through mergeParams
app.use('/api/campaigns/:campaignId/maps', mapRoutes); // mapRoutes = Router({ mergeParams: true })
router.get('/', campaignMember, handler);

// ❌ WRONG - no campaignId in the path; a body campaignId is not read
router.post('/notes', campaignMember, handler); // always 400
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
4. Use the permission helpers in `services/permissions.ts` that routes already call (`canControlToken`, `canReadMap`, `canDeleteCampaign`, …) for rules the guards cannot express, and decide a record's rule from the record itself
5. Always check permissions server-side, never trust client
6. Use `AuthenticatedRequest` type for TypeScript autocomplete

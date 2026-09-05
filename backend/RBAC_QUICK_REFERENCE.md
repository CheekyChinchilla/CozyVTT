# RBAC Quick Reference Guide

_Last verified against the code on 2026-09-01._

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
  canMoveToken,
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

#### Check Token Movement Permission
```typescript
const canMove = await canMoveToken(userId, characterId, campaignId);

if (!canMove) {
  return res.status(403).json({ error: 'Cannot move this token' });
}
```

#### Which token fields a player may change

`PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId` is mounted on
`campaignMember`, so the route guard alone does **not** decide this. A player who
controls the token may change only where it is and how it looks in play:

| A player controlling the token may set | Everything else is DM-only |
|---|---|
| `position`, `rotation`, `size`, `conditions` | `hp`, `showHpBar`, `notes`, `initiative`, `type`, `disposition`, `visible`, `name`, `imageUrl`, `layer`, `controlledBy`, `displayMode`, `statBlock`, `creatureTemplateId`, `metadata` |

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

The four asset-serving routes (`/api/assets/maps/:id`, `/tokens/:id`,
`/audio/:id`, `/avatars/:userId`) decide read access from the asset's **scope**.
`GLOBAL` is readable by anyone signed in, `CAMPAIGN` by that campaign's members,
and `USER` by its uploader.

Scope alone is not enough for maps and tokens, because an asset can be *used*
somewhere its scope does not describe. A DM picking a map out of their own
library — which the picker offers, listing personal assets with no campaign
filter — leaves every player at that table 403ing on the battlemap. So
`routes/assets.ts` funnels both image routes through one `canReadAssetFile`,
which falls back to `assetUsedInUserCampaign(assetId, userId)`: true when a map
layer, a token placed on a map, a character, a creature template or a token
template in one of the caller's campaigns points at that asset.

Three things this deliberately does **not** do:

- **It does not re-scope the asset.** `Asset.scope` carries a single
  `campaignId`, and one map is commonly shared by several campaigns at once, so
  promoting it on use would break the others.
- **It grants read only.** Deleting and editing are decided by their own routes
  and are unchanged — seeing the battlemap must not mean being able to delete it.
- **It does not cover audio or avatars.** Those have their own reference paths
  and were left alone.

Two things to get right when adding a check of this kind:

- **Read the flag, do not trust the session.** `templateEditor` and
  `globalAssetManager` are deliberately not session fields, so a permission
  change takes effect immediately rather than after the next sign-in.
- **Branch on `code`, not on the message.** The password-change gate answers with
  a machine-readable `code`; clients route on that, and changing the wording must
  not change behaviour.

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

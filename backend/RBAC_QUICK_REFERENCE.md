# RBAC Quick Reference Guide

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

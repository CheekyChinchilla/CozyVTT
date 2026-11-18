/**
 * The API key permission rules on their own: levels, the "*" floor, which
 * route needs what, and what a client may ask for.
 */

import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_IDS,
  availableLevels,
  grantedLevel,
  hasLevel,
  normalizePermissions,
  routeAccess,
  ruleFor,
} from '../apiKeyPermissions';
import { accountMayHoldKeys, generateApiKey, hashApiKey, issueApiKey, isExpired, storedPermissions } from '../apiKeys';

describe('grantedLevel', () => {
  it('is none for a permission the key does not hold', () => {
    expect(grantedLevel({}, 'maps')).toBe('none');
    expect(grantedLevel(null, 'maps')).toBe('none');
  });

  it('counts "*" as a floor that an explicit entry can rise above', () => {
    expect(grantedLevel({ [ALL_PERMISSIONS]: 'read' }, 'maps')).toBe('read');
    expect(grantedLevel({ [ALL_PERMISSIONS]: 'read', maps: 'write' }, 'maps')).toBe('write');
    expect(grantedLevel({ [ALL_PERMISSIONS]: 'write', maps: 'read' }, 'maps')).toBe('write');
  });

  it('does not let "*" reach the administration permissions, which are granted one by one', () => {
    expect(grantedLevel({ [ALL_PERMISSIONS]: 'write' }, 'admin-backups')).toBe('none');
    expect(grantedLevel({ [ALL_PERMISSIONS]: 'write', 'admin-backups': 'read' }, 'admin-backups')).toBe('read');
  });

  it('reads a stored value that is not a level as none', () => {
    expect(grantedLevel({ maps: 'admin' }, 'maps')).toBe('none');
    expect(grantedLevel({ maps: 'write' }, 'constructor')).toBe('none');
  });

  it('holds write as enough for read, and not the other way round', () => {
    expect(hasLevel({ maps: 'write' }, 'maps', 'read')).toBe(true);
    expect(hasLevel({ maps: 'read' }, 'maps', 'write')).toBe(false);
  });
});

describe('routeAccess', () => {
  it('asks Read of GET and HEAD and Write of everything else', () => {
    expect(routeAccess('GET', '/api/campaigns')).toEqual({ kind: 'permission', permission: 'campaigns', level: 'read' });
    expect(routeAccess('HEAD', '/api/campaigns')).toEqual({ kind: 'permission', permission: 'campaigns', level: 'read' });
    expect(routeAccess('POST', '/api/campaigns')).toEqual({ kind: 'permission', permission: 'campaigns', level: 'write' });
  });

  it('counts a read-only POST as Read', () => {
    expect(routeAccess('POST', '/api/campaigns/import/preview')).toEqual({
      kind: 'permission',
      permission: 'campaign-archives',
      level: 'read',
    });
  });

  it('picks the more specific area before the campaign catch-all', () => {
    expect(routeAccess('GET', '/api/campaigns/:campaignId/maps/:id')).toMatchObject({ permission: 'maps' });
    expect(routeAccess('GET', '/api/campaigns/:campaignId/notes')).toMatchObject({ permission: 'notes' });
    expect(routeAccess('GET', '/api/campaigns/admin/all')).toMatchObject({ permission: 'admin-overview' });
    expect(routeAccess('GET', '/api/campaigns/:campaignId/characters')).toMatchObject({ permission: 'characters' });
  });

  it('refuses sign-in, key management and credential routes, and anything no rule names', () => {
    for (const [method, path] of [
      ['POST', '/api/auth/change-password'],
      ['GET', '/api/auth/me'],
      ['POST', '/api/api-keys'],
      ['POST', '/api/admin/users'],
      ['POST', '/api/admin/users/:id/reset-mfa'],
      ['POST', '/api/admin/backups/restore'],
      ['GET', '/api/admin/backups/:filename/download'],
      ['POST', '/api/users/:id/reset-password'],
      ['GET', '/api/something-new'],
    ]) {
      expect([method, path, routeAccess(method, path)]).toEqual([method, path, { kind: 'excluded' }]);
    }
    expect(ruleFor('GET', '/api/something-new')).toBeUndefined();
  });

  it('does not let a path that only starts like a rule borrow it', () => {
    expect(routeAccess('GET', '/api/assetsx')).toEqual({ kind: 'excluded' });
    expect(routeAccess('GET', '/api/campaignsfoo')).toEqual({ kind: 'excluded' });
  });
});

describe('availableLevels', () => {
  const routes = [
    { method: 'GET', path: '/api/campaigns' },
    { method: 'POST', path: '/api/campaigns' },
    { method: 'GET', path: '/api/admin/stats' },
    { method: 'GET', path: '/api/admin/settings' },
    { method: 'PUT', path: '/api/admin/settings' },
    { method: 'POST', path: '/api/auth/login' },
  ];

  it('offers Read and Write only where a route writes, and administration to administrators only', () => {
    expect(availableLevels(routes, false)).toEqual({ campaigns: ['none', 'read', 'write'] });
    expect(availableLevels(routes, true)).toEqual({
      campaigns: ['none', 'read', 'write'],
      'admin-overview': ['none', 'read'],
      'admin-settings': ['none', 'read', 'write'],
    });
  });
});

describe('normalizePermissions', () => {
  const levels = { campaigns: ['none', 'read', 'write'], 'admin-overview': ['none', 'read'] } as const;
  const offered = { campaigns: [...levels.campaigns], 'admin-overview': [...levels['admin-overview']] };

  it('keeps what is offered and drops No access', () => {
    expect(normalizePermissions({ campaigns: 'write', 'admin-overview': 'none', [ALL_PERMISSIONS]: 'read' }, offered)).toEqual({
      campaigns: 'write',
      [ALL_PERMISSIONS]: 'read',
    });
  });

  it('refuses what is not offered instead of lowering it', () => {
    expect(() => normalizePermissions({ 'admin-overview': 'write' }, offered)).toThrow(/not available for admin-overview/);
    expect(() => normalizePermissions({ 'admin-users': 'read' }, offered)).toThrow(/cannot use admin-users/);
    expect(() => normalizePermissions({ wizardry: 'read' }, offered)).toThrow(/Unknown permission/);
    expect(() => normalizePermissions({ [ALL_PERMISSIONS]: 'admin' }, offered)).toThrow(/all permissions/);
    expect(() => normalizePermissions({ campaigns: 2 }, offered)).toThrow(/not available for campaigns/);
    expect(() => normalizePermissions(['campaigns'], offered)).toThrow(/must be an object/);
    // As a JSON body brings them: own keys, not the object's prototype.
    expect(() => normalizePermissions(JSON.parse('{"__proto__":"read"}'), offered)).toThrow(/Unknown permission: __proto__/);
    expect(() => normalizePermissions({ constructor: 'read' }, offered)).toThrow(/Unknown permission: constructor/);
  });
});

describe('the permission table', () => {
  it('puts every permission in a known group', () => {
    for (const id of PERMISSION_IDS) expect(PERMISSION_GROUPS).toContain(PERMISSIONS[id].group);
  });
});

describe('keys', () => {
  it('are cozy_ and 43 base64url characters, a new one each time', () => {
    const a = generateApiKey();
    expect(a).toMatch(/^cozy_[A-Za-z0-9_-]{43}$/);
    expect(generateApiKey()).not.toBe(a);
  });

  it('are stored as their SHA-256 hash and a 12-character prefix', () => {
    const { key, keyHash, prefix } = issueApiKey();
    expect(keyHash).toBe(hashApiKey(key));
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(key.slice(0, 12));
  });

  it('expire at their expiry, not after it', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(new Date('2027-01-01T00:00:00Z'), now)).toBe(true);
    expect(isExpired(new Date('2027-01-01T00:00:01Z'), now)).toBe(false);
  });

  it('read a stored permission map defensively', () => {
    expect(storedPermissions({ maps: 'read', bad: 3 })).toEqual({ maps: 'read' });
    expect(storedPermissions(null)).toEqual({});
    expect(storedPermissions(['read'])).toEqual({});
  });
});

describe('accountMayHoldKeys', () => {
  it('lets administrators hold keys, others once granted, and nobody awaiting approval', () => {
    expect(accountMayHoldKeys({ platformRole: 'ADMIN', apiKeysEnabled: false, isApproved: true })).toBe(true);
    expect(accountMayHoldKeys({ platformRole: 'USER', apiKeysEnabled: false, isApproved: true })).toBe(false);
    expect(accountMayHoldKeys({ platformRole: 'USER', apiKeysEnabled: true, isApproved: true })).toBe(true);
    expect(accountMayHoldKeys({ platformRole: 'USER', apiKeysEnabled: true, isApproved: false })).toBe(false);
    expect(accountMayHoldKeys(null)).toBe(false);
  });
});

/**
 * What a personal API key may reach: its permissions, and which permission
 * each route falls under.
 *
 * A key acts as its owner, and the owner's own guards and checks still run on
 * every request, so a key never does more than its owner could. This file only
 * narrows that: it decides which parts of the API a key may touch at all.
 *
 * - The route's full Express path (as written in the code, parameters and all)
 *   picks the permission, through ROUTE_RULES. The first rule that matches
 *   wins. A route no rule names is refused, so a new route fails closed until
 *   someone places it, and apiKeyRoutes.e2e.test.ts fails until they do.
 * - The method picks the level: GET and HEAD need Read, anything else Read and
 *   Write. A rule marked `readOnly` counts its other methods as Read too, for
 *   a POST that only carries a body and changes nothing.
 * - EXCLUDED routes are never reachable with a key, whatever it holds: sign-in
 *   and the account's credentials, setup, key management itself, and the
 *   admin routes that set or send credentials. Inside reachable routes, the
 *   few changes that only a signed-in person may make (an email address, a
 *   role or permission, the sign-in settings) are refused by the route itself
 *   (assertSignedInSession in middleware/apiKeys.ts).
 * - ALL_PERMISSIONS ("*") in a key's permissions raises every permission,
 *   present and future, to at least its level, except the administration
 *   ones: those are granted one by one, so a key made for someone's own data
 *   gains nothing over the instance if its owner is later made an admin.
 * - Credential-bearing data is never a key's to read: a backup holds every
 *   password hash and MFA secret, so its download is EXCLUDED.
 */

export const LEVEL_NONE = 'none';
export const LEVEL_READ = 'read';
export const LEVEL_WRITE = 'write';
export type Level = typeof LEVEL_NONE | typeof LEVEL_READ | typeof LEVEL_WRITE;
export const LEVELS: readonly Level[] = [LEVEL_NONE, LEVEL_READ, LEVEL_WRITE];
const RANK: Record<Level, number> = { none: 0, read: 1, write: 2 };

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export const ALL_PERMISSIONS = '*';

/** Sections of the key editor, in the order it shows them. */
export const PERMISSION_GROUPS = ['campaigns', 'personal', 'admin'] as const;
export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export interface PermissionSpec {
  /** Its name in the key editor. */
  name: string;
  /** What it covers, in a line under the name. */
  description: string;
  group: PermissionGroup;
  /** Offered to administrators only: every route under it is an admin's. */
  adminOnly?: boolean;
}

/** Every permission, in the order the key editor lists them. */
export const PERMISSIONS = {
  campaigns: {
    name: 'Campaigns',
    description: 'Details, members, invitations, sessions, chat and dice macros',
    group: 'campaigns',
  },
  maps: { name: 'Maps', description: 'Maps and what is on them: tokens, walls, lights, fog, drawings', group: 'campaigns' },
  notes: { name: 'Notes', description: 'Your own notes in each campaign', group: 'campaigns' },
  documents: { name: 'Handouts', description: 'Documents shared with a campaign', group: 'campaigns' },
  creatures: { name: 'Creatures', description: 'Creature libraries and token templates', group: 'campaigns' },
  'campaign-archives': { name: 'Import & export', description: 'Whole campaigns to and from a file', group: 'campaigns' },
  characters: {
    name: 'Characters',
    description: 'Characters and their sheets, and character templates',
    group: 'personal',
  },
  assets: { name: 'Asset library', description: 'Your uploaded pictures, sounds and documents', group: 'personal' },
  profile: { name: 'Profile', description: 'Your profile and preferences', group: 'personal' },
  'admin-overview': {
    name: 'Overview',
    description: 'Statistics, health, the activity log and every campaign',
    group: 'admin',
    adminOnly: true,
  },
  'admin-users': { name: 'Users', description: 'List and delete accounts', group: 'admin', adminOnly: true },
  'admin-settings': {
    name: 'Settings',
    description: 'Instance settings, except sign-in, and the email test',
    group: 'admin',
    adminOnly: true,
  },
  'admin-backups': {
    name: 'Backups & storage',
    description: 'Make, list and delete backups, and clear out orphaned files',
    group: 'admin',
    adminOnly: true,
  },
} as const satisfies Record<string, PermissionSpec>;

export type PermissionId = keyof typeof PERMISSIONS;
export const PERMISSION_IDS = Object.keys(PERMISSIONS) as PermissionId[];

export function isPermissionId(value: unknown): value is PermissionId {
  return typeof value === 'string' && Object.hasOwn(PERMISSIONS, value);
}

export const EXCLUDED = 'excluded';

export interface RouteRule {
  /**
   * `METHOD /path` for one route, or `/path` for every method on it. A path
   * ending in `/**` also covers every route below it.
   */
  match: string;
  outcome: PermissionId | typeof EXCLUDED;
  /** Every method counts as Read: a POST that changes nothing. */
  readOnly?: boolean;
}

/**
 * Route → permission, first match wins. Matched against the route's path as
 * written in the code (`/api/campaigns/:campaignId/maps/:id`), never against
 * the address a request asked for, so case and encoding cannot steer it.
 */
export const ROUTE_RULES: readonly RouteRule[] = [
  // ── Never with a key ──
  // Health and the client configuration are public; a key adds nothing.
  { match: '/health', outcome: EXCLUDED },
  { match: '/api/config', outcome: EXCLUDED },
  // The setup wizard, and every sign-in, session and credential flow of the
  // account itself: password, email by reset link, MFA, account deletion.
  { match: '/api/setup/**', outcome: EXCLUDED },
  { match: '/api/auth/**', outcome: EXCLUDED },
  // Key management: a key must never mint, widen or read keys.
  { match: '/api/api-keys/**', outcome: EXCLUDED },
  // Admin routes that set or send someone's credentials, or let them sign
  // in: accounts made with a password, invitations, approval, the sign-in
  // lock, MFA resets, password resets and reset links.
  { match: '/api/admin/users/**', outcome: EXCLUDED },
  { match: 'POST /api/users/:id/reset-password', outcome: EXCLUDED },
  { match: 'POST /api/users/:id/send-reset-link', outcome: EXCLUDED },
  // A restore replaces the whole database, every password and key with it,
  // and a backup holds every password hash and MFA secret.
  { match: 'POST /api/admin/backups/restore', outcome: EXCLUDED },
  { match: 'GET /api/admin/backups/:filename/download', outcome: EXCLUDED },

  // ── Administration ──
  { match: 'GET /api/admin/stats', outcome: 'admin-overview' },
  { match: 'GET /api/admin/health', outcome: 'admin-overview' },
  { match: 'GET /api/admin/activity', outcome: 'admin-overview' },
  { match: 'GET /api/admin/config', outcome: 'admin-overview' },
  { match: 'GET /api/campaigns/admin/all', outcome: 'admin-overview' },
  { match: '/api/admin/settings', outcome: 'admin-settings' },
  { match: 'POST /api/admin/smtp/test', outcome: 'admin-settings' },
  { match: '/api/admin/backups/**', outcome: 'admin-backups' },
  { match: '/api/admin/orphaned-files/**', outcome: 'admin-backups' },
  { match: 'GET /api/users', outcome: 'admin-users' },
  { match: 'DELETE /api/users/:id', outcome: 'admin-users' },

  // ── The account ──
  { match: '/api/users/:id/**', outcome: 'profile' },

  // ── Campaigns and play ──
  { match: 'GET /api/campaigns/:campaignId/export', outcome: 'campaign-archives' },
  // Reads an archive and says what importing it would bring; stores nothing.
  { match: 'POST /api/campaigns/import/preview', outcome: 'campaign-archives', readOnly: true },
  { match: 'POST /api/campaigns/import', outcome: 'campaign-archives' },
  { match: '/api/campaigns/:campaignId/maps/**', outcome: 'maps' },
  { match: '/api/campaigns/:campaignId/creatures/**', outcome: 'creatures' },
  { match: '/api/campaigns/:campaignId/token-templates/**', outcome: 'creatures' },
  { match: '/api/campaigns/:campaignId/notes/**', outcome: 'notes' },
  { match: '/api/campaigns/left/:campaignId/notes/**', outcome: 'notes' },
  { match: '/api/campaigns/:campaignId/macros/**', outcome: 'campaigns' },
  { match: '/api/campaigns/:campaignId/documents/**', outcome: 'documents' },
  { match: '/api/assets/documents/**', outcome: 'documents' },
  // The sheets of a campaign's characters are characters, wherever listed.
  { match: 'GET /api/campaigns/:campaignId/characters', outcome: 'characters' },
  { match: '/api/campaigns/**', outcome: 'campaigns' },
  { match: '/api/invitations/**', outcome: 'campaigns' },

  // ── Characters ──
  { match: '/api/characters/**', outcome: 'characters' },
  { match: '/api/character-templates/**', outcome: 'characters' },

  // ── The asset library ──
  { match: '/api/assets/**', outcome: 'assets' },
];

function ruleMatches(rule: RouteRule, method: string, path: string): boolean {
  let pattern = rule.match;
  const space = pattern.indexOf(' ');
  if (space !== -1) {
    if (pattern.slice(0, space) !== method) return false;
    pattern = pattern.slice(space + 1);
  }
  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    return path === base || path.startsWith(`${base}/`);
  }
  return path === pattern;
}

/** HEAD is answered by the GET route; it reads like GET. */
function asRuleMethod(method: string): string {
  const upper = method.toUpperCase();
  return upper === 'HEAD' ? 'GET' : upper;
}

/** The rule that places a route, or undefined when none does (and it is refused). */
export function ruleFor(method: string, path: string): RouteRule | undefined {
  const asMethod = asRuleMethod(method);
  return ROUTE_RULES.find((r) => ruleMatches(r, asMethod, path));
}

export type RouteAccess =
  | { kind: 'excluded' }
  | { kind: 'permission'; permission: PermissionId; level: Level };

/**
 * The permission and level a route needs from a key, or excluded. `method` is
 * upper case, `path` the route's full path as written in the code. A route no
 * rule matches is excluded.
 */
export function routeAccess(method: string, path: string): RouteAccess {
  const asMethod = asRuleMethod(method);
  const rule = ruleFor(asMethod, path);
  if (!rule || rule.outcome === EXCLUDED) return { kind: 'excluded' };
  const level: Level = asMethod === 'GET' || rule.readOnly ? LEVEL_READ : LEVEL_WRITE;
  return { kind: 'permission', permission: rule.outcome, level };
}

/** A key's permissions as stored: `{ permission or "*": "read" | "write" }`. */
export type KeyPermissions = Record<string, string>;

/** Whether ALL_PERMISSIONS reaches `permission`: every one but the administration ones. */
export function floorReaches(permission: string): boolean {
  if (!isPermissionId(permission)) return true;
  const spec: PermissionSpec = PERMISSIONS[permission];
  return !spec.adminOnly;
}

/** The level a key holds for `permission`, counting ALL_PERMISSIONS as a floor where it reaches. */
export function grantedLevel(permissions: KeyPermissions | null | undefined, permission: string): Level {
  const perms = permissions ?? {};
  const explicit = Object.hasOwn(perms, permission) ? perms[permission] : undefined;
  const floor = Object.hasOwn(perms, ALL_PERMISSIONS) && floorReaches(permission) ? perms[ALL_PERMISSIONS] : undefined;
  const a: Level = isLevel(explicit) ? explicit : LEVEL_NONE;
  const b: Level = isLevel(floor) ? floor : LEVEL_NONE;
  return RANK[a] >= RANK[b] ? a : b;
}

export function hasLevel(permissions: KeyPermissions | null | undefined, permission: string, needed: Level): boolean {
  return RANK[grantedLevel(permissions, permission)] >= RANK[needed];
}

/**
 * The levels worth offering `isAdmin`'s owner per permission, from the routes
 * the app serves: Read and Write only where a route under it needs Write, and
 * the administration permissions to administrators only. A permission no
 * served route falls under is not offered.
 */
export function availableLevels(
  routes: ReadonlyArray<{ method: string; path: string }>,
  isAdmin: boolean
): Partial<Record<PermissionId, Level[]>> {
  const reach: Partial<Record<PermissionId, Level>> = {};
  for (const route of routes) {
    const access = routeAccess(route.method, route.path);
    if (access.kind !== 'permission') continue;
    const spec: PermissionSpec = PERMISSIONS[access.permission];
    if (spec.adminOnly && !isAdmin) continue;
    const current = reach[access.permission] ?? LEVEL_NONE;
    if (RANK[access.level] > RANK[current]) reach[access.permission] = access.level;
  }
  const out: Partial<Record<PermissionId, Level[]>> = {};
  for (const id of PERMISSION_IDS) {
    const top = reach[id];
    if (top) out[id] = LEVELS.slice(0, RANK[top] + 1);
  }
  return out;
}

/**
 * Check a `{ permission: level }` map from a client, dropping No access.
 * Throws an Error naming the first bad entry: a level the owner is not offered
 * is refused, never quietly lowered.
 */
export function normalizePermissions(
  raw: unknown,
  levels: Partial<Record<PermissionId, Level[]>>
): KeyPermissions {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('permissions must be an object of permission to level');
  }
  const out: KeyPermissions = {};
  for (const [perm, level] of Object.entries(raw)) {
    if (perm === ALL_PERMISSIONS) {
      if (!isLevel(level)) throw new Error(`Level ${JSON.stringify(level)} is not available for all permissions`);
      if (level !== LEVEL_NONE) out[perm] = level;
      continue;
    }
    if (!isPermissionId(perm)) throw new Error(`Unknown permission: ${perm}`);
    const offered = levels[perm];
    if (!offered) throw new Error(`Your account cannot use ${perm}`);
    if (!isLevel(level) || !offered.includes(level)) {
      throw new Error(`Level ${JSON.stringify(level)} is not available for ${perm}`);
    }
    if (level !== LEVEL_NONE) out[perm] = level;
  }
  return out;
}

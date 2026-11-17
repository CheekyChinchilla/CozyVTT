/**
 * Personal API keys: making them, recognising them, and who may hold them.
 *
 * A key is `cozy_` and 32 random bytes in base64url. Only its SHA-256 hash is
 * stored: a long random value needs no slow password hash, and the hash is
 * what the lookup keys on. The key itself is answered once, when it is made or
 * replaced, and never again; `prefix` keeps its first few characters so its
 * owner can tell keys apart.
 *
 * What a key may reach is services/apiKeyPermissions.ts; how a request is
 * authenticated with one is middleware/apiKeys.ts.
 */

import crypto from 'crypto';
import type { ApiKey, PlatformRole } from '@prisma/client';
import { getSystemSettings } from './systemSettings';
import type { KeyPermissions } from './apiKeyPermissions';

export const KEY_PREFIX = 'cozy_';
/** Characters of a key kept for display: `cozy_` and seven random ones. */
export const DISPLAY_PREFIX_LENGTH = 12;
/** Longer than any key this makes; a longer header is refused unhashed. */
export const MAX_PRESENTED_LENGTH = 200;
/** The header a key is sent in. Never a query parameter: those end up in logs. */
export const API_KEY_HEADER = 'x-api-key';
export const NAME_MAX_LENGTH = 100;
/** lastUsedAt is written at most this often per key, so polling is not a write per request. */
export const LAST_USED_THROTTLE_MS = 60 * 1000;

export function generateApiKey(): string {
  return KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/** A fresh key and what is stored of it. */
export function issueApiKey(): { key: string; keyHash: string; prefix: string } {
  const key = generateApiKey();
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, DISPLAY_PREFIX_LENGTH) };
}

/** Whether API keys exist on this instance at all (the admin's setting). */
export async function apiKeysEnabledOnInstance(): Promise<boolean> {
  const settings = await getSystemSettings();
  return settings.apiKeysEnabled;
}

export interface KeyOwnerFields {
  platformRole: PlatformRole;
  apiKeysEnabled: boolean;
  isApproved: boolean;
}

/**
 * Whether an account may make and use keys, the instance allowing them:
 * administrators always, anyone else once an administrator has turned
 * `apiKeysEnabled` on for them. An account still waiting for approval cannot
 * sign in, so it holds no keys either.
 */
export function accountMayHoldKeys(user: KeyOwnerFields | null | undefined): boolean {
  if (!user || !user.isApproved) return false;
  if (user.platformRole === 'ADMIN') return true;
  return user.apiKeysEnabled === true;
}

export function isExpired(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/** A stored permission map, read defensively: anything but string values is dropped. */
export function storedPermissions(value: unknown): KeyPermissions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: KeyPermissions = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** A key as the API lists it: everything but the key and its hash. */
export function serializeApiKey(row: ApiKey, owner?: { displayName: string; email: string } | null) {
  return {
    id: row.id,
    userId: row.userId,
    ...(owner ? { owner: { displayName: owner.displayName, email: owner.email } } : {}),
    name: row.name,
    prefix: row.prefix,
    permissions: storedPermissions(row.permissions),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    expired: isExpired(row.expiresAt),
  };
}

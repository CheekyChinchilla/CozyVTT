/**
 * Words and choices the API key settings share: section names, level labels,
 * expiry choices, and how a key's permissions and dates read in a list.
 */

import type { ApiKey, ApiKeyLevel, ApiKeyPermissionGroup } from '@/types';
import { formatDate, formatRelativeTime } from '@/utils/format';

/** The "*" entry: every permission, present and future, at least this level. */
export const ALL_PERMISSIONS = '*';

export const GROUP_LABELS: Record<ApiKeyPermissionGroup, string> = {
  campaigns: 'Campaigns',
  personal: 'Characters & account',
  admin: 'Administration',
};

export const GROUP_ORDER: ApiKeyPermissionGroup[] = ['campaigns', 'personal', 'admin'];

export const LEVEL_LABELS: Record<ApiKeyLevel, string> = {
  none: 'No access',
  read: 'Read',
  write: 'Read & write',
};

const LEVEL_RANK: Record<ApiKeyLevel, number> = { none: 0, read: 1, write: 2 };

export function levelAtLeast(level: ApiKeyLevel, floor: ApiKeyLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[floor];
}

/** A permission's level once the "*" floor is counted. */
export function effectiveLevel(permissions: Record<string, string>, id: string): ApiKeyLevel {
  const own = (permissions[id] ?? 'none') as ApiKeyLevel;
  const floor = (permissions[ALL_PERMISSIONS] ?? 'none') as ApiKeyLevel;
  return levelAtLeast(own, floor) ? own : floor;
}

/** How long a new key lasts: the editor offers these, 90 days first. */
export const EXPIRY_CHOICES = [
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: '365', label: '1 year', days: 365 },
  { id: 'never', label: 'Never expires', days: null },
] as const;

export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]['id'] | 'keep';

export const DEFAULT_EXPIRY: ExpiryChoice = '90';

/** The expiry a choice sends: an ISO instant, null for never, undefined to keep the key's. */
export function expiryFor(choice: ExpiryChoice, now = Date.now()): string | null | undefined {
  if (choice === 'keep') return undefined;
  const found = EXPIRY_CHOICES.find((c) => c.id === choice);
  if (!found || found.days === null) return null;
  return new Date(now + found.days * 24 * 60 * 60 * 1000).toISOString();
}

/** A key's permissions in a few words, for its row. */
export function permissionSummary(permissions: ApiKey['permissions']): string {
  const floor = permissions[ALL_PERMISSIONS];
  const own = Object.keys(permissions).filter((id) => id !== ALL_PERMISSIONS).length;
  if (floor) {
    const base = `Everything: ${LEVEL_LABELS[floor].toLowerCase()}`;
    return own > 0 ? `${base}, ${own} raised` : base;
  }
  if (own === 0) return 'No access';
  return `${own} ${own === 1 ? 'permission' : 'permissions'}`;
}

export function lastUsedText(key: Pick<ApiKey, 'lastUsedAt'>, now = Date.now()): string {
  return key.lastUsedAt ? `Used ${formatRelativeTime(key.lastUsedAt, { now, words: true, dateAfterDays: 30 })}` : 'Never used';
}

export function expiryText(key: Pick<ApiKey, 'expiresAt' | 'expired'>): string {
  if (key.expired) return `Expired ${key.expiresAt ? formatDate(key.expiresAt) : ''}`.trim();
  return key.expiresAt ? `Expires ${formatDate(key.expiresAt)}` : 'Never expires';
}

/** Whether a key that has not expired will within a week, for the warning colour. */
export function expiresSoon(key: Pick<ApiKey, 'expiresAt' | 'expired'>, now = Date.now()): boolean {
  if (key.expired || !key.expiresAt) return false;
  return new Date(key.expiresAt).getTime() - now < 7 * 24 * 60 * 60 * 1000;
}

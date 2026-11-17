/**
 * What making or changing a personal API key may carry.
 *
 * The permissions are checked against what the owner is offered in the route
 * (services/apiKeyPermissions.ts normalizePermissions), not here: that depends
 * on the account. The cap on keys per account keeps a list someone reads by
 * eye short enough to read.
 */

import { z } from 'zod';
import { NAME_MAX_LENGTH } from '../services/apiKeys';

export const MAX_API_KEYS_PER_ACCOUNT = 50;

const name = z
  .string({ error: 'name must be text' })
  .trim()
  .min(1, 'Name is required')
  .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`);

const permissions = z.record(z.string(), z.unknown(), { error: 'permissions must be an object of permission to level' });

/** An instant with its offset (`2027-01-01T00:00:00Z`), or null for never. */
const expiresAt = z.iso.datetime({ offset: true, error: 'expiresAt must be a date and time, or null' }).nullable();

export const createApiKeySchema = z.object({
  name,
  permissions: permissions.default({}),
  expiresAt: expiresAt.default(null),
});

/** Every field may be left out; `expiresAt: null` makes a key never expire. */
export const updateApiKeySchema = z.object({
  name: name.optional(),
  permissions: permissions.optional(),
  expiresAt: expiresAt.optional(),
});

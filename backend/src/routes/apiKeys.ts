/**
 * Personal API key management: /api/api-keys.
 *
 * Administrators may always hold keys; anyone else once an administrator has
 * turned API keys on for their account. With API keys turned off for the
 * instance every route here refuses but revoking and an administrator's list
 * of every key, so a leaked key can be found and revoked while keys are off.
 * A person manages only their own keys,
 * and someone else's key is answered as one that does not exist, so ids cannot
 * be probed; an administrator may also list everyone's and revoke any, but
 * nobody can replace or change a key that is not theirs, so nobody makes a
 * secret for someone else.
 *
 * No key can reach these routes: services/apiKeyPermissions.ts excludes them,
 * and `signedInSessionOnly` below refuses a key request as well, so a key can
 * never make or widen keys even if that exclusion were edited away.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Express } from 'express';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/auth';
import { apiKeyRouteList } from '../middleware/apiKeys';
import {
  accountMayHoldKeys,
  apiKeysEnabledOnInstance,
  isExpired,
  issueApiKey,
  serializeApiKey,
} from '../services/apiKeys';
import {
  PERMISSIONS,
  PERMISSION_IDS,
  availableLevels,
  normalizePermissions,
  type KeyPermissions,
} from '../services/apiKeyPermissions';
import { writeAdminLog } from '../services/systemLog';
import { createApiKeySchema, updateApiKeySchema, MAX_API_KEYS_PER_ACCOUNT } from '../validators/apiKeys';

const router = Router();

const NOT_FOUND = { error: 'Not Found', message: 'API key not found' } as const;
const NOT_ENABLED = { error: 'Forbidden', message: 'API keys are not enabled for your account' } as const;

/** The second lock: never a key request, whatever the permission table says. */
function signedInSessionOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.apiKey) {
    res.status(403).json({ error: 'Forbidden', message: 'API keys cannot manage API keys' });
    return;
  }
  next();
}

/**
 * Refuse while API keys are off for the instance, except revoking and an
 * administrator's list of every key: a leak is answered by turning keys off,
 * and the leaked key must still be found and revoked before they go on again.
 */
async function keysOnInstance(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method === 'DELETE' || (req.method === 'GET' && req.path === '/' && req.query.all === 'true')) {
    next();
    return;
  }
  try {
    if (!(await apiKeysEnabledOnInstance())) {
      res.status(403).json({ error: 'Forbidden', message: 'API keys are turned off on this server' });
      return;
    }
    next();
  } catch (error) {
    logger.error('Error reading whether API keys are on', { err: error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to read the API key setting' });
  }
}

router.use(requireAuth, signedInSessionOnly, keysOnInstance);

async function sessionAccount(req: Request) {
  return prisma.user.findUnique({
    where: { id: req.session.userId! },
    select: { id: true, platformRole: true, apiKeysEnabled: true, isApproved: true, displayName: true, email: true },
  });
}

type Account = NonNullable<Awaited<ReturnType<typeof sessionAccount>>>;

/** The signed-in account if it may hold keys; otherwise answered 403 and null. */
async function keyHolder(req: Request, res: Response): Promise<Account | null> {
  const account = await sessionAccount(req);
  if (!account || !accountMayHoldKeys(account)) {
    res.status(403).json(NOT_ENABLED);
    return null;
  }
  return account;
}

function offeredLevels(req: Request, account: Account) {
  return availableLevels(apiKeyRouteList(req.app as Express), account.platformRole === 'ADMIN');
}

/** The account's own key, or answered 404 and null. */
async function ownKey(req: Request<{ id: string }>, res: Response, account: Account) {
  const row = await prisma.apiKey.findFirst({ where: { id: req.params.id, userId: account.id } });
  if (!row) res.status(404).json(NOT_FOUND);
  return row;
}

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: 'Validation Error', message });
}

/** An expiry the client sent, refused when it is not in the future. */
function futureExpiry(value: string | null, res: Response): Date | null | false {
  if (value === null) return null;
  const at = new Date(value);
  if (at.getTime() <= Date.now()) {
    validationError(res, 'The expiry must be in the future');
    return false;
  }
  return at;
}

function checkedPermissions(raw: unknown, req: Request, res: Response, account: Account): KeyPermissions | null {
  try {
    return normalizePermissions(raw, offeredLevels(req, account));
  } catch (error) {
    validationError(res, error instanceof Error ? error.message : 'Invalid permissions');
    return null;
  }
}

/**
 * GET /api/api-keys
 * Your keys, newest first, never their secrets. `?all=true`: every account's,
 * for administrators.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const all = req.query.all === 'true';
    if (all) {
      if (req.session.platformRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }
      const rows = await prisma.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { displayName: true, email: true } } },
      });
      return res.json({ apiKeys: rows.map((row) => serializeApiKey(row, row.user)) });
    }
    const account = await keyHolder(req, res);
    if (!account) return;
    const rows = await prisma.apiKey.findMany({ where: { userId: account.id }, orderBy: { createdAt: 'desc' } });
    return res.json({ apiKeys: rows.map((row) => serializeApiKey(row)) });
  } catch (error) {
    logger.error('Error listing API keys', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list API keys' });
  }
});

/**
 * GET /api/api-keys/permissions
 * The permissions your keys can be given, each with the levels your account
 * is offered: the administration ones to administrators only.
 */
router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const account = await keyHolder(req, res);
    if (!account) return;
    const levels = offeredLevels(req, account);
    const permissions = PERMISSION_IDS.flatMap((id) => {
      const offered = levels[id];
      if (!offered) return [];
      const spec = PERMISSIONS[id];
      return [{ id, name: spec.name, description: spec.description, group: spec.group, levels: offered }];
    });
    return res.json({ permissions });
  } catch (error) {
    logger.error('Error listing API key permissions', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list API key permissions' });
  }
});

/**
 * POST /api/api-keys
 * Make a key that acts as you. Answers the key itself once, in `key`; only its
 * hash is kept.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const account = await keyHolder(req, res);
    if (!account) return;
    const parsed = createApiKeySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(res, parsed.error.issues[0]?.message ?? 'Invalid API key');
    const permissions = checkedPermissions(parsed.data.permissions, req, res, account);
    if (!permissions) return;
    const expiresAt = futureExpiry(parsed.data.expiresAt, res);
    if (expiresAt === false) return;
    if ((await prisma.apiKey.count({ where: { userId: account.id } })) >= MAX_API_KEYS_PER_ACCOUNT) {
      return res.status(409).json({
        error: 'Conflict',
        message: `An account can hold at most ${MAX_API_KEYS_PER_ACCOUNT} API keys. Revoke one you no longer use first.`,
      });
    }
    const { key, keyHash, prefix } = issueApiKey();
    const row = await prisma.apiKey.create({
      data: { userId: account.id, name: parsed.data.name, permissions, expiresAt, keyHash, prefix },
    });
    return res.status(201).json({ apiKey: serializeApiKey(row), key });
  } catch (error) {
    logger.error('Error creating an API key', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create the API key' });
  }
});

/**
 * PATCH /api/api-keys/:id
 * Rename one of your keys, or change its permissions or expiry. An expiry left
 * out stays as it is; null makes the key never expire.
 */
router.patch('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const account = await keyHolder(req, res);
    if (!account) return;
    const parsed = updateApiKeySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(res, parsed.error.issues[0]?.message ?? 'Invalid API key');
    const row = await ownKey(req, res, account);
    if (!row) return;
    const data: { name?: string; permissions?: KeyPermissions; expiresAt?: Date | null } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.permissions !== undefined) {
      const permissions = checkedPermissions(parsed.data.permissions, req, res, account);
      if (!permissions) return;
      data.permissions = permissions;
    }
    if (parsed.data.expiresAt !== undefined) {
      const expiresAt = futureExpiry(parsed.data.expiresAt, res);
      if (expiresAt === false) return;
      data.expiresAt = expiresAt;
    }
    const updated = await prisma.apiKey.update({ where: { id: row.id }, data });
    return res.json({ apiKey: serializeApiKey(updated) });
  } catch (error) {
    logger.error('Error updating an API key', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update the API key' });
  }
});

/**
 * POST /api/api-keys/:id/regenerate
 * A new secret for one of your keys, with the same name and permissions. The
 * old one stops working at once.
 */
router.post('/:id/regenerate', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const account = await keyHolder(req, res);
    if (!account) return;
    const row = await ownKey(req, res, account);
    if (!row) return;
    // A new secret for an expired key would not work either.
    if (isExpired(row.expiresAt)) {
      return validationError(res, 'This key has expired. Give it a new expiry before regenerating it.');
    }
    const { key, keyHash, prefix } = issueApiKey();
    const updated = await prisma.apiKey.update({ where: { id: row.id }, data: { keyHash, prefix, lastUsedAt: null } });
    return res.json({ apiKey: serializeApiKey(updated), key });
  } catch (error) {
    logger.error('Error regenerating an API key', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to regenerate the API key' });
  }
});

/**
 * DELETE /api/api-keys/:id
 * Revoke a key. Administrators may revoke anyone's, even one whose owner has
 * since lost API keys; that goes to the activity log.
 */
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (req.session.platformRole === 'ADMIN') {
      const row = await prisma.apiKey.findUnique({
        where: { id: req.params.id },
        include: { user: { select: { email: true } } },
      });
      if (!row) return res.status(404).json(NOT_FOUND);
      await prisma.apiKey.deleteMany({ where: { id: row.id } });
      if (row.userId !== req.session.userId) {
        await writeAdminLog(req.session.userId!, `Revoked the API key "${row.name}" of ${row.user.email}`, 'WARNING', {
          targetUserId: row.userId,
        });
      }
      return res.status(204).end();
    }
    const account = await keyHolder(req, res);
    if (!account) return;
    const row = await ownKey(req, res, account);
    if (!row) return;
    await prisma.apiKey.deleteMany({ where: { id: row.id } });
    return res.status(204).end();
  } catch (error) {
    logger.error('Error revoking an API key', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to revoke the API key' });
  }
});

export default router;

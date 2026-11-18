/**
 * Requests made with a personal API key (`X-API-Key: cozy_...`).
 *
 * A key request is the key's owner, narrowed to the key's permissions
 * (services/apiKeyPermissions.ts). Three pieces, which createApp (app.ts) puts
 * in place:
 *
 * 1. `skipSessionForApiKeys` wraps the session middleware. A request that
 *    sends the header never loads, saves or renews a sign-in session, so a key
 *    is always held to its own permissions instead of riding the owner's
 *    cookie, and a key request leaves no session and sets no cookie.
 * 2. `authenticateApiKey`, on /api after the general rate limit, checks the
 *    key and gives the request a session of its own that is never stored: the
 *    owner as they are now (their current role, not the one they had when the
 *    key was made), so the password-change and administrator MFA gates and
 *    every route guard apply to the owner's key as to their sign-in.
 * 3. The route gate runs as Express dispatches the route it matched, and
 *    refuses a key the route's permission does not allow. It is decided on
 *    that route, not on the address asked for, and a route it cannot place is
 *    refused. A route reached without (1) and (2) having passed refuses any
 *    request that sends the header.
 *
 * A key that does not exist, has expired or has no owner is a 401, counted
 * against the client address; past the limit those answers become 429. Only
 * failures count, so a working integration is never slowed however often it
 * asks, and a correct key keeps working from an address over the limit: keys
 * are long random values, and many people can share one address. Live
 * connections (socket.io) sign in with the session only; a key opens none.
 */

import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response, type Router } from 'express';
import crypto from 'crypto';
import type { Session, SessionData } from 'express-session';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { addressKey, failureLimiter } from './failureLimiter';
import {
  API_KEY_HEADER,
  LAST_USED_THROTTLE_MS,
  MAX_PRESENTED_LENGTH,
  accountMayHoldKeys,
  apiKeysEnabledOnInstance,
  hashApiKey,
  isExpired,
  storedPermissions,
} from '../services/apiKeys';
import { grantedLevel, hasLevel, routeAccess } from '../services/apiKeyPermissions';

/** The 403 for a route keys may not use. */
export const KEY_ROUTE_REFUSED = 'API keys cannot be used for this endpoint';
/** The 403 for a change only a signed-in person may make. */
export const SESSION_ONLY_MESSAGE = 'This change needs a signed-in session, not an API key';

/** Whether a request sends the API key header at all, whatever its value. */
export function presentsApiKey(req: Request): boolean {
  return req.headers[API_KEY_HEADER] !== undefined;
}

/** The session middleware, skipped for a request that sends a key. */
export function skipSessionForApiKeys(sessionMiddleware: RequestHandler): RequestHandler {
  return function sessionUnlessApiKey(req, res, next) {
    if (presentsApiKey(req)) {
      next();
      return;
    }
    sessionMiddleware(req, res, next);
  };
}

/**
 * Wrong keys per client address: 20 in 15 minutes, then 429 until the oldest
 * leaves the window. Its middleware is never mounted; only `peek` and
 * `recordFailure` are used, so a correct key is never held back.
 */
export const apiKeyFailureLimiter = failureLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many invalid API key attempts. Please try again later.',
});

function refuseKey(req: Request, res: Response, message: string): void {
  if (apiKeyFailureLimiter.peek(addressKey(req)).lockedUntil !== null) {
    res.status(429).json({ error: 'Rate Limited', message: 'Too many invalid API key attempts. Please try again later.' });
    return;
  }
  apiKeyFailureLimiter.recordFailure(req);
  res.status(401).json({ error: 'Unauthorized', message });
}

/**
 * The session a key request carries: the owner, signed in now, never stored.
 * Its methods do nothing a stored session would; regenerating one, which only
 * a sign-in does, fails.
 */
function keySession(owner: { id: string; platformRole: SessionData['platformRole']; mustChangePassword: boolean }): Session & Partial<SessionData> {
  const keyed = {
    userId: owner.id,
    platformRole: owner.platformRole,
    mustChangePassword: owner.mustChangePassword,
    signedInAt: Date.now(),
    id: '',
    regenerate(callback: (err: unknown) => void) {
      callback(new Error('An API key request has no session to regenerate'));
      return keyed;
    },
    destroy(callback?: (err: unknown) => void) {
      callback?.(undefined);
      return keyed;
    },
    reload(callback: (err: unknown) => void) {
      callback(undefined);
      return keyed;
    },
    save(callback?: (err: unknown) => void) {
      callback?.(undefined);
      return keyed;
    },
    touch() {
      return keyed;
    },
    resetMaxAge() {
      return keyed;
    },
  };
  return keyed as unknown as Session & Partial<SessionData>;
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Check the key a request sends, and make the request its owner's. */
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!presentsApiKey(req)) {
    next();
    return;
  }
  const raw = req.headers[API_KEY_HEADER];
  // Sent twice, Node joins the two with a comma, which matches no key.
  const presented = typeof raw === 'string' ? raw.trim() : '';
  try {
    if (!(await apiKeysEnabledOnInstance())) {
      res.status(403).json({ error: 'Forbidden', message: 'API keys are turned off on this server' });
      return;
    }
    if (presented === '' || presented.length > MAX_PRESENTED_LENGTH) {
      refuseKey(req, res, 'Invalid API key');
      return;
    }
    const presentedHash = hashApiKey(presented);
    const row = await prisma.apiKey.findUnique({
      where: { keyHash: presentedHash },
      include: {
        user: { select: { id: true, platformRole: true, apiKeysEnabled: true, isApproved: true, mustChangePassword: true } },
      },
    });
    if (!row || !sameHash(row.keyHash, presentedHash)) {
      refuseKey(req, res, 'Invalid API key');
      return;
    }
    const now = new Date();
    if (isExpired(row.expiresAt, now)) {
      refuseKey(req, res, 'API key has expired');
      return;
    }
    // Read on every request, so taking keys away from an account, or demoting
    // it, applies to its keys at once.
    if (!accountMayHoldKeys(row.user)) {
      res.status(403).json({ error: 'Forbidden', message: 'API keys are not enabled for your account' });
      return;
    }

    // Written at most once a minute per key, and only if no other request
    // wrote it since.
    if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS) {
      await prisma.apiKey
        .updateMany({
          where: { id: row.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_THROTTLE_MS) } }] },
          data: { lastUsedAt: now },
        })
        .catch((err: unknown) => logger.error('Failed to record when an API key was last used', { err, apiKeyId: row.id }));
    }

    req.apiKey = { id: row.id, userId: row.user.id, permissions: storedPermissions(row.permissions) };
    req.session = keySession(row.user);
    next();
  } catch (error) {
    logger.error('Error checking an API key', { err: error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to check the API key' });
  }
}

/**
 * Refuse a change a key may not make inside a route it may use: 403, and
 * false, for a key request; true for a signed-in person.
 */
export function assertSignedInSession(req: Request, res: Response, message = SESSION_ONLY_MESSAGE): boolean {
  if (!req.apiKey) return true;
  res.status(403).json({ error: 'Forbidden', message });
  return false;
}

// ============================================
// The route gate
// ============================================

/** What Express keeps of a route: its path as written and its methods. */
interface ExpressRoute {
  path: string;
  methods: Record<string, boolean | undefined>;
  dispatch(req: Request, res: Response, done: NextFunction): void;
}

interface StackLayer {
  route?: ExpressRoute;
}

/** Each app's routes, by the route object Express dispatches, with their full paths. */
const routeTables = new WeakMap<Express, Map<ExpressRoute, string>>();

function routesOf(router: { stack: unknown[] }): ExpressRoute[] {
  return (router.stack as StackLayer[]).flatMap((layer) => (layer.route ? [layer.route] : []));
}

function isRouter(value: unknown): value is Router {
  return typeof value === 'function' && Array.isArray((value as { stack?: unknown }).stack);
}

/**
 * From now on, note each router `app.use` mounts at a plain path, with that
 * path: Express keeps no mount path of its own. Mounting stays the ordinary
 * `app.use(path, router)`. Pass the list to registerApiKeyRoutes.
 */
export function recordRouterMounts(app: Express): ReadonlyArray<readonly [string, Router]> {
  const mounts: Array<readonly [string, Router]> = [];
  const use = app.use;
  app.use = function recordingRouterMounts(this: Express, ...args: unknown[]) {
    const [path, ...handlers] = args;
    if (typeof path === 'string') {
      for (const handler of handlers) if (isRouter(handler)) mounts.push([path, handler]);
    }
    return Reflect.apply(use, this, args) as Express;
  } as Express['use'];
  return mounts;
}

/**
 * Note every route the app serves with its full path: its own routes and those
 * of each router in `mounts`, at the path it was mounted at. Called by
 * createApp once everything is mounted. A route this does not see is one the
 * gate cannot place, and refuses.
 */
export function registerApiKeyRoutes(app: Express, mounts: ReadonlyArray<readonly [string, Router]>): void {
  const table = new Map<ExpressRoute, string>();
  for (const route of routesOf(app.router)) table.set(route, route.path);
  for (const [mount, router] of mounts) {
    for (const route of routesOf(router)) {
      table.set(route, `${mount}${route.path === '/' ? '' : route.path}` || '/');
    }
  }
  routeTables.set(app, table);
}

/** Every method and full path the app serves, as registerApiKeyRoutes noted them. */
export function apiKeyRouteList(app: Express): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  for (const [route, path] of routeTables.get(app) ?? []) {
    for (const [method, on] of Object.entries(route.methods)) {
      if (on && method !== '_all') out.push({ method: method.toUpperCase(), path });
    }
  }
  return out;
}

function refuseRoute(res: Response, message = KEY_ROUTE_REFUSED): void {
  res.status(403).json({ error: 'Forbidden', message });
}

/** The gate itself: whether a key request may go on to `route`'s handlers. */
function keyMayUseRoute(route: ExpressRoute, req: Request, res: Response): boolean {
  const key = req.apiKey;
  // The header was sent, but the key was not checked: a route outside /api,
  // or one reached some way the middleware did not see.
  if (!key) {
    refuseRoute(res);
    return false;
  }
  const path = routeTables.get(req.app as Express)?.get(route);
  if (path === undefined) {
    refuseRoute(res);
    return false;
  }
  const access = routeAccess(req.method, path);
  if (access.kind === 'excluded') {
    refuseRoute(res);
    return false;
  }
  if (!hasLevel(key.permissions, access.permission, access.level)) {
    const granted = grantedLevel(key.permissions, access.permission);
    refuseRoute(res, `This API key needs ${access.level} access to ${access.permission} (it has ${granted})`);
    return false;
  }
  return true;
}

const GATED = Symbol.for('cozyvtt.apiKeyRouteGate');

/**
 * Put the gate in front of every route's handlers, once per process. Express
 * runs a matched route through `Route.prototype.dispatch`; a request without
 * the key header goes straight through.
 */
export function installApiKeyRouteGate(): void {
  const RouteClass = (express as unknown as { Route?: { prototype: ExpressRoute & { [GATED]?: true } } }).Route;
  if (!RouteClass || typeof RouteClass.prototype.dispatch !== 'function') {
    // Without the gate a key would reach every route its owner can: refuse to
    // start rather than run like that.
    throw new Error('Express no longer exposes Route.prototype.dispatch; the API key route gate cannot be installed');
  }
  if (RouteClass.prototype[GATED]) return;
  const original = RouteClass.prototype.dispatch;
  RouteClass.prototype.dispatch = function gatedDispatch(this: ExpressRoute, req: Request, res: Response, done: NextFunction) {
    if (presentsApiKey(req) && !keyMayUseRoute(this, req, res)) return;
    original.call(this, req, res, done);
  };
  RouteClass.prototype[GATED] = true;
}

/** Whether the gate is in place, for the test that holds createApp to it. */
export function apiKeyRouteGateInstalled(): boolean {
  const RouteClass = (express as unknown as { Route?: { prototype: { [GATED]?: true } } }).Route;
  return RouteClass?.prototype[GATED] === true;
}

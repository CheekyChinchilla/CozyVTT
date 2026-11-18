/**
 * Every route the server answers is placed for API keys, and the route gate
 * holds each of them to its place.
 *
 * The route list is read from the app (routeInventory), so a new route fails
 * here until a rule in services/apiKeyPermissions.ts names it: either the
 * permission it falls under, or EXCLUDED. A route no rule names is refused at
 * run time too; this file makes that a decision rather than an accident.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { mountedRoutes, routeKey } from '../../__tests__/helpers/routeInventory';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import {
  EXCLUDED,
  PERMISSION_IDS,
  ROUTE_RULES,
  routeAccess,
  ruleFor,
} from '../../services/apiKeyPermissions';
import { KEY_ROUTE_REFUSED, apiKeyRouteGateInstalled, apiKeyRouteList } from '../../middleware/apiKeys';

const app = createTestApp();
const routes = mountedRoutes(app).filter((route) => route.method !== 'ALL');

/**
 * Every route no key may use. A route added here is a credential, sign-in or
 * whole-instance change; anything else belongs under a permission.
 */
const EXCLUDED_ROUTES = [
  'GET /health',
  'GET /api/setup/status',
  'POST /api/setup/init',
  'GET /api/config',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/auth/change-password',
  'DELETE /api/auth/account',
  'POST /api/auth/mfa/setup',
  'POST /api/auth/mfa/verify',
  'POST /api/auth/mfa/verify-login',
  'POST /api/auth/mfa/disable',
  'POST /api/auth/mfa/backup-codes',
  'GET /api/auth/registration-status',
  'GET /api/auth/appearance',
  'GET /api/auth/ping',
  'POST /api/users/:id/reset-password',
  'POST /api/users/:id/send-reset-link',
  'POST /api/admin/users',
  'POST /api/admin/users/invite',
  'POST /api/admin/users/:id/resend-invite',
  'POST /api/admin/users/:id/approve',
  'DELETE /api/admin/users/:id/sign-in-lock',
  'POST /api/admin/users/:id/reset-mfa',
  'POST /api/admin/backups/restore',
  'GET /api/admin/backups/:filename/download',
  'GET /api/api-keys',
  'GET /api/api-keys/permissions',
  'POST /api/api-keys',
  'PATCH /api/api-keys/:id',
  'POST /api/api-keys/:id/regenerate',
  'DELETE /api/api-keys/:id',
].sort();

/** Router-level middleware, which runs before the route gate: guards only. */
const ROUTER_LEVEL_ALLOWED = new Set(['requireAuth', 'requireAdmin', 'signedInSessionOnly', 'keysOnInstance']);

const created: string[] = [];
let key = '';

beforeAll(async () => {
  const admin = await createTestUser({ role: 'ADMIN' });
  created.push(admin.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: admin.email, password: TEST_PASSWORD })).status).toBe(200);
  // A key with nothing: every route it may reach at all refuses it for its level.
  const res = await agent.post('/api/api-keys').send({ name: 'Nothing', permissions: {} });
  expect(res.status).toBe(201);
  key = res.body.key;
});

afterAll(async () => {
  await cleanupUsers(created);
});

describe('the route table', () => {
  it('has the gate in place', () => {
    expect(apiKeyRouteGateInstalled()).toBe(true);
  });

  it('places every route the app serves, so the gate can find each one', () => {
    const seen = new Set(apiKeyRouteList(app).map(routeKey));
    expect(routes.map(routeKey).filter((r) => !seen.has(r))).toEqual([]);
  });

  it('names every route in a rule', () => {
    expect(routes.filter((r) => !ruleFor(r.method, r.path)).map(routeKey)).toEqual([]);
  });

  it('has no rule that names no route', () => {
    const unused = ROUTE_RULES.filter((rule) => !routes.some((r) => ruleFor(r.method, r.path) === rule));
    expect(unused.map((rule) => rule.match)).toEqual([]);
  });

  it('puts at least one route under every permission', () => {
    const used = new Set(routes.flatMap((r) => {
      const access = routeAccess(r.method, r.path);
      return access.kind === 'permission' ? [access.permission] : [];
    }));
    expect(PERMISSION_IDS.filter((id) => !used.has(id))).toEqual([]);
  });

  it('excludes exactly the sign-in, credential and key routes', () => {
    const excluded = routes.filter((r) => routeAccess(r.method, r.path).kind === 'excluded').map(routeKey).sort();
    expect(excluded).toEqual(EXCLUDED_ROUTES);
    expect(ROUTE_RULES.filter((rule) => rule.outcome === EXCLUDED).length).toBeGreaterThan(0);
  });

  it('runs nothing but guards at router level, ahead of the gate', () => {
    const names: string[] = [];
    for (const layer of app.router.stack) {
      const stack = (layer.handle as { stack?: Array<{ route?: unknown; name: string }> }).stack;
      if (layer.name !== 'router' || !stack) continue;
      for (const inner of stack) if (!inner.route) names.push(inner.name);
    }
    expect(names.filter((name) => !ROUTER_LEVEL_ALLOWED.has(name))).toEqual([]);
  });
});

describe('the gate, on every route', () => {
  const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');

  it.each(routes.map((r) => [routeKey(r), r] as const))('holds %s to its place', async (_name, route) => {
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    const res = await request(app)[method](concrete(route.path)).set('X-API-Key', key).send({});
    const access = routeAccess(route.method, route.path);
    expect(res.status).toBe(403);
    if (access.kind === 'excluded') {
      expect([KEY_ROUTE_REFUSED, 'API keys cannot manage API keys']).toContain(res.body.message);
    } else {
      expect(res.body.message).toBe(`This API key needs ${access.level} access to ${access.permission} (it has none)`);
    }
  });
});

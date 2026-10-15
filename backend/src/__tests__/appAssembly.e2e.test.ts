/**
 * The app the integration tests drive is the one the server runs.
 *
 * server.ts used to put its app together itself, and the test app kept a
 * copy of the parts it wanted. The copy left out the security headers, CORS,
 * the proxy setting, the server's session cookie, the password-change and
 * administrator two-factor gates and the general request limit, so no suite
 * could tell if one of them went missing or moved. Both are now built by the
 * same function, and the test app differs from the server only where sessions
 * are kept, the general limit and the setup gate. These check what the copy
 * used to leave out.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from './helpers/test-app';
import { appLayers } from './helpers/routeInventory';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from './helpers/db';
import { createApp, createGeneralApiLimiter } from '../app';
import { sessionOptions } from '../config/sessionOptions';
import { originCheck } from '../middleware/originCheck';
import { refuseWhileDatabaseIsReplaced } from '../middleware/restoreGate';
import { requireSetupComplete } from '../middleware/setup';
import { requirePasswordChanged } from '../middleware/passwordChange';
import { requireAdminMfa } from '../middleware/adminMfa';

const app = createTestApp();
const created: string[] = [];

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

/** The cookies a response set, each as sent. */
const cookiesOf = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

describe('the security headers', () => {
  it.each([
    ['an answer', '/api/config'],
    ['a not-found answer', '/api/no-such-route'],
  ])('come with %s', async (_what, path) => {
    const res = await request(app).get(path);

    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  // The deployment guide tells self-hosters how long a browser keeps their
  // name on HTTPS after seeing this, and the policy has to stay in step with
  // the app page's. Either changes when the headers library or app.ts does.
  it('keep a browser on HTTPS for a year and send the policy app.ts sets', async () => {
    const res = await request(app).get('/api/config');

    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    // The order of the directives carries no meaning to a browser.
    expect(String(res.headers['content-security-policy']).split(';').sort()).toEqual([
      "base-uri 'self'",
      "connect-src 'self' ws: wss:",
      "default-src 'self'",
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "media-src 'self'",
      "object-src 'none'",
      "script-src 'self'",
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      'upgrade-insecure-requests',
    ]);
  });
});

describe('the session cookie', () => {
  async function signIn(headers: Record<string, string> = {}): Promise<string> {
    const user = await createTestUser({ displayName: 'Cookie' });
    created.push(user.id);
    const res = await request(app).post('/api/auth/login').set(headers).send({ email: user.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = cookiesOf(res).find((c) => c.startsWith('cozyvtt.sid='));
    expect(cookie).toBeDefined();
    return cookie ?? '';
  }

  it('is the server\'s: named cozyvtt.sid, out of reach of scripts, and not sent along by other sites', async () => {
    const cookie = await signIn();

    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).not.toMatch(/; Secure/);
  });

  it('is marked Secure when the proxy in front says the visitor came over HTTPS', async () => {
    const cookie = await signIn({ 'X-Forwarded-Proto': 'https' });

    expect(cookie).toMatch(/; Secure/);
  });
});

describe('the password-change gate', () => {
  it('holds an account with an administrator-issued password to changing it', async () => {
    const user = await createTestUser({ displayName: 'Must change' });
    created.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);

    const refused = await agent.get('/api/campaigns');

    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });
});

describe('the order a request meets the middleware in', () => {
  // The app as the server builds it: every gate on, the general limit included.
  const limiter = createGeneralApiLimiter();
  const layers = appLayers(createApp({ session: { ...sessionOptions, secret: 'test-secret-do-not-use-in-production' }, generalApiLimiter: limiter }));
  const by = (handle: unknown) => layers.findIndex((layer) => layer.handle === handle);
  const named = (name: string) => layers.findIndex((layer) => layer.name === name);

  const steps: Array<[string, number]> = [
    ['the security headers', named('helmetMiddleware')],
    ['CORS', named('corsMiddleware')],
    ['the cross-site check', by(originCheck)],
    ['the restore gate', by(refuseWhileDatabaseIsReplaced)],
    ['the session', named('session')],
    ['the setup gate', by(requireSetupComplete)],
    ['the health check', layers.findIndex((layer) => layer.route && layer.path === '/health')],
    ['the general limit', by(limiter)],
    ['the password-change gate', by(requirePasswordChanged)],
    ['the administrator two-factor gate', by(requireAdminMfa)],
    ['the first router', named('router')],
  ];

  it('has every step', () => {
    expect(steps.filter(([, index]) => index < 0).map(([step]) => step)).toEqual([]);
  });

  it('runs them in the server\'s order', () => {
    const sorted = [...steps].sort((a, b) => a[1] - b[1]).map(([step]) => step);
    expect(sorted).toEqual(steps.map(([step]) => step));
  });

  it('puts every router after the gates', () => {
    const lastGate = by(requireAdminMfa);
    const routers = layers.flatMap((layer, index) => (layer.name === 'router' ? [index] : []));
    expect(routers.length).toBeGreaterThan(10);
    expect(routers.filter((index) => index < lastGate)).toEqual([]);
  });

  it('mounts the restore gate, the general limit and the two account gates on /api, and the setup gate on every path', () => {
    const at = (handle: unknown) => layers[by(handle)]?.path;
    expect([refuseWhileDatabaseIsReplaced, limiter, requirePasswordChanged, requireAdminMfa].map(at)).toEqual(['/api', '/api', '/api', '/api']);
    expect(at(requireSetupComplete)).toBe('');
  });
});

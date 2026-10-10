/**
 * The setup wizard, and the gate that holds the API closed until it has run.
 *
 * POST /api/setup/init is the one route that creates an administrator without
 * anyone signed in, so what it refuses matters as much as what it does: it
 * runs once, only on an instance with no accounts, and only with a valid first
 * account. Until it has run, the gate answers 403 to everything except the
 * setup routes and the health check.
 *
 * A brand new instance is an empty database, which the shared test database
 * never is, so this file runs on a schema of its own (helpers/isolatedSchema).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';

jest.setTimeout(60000);

const PASSWORD = 'FirstAdmin1!Cozy';
const sharedUrl = process.env.DATABASE_URL;

let schema: IsolatedSchema;
let db: PrismaClient;
let app: express.Express;

/** The session cookie a response set, as `name=value`. */
function sessionCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
}

/** Back to a brand new instance: no accounts, no settings row. */
async function freshInstance(): Promise<void> {
  await db.user.deleteMany({});
  await db.systemSettings.deleteMany({});
}

const init = (body: Record<string, unknown>, agent: request.Agent | null = null) =>
  (agent ?? request(app)).post('/api/setup/init').send(body);

beforeAll(async () => {
  schema = createIsolatedSchema('setup_wizard_test');
  process.env.DATABASE_URL = schema.url;
  db = new PrismaClient({ datasources: { db: { url: schema.url } } });

  const { createTestApp } = await import('../../__tests__/helpers/test-app');
  const { requireSetupComplete } = await import('../../middleware/setup');

  // The server's order: sessions, then the gate, then the routes. The one
  // extra route stands in for any page that stores something in a visitor's
  // session before they sign in, so there is a session to replace.
  app = express();
  app.use(session({ secret: 'test-secret-do-not-use-in-production', resave: false, saveUninitialized: false, cookie: { secure: false } }));
  app.get('/visit', (req, res) => {
    req.session.mfaRememberMe = false;
    res.status(204).end();
  });
  app.use(requireSetupComplete);
  app.use(createTestApp());
});

afterAll(async () => {
  await db.$disconnect();
  const appDb = (global as unknown as { prisma?: PrismaClient }).prisma;
  if (appDb) await appDb.$disconnect();
  schema.drop();
  process.env.DATABASE_URL = sharedUrl;
});

describe('before setup', () => {
  beforeAll(freshInstance);

  it('says setup is needed', async () => {
    const res = await request(app).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ setupCompleted: false, hasUsers: false, needsSetup: true });
  });

  it('answers the health check and nothing else outside setup', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    for (const [method, url] of [['get', '/api/campaigns'], ['post', '/api/auth/login'], ['post', '/api/auth/register'], ['get', '/api/config']] as const) {
      const res = await request(app)[method](url).send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Setup Required');
    }
  });

  it.each([
    ['no display name', { email: 'admin@example.com', password: PASSWORD }],
    ['no password', { email: 'admin@example.com', displayName: 'Admin' }],
    ['an address that is not one', { email: 'not-an-address', password: PASSWORD, displayName: 'Admin' }],
    ['a weak password', { email: 'admin@example.com', password: 'password', displayName: 'Admin' }],
  ])('refuses a first account with %s, and creates nothing', async (_label, body) => {
    const res = await init(body);
    expect(res.status).toBe(400);
    expect(await db.user.count()).toBe(0);
    expect((await request(app).get('/api/setup/status')).body.setupCompleted).toBe(false);
  });
});

describe('running setup', () => {
  beforeAll(freshInstance);

  it('creates the first admin, applies the wizard\'s settings and signs them in on a new session', async () => {
    const agent = request.agent(app);
    const visit = await agent.get('/visit');
    const before = sessionCookie(visit);
    expect(before).toBeDefined();

    const res = await init(
      { email: 'Admin@Example.com', password: PASSWORD, displayName: 'First Admin', instanceName: 'Tuesday Table', allowRegistration: true },
      agent
    );

    expect(res.status).toBe(201);
    expect(res.body.user.platformRole).toBe('ADMIN');
    expect(res.body.user.email).toBe('admin@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');

    // A fresh session id, so one planted before setup is not the admin's.
    const after = sessionCookie(res);
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    expect((await agent.get('/api/auth/me')).body.user.platformRole).toBe('ADMIN');
    expect((await request(app).get('/api/auth/me').set('Cookie', before ?? '')).status).toBe(401);

    const settings = await db.systemSettings.findFirstOrThrow({ orderBy: { id: 'asc' } });
    expect(settings.setupCompleted).toBe(true);
    expect(settings.instanceName).toBe('Tuesday Table');
    expect(settings.allowRegistration).toBe(true);
  });

  it('opens the API once it has run', async () => {
    expect((await request(app).get('/api/setup/status')).body).toEqual({ setupCompleted: true, hasUsers: true, needsSetup: false });
    // Through the gate to the route's own sign-in check.
    expect((await request(app).get('/api/campaigns')).status).toBe(401);
  });

  it('refuses to run a second time', async () => {
    const res = await init({ email: 'second@example.com', password: PASSWORD, displayName: 'Second' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Setup Already Completed');
    expect(await db.user.count()).toBe(1);
    expect(await db.user.count({ where: { platformRole: 'ADMIN' } })).toBe(1);
  });

  it('refuses to run where accounts exist, even if setup was never marked complete', async () => {
    await db.systemSettings.updateMany({ data: { setupCompleted: false } });
    const res = await init({ email: 'third@example.com', password: PASSWORD, displayName: 'Third' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Users Exist');
    expect(await db.user.count()).toBe(1);
  });
});

describe('two setups at once', () => {
  beforeAll(freshInstance);

  it('make exactly one admin', async () => {
    const answers = await Promise.all(
      Array.from({ length: 4 }, (_, i) => init({ email: `racer${i}@example.com`, password: PASSWORD, displayName: `Racer ${i}` }))
    );
    expect(answers.some((res) => res.status === 201)).toBe(true);
    expect(await db.user.count({ where: { platformRole: 'ADMIN' } })).toBe(1);
  });
});

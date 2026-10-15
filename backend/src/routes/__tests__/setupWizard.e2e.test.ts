/**
 * The setup wizard, and the gate that holds the API closed until it has run.
 *
 * POST /api/setup/init is the one route that creates an administrator without
 * anyone signed in, so what it refuses matters as much as what it does: it
 * runs once, only on an instance with no accounts, only with the setup token
 * the backend printed in its log (or SETUP_TOKEN), and only with a valid
 * first account. Until it has run, the gate answers 403 to everything except
 * the setup routes and the health check.
 *
 * Creating the administrator, applying the wizard's settings and marking
 * setup complete are one transaction, so two wizards submitted together make
 * one administrator and one of them is told setup is already complete, and a
 * failure part-way leaves nothing behind. An instance an older version left
 * with an administrator but setup unmarked is finished on the next request,
 * so that administrator can sign in.
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
import { createPrismaClient } from '../../config/prismaClient';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';

jest.setTimeout(60000);

const PASSWORD = 'FirstAdmin1!Cozy';
const TOKEN = 'setup-wizard-test-token-0123456789';
const sharedUrl = process.env.DATABASE_URL;
let setupService: typeof import('../../services/setup');

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

/** A wizard submission, carrying the setup token unless the body says otherwise. */
const init = (body: Record<string, unknown>, agent: request.Agent | null = null) =>
  (agent ?? request(app)).post('/api/setup/init').send({ setupToken: TOKEN, ...body });

beforeAll(async () => {
  schema = createIsolatedSchema('setup_wizard_test');
  process.env.DATABASE_URL = schema.url;
  process.env.SETUP_TOKEN = TOKEN;
  db = createPrismaClient(schema.url);

  const { createTestApp } = await import('../../__tests__/helpers/test-app');
  const { requireSetupComplete } = await import('../../middleware/setup');
  setupService = await import('../../services/setup');

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
  delete process.env.SETUP_TOKEN;
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
    ['an email that is not text', { email: ['admin@example.com'], password: PASSWORD, displayName: 'Admin' }],
  ])('refuses a first account with %s, and creates nothing', async (_label, body) => {
    const res = await init(body);
    expect(res.status).toBe(400);
    expect(await db.user.count()).toBe(0);
    expect((await request(app).get('/api/setup/status')).body.setupCompleted).toBe(false);
  });

  it.each([
    ['no setup token', { setupToken: undefined }],
    ['a wrong setup token', { setupToken: 'not-the-token' }],
    ['a setup token that is not text', { setupToken: { equals: TOKEN } }],
  ])('refuses a wizard with %s with 403, before looking at the account, and creates nothing', async (_label, body) => {
    const res = await init({ email: 'admin@example.com', password: PASSWORD, displayName: 'Admin', ...body });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.message).toContain('Setup token');
    expect(await db.user.count()).toBe(0);
    expect((await request(app).get('/api/setup/status')).body.setupCompleted).toBe(false);
  });

  it('answers a failure inside the server with a fixed message, and leaves setup open', async () => {
    const spy = jest.spyOn(setupService, 'setUpInstance').mockRejectedValueOnce(
      new Error('Invalid `tx.systemSettings.updateMany()` invocation in /app/dist/services/setup.js:40')
    );
    try {
      const res = await init({ email: 'admin@example.com', password: PASSWORD, displayName: 'Admin' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error', message: 'An unexpected error occurred during setup' });
    } finally {
      spy.mockRestore();
    }
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

  it('finishes a setup that made the administrator but was never marked complete, so they can sign in', async () => {
    // What an older version left behind when it failed between creating the
    // account and marking setup complete: the account exists, the gate holds
    // everything closed, and the wizard refuses to run again.
    await db.systemSettings.updateMany({ data: { setupCompleted: false } });

    const res = await init({ email: 'third@example.com', password: PASSWORD, displayName: 'Third' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Setup Already Completed');
    expect(await db.user.count()).toBe(1);

    expect((await request(app).get('/api/setup/status')).body).toEqual({ setupCompleted: true, hasUsers: true, needsSetup: false });
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
  });
});

describe('two setups at once', () => {
  beforeAll(freshInstance);

  it('make exactly one admin, with exactly one 201, and apply only the winner\'s settings', async () => {
    const answers = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        init({ email: `racer${i}@example.com`, password: PASSWORD, displayName: `Racer ${i}`, instanceName: `Table ${i}`, allowRegistration: i % 2 === 0 })
      )
    );
    const won = answers.filter((res) => res.status === 201);
    expect(won).toHaveLength(1);
    for (const lost of answers.filter((res) => res.status !== 201)) {
      expect(lost.status).toBe(400);
      expect(lost.body.error).toBe('Setup Already Completed');
      expect(sessionCookie(lost)).toBeUndefined();
    }

    expect(await db.user.count()).toBe(1);
    expect(await db.user.count({ where: { platformRole: 'ADMIN' } })).toBe(1);
    const winner = Number(/racer(\d)@/.exec(won[0].body.user.email)?.[1]);
    const settings = await db.systemSettings.findFirstOrThrow({ orderBy: { id: 'asc' } });
    expect(settings.instanceName).toBe(`Table ${winner}`);
    expect(settings.allowRegistration).toBe(winner % 2 === 0);
  });
});

/**
 * Turning API keys off for the instance, and the settings a key may not change — End-to-End Tests
 *
 * The switch is one settings row for the whole instance, and the other API key
 * suites use keys at the same time in the shared schema, so this runs on a
 * schema of its own, as does what a key may change of those settings.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type express from 'express';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../config/prismaClient';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';

jest.setTimeout(60000);

const PASSWORD = 'KeySwitch1!Cozy';
const sharedUrl = process.env.DATABASE_URL;

let schema: IsolatedSchema;
let db: PrismaClient;
let app: express.Express;
let admin: ReturnType<typeof request.agent>;
let key = '';

beforeAll(async () => {
  schema = createIsolatedSchema('api_keys_switch_test');
  process.env.DATABASE_URL = schema.url;
  db = createPrismaClient(schema.url);

  const { hashPassword } = require('../../services/auth') as typeof import('../../services/auth');
  const { createTestApp } = require('../../__tests__/helpers/test-app') as typeof import('../../__tests__/helpers/test-app');
  app = createTestApp();
  const user = await db.user.create({
    data: { email: 'key-switch@test.invalid', displayName: 'Key Switch Admin', passwordHash: await hashPassword(PASSWORD), platformRole: 'ADMIN' },
  });
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(200);
  const made = await admin.post('/api/api-keys').send({ name: 'Switch', permissions: { campaigns: 'read' } });
  expect(made.status).toBe(201);
  key = made.body.key;
});

afterAll(async () => {
  await db.$disconnect();
  const appDb = (global as unknown as { prisma?: PrismaClient }).prisma;
  if (appDb) await appDb.$disconnect();
  schema.drop();
  process.env.DATABASE_URL = sharedUrl;
});

it('refuses every key and every key route while off, tells the pages, and lets keys work again once on', async () => {
  expect((await request(app).get('/api/campaigns').set('X-API-Key', key)).status).toBe(200);
  expect((await admin.put('/api/admin/settings').send({ apiKeysEnabled: false })).status).toBe(200);

  const refused = await request(app).get('/api/campaigns').set('X-API-Key', key);
  expect(refused.status).toBe(403);
  expect(refused.body.message).toBe('API keys are turned off on this server');
  expect((await admin.get('/api/api-keys')).status).toBe(403);
  expect((await admin.post('/api/api-keys').send({ name: 'x' })).status).toBe(403);
  expect((await admin.get('/api/auth/me')).body.user.apiKeysAllowed).toBe(false);
  expect((await admin.get('/api/admin/settings')).body.settings.apiKeysEnabled).toBe(false);

  expect((await admin.put('/api/admin/settings').send({ apiKeysEnabled: true })).status).toBe(200);
  expect((await request(app).get('/api/campaigns').set('X-API-Key', key)).status).toBe(200);
  expect((await admin.get('/api/auth/me')).body.user.apiKeysAllowed).toBe(true);
});

it('still lets an administrator find and revoke a key while keys are off, and the owner revoke their own', async () => {
  const leaked = await admin.post('/api/api-keys').send({ name: 'Leaked' });
  const own = await admin.post('/api/api-keys').send({ name: 'Own' });
  expect((await admin.put('/api/admin/settings').send({ apiKeysEnabled: false })).status).toBe(200);
  try {
    const all = await admin.get('/api/api-keys?all=true');
    expect(all.status).toBe(200);
    expect(all.body.apiKeys.map((k: { name: string }) => k.name)).toEqual(expect.arrayContaining(['Leaked', 'Own']));
    expect((await admin.delete(`/api/api-keys/${leaked.body.apiKey.id}`)).status).toBe(204);
    expect((await admin.delete(`/api/api-keys/${own.body.apiKey.id}`)).status).toBe(204);
    expect((await admin.post('/api/api-keys/x/regenerate')).status).toBe(403);
  } finally {
    await admin.put('/api/admin/settings').send({ apiKeysEnabled: true });
  }
  expect(await db.apiKey.count({ where: { name: { in: ['Leaked', 'Own'] } } })).toBe(0);
});

it('writes turning keys off to the activity log', async () => {
  await admin.put('/api/admin/settings').send({ apiKeysEnabled: false });
  const line = await db.systemLog.findFirst({ where: { message: { contains: 'apiKeysEnabled' } }, orderBy: { createdAt: 'desc' } });
  expect(line?.message).toBe('Updated system settings: apiKeysEnabled');
  await admin.put('/api/admin/settings').send({ apiKeysEnabled: true });
});

it('refuses a key changing the sign-in or API key settings, and allows the rest', async () => {
  const made = await admin.post('/api/api-keys').send({ name: 'Settings', permissions: { 'admin-settings': 'write' } });
  expect(made.status).toBe(201);
  const withKey = { 'X-API-Key': made.body.key as string };
  const settings = (await admin.get('/api/admin/settings')).body.settings;
  for (const change of [
    { allowRegistration: !settings.allowRegistration },
    { requireAdminApproval: !settings.requireAdminApproval },
    { apiKeysEnabled: false },
  ]) {
    const res = await request(app).put('/api/admin/settings').set(withKey).send(change);
    expect([Object.keys(change)[0], res.status, res.body.message]).toEqual([
      Object.keys(change)[0],
      403,
      'Sign-in and API key settings need a signed-in session',
    ]);
  }
  const stored = await db.systemSettings.findFirstOrThrow({ orderBy: { id: 'asc' } });
  expect([stored.allowRegistration, stored.requireAdminApproval, stored.apiKeysEnabled]).toEqual([
    settings.allowRegistration,
    settings.requireAdminApproval,
    true,
  ]);
  const ok = await request(app)
    .put('/api/admin/settings')
    .set(withKey)
    .send({ instanceName: 'Keyed Tavern', allowRegistration: settings.allowRegistration, apiKeysEnabled: true });
  expect(ok.status).toBe(200);
  expect(ok.body.settings.instanceName).toBe('Keyed Tavern');
});

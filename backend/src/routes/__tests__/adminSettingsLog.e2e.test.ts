/**
 * A settings save writes only what it changed to the admins' activity log,
 * with the value before and after, as an edit to an account does.
 *
 * PUT /api/admin/settings wrote every setting the page sent, changed or not,
 * as "now ..." with no value before, so saving the page with one field edited
 * listed all of them and said nothing of what had been there.
 *
 * The settings row is shared by every test file, so it is put back when this
 * file ends.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type express from 'express';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../config/prismaClient';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';

jest.setTimeout(60000);

const PASSWORD = 'SettingsLog1!Cozy';
const sharedUrl = process.env.DATABASE_URL;

let schema: IsolatedSchema;
let db: PrismaClient;
let app: express.Express;
let adminId: string;
let admin: ReturnType<typeof request.agent>;
let original: Awaited<ReturnType<PrismaClient['systemSettings']['findFirstOrThrow']>>;

const save = (body: Record<string, unknown>) => admin.put('/api/admin/settings').send(body);
const lines = () =>
  db.systemLog.findMany({ where: { userId: adminId, message: { startsWith: 'Updated system settings' } }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  // The settings are one row for the whole instance, which the other suites
  // change at the same time in the shared schema, so this runs on its own.
  schema = createIsolatedSchema('admin_settings_log_test');
  process.env.DATABASE_URL = schema.url;
  db = createPrismaClient(schema.url);

  const { hashPassword } = require('../../services/auth') as typeof import('../../services/auth');
  const { createTestApp } = require('../../__tests__/helpers/test-app') as typeof import('../../__tests__/helpers/test-app');
  app = createTestApp();
  const user = await db.user.create({
    data: { email: 'settings-log@test.invalid', displayName: 'Settings Log Admin', passwordHash: await hashPassword(PASSWORD), platformRole: 'ADMIN' },
  });
  adminId = user.id;
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(200);
  // Reading the settings makes the row on a schema that has none yet.
  expect((await admin.get('/api/admin/settings')).status).toBe(200);
  original = await db.systemSettings.findFirstOrThrow({ orderBy: { id: 'asc' } });
});

afterAll(async () => {
  await db.$disconnect();
  const appDb = (global as unknown as { prisma?: PrismaClient }).prisma;
  if (appDb) await appDb.$disconnect();
  schema.drop();
  process.env.DATABASE_URL = sharedUrl;
});

it('lists only the settings that changed, each with its value before and after', async () => {
  // The page sends every setting; only the instance name differs from what is stored.
  const res = await save({
    instanceName: 'Log Test Tavern',
    allowRegistration: original.allowRegistration,
    requireAdminApproval: original.requireAdminApproval,
    themeId: original.themeId,
    fontId: original.fontId,
  });
  expect(res.status).toBe(200);

  const written = await lines();
  expect(written).toHaveLength(1);
  expect(written[0].message).toBe('Updated system settings: instanceName');
  expect(written[0].context).toEqual({ changes: { instanceName: { from: original.instanceName, to: 'Log Test Tavern' } } });
});

it('writes nothing when a save changes nothing', async () => {
  const before = (await lines()).length;

  expect((await save({ instanceName: 'Log Test Tavern', allowRegistration: original.allowRegistration })).status).toBe(200);

  expect(await lines()).toHaveLength(before);
});

it('lists several changes together, a switch as yes and no', async () => {
  const before = (await lines()).length;

  expect((await save({ instanceName: 'Log Test Inn', allowRegistration: !original.allowRegistration })).status).toBe(200);

  const written = await lines();
  expect(written).toHaveLength(before + 1);
  const last = written[written.length - 1];
  expect(last.message).toBe('Updated system settings: instanceName, allowRegistration');
  expect(last.context).toEqual({
    changes: {
      instanceName: { from: 'Log Test Tavern', to: 'Log Test Inn' },
      allowRegistration: { from: original.allowRegistration, to: !original.allowRegistration },
    },
  });
});

it('compares the custom colours by value, not by the order of their keys', async () => {
  const colours = { primary: '#112233', accent: '#445566', background: '#778899', text: '#aabbcc' };
  expect((await save({ themeId: 'custom', customThemeColors: colours })).status).toBe(200);
  const afterFirst = (await lines()).length;

  // The same four colours, written in another order.
  const reordered = { text: '#aabbcc', background: '#778899', accent: '#445566', primary: '#112233' };
  expect((await save({ customThemeColors: reordered })).status).toBe(200);
  expect(await lines()).toHaveLength(afterFirst);

  expect((await save({ customThemeColors: { ...colours, primary: '#123456' } })).status).toBe(200);
  const written = await lines();
  expect(written).toHaveLength(afterFirst + 1);
  expect(written[written.length - 1].context).toEqual({
    changes: { customThemeColors: { from: colours, to: { ...colours, primary: '#123456' } } },
  });
});

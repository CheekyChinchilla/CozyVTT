/**
 * The instance name an admin sets reaches the browser.
 *
 * The browser tab showed CozyVTT whatever the name was, because nothing the
 * page could read carried it. GET /api/auth/appearance, which every page
 * reads before anyone signs in, now includes it.
 *
 * The settings row is shared by every test file, so the name is put back
 * when this file ends.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let adminId: string;
let admin: ReturnType<typeof request.agent>;
let before: string | null = null;

beforeAll(async () => {
  const user = await createTestUser({ role: PlatformRole.ADMIN, displayName: 'Name Admin' });
  adminId = user.id;
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  before = (await admin.get('/api/admin/settings')).body.settings.instanceName;
});

afterAll(async () => {
  try {
    if (before !== null) await prisma.systemSettings.updateMany({ data: { instanceName: before } });
    await cleanupUsers([adminId]);
  } finally {
    await prisma.$disconnect();
  }
});

it('is in the appearance every page reads, signed in or not', async () => {
  expect((await admin.put('/api/admin/settings').send({ instanceName: 'The Hearthstone Tavern' })).status).toBe(200);

  const res = await request(app).get('/api/auth/appearance');

  expect(res.status).toBe(200);
  expect(res.body.instanceName).toBe('The Hearthstone Tavern');
});

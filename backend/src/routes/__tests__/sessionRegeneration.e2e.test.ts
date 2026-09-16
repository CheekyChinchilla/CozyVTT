/**
 * A new session id at every step up in privilege.
 *
 * Signing in used to write onto the existing session object, so the id a
 * request carried before it authenticated became the authenticated id. The
 * fields are now written to a freshly regenerated session. This drives it
 * through the cookie: two logins on one agent must not share a session id.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let email: string;

const sidOf = (res: request.Response): string | undefined => {
  const set = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = set?.find((c) => c.startsWith('connect.sid='));
  return cookie?.split(';')[0].split('=')[1];
};

beforeAll(async () => {
  const u = await createTestUser({ email: `regen-${Date.now()}@test.cozyvtt.local`, displayName: 'Regen' });
  userId = u.id;
  email = u.email;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

it('mints a new session id on each login', async () => {
  const agent = request.agent(app);

  const first = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(first.status).toBe(200);
  const sidA = sidOf(first);
  expect(sidA).toBeTruthy();

  // Log in again on the same agent. Without regeneration express-session keeps
  // the same id and sets no new cookie; with it, a new id is issued.
  const second = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(second.status).toBe(200);
  const sidB = sidOf(second);
  expect(sidB).toBeTruthy();
  expect(sidB).not.toBe(sidA);

  // And the session still works.
  expect((await agent.get('/api/auth/me')).status).toBe(200);
});

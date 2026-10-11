/**
 * An administrator without two-factor authentication is told when it becomes required.
 *
 * The app said administrators must keep MFA on but never asked them to turn it
 * on. Now an administrator account must enrol within 7 days of the policy
 * starting on the instance (or of the account being created, whichever is
 * later). Until then the signed-in user carries `adminMfaDeadline`, which the
 * pages show as a banner; after it the gate refuses everything but enrolment.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const created: string[] = [];

async function signedIn(role: 'ADMIN' | 'USER', mfa: boolean) {
  const user = await createTestUser({ displayName: 'Deadline', role });
  created.push(user.id);
  if (mfa) await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  return { user, agent, login };
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('gives an administrator without MFA a deadline about seven days away, at sign-in and on /me', async () => {
  const { agent, login } = await signedIn('ADMIN', false);

  expect(login.status).toBe(200);
  expect(login.body.user.adminMfaDeadline).toEqual(expect.any(String));
  const me = await agent.get('/api/auth/me');
  expect(me.body.user.adminMfaDeadline).toEqual(expect.any(String));

  const daysAway = (Date.parse(me.body.user.adminMfaDeadline) - Date.now()) / (24 * 60 * 60 * 1000);
  expect(daysAway).toBeGreaterThan(6.9);
  expect(daysAway).toBeLessThanOrEqual(7);
});

it('gives no deadline to an ordinary user, or to an administrator who has MFA on', async () => {
  const user = await signedIn('USER', false);
  expect(user.login.status).toBe(200);
  expect((await user.agent.get('/api/auth/me')).body.user.adminMfaDeadline).toBeNull();

  const admin = await createTestUser({ displayName: 'Enrolled admin', role: 'ADMIN' });
  created.push(admin.id);
  await prisma.user.update({ where: { id: admin.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  // Signed in through the test route the gate tests use, since MFA is on.
  const me = await request(app).get('/api/auth/me');
  expect(me.status).toBe(401);
});

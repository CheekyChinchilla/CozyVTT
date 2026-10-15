/**
 * An administrator without two-factor authentication is told when it becomes required.
 *
 * The app said administrators must keep MFA on but never asked them to turn it
 * on. Now an administrator account must enrol within 7 days of the policy
 * starting on the instance (or of the account being created, whichever is
 * later). Until then the signed-in user carries `adminMfaDeadline`, which the
 * pages show as a banner; after it the gate refuses everything but enrolment.
 *
 * An account made subject to the rule afresh gets 7 days from then: another
 * administrator reset its MFA, or a user was made an administrator. Without
 * that, both were refused everything on their first request once the account
 * and the policy were a week old, while the app promised them a week.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { ADMIN_MFA_POLICY_MESSAGE, resetAdminMfaPolicyCache } from '../../services/adminMfaPolicy';

const app = createTestApp();
const created: string[] = [];
const DAY = 24 * 60 * 60 * 1000;
const daysAway = (iso: string): number => (Date.parse(iso) - Date.now()) / DAY;

/** The policy started on this instance long ago, so only a newer anchor puts a deadline ahead. */
async function policyStartedLongAgo(): Promise<void> {
  const longAgo = new Date(Date.now() - 30 * DAY);
  await prisma.systemLog.updateMany({ where: { message: ADMIN_MFA_POLICY_MESSAGE }, data: { createdAt: longAgo } });
  if ((await prisma.systemLog.count({ where: { message: ADMIN_MFA_POLICY_MESSAGE } })) === 0) {
    await prisma.systemLog.create({ data: { level: 'INFO', message: ADMIN_MFA_POLICY_MESSAGE, createdAt: longAgo } });
  }
  resetAdminMfaPolicyCache();
}

async function signedIn(role: 'ADMIN' | 'USER', mfa: boolean) {
  const user = await createTestUser({ displayName: 'Deadline', role });
  created.push(user.id);
  if (mfa) await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  return { user, agent, login };
}

afterAll(async () => {
  await prisma.systemLog.deleteMany({ where: { userId: { in: created } } });
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

describe('an account made subject to the rule afresh has 7 days from then', () => {
  it('when another administrator resets its MFA, though the account and the policy are older', async () => {
    await policyStartedLongAgo();
    const target = await createTestUser({ displayName: 'Reset admin', role: 'ADMIN' });
    created.push(target.id);
    await prisma.user.update({
      where: { id: target.id },
      data: { createdAt: new Date(Date.now() - 30 * DAY), mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' },
    });
    const actor = await signedIn('ADMIN', false);

    expect((await actor.agent.post(`/api/admin/users/${target.id}/reset-mfa`)).status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(daysAway(login.body.user.adminMfaDeadline)).toBeGreaterThan(6.9);
    expect(daysAway(login.body.user.adminMfaDeadline)).toBeLessThanOrEqual(7);
  });

  it('when a user is made an administrator, and the promotion is written to the activity log', async () => {
    await policyStartedLongAgo();
    const promoted = await createTestUser({ displayName: 'Promoted', role: 'USER' });
    created.push(promoted.id);
    await prisma.user.update({ where: { id: promoted.id }, data: { createdAt: new Date(Date.now() - 30 * DAY) } });
    const actor = await signedIn('ADMIN', false);

    expect((await actor.agent.put(`/api/users/${promoted.id}`).send({ platformRole: 'ADMIN' })).status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: promoted.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(daysAway(login.body.user.adminMfaDeadline)).toBeGreaterThan(6.9);
    expect(daysAway(login.body.user.adminMfaDeadline)).toBeLessThanOrEqual(7);

    const logged = await prisma.systemLog.findMany({ where: { message: `Made ${promoted.email} an administrator` } });
    expect(logged).toHaveLength(1);
    expect(logged[0].userId).toBe(actor.user.id);
    expect(logged[0].level).toBe('WARNING');
  });
});

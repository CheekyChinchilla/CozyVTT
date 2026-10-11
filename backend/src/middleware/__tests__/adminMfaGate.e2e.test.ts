/**
 * An administrator without two-factor authentication is held to the deadline.
 *
 * Past it the gate answers 403 with the code MFA_ENROLMENT_REQUIRED to
 * everything but enrolment, signing out and the few reads the password gate
 * allows too, so the app can send the administrator to set it up. Within the
 * grace period, and once MFA is on, nothing changes. The same read refreshes
 * the session's copy of the role, so a demoted administrator loses the admin
 * guards on their next request, and a session whose account is gone ends.
 *
 * Mounted here the way server.ts mounts it, on /api behind the session, in
 * front of the routers. Requires PostgreSQL at DATABASE_URL.
 */

import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { requireAdminMfa, MFA_ENROLMENT_REQUIRED } from '../adminMfa';
import { ADMIN_MFA_POLICY_MESSAGE, resetAdminMfaPolicyCache } from '../../services/adminMfaPolicy';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = express();
app.use(session({ secret: 'test-secret-do-not-use-in-production', resave: false, saveUninitialized: false, cookie: { secure: false } }));
app.use('/api', requireAdminMfa);
app.use(createTestApp());

const DAY = 24 * 60 * 60 * 1000;
const created: string[] = [];

/** An administrator created `ageDays` ago, signed in. */
async function admin(ageDays: number): Promise<{ id: string; agent: request.Agent }> {
  const user = await createTestUser({ displayName: 'Gated admin', role: 'ADMIN' });
  created.push(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date(Date.now() - ageDays * DAY) } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

beforeAll(async () => {
  // The policy started on this instance long ago, so an old administrator's
  // deadline has passed; a new one still has the whole grace period.
  await prisma.systemLog.updateMany({ where: { message: ADMIN_MFA_POLICY_MESSAGE }, data: { createdAt: new Date(Date.now() - 30 * DAY) } });
  if ((await prisma.systemLog.count({ where: { message: ADMIN_MFA_POLICY_MESSAGE } })) === 0) {
    await prisma.systemLog.create({ data: { level: 'INFO', message: ADMIN_MFA_POLICY_MESSAGE, createdAt: new Date(Date.now() - 30 * DAY) } });
  }
  resetAdminMfaPolicyCache();
});

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('refuses everything but enrolment to an administrator past the deadline, with a code the app can act on', async () => {
  const { agent } = await admin(10);

  const refused = await agent.get('/api/admin/stats');
  expect(refused.status).toBe(403);
  expect(refused.body).toEqual({
    error: 'MFA Required',
    code: MFA_ENROLMENT_REQUIRED,
    message: 'Administrator accounts must use two-factor authentication. Set it up to continue.',
  });
  expect((await agent.get('/api/campaigns')).status).toBe(403);

  // What stays open: who am I, enrolment, signing out.
  expect((await agent.get('/api/auth/me')).status).toBe(200);
  const setup = await agent.post('/api/auth/mfa/setup').send({ password: TEST_PASSWORD });
  expect(setup.status).toBe(200);
  expect((await agent.post('/api/auth/logout')).status).toBe(200);
});

it('leaves an administrator within the grace period, and one with MFA on, alone', async () => {
  const fresh = await admin(0);
  expect((await fresh.agent.get('/api/admin/stats')).status).toBe(200);

  const enrolled = await admin(10);
  await prisma.user.update({ where: { id: enrolled.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  expect((await enrolled.agent.get('/api/admin/stats')).status).toBe(200);
});

it('refreshes the session\'s role, so a demoted administrator loses the admin routes on the next request', async () => {
  const { id, agent } = await admin(0);
  expect((await agent.get('/api/admin/stats')).status).toBe(200);

  await prisma.user.update({ where: { id }, data: { platformRole: 'USER' } });

  const after = await agent.get('/api/admin/stats');
  expect(after.status).toBe(403);
  expect(after.body.error).toBe('Forbidden');
});

it('ends a session whose account no longer exists', async () => {
  const { id, agent } = await admin(0);
  await prisma.user.delete({ where: { id } });
  created.splice(created.indexOf(id), 1);

  const gone = await agent.get('/api/admin/stats');
  expect(gone.status).toBe(401);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});

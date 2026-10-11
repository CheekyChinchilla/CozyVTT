/**
 * An admin cannot reset their own MFA or password through the admin routes.
 *
 * Turning one's own MFA off and changing one's own password each ask for the
 * current password, so a stolen session alone cannot do them. The admin reset
 * routes asked for nothing but the session and accepted the caller's own id,
 * so a stolen admin session could turn off its MFA and read a new temporary
 * password for itself. Both now refuse the caller's own id and point at the
 * self-service routes, and an admin password reset is written to the admins'
 * activity log, as the MFA reset already was.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const created: string[] = [];

async function admin(): Promise<{ id: string; agent: request.Agent }> {
  const user = await createTestUser({ displayName: 'Admin', role: 'ADMIN' });
  created.push(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  const agent = request.agent(app);
  // Sign in through the test route the live-table tests use: the account has
  // MFA on, and this file is about what the session may do once signed in.
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).body.mfaRequired).toBe(true);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
  const signedIn = request.agent(app);
  expect((await signedIn.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  return { id: user.id, agent: signedIn };
}

afterAll(async () => {
  await prisma.systemLog.deleteMany({ where: { userId: { in: created } } });
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('refuses to reset the caller\'s own MFA, and leaves it on', async () => {
  const { id, agent } = await admin();

  const res = await agent.post(`/api/admin/users/${id}/reset-mfa`);

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/your own/i);
  const stored = await prisma.user.findUniqueOrThrow({ where: { id }, select: { mfaEnabled: true } });
  expect(stored.mfaEnabled).toBe(true);
});

it('refuses to reset the caller\'s own password, and leaves it alone', async () => {
  const { id, agent } = await admin();
  const before = await prisma.user.findUniqueOrThrow({ where: { id }, select: { passwordHash: true } });

  const res = await agent.post(`/api/users/${id}/reset-password`);

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/your own/i);
  expect(res.body).not.toHaveProperty('temporaryPassword');
  const after = await prisma.user.findUniqueOrThrow({ where: { id }, select: { passwordHash: true, mustChangePassword: true } });
  expect(after.passwordHash).toBe(before.passwordHash);
  expect(after.mustChangePassword).toBe(false);
});

it('still resets another user\'s password, and writes it to the activity log', async () => {
  const { id, agent } = await admin();
  const target = await createTestUser({ displayName: 'Target' });
  created.push(target.id);

  const res = await agent.post(`/api/users/${target.id}/reset-password`);

  expect(res.status).toBe(200);
  expect(res.body.temporaryPassword).toEqual(expect.any(String));
  const logged = await prisma.systemLog.findMany({ where: { userId: id, message: { contains: target.email } } });
  expect(logged).toHaveLength(1);
  expect(logged[0].level).toBe('WARNING');
});

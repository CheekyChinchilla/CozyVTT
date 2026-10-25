/**
 * A route that hashes or checks a password answers 503 when the server is
 * too busy to.
 *
 * Only HASH_SLOTS password hashes run at once and HASH_QUEUE_MAX wait
 * (services/auth.ts). Here every turn and every place in the line is taken,
 * by checks whose Argon2 call finishes only when the test says, and each
 * route is then asked for one more: it answers 503 with "The server is busy,
 * try again in a moment." and `Retry-After`, and a sign-in refused so is not
 * counted as a wrong password.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import argon2 from 'argon2';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import * as systemSettings from '../../services/systemSettings';
import { verifyPassword, HASH_SLOTS, HASH_QUEUE_MAX, SERVER_BUSY_MESSAGE } from '../../services/auth';

jest.setTimeout(30000);

const app = createTestApp();
const users: string[] = [];
let user: { id: string; email: string };
let mfaUser: { id: string; email: string };
let me: ReturnType<typeof request.agent>;
let admin: ReturnType<typeof request.agent>;
let mfaPending: ReturnType<typeof request.agent>;

const unique = (label: string) => `busy-${label}-${randomUUID().slice(0, 8)}@test.cozyvtt.local`;

async function signedIn(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

/** Argon2 calls held open, finished by `release`. */
const held: Array<(value: boolean) => void> = [];
let holding: Promise<unknown>[] = [];

async function release() {
  while (held.length > 0) {
    held.shift()?.(false);
    await new Promise((resolve) => setImmediate(resolve));
  }
  await Promise.allSettled(holding);
}

beforeAll(async () => {
  const u = await createTestUser({ email: unique('user'), displayName: 'Busy user' });
  const a = await createTestUser({ email: unique('admin'), displayName: 'Busy admin', role: PlatformRole.ADMIN });
  const m = await createTestUser({ email: unique('mfa'), displayName: 'Busy MFA' });
  users.push(u.id, a.id, m.id);
  user = u;
  mfaUser = m;
  me = await signedIn(u.email);
  admin = await signedIn(a.email);

  await prisma.user.update({
    where: { id: m.id },
    data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP', mfaBackupCodes: [await argon2.hash('AAAABBBBCC')] },
  });
  mfaPending = request.agent(app);
  const pending = await mfaPending.post('/api/auth/login').send({ email: m.email, password: TEST_PASSWORD });
  expect(pending.body.mfaRequired).toBe(true);

  // Every turn taken and every place in the line filled.
  jest.spyOn(argon2, 'verify').mockImplementation(() => new Promise<boolean>((resolve) => held.push(resolve)));
  holding = Array.from({ length: HASH_SLOTS + HASH_QUEUE_MAX }, () => verifyPassword('$argon2id$held', 'x').catch(() => false));
  await new Promise((resolve) => setImmediate(resolve));
  expect(held).toHaveLength(HASH_SLOTS);
});

afterAll(async () => {
  await release();
  jest.restoreAllMocks();
  await cleanupUsers(users);
  await prisma.$disconnect();
});

function expectBusy(res: request.Response) {
  expect({ status: res.status, body: res.body }).toEqual({ status: 503, body: { error: 'Service Unavailable', message: SERVER_BUSY_MESSAGE } });
  expect(res.headers['retry-after']).toBe('5');
}

it('answers a sign-in with 503', async () => {
  expectBusy(await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }));
  // Five wrong passwords from one address lock it; these are not counted (last test).
  for (let i = 0; i < 6; i++) {
    expectBusy(await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong-Passw0rd!' }));
  }
});

it('answers registration with 503', async () => {
  const settings = await systemSettings.getSystemSettings();
  jest.spyOn(systemSettings, 'getSystemSettings').mockResolvedValueOnce({ ...settings, allowRegistration: true, requireAdminApproval: false });
  expectBusy(await request(app).post('/api/auth/register').send({ email: unique('new'), password: 'Brand-New-Passw0rd!', displayName: 'New' }));
});

it('answers a reset by emailed link with 503', async () => {
  const token = randomUUID();
  await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60_000) } });
  expectBusy(await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Recovered-Str0ng-one!' }));
});

it('answers the signed-in password checks with 503', async () => {
  expectBusy(await me.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: 'Another-Str0ng-one!' }));
  expectBusy(await me.delete('/api/auth/account').send({ password: TEST_PASSWORD }));
  expectBusy(await me.post('/api/auth/mfa/setup').send({ password: TEST_PASSWORD }));
  expectBusy(await me.put(`/api/users/${user.id}`).send({ email: unique('moved'), currentPassword: TEST_PASSWORD }));
  // The two that need two-factor authentication on.
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  expectBusy(await me.post('/api/auth/mfa/disable').send({ password: TEST_PASSWORD, token: '123456' }));
  expectBusy(await me.post('/api/auth/mfa/backup-codes').send({ password: TEST_PASSWORD }));
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
});

it('answers a backup code at the two-factor step with 503', async () => {
  expectBusy(await mfaPending.post('/api/auth/mfa/verify-login').send({ backupCode: 'AAAA-BBBB-CC' }));
  const still = await prisma.user.findUnique({ where: { id: mfaUser.id }, select: { mfaBackupCodes: true } });
  expect(still?.mfaBackupCodes).toHaveLength(1);
});

it('answers an administrator making an account or a temporary password with 503', async () => {
  expectBusy(await admin.post('/api/admin/users').send({ email: unique('made'), displayName: 'Made' }));
  expectBusy(await admin.post(`/api/users/${user.id}/reset-password`));
});

it('signs in once the server is free, the busy answers having counted for nothing', async () => {
  await release();
  jest.mocked(argon2.verify).mockRestore();
  expect((await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

/**
 * A backup code is spent exactly once, however the requests arrive.
 *
 * Checking a code against its Argon2 hashes takes a noticeable moment, and the
 * code used to be removed by writing back the list read before that check.
 * Two sign-ins carrying the same code both passed and both got in; two carrying
 * different codes each wrote back the list without their own code, so the
 * later write brought the other code back to life. The matched code is now
 * removed with a conditional update, and a request that finds it already gone
 * is refused as a used code.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

import request from 'supertest';
import speakeasy from 'speakeasy';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { generateBackupCodes, hashBackupCodes } from '../../utils/backupCodes';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];

/** A user with MFA on and ten known backup codes, set straight in the table. */
async function withCodes(label: string) {
  const user = await createTestUser({ email: `mfa-race-${label}-${stamp}@test.cozyvtt.local` });
  created.push(user.id);
  const codes = generateBackupCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      mfaSecret: speakeasy.generateSecret({ length: 20 }).base32,
      mfaBackupCodes: await hashBackupCodes(codes),
    },
  });
  return { user, codes };
}

/** An agent signed in up to the second factor. */
async function pending(email: string) {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(login.body.mfaRequired).toBe(true);
  return agent;
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('lets only one of two simultaneous sign-ins use the same code', async () => {
  const { user, codes } = await withCodes('same');
  const [a, b] = await Promise.all([pending(user.email), pending(user.email)]);

  const results = await Promise.all([
    a.post('/api/auth/mfa/verify-login').send({ backupCode: codes[0] }),
    b.post('/api/auth/mfa/verify-login').send({ backupCode: codes[0] }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 401]);

  const winner = results.find((r) => r.status === 200)!;
  expect(winner.body.remainingBackupCodes).toBe(9);
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaBackupCodes: true } });
  expect(row?.mfaBackupCodes).toHaveLength(9);
});

it('spends both codes when two different ones are used at once', async () => {
  const { user, codes } = await withCodes('different');
  const [a, b] = await Promise.all([pending(user.email), pending(user.email)]);

  const results = await Promise.all([
    a.post('/api/auth/mfa/verify-login').send({ backupCode: codes[0] }),
    b.post('/api/auth/mfa/verify-login').send({ backupCode: codes[1] }),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaBackupCodes: true } });
  expect(row?.mfaBackupCodes).toHaveLength(8);

  // Neither can be used again.
  const again = await pending(user.email);
  expect((await again.post('/api/auth/mfa/verify-login').send({ backupCode: codes[0] })).status).toBe(401);
  expect((await again.post('/api/auth/mfa/verify-login').send({ backupCode: codes[1] })).status).toBe(401);
});

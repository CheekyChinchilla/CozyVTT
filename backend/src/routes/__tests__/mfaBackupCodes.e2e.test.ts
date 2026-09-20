/**
 * Backup codes work end to end, and are stored hashed.
 *
 * Enrolling in MFA hands back ten backup codes; one of them must let you finish
 * a login when you cannot reach your authenticator, and must then be spent. The
 * verify-login path changed from a synchronous SHA-256 comparison to an async
 * Argon2 verify, so this exercises the whole round trip and checks the database
 * never holds the plaintext.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import speakeasy from 'speakeasy';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let userId: string;
let email: string;

async function enableMfa(agent: ReturnType<typeof request.agent>): Promise<string[]> {
  const setup = await agent.post('/api/auth/mfa/setup').send({});
  expect(setup.status).toBe(200);
  const secret: string = setup.body.secret;
  const token = speakeasy.totp({ secret, encoding: 'base32' });
  const verify = await agent.post('/api/auth/mfa/verify').send({ token });
  expect(verify.status).toBe(200);
  return verify.body.backupCodes as string[];
}

beforeAll(async () => {
  const u = await createTestUser({ email: `mfa-backup-${Date.now()}@test.cozyvtt.local`, displayName: 'MFA Backup' });
  userId = u.id;
  email = u.email;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

it('lets a backup code complete a login and spends it', async () => {
  const setupAgent = request.agent(app);
  expect((await setupAgent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  const codes = await enableMfa(setupAgent);
  expect(codes).toHaveLength(10);

  // Stored hashed, never in the clear.
  const stored = await prisma.user.findUnique({ where: { id: userId }, select: { mfaBackupCodes: true } });
  expect(stored?.mfaBackupCodes).toHaveLength(10);
  for (const h of stored!.mfaBackupCodes) expect(h).toMatch(/^\$argon2/);

  // A fresh login now needs the second factor.
  const loginAgent = request.agent(app);
  const login = await loginAgent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(login.body.mfaRequired).toBe(true);

  // A backup code finishes it.
  const done = await loginAgent.post('/api/auth/mfa/verify-login').send({ backupCode: codes[0] });
  expect(done.status).toBe(200);
  expect(done.body.backupCodeUsed).toBe(true);
  expect(done.body.remainingBackupCodes).toBe(9);

  // And it cannot be used again.
  const replayAgent = request.agent(app);
  await replayAgent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  const replay = await replayAgent.post('/api/auth/mfa/verify-login').send({ backupCode: codes[0] });
  expect(replay.status).toBe(401);
});

it('refuses a second factor that is not a string, as a bad request', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(login.body.mfaRequired).toBe(true);
  expect((await agent.post('/api/auth/mfa/verify-login').send({ backupCode: { any: 'thing' } })).status).toBe(400);
  expect((await agent.post('/api/auth/mfa/verify-login').send({ token: 123456 })).status).toBe(400);
});

/**
 * The signed-in user carries how many MFA backup codes they have left.
 *
 * The count was sent only in the answer to a sign-in made with a backup
 * code, so the app could never show it anywhere else, and someone could
 * spend their last code without knowing. The user object the client reads
 * now carries it, as a number for an account with MFA on and null for one
 * without. Only the count leaves the server, never the codes' hashes. After a
 * sign-in finished with a backup code, that code is no longer counted.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { generateBackupCodes, hashBackupCodes } from '../../utils/backupCodes';

const app = createTestApp();
const created: string[] = [];

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

async function signedIn() {
  const user = await createTestUser();
  created.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

it('is null for an account without MFA', async () => {
  const { agent } = await signedIn();

  const me = await agent.get('/api/auth/me');

  expect(me.status).toBe(200);
  expect(me.body.user.mfaBackupCodesRemaining).toBeNull();
});

it('is the number of unused codes for an account with MFA on, and the codes stay on the server', async () => {
  const { user, agent } = await signedIn();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP', mfaBackupCodes: ['$argon2id$one', '$argon2id$two', '$argon2id$three'] },
  });

  const me = await agent.get('/api/auth/me');

  expect(me.status).toBe(200);
  expect(me.body.user.mfaBackupCodesRemaining).toBe(3);
  expect(JSON.stringify(me.body)).not.toContain('argon2id');
});

it('counts the code just spent when a sign-in is finished with a backup code', async () => {
  const user = await createTestUser();
  created.push(user.id);
  const codes = generateBackupCodes(4);
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP', mfaBackupCodes: await hashBackupCodes(codes) },
  });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).body.mfaRequired).toBe(true);

  const done = await agent.post('/api/auth/mfa/verify-login').send({ backupCode: codes[0] });

  expect(done.status).toBe(200);
  expect(done.body.remainingBackupCodes).toBe(3);
  expect(done.body.user.mfaBackupCodesRemaining).toBe(3);
  expect((await agent.get('/api/auth/me')).body.user.mfaBackupCodesRemaining).toBe(3);
});

/**
 * A sign-in left at the two-factor step expires after five minutes.
 *
 * The pending state sat on the ordinary rolling cookie, so any request that
 * carried it, a 401 from /api/auth/me included, kept it alive for as long as
 * someone cared to ping. A password proved once could then be turned into a
 * sign-in whenever a code came to hand. The code step now has to be finished
 * within five minutes of the password step; after that the pending sign-in
 * is ended and the person starts again with their password.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { generateSecret, generateSync } from 'otplib';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const created: string[] = [];
const secret = generateSecret();

async function pendingSignIn(): Promise<request.Agent> {
  const user = await createTestUser({ displayName: 'Code step' });
  created.push(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: secret } });
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect(login.body.mfaRequired).toBe(true);
  return agent;
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('accepts the code within five minutes', async () => {
  const agent = await pendingSignIn();
  const res = await agent.post('/api/auth/mfa/verify-login').send({ token: generateSync({ secret }) });
  expect(res.status).toBe(200);
});

it('refuses the code step after five minutes and ends the pending sign-in', async () => {
  const agent = await pendingSignIn();
  const realNow = Date.now;
  const later = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + 5 * 60 * 1000 + 1000);
  let expired: request.Response;
  try {
    expired = await agent.post('/api/auth/mfa/verify-login').send({ token: '000000' });
  } finally {
    later.mockRestore();
  }
  expect(expired.status).toBe(401);
  expect(expired.body).toEqual({ error: 'Sign-In Expired', message: 'Your sign-in timed out at the code step. Sign in again with your password.' });

  // The pending state is gone: a correct code no longer finishes this sign-in.
  const again = await agent.post('/api/auth/mfa/verify-login').send({ token: generateSync({ secret }) });
  expect(again.status).toBe(401);
  expect(again.body.message).toBe('No MFA verification pending. Please log in first.');
});

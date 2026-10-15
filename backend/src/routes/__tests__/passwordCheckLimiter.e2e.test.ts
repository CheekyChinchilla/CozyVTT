/**
 * Password checks made from a signed-in session have an attempt limit of their own.
 *
 * Changing the password, deleting the account and changing one's own email
 * each ask for the current password, and a wrong one counted only against the
 * general request limit of 300 a minute, so a stolen session could guess the
 * password through them. They now share one allowance of 10 wrong passwords
 * per 15 minutes for the account, from every address; a correct password
 * never counts. The limit is checked before the password is, so the refusal
 * is 429 and the password is not checked at all.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import express from 'express';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

jest.setTimeout(60000);

const app = express();
app.set('trust proxy', 1);
app.use(createTestApp());

const created: string[] = [];
let addressCounter = 0;
const freshAddress = () => {
  addressCounter += 1;
  return `10.75.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
};

async function signedIn(): Promise<{ id: string; agent: request.Agent }> {
  const user = await createTestUser({ displayName: 'Password check' });
  created.push(user.id);
  const agent = request.agent(app).set('X-Forwarded-For', freshAddress());
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

const WRONG = 'wrong-password';
const LOCKED = { error: 'Rate Limited', message: 'Too many wrong passwords, please try again later' };

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('locks the three password checks together after ten wrong passwords, from any address', async () => {
  const { id, agent } = await signedIn();
  const from = () => agent.set('X-Forwarded-For', freshAddress());

  // Ten wrong passwords spread over the three checks, each from a new address.
  for (let i = 0; i < 4; i += 1) {
    expect((await from().post('/api/auth/change-password').send({ currentPassword: WRONG, newPassword: 'Another1!Cozy' })).status).toBe(401);
  }
  for (let i = 0; i < 3; i += 1) {
    expect((await from().delete('/api/auth/account').send({ password: WRONG })).status).toBe(401);
  }
  for (let i = 0; i < 3; i += 1) {
    expect((await from().put(`/api/users/${id}`).send({ email: `moved-${i}@test.invalid`, currentPassword: WRONG })).status).toBe(401);
  }

  const change = await from().post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: 'Another1!Cozy' });
  expect(change.status).toBe(429);
  expect(change.body).toEqual(LOCKED);
  expect((await from().delete('/api/auth/account').send({ password: TEST_PASSWORD })).status).toBe(429);
  expect((await from().put(`/api/users/${id}`).send({ email: 'moved@test.invalid', currentPassword: TEST_PASSWORD })).status).toBe(429);

  // The password was never checked, so nothing changed and the session is still signed in.
  expect((await agent.get('/api/auth/me')).status).toBe(200);
  const stored = await prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
  expect(stored.email).not.toBe('moved@test.invalid');
});

it('leaves other accounts and profile edits without a password alone', async () => {
  const locked = await signedIn();
  for (let i = 0; i < 10; i += 1) {
    expect((await locked.agent.post('/api/auth/change-password').send({ currentPassword: WRONG, newPassword: 'Another1!Cozy' })).status).toBe(401);
  }
  // A display-name change asks for no password and is not held back.
  expect((await locked.agent.put(`/api/users/${locked.id}`).send({ displayName: 'Still me' })).status).toBe(200);

  const other = await signedIn();
  expect((await other.agent.post('/api/auth/change-password').send({ currentPassword: WRONG, newPassword: 'Another1!Cozy' })).status).toBe(401);
});

it('never counts a correct password', async () => {
  const { agent } = await signedIn();
  let password = TEST_PASSWORD;
  for (let i = 0; i < 11; i += 1) {
    const next = `Rotated${i}!Cozy-password`;
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: password, newPassword: next })).status).toBe(200);
    password = next;
  }
});

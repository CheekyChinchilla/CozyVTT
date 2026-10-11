/**
 * The two-factor code step counts wrong codes, and nothing else.
 *
 * Its two limits (5 wrong codes per 15 minutes per address, and 5 per account
 * from anywhere) counted every request as it arrived and took a correct code
 * back off only once it had been answered. So six people behind one address
 * entering correct codes at the same moment had the sixth refused, and a
 * refusal stayed counted. Now the limit is checked first and only a wrong
 * code or a wrong backup code adds to it, as the password step already does.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import express from 'express';
import request from 'supertest';
import speakeasy from 'speakeasy';
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
  return `10.76.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
};

/** An account with MFA on, with its own secret, signed in to the code step from `address`. */
async function pending(address: string): Promise<{ agent: request.Agent; secret: string }> {
  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const user = await createTestUser({ displayName: 'Code limiter' });
  created.push(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: secret } });
  const agent = request.agent(app).set('X-Forwarded-For', address);
  const login = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect(login.body.mfaRequired).toBe(true);
  return { agent, secret };
}

const code = (secret: string) => speakeasy.totp({ secret, encoding: 'base32' });

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('lets eight correct codes from one address through at once', async () => {
  const address = freshAddress();
  const signIns = await Promise.all(Array.from({ length: 8 }, () => pending(address)));

  const answers = await Promise.all(signIns.map(({ agent, secret }) => agent.post('/api/auth/mfa/verify-login').send({ token: code(secret) })));

  expect(answers.map((res) => res.status)).toEqual(signIns.map(() => 200));
});

it('still locks an address after five wrong codes, and says so', async () => {
  const address = freshAddress();
  const { agent } = await pending(address);

  for (let i = 0; i < 5; i += 1) expect((await agent.post('/api/auth/mfa/verify-login').send({ token: '000000' })).status).toBe(401);

  const locked = await agent.post('/api/auth/mfa/verify-login').send({ token: '000000' });
  expect(locked.status).toBe(429);
  expect(locked.body).toEqual({ error: 'Rate Limited', message: 'Too many MFA login attempts, please try again later' });
  expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
});

it('does not count a request with no sign-in pending, or one refused for its shape', async () => {
  const address = freshAddress();
  for (let i = 0; i < 6; i += 1) {
    expect((await request(app).post('/api/auth/mfa/verify-login').set('X-Forwarded-For', address).send({ token: '000000' })).status).toBe(401);
  }
  const { agent, secret } = await pending(address);
  for (let i = 0; i < 6; i += 1) {
    expect((await agent.post('/api/auth/mfa/verify-login').send({})).status).toBe(400);
  }
  expect((await agent.post('/api/auth/mfa/verify-login').send({ token: code(secret) })).status).toBe(200);
});

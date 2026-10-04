/**
 * The MFA endpoints are actually rate limited.
 *
 * The limiter objects are unit-tested elsewhere; this pins that they are wired
 * to the live routes, which they were not before. `/mfa/verify` guesses a
 * six-digit code during enrolment and used to lean only on the blanket
 * 300/minute cap. A rejected attempt counts, so a burst of wrong codes is shut
 * off after five within the window.
 *
 * This file does not mock express-rate-limit (unlike auth.e2e), so the real
 * middleware runs. jest isolates modules per file, so the limiter's counter is
 * this file's alone.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import express from 'express';
import request from 'supertest';
import speakeasy from 'speakeasy';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let email: string;
const extraUsers: string[] = [];

beforeAll(async () => {
  const u = await createTestUser({ email: `mfa-rl-${Date.now()}@test.cozyvtt.local`, displayName: 'MFA RL' });
  userId = u.id;
  email = u.email;
});

afterAll(async () => {
  await cleanupUsers([userId, ...extraUsers]);
  await prisma.$disconnect();
});

it('stops repeated MFA verification attempts after five failures', async () => {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);

  // Five wrong codes are each rejected (400/401), and count against the budget.
  for (let i = 0; i < 5; i++) {
    const res = await agent.post('/api/auth/mfa/verify').send({ token: '000000' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(429);
  }

  // The sixth is refused by the limiter, not the handler.
  const blocked = await agent.post('/api/auth/mfa/verify').send({ token: '000000' });
  expect(blocked.status).toBe(429);
});

describe('the sign-in code step, per account', () => {
  // The test app wrapped in one that trusts a proxy hop, as server.ts does, so
  // each request can come from its own address via X-Forwarded-For. A mounted
  // app inherits the setting.
  const proxied = express();
  proxied.set('trust proxy', 1);
  proxied.use(createTestApp());

  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

  async function mfaUser(label: string) {
    const u = await createTestUser({ email: `mfa-rl-acct-${label}-${stamp}@test.cozyvtt.local` });
    extraUsers.push(u.id);
    await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: true, mfaSecret: secret } });
    return u;
  }

  async function attempt(address: string, ip: string, token: string) {
    const agent = request.agent(proxied);
    const login = await agent.post('/api/auth/login').set('X-Forwarded-For', ip).send({ email: address, password: TEST_PASSWORD });
    expect(login.body.mfaRequired).toBe(true);
    return agent.post('/api/auth/mfa/verify-login').set('X-Forwarded-For', ip).send({ token });
  }

  it('stops guessing on one account after five wrong codes, whatever address they come from', async () => {
    const target = await mfaUser('target');

    // Five wrong codes, each from a different address, so no address reaches
    // its own limit.
    for (let i = 1; i <= 5; i++) {
      const res = await attempt(target.email, `10.20.0.${i}`, '000000');
      expect(res.status).toBe(401);
    }

    // A sixth address, with the right code, is still turned away for this account.
    const blocked = await attempt(target.email, '10.20.0.6', speakeasy.totp({ secret, encoding: 'base32' }));
    expect(blocked.status).toBe(429);
  });

  it('leaves other accounts alone', async () => {
    const other = await mfaUser('other');
    const res = await attempt(other.email, '10.20.1.1', speakeasy.totp({ secret, encoding: 'base32' }));
    expect(res.status).toBe(200);
  });
});

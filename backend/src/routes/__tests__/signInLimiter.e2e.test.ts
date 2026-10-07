/**
 * The sign-in limiter counts wrong answers, and nothing else.
 *
 * It allows five failures per fifteen minutes per address, and was meant to
 * skip correct sign-ins. It counted every request as it arrived and took a
 * correct one back off only once that one had finished, so sign-ins arriving
 * together were all counted first: the sixth correct sign-in from one address
 * at the same moment was refused. A refusal is not a success, so it stayed
 * counted, and five refusals locked sign-in, password reset and MFA changes
 * for everyone at that address, correct passwords included. A household or a
 * school signing in as a session starts, or an instance behind a proxy that
 * shows every visitor as one address, was locked out by signing in.
 *
 * Now the limit is checked before the password is, and only a wrong password,
 * a wrong code or a bad reset link adds to it. Wrong answers sent together
 * are still held to five: the sixth waits for the first five to be checked,
 * and is refused if they all failed.
 *
 * The real limiter runs here (this file does not mock it), so each case uses
 * an address of its own through a trusted proxy hop, as server.ts sets up.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import express from 'express';
import request from 'supertest';
import speakeasy from 'speakeasy';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { hashPassword } from '../../services/auth';

jest.setTimeout(60000);

const app = express();
app.set('trust proxy', 1);
app.use(createTestApp());

const created: string[] = [];
let passwordHash: string;
let addressCounter = 0;

/** An address no other case has used. */
const freshAddress = () => {
  addressCounter += 1;
  return `10.73.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
};

async function users(count: number): Promise<{ id: string; email: string }[]> {
  return Promise.all(
    Array.from({ length: count }, async () => {
      const user = await prisma.user.create({
        data: { email: testEmail('signin'), displayName: 'Sign-in', passwordHash, isApproved: true },
        select: { id: true, email: true },
      });
      created.push(user.id);
      return user;
    })
  );
}

const signIn = (address: string, email: string, password: string, agent: request.Agent | null = null) =>
  (agent ?? request(app)).post('/api/auth/login').set('X-Forwarded-For', address).send({ email, password });

beforeAll(async () => {
  passwordHash = await hashPassword(TEST_PASSWORD);
});

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('correct sign-ins from one address', () => {
  it.each([8, 20])('all succeed when %i arrive at once', async (count) => {
    const address = freshAddress();
    const accounts = await users(count);

    const answers = await Promise.all(accounts.map((u) => signIn(address, u.email, TEST_PASSWORD)));

    expect(answers.map((res) => res.status)).toEqual(accounts.map(() => 200));
  });

  it('leave the address its whole allowance for wrong passwords', async () => {
    const address = freshAddress();
    const accounts = await users(20);
    await Promise.all(accounts.map((u) => signIn(address, u.email, TEST_PASSWORD)));

    for (let i = 0; i < 4; i += 1) expect((await signIn(address, accounts[0].email, 'wrong-password')).status).toBe(401);
    expect((await signIn(address, accounts[1].email, TEST_PASSWORD)).status).toBe(200);
  });
});

describe('wrong passwords from one address', () => {
  it('lock the address after five, correct passwords included, and say when to come back', async () => {
    const address = freshAddress();
    const [account] = await users(1);

    for (let i = 0; i < 5; i += 1) expect((await signIn(address, account.email, 'wrong-password')).status).toBe(401);
    const locked = await signIn(address, account.email, TEST_PASSWORD);

    expect(locked.status).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(locked.text).toBe('Too many authentication attempts, please try again later');
    // Another address is not affected.
    expect((await signIn(freshAddress(), account.email, TEST_PASSWORD)).status).toBe(200);
  });

  it('sent together are checked five at most', async () => {
    const address = freshAddress();
    const [account] = await users(1);

    const answers = await Promise.all(Array.from({ length: 20 }, () => signIn(address, account.email, 'wrong-password')));
    const statuses = answers.map((res) => res.status);

    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(15);
    expect((await signIn(address, account.email, TEST_PASSWORD)).status).toBe(429);
  });

  it('count the same for an address with no account, which answers exactly as a wrong password', async () => {
    const [account] = await users(1);
    const known = await signIn(freshAddress(), account.email, 'wrong-password');
    const unknown = await signIn(freshAddress(), testEmail('nobody'), 'wrong-password');

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(unknown.headers['ratelimit-remaining']).toBe(known.headers['ratelimit-remaining']);

    const address = freshAddress();
    for (let i = 0; i < 5; i += 1) expect((await signIn(address, testEmail('nobody'), 'wrong-password')).status).toBe(401);
    expect((await signIn(address, account.email, TEST_PASSWORD)).status).toBe(429);
  });
});

describe('what does not count', () => {
  it('a request missing its email or password', async () => {
    const address = freshAddress();
    const [account] = await users(1);

    for (let i = 0; i < 8; i += 1) {
      const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', address).send({ email: account.email });
      expect(res.status).toBe(400);
    }
    expect((await signIn(address, account.email, TEST_PASSWORD)).status).toBe(200);
  });

  it('a reset link that works with a password too weak to take', async () => {
    const address = freshAddress();
    const [account] = await users(1);
    const token = `reset-${account.id}`;
    await prisma.passwordResetToken.create({ data: { token, userId: account.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });

    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).post('/api/auth/reset-password').set('X-Forwarded-For', address).send({ token, newPassword: 'short' });
      expect(res.status).toBe(400);
    }
    expect((await signIn(address, account.email, TEST_PASSWORD)).status).toBe(200);
  });
});

describe('one allowance for every route that checks a credential', () => {
  it('is spent by a bad reset link, wrong passwords for MFA changes and a wrong MFA code', async () => {
    const address = freshAddress();
    const [plain, enrolled] = await users(2);
    const secret = speakeasy.generateSecret({ length: 20 }).base32;

    const plainAgent = request.agent(app);
    const enrolledAgent = request.agent(app);
    expect((await signIn(address, plain.email, TEST_PASSWORD, plainAgent)).status).toBe(200);
    expect((await signIn(address, enrolled.email, TEST_PASSWORD, enrolledAgent)).status).toBe(200);
    await prisma.user.update({ where: { id: enrolled.id }, data: { mfaEnabled: true, mfaSecret: secret } });

    const post = (agent: request.Agent | request.SuperTest<request.Test>, path: string, body: object) =>
      agent.post(path).set('X-Forwarded-For', address).send(body);

    expect((await post(request(app), '/api/auth/reset-password', { token: 'no-such-link', newPassword: 'Another1!Password' })).status).toBe(400);
    expect((await post(plainAgent, '/api/auth/mfa/setup', { password: 'wrong-password' })).status).toBe(401);
    expect((await post(enrolledAgent, '/api/auth/mfa/backup-codes', { password: 'wrong-password' })).status).toBe(401);
    expect((await post(enrolledAgent, '/api/auth/mfa/disable', { password: TEST_PASSWORD, token: '000000' })).status).toBe(401);
    expect((await signIn(address, plain.email, 'wrong-password')).status).toBe(401);

    expect((await signIn(address, plain.email, TEST_PASSWORD)).status).toBe(429);
    expect((await post(plainAgent, '/api/auth/mfa/setup', { password: TEST_PASSWORD })).status).toBe(429);
  });
});

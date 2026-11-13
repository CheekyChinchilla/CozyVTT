/**
 * Changing one's own email address has a small hourly cap per account.
 *
 * With registration closed, a signed-in user who knows their own password
 * could otherwise try address after address here and learn from "Email
 * already in use" which ones have accounts, at the general request limit:
 * a correct password is never counted against the password-check limit.
 * Every attempt to change one's own address counts, right password or wrong,
 * taken address or free, whichever sign-in it comes from. Other profile edits
 * neither count nor are held, and an admin changing someone else's address
 * is not capped. A refusal is 429 with Retry-After and no rate-limit headers
 * of its own, and is not counted.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: jest.fn(() => false),
}));

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { EMAIL_CHANGES_PER_HOUR, EMAIL_CHANGE_WINDOW_MS, EMAIL_CHANGE_LIMIT_MESSAGE } from '../../middleware/emailChangeLimiter';

jest.setTimeout(60000);

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];
let counter = 0;
const fresh = (label: string) => {
  counter += 1;
  return `emailcap-${label}-${counter}-${stamp}@test.cozyvtt.local`;
};

const CAPPED = { error: 'Rate Limited', message: EMAIL_CHANGE_LIMIT_MESSAGE };

async function account(label: string, role: 'USER' | 'ADMIN' = 'USER') {
  const user = await createTestUser({ email: fresh(label), displayName: `Cap ${label}`, role });
  created.push(user.id);
  return user;
}

/** A remembered sign-in, so moving the clock an hour does not end it. */
async function signIn(email: string): Promise<request.Agent> {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD, rememberMe: true });
  expect(login.status).toBe(200);
  return agent;
}

async function storedEmail(id: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true } })).email;
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('is a handful an hour', () => {
  expect(EMAIL_CHANGES_PER_HOUR).toBe(5);
  expect(EMAIL_CHANGE_WINDOW_MS).toBe(60 * 60 * 1000);
});

describe('changing your own address', () => {
  it('counts every attempt, right password or wrong, taken address or free, then refuses', async () => {
    const user = await account('counts');
    const taken = await account('counts-taken');
    const agent = await signIn(user.email);
    const put = (body: object) => agent.put(`/api/users/${user.id}`).send(body);

    // Five attempts, each answered as it is today.
    expect((await put({ email: fresh('a'), currentPassword: 'Not-the-password1!' })).status).toBe(401);
    const inUse = await put({ email: taken.email, currentPassword: TEST_PASSWORD });
    expect(inUse.status).toBe(400);
    expect(inUse.body.message).toBe('Email already in use');
    expect((await put({ email: fresh('b') })).status).toBe(400);
    const moved = fresh('c');
    expect((await put({ email: moved, currentPassword: TEST_PASSWORD })).status).toBe(200);
    expect((await put({ email: fresh('d'), currentPassword: TEST_PASSWORD })).status).toBe(200);
    const lastStored = await storedEmail(user.id);

    // The sixth is refused before the password is checked, and changes nothing.
    const sixth = await put({ email: fresh('e'), currentPassword: TEST_PASSWORD });
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual(CAPPED);
    const retryAfter = Number(sixth.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(EMAIL_CHANGE_WINDOW_MS / 1000 - 120);
    expect(retryAfter).toBeLessThanOrEqual(EMAIL_CHANGE_WINDOW_MS / 1000);
    expect(await storedEmail(user.id)).toBe(lastStored);

    // A taken address gets the same refusal, so nothing is learnt from it.
    const probe = await put({ email: taken.email, currentPassword: TEST_PASSWORD });
    expect(probe.status).toBe(429);
    expect(probe.body).toEqual(CAPPED);

    // The cap sends no rate-limit headers of its own (a request with no
    // password is not held to the password-check limit, which sends its own).
    const bare = await put({ email: fresh('f') });
    expect(bare.status).toBe(429);
    expect(bare.headers['ratelimit-limit']).toBeUndefined();
    expect(bare.headers['ratelimit-remaining']).toBeUndefined();
    expect(bare.headers['ratelimit-policy']).toBeUndefined();
    expect(bare.headers['retry-after']).toBeDefined();
  });

  it('lets exactly five through when ten are sent at once', async () => {
    const user = await account('burst');
    const agent = await signIn(user.email);
    const answers = await Promise.all(
      Array.from({ length: 10 }, () => agent.put(`/api/users/${user.id}`).send({ email: fresh('burst') }))
    );
    const statuses = answers.map((res) => res.status);
    expect(statuses.filter((status) => status !== 429)).toHaveLength(EMAIL_CHANGES_PER_HOUR);
    expect(statuses.filter((status) => status === 429)).toHaveLength(10 - EMAIL_CHANGES_PER_HOUR);
  });

  it('counts the account, from every sign-in, and leaves other accounts alone', async () => {
    const user = await account('per-account');
    const first = await signIn(user.email);
    for (let i = 0; i < EMAIL_CHANGES_PER_HOUR; i += 1) {
      expect((await first.put(`/api/users/${user.id}`).send({ email: fresh('pa') })).status).toBe(400);
    }

    const second = await signIn(user.email);
    expect((await second.put(`/api/users/${user.id}`).send({ email: fresh('pa'), currentPassword: TEST_PASSWORD })).status).toBe(429);

    const other = await account('per-account-other');
    const otherAgent = await signIn(other.email);
    expect((await otherAgent.put(`/api/users/${other.id}`).send({ email: fresh('pb'), currentPassword: TEST_PASSWORD })).status).toBe(200);
  });

  it('opens again once the oldest attempt is an hour old', async () => {
    const user = await account('window');
    const agent = await signIn(user.email);
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(start);
      for (let i = 0; i < EMAIL_CHANGES_PER_HOUR; i += 1) {
        expect((await agent.put(`/api/users/${user.id}`).send({ email: fresh('w') })).status).toBe(400);
      }

      clock.mockReturnValue(start + EMAIL_CHANGE_WINDOW_MS - 60_000);
      const late = await agent.put(`/api/users/${user.id}`).send({ email: fresh('w'), currentPassword: TEST_PASSWORD });
      expect(late.status).toBe(429);
      expect(Number(late.headers['retry-after'])).toBe(60);

      clock.mockReturnValue(start + EMAIL_CHANGE_WINDOW_MS + 1000);
      const moved = fresh('w');
      const after = await agent.put(`/api/users/${user.id}`).send({ email: moved, currentPassword: TEST_PASSWORD });
      expect(after.status).toBe(200);
      expect(await storedEmail(user.id)).toBe(moved);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not count or hold other profile changes, or saving the same address', async () => {
    const user = await account('profile');
    const agent = await signIn(user.email);
    const put = (body: object) => agent.put(`/api/users/${user.id}`).send(body);

    for (let i = 0; i < EMAIL_CHANGES_PER_HOUR - 1; i += 1) {
      expect((await put({ email: fresh('p') })).status).toBe(400);
    }
    for (let i = 0; i < 4; i += 1) {
      expect((await put({ displayName: `Renamed ${i}` })).status).toBe(200);
      expect((await put({ bio: `Bio ${i}` })).status).toBe(200);
      expect((await put({ email: user.email.toUpperCase(), displayName: `Same address ${i}` })).status).toBe(200);
    }

    // The fifth attempt is still allowed; the sixth is not.
    const moved = fresh('p');
    expect((await put({ email: moved, currentPassword: TEST_PASSWORD })).status).toBe(200);
    expect((await put({ email: fresh('p'), currentPassword: TEST_PASSWORD })).status).toBe(429);

    // Capped, the account can still edit the rest of its profile.
    expect((await put({ displayName: 'Still editable', bio: 'Still here' })).status).toBe(200);
  });

  it('applies to an admin changing their own address', async () => {
    const admin = await account('admin-self', 'ADMIN');
    const agent = await signIn(admin.email);
    for (let i = 0; i < EMAIL_CHANGES_PER_HOUR; i += 1) {
      expect((await agent.put(`/api/users/${admin.id}`).send({ email: fresh('as') })).status).toBe(400);
    }
    expect((await agent.put(`/api/users/${admin.id}`).send({ email: fresh('as'), currentPassword: TEST_PASSWORD })).status).toBe(429);
  });
});

describe('requests that may not change the address', () => {
  it('are refused as before and use up nobody\'s attempts', async () => {
    const owner = await account('victim');
    const other = await account('intruder');
    const intruder = await signIn(other.email);

    for (let i = 0; i < EMAIL_CHANGES_PER_HOUR + 1; i += 1) {
      expect((await intruder.put(`/api/users/${owner.id}`).send({ email: fresh('v'), currentPassword: TEST_PASSWORD })).status).toBe(403);
      expect((await request(app).put(`/api/users/${owner.id}`).send({ email: fresh('v'), currentPassword: TEST_PASSWORD })).status).toBe(401);
    }

    const agent = await signIn(owner.email);
    expect((await agent.put(`/api/users/${owner.id}`).send({ email: fresh('v'), currentPassword: TEST_PASSWORD })).status).toBe(200);
    // The intruder's own allowance is untouched too.
    expect((await intruder.put(`/api/users/${other.id}`).send({ email: fresh('i'), currentPassword: TEST_PASSWORD })).status).toBe(200);
  });
});

describe('an admin changing someone else\'s address', () => {
  it('is not capped', async () => {
    const admin = await account('admin', 'ADMIN');
    const target = await account('target');
    const agent = await signIn(admin.email);

    for (let i = 0; i < EMAIL_CHANGES_PER_HOUR * 2; i += 1) {
      const next = fresh('t');
      const res = await agent.put(`/api/users/${target.id}`).send({ email: next });
      expect(res.status).toBe(200);
      expect(await storedEmail(target.id)).toBe(next);
    }
  });
});

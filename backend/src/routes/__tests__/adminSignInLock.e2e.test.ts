/**
 * An administrator can see and clear an account's sign-in lock.
 *
 * Ten wrong passwords in an hour lock an account for every address, and the
 * only ways to open it again were to wait or to set a new password. The
 * Admin Panel's user list now shows when each lock ends, and
 * `DELETE /api/admin/users/:id/sign-in-lock` forgets the account's wrong
 * passwords and wrong sign-in codes, writing a line to the activity log.
 *
 * Keyed by user id, never an address, so it cannot be used to find out
 * whether an address has an account; and it is the admins' alone.
 *
 * The real limiters run here. Each wrong password comes from an address of
 * its own, so the per-address limit never fires first.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import express, { type Request } from 'express';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { mfaAccountLimiter } from '../../middleware/authLimiters';

jest.setTimeout(60000);

const app = express();
app.set('trust proxy', 1);
app.use(createTestApp());

const created: string[] = [];
let addressCounter = 0;

/** An address no other case has used. */
const freshAddress = () => {
  addressCounter += 1;
  return `10.75.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
};

const signIn = (email: string, password: string) =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', freshAddress()).send({ email, password });

async function account(role: 'ADMIN' | 'USER' = 'USER') {
  const user = await createTestUser({ displayName: role === 'ADMIN' ? 'Lock Admin' : 'Lock Target', role });
  created.push(user.id);
  return user;
}

async function signedIn(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('X-Forwarded-For', freshAddress()).send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** Ten wrong passwords from ten addresses, so the account is locked. */
async function lock(email: string): Promise<void> {
  for (let i = 0; i < 10; i += 1) expect((await signIn(email, 'wrong-password')).status).toBe(401);
  expect((await signIn(email, TEST_PASSWORD)).status).toBe(429);
}

const clear = (agent: ReturnType<typeof request.agent>, id: string) =>
  agent.delete(`/api/admin/users/${id}/sign-in-lock`).set('X-Forwarded-For', freshAddress());

const listed = async (agent: ReturnType<typeof request.agent>, id: string) => {
  const res = await agent.get('/api/users').set('X-Forwarded-For', freshAddress());
  expect(res.status).toBe(200);
  return (res.body.users as Array<{ id: string; signInLockedUntil: string | null }>).find((u) => u.id === id);
};

let admin: ReturnType<typeof request.agent>;
let adminId: string;

beforeAll(async () => {
  const a = await account('ADMIN');
  adminId = a.id;
  admin = await signedIn(a.email);
});

afterAll(async () => {
  await prisma.systemLog.deleteMany({
    where: { OR: [{ userId: { in: created } }, { message: { contains: '@test.invalid' }, userId: null }] },
  });
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('the user list', () => {
  it('gives each account the time its sign-in lock ends, and null for one not locked', async () => {
    const target = await account();
    const other = await account();
    const before = Date.now();
    await lock(target.email);

    const until = (await listed(admin, target.id))?.signInLockedUntil;
    expect(typeof until).toBe('string');
    // An hour from the first wrong password.
    const ends = new Date(until as string).getTime();
    expect(ends).toBeGreaterThan(before + 59 * 60 * 1000);
    expect(ends).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
    expect((await listed(admin, other.id))?.signInLockedUntil).toBeNull();
  });
});

describe('DELETE /api/admin/users/:id/sign-in-lock', () => {
  it('opens a locked account at once, so the right password signs in, and writes it to the activity log', async () => {
    const target = await account();
    await lock(target.email);

    const res = await clear(admin, target.id);
    expect(res.status).toBe(200);

    expect((await signIn(target.email, TEST_PASSWORD)).status).toBe(200);
    expect((await listed(admin, target.id))?.signInLockedUntil).toBeNull();

    const lines = await prisma.systemLog.findMany({ where: { userId: adminId, message: { contains: target.email } } });
    expect(lines).toHaveLength(1);
    expect(lines[0].message).toBe(`Cleared the sign-in lock on ${target.email}`);
    expect(lines[0].context).toMatchObject({ targetUserId: target.id });
  });

  it('forgets wrong sign-in codes for the account too', async () => {
    const target = await account();
    const pending = { session: { mfaPendingUserId: target.id } } as unknown as Request;
    for (let i = 0; i < 5; i += 1) mfaAccountLimiter.recordFailure(pending);
    expect(mfaAccountLimiter.peek(`mfa-account:${target.id}`).lockedUntil).not.toBeNull();
    expect((await listed(admin, target.id))?.signInLockedUntil).not.toBeNull();

    expect((await clear(admin, target.id)).status).toBe(200);

    expect(mfaAccountLimiter.peek(`mfa-account:${target.id}`)).toEqual({ failures: 0, lockedUntil: null });
  });

  it('is refused to anyone but an admin, and leaves the lock in place', async () => {
    const target = await account();
    const player = await account();
    const playerAgent = await signedIn(player.email);
    await lock(target.email);

    expect((await clear(playerAgent, target.id)).status).toBe(403);
    expect((await signIn(target.email, TEST_PASSWORD)).status).toBe(429);
  });

  it('answers 404 for an id that names no account', async () => {
    const res = await clear(admin, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found', message: 'User not found' });
  });
});

/**
 * Wrong passwords are also counted per account, from every address.
 *
 * The sign-in limiter counts per visitor address, so someone with many
 * addresses had as many guesses at one account as they had addresses, with
 * nothing to notice it. A second limiter now counts wrong passwords for each
 * email, whatever address they come from: 10 in an hour, then that email is
 * refused with 429 until the oldest counted failure is an hour old, and the
 * admins' activity log gets a line.
 *
 * The answer, the headers and the count are the same whether or not the
 * address has an account, so this cannot be used to find out who has one.
 *
 * A new password opens the account again at once, however it was set: the
 * counted guesses were at the old one. Without that, anyone who knew an
 * email address could keep that account locked for as long as they cared to
 * send ten wrong passwords an hour.
 *
 * The real limiters run here. Each wrong password comes from an address of
 * its own, so the per-address limit never fires first.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import express from 'express';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { hashPassword } from '../../services/auth';
import { issueResetToken, RESET_LINK_TTL_MS } from '../../services/passwordResetTokens';

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
  return `10.74.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
};

async function user(): Promise<{ id: string; email: string }> {
  const u = await prisma.user.create({
    data: { email: testEmail('acctlimit'), displayName: 'Account limit', passwordHash, isApproved: true },
    select: { id: true, email: true },
  });
  created.push(u.id);
  return u;
}

const signIn = (email: string, password: string, address = freshAddress()) =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', address).send({ email, password });

const LOCKED = { error: 'Rate Limited', message: 'Too many failed sign-ins for this account, please try again later' };

beforeAll(async () => {
  passwordHash = await hashPassword(TEST_PASSWORD);
});

afterAll(async () => {
  await prisma.systemLog.deleteMany({
    where: { OR: [{ message: { contains: '@test.invalid' }, userId: null }, { userId: { in: created } }] },
  });
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('locks an account after ten wrong passwords from ten addresses, for every address, and tells the admins', async () => {
  const target = await user();
  const bystander = await user();

  for (let i = 0; i < 10; i += 1) expect((await signIn(target.email, 'wrong-password')).status).toBe(401);

  const locked = await signIn(target.email, TEST_PASSWORD);
  expect(locked.status).toBe(429);
  expect(locked.body).toEqual(LOCKED);
  expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

  // Another account is not affected, from a fresh address or one that guessed.
  expect((await signIn(bystander.email, TEST_PASSWORD)).status).toBe(200);

  const logged = await prisma.systemLog.findMany({ where: { message: { contains: target.email } } });
  expect(logged).toHaveLength(1);
  expect(logged[0].level).toBe('WARNING');
  expect(logged[0].message).toMatch(/10 wrong passwords/);
});

it('answers an address with no account exactly as a locked account', async () => {
  const target = await user();
  const nobody = testEmail('nobody');

  for (let i = 0; i < 10; i += 1) {
    const known = await signIn(target.email, 'wrong-password');
    const unknown = await signIn(nobody, 'wrong-password');
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  }

  const known = await signIn(target.email, TEST_PASSWORD);
  const unknown = await signIn(nobody, TEST_PASSWORD);
  expect(known.status).toBe(429);
  expect(unknown.status).toBe(429);
  expect(unknown.body).toEqual(known.body);
  expect(unknown.headers['ratelimit-remaining']).toBe(known.headers['ratelimit-remaining']);
});

it('counts the email however it is typed: spaces around it and capital letters make no difference', async () => {
  const target = await user();
  const variants = [target.email.toUpperCase(), ` ${target.email} `, target.email];

  for (let i = 0; i < 10; i += 1) expect((await signIn(variants[i % 3], 'wrong-password')).status).toBe(401);

  expect((await signIn(target.email, TEST_PASSWORD)).status).toBe(429);
});

it('never counts a correct sign-in, however many there are', async () => {
  const target = await user();
  for (let i = 0; i < 12; i += 1) expect((await signIn(target.email, TEST_PASSWORD)).status).toBe(200);
});

describe('a new password opens a locked account at once', () => {
  const NEW_PASSWORD = 'NewPass2!Cozy';

  /** Ten wrong passwords from ten addresses, so the account is locked. */
  async function lock(email: string): Promise<void> {
    for (let i = 0; i < 10; i += 1) expect((await signIn(email, 'wrong-password')).status).toBe(401);
    expect((await signIn(email, TEST_PASSWORD)).status).toBe(429);
  }

  it('when it was set through a reset link', async () => {
    const target = await user();
    await lock(target.email);

    const token = await issueResetToken(target.id, RESET_LINK_TTL_MS);
    const reset = await request(app).post('/api/auth/reset-password').set('X-Forwarded-For', freshAddress()).send({ token, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    expect((await signIn(target.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('when an administrator set a temporary one', async () => {
    const target = await user();
    const admin = await createTestUser({ displayName: 'Unlocking admin', role: 'ADMIN' });
    created.push(admin.id);
    const asAdmin = request.agent(app);
    expect((await asAdmin.post('/api/auth/login').set('X-Forwarded-For', freshAddress()).send({ email: admin.email, password: TEST_PASSWORD })).status).toBe(200);
    await lock(target.email);

    const reset = await asAdmin.post(`/api/users/${target.id}/reset-password`).set('X-Forwarded-For', freshAddress());
    expect(reset.status).toBe(200);

    expect((await signIn(target.email, reset.body.temporaryPassword)).status).toBe(200);
  });

  it('when the owner changed it from a device still signed in', async () => {
    const target = await user();
    const owner = request.agent(app);
    expect((await owner.post('/api/auth/login').set('X-Forwarded-For', freshAddress()).send({ email: target.email, password: TEST_PASSWORD })).status).toBe(200);
    await lock(target.email);

    const change = await owner.post('/api/auth/change-password').set('X-Forwarded-For', freshAddress()).send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status).toBe(200);

    expect((await signIn(target.email, NEW_PASSWORD)).status).toBe(200);
  });
});

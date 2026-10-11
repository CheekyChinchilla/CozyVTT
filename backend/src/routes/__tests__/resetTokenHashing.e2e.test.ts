/**
 * Reset and invitation links are stored as hashes.
 *
 * Both are rows in PasswordResetToken, and either sets the account's password
 * to whatever its holder likes. The token was stored as sent, so anyone who
 * read the database or a backup had every outstanding link, invitations to
 * admin accounts included. The row now holds SHA-256 of the token: the link in
 * the email still carries the token itself, and the route hashes what it is
 * given before looking it up. A token is 256 random bits, so a fast hash is
 * right here.
 *
 * Links sent before this change hold the token in the old form, a UUID, and
 * keep working until they expire: a UUID-shaped token is looked up as it is
 * when its hash finds nothing. Nothing else is, so the hash read from a
 * database cannot be presented as the token.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

const sentReset = jest.fn(() => Promise.resolve());
const sentInvite = jest.fn(() => Promise.resolve());
jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: () => true,
  sendPasswordResetEmail: (...args: unknown[]) => sentReset(...(args as [])),
  sendInvitationEmail: (...args: unknown[]) => sentInvite(...(args as [])),
}));

import crypto from 'crypto';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const created: string[] = [];
const NEW_PASSWORD = 'Hashed-Link-Pass1!';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const resetWith = (token: string, newPassword = NEW_PASSWORD) =>
  request(app).post('/api/auth/reset-password').send({ token, newPassword });

/** The token the last email carried, as its second argument. */
const emailed = (send: jest.Mock): string => (send.mock.calls.at(-1) as unknown as unknown[])[1] as string;

async function stored(userId: string) {
  return prisma.passwordResetToken.findMany({ where: { userId, used: false } });
}

async function adminAgent(): Promise<request.Agent> {
  const admin = await createTestUser({ displayName: 'Admin', role: 'ADMIN' });
  created.push(admin.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: admin.email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('a reset link asked for from the sign-in page', () => {
  it('is stored as its hash, and the emailed token still sets the password', async () => {
    const u = await createTestUser({ displayName: 'Forgot' });
    created.push(u.id);

    expect((await request(app).post('/api/auth/forgot-password').send({ email: u.email })).status).toBe(200);
    const token = emailed(sentReset);
    const rows = await stored(u.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].token).not.toBe(token);
    expect(rows[0].token).toBe(sha256(token));
    expect((await resetWith(token)).status).toBe(200);
  });

  it('cannot be used by presenting the stored hash', async () => {
    const u = await createTestUser({ displayName: 'Leaked' });
    created.push(u.id);
    expect((await request(app).post('/api/auth/forgot-password').send({ email: u.email })).status).toBe(200);
    const [row] = await stored(u.id);

    expect((await resetWith(row.token)).status).toBe(400);
    expect((await stored(u.id))[0].used).toBe(false);
  });
});

describe('links an admin issues', () => {
  it('a reset link is stored as its hash', async () => {
    const admin = await adminAgent();
    const u = await createTestUser({ displayName: 'Sent a link' });
    created.push(u.id);

    expect((await admin.post(`/api/users/${u.id}/send-reset-link`)).status).toBe(200);
    const token = emailed(sentReset);

    expect((await stored(u.id)).map((r) => r.token)).toEqual([sha256(token)]);
    expect((await resetWith(token)).status).toBe(200);
  });

  it('an invitation, and a resent one, are stored as hashes and the emailed token sets the first password', async () => {
    const admin = await adminAgent();
    const email = testEmail('invited');

    const invited = await admin.post('/api/admin/users/invite').send({ email, displayName: 'Invited' });
    expect(invited.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    created.push(user.id);
    const first = emailed(sentInvite);
    expect((await stored(user.id)).map((r) => r.token)).toEqual([sha256(first)]);

    expect((await admin.post(`/api/admin/users/${user.id}/resend-invite`)).status).toBe(200);
    const second = emailed(sentInvite);
    expect(second).not.toBe(first);
    expect((await stored(user.id)).map((r) => r.token)).toEqual([sha256(second)]);

    expect((await resetWith(first)).status).toBe(400);
    expect((await resetWith(second)).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email, password: NEW_PASSWORD })).status).toBe(200);
  });
});

describe('a link sent before links were hashed', () => {
  it('still works until it expires', async () => {
    const u = await createTestUser({ displayName: 'Older link' });
    created.push(u.id);
    const legacy = crypto.randomUUID();
    await prisma.passwordResetToken.create({ data: { userId: u.id, token: legacy, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });

    expect((await resetWith(legacy)).status).toBe(200);
    expect((await resetWith(legacy, 'Another-Pass-2!xx')).status).toBe(400);
  });

  it('is refused once it has expired', async () => {
    const u = await createTestUser({ displayName: 'Expired older link' });
    created.push(u.id);
    const legacy = crypto.randomUUID();
    await prisma.passwordResetToken.create({ data: { userId: u.id, token: legacy, expiresAt: new Date(Date.now() - 60_000) } });

    expect((await resetWith(legacy)).status).toBe(400);
  });
});

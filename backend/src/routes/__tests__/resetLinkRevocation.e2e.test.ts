/**
 * A password-reset or invitation link stops working once the password it would
 * set has been settled some other way.
 *
 * A link is a credential: whoever holds it can set the account's password and,
 * since a reset signs out every device, lock the owner out. So an unused link
 * has to die when a newer one is requested, when another link is used, when
 * the owner changes their password, and when an admin resets it. And one link
 * sets the password once, even when two requests carry it at the same moment.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

import crypto from 'crypto';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];
const NEW_PASSWORD = 'AnotherGoodPass42!';

async function user(label: string) {
  const u = await createTestUser({ email: `resetlink-${label}-${stamp}@test.cozyvtt.local` });
  created.push(u.id);
  return u;
}

/** Issue a link the way forgot-password and invitations do, straight into the table. */
async function link(userId: string, hours = 1): Promise<string> {
  const token = crypto.randomUUID();
  await prisma.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000) },
  });
  return token;
}

const resetWith = (token: string, newPassword = NEW_PASSWORD) =>
  request(app).post('/api/auth/reset-password').send({ token, newPassword });

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('voids the older link when a new one is requested from the sign-in page', async () => {
  const u = await user('forgot');
  expect((await request(app).post('/api/auth/forgot-password').send({ email: u.email })).status).toBe(200);
  expect((await request(app).post('/api/auth/forgot-password').send({ email: u.email })).status).toBe(200);

  const tokens = await prisma.passwordResetToken.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
  expect(tokens).toHaveLength(2);

  expect((await resetWith(tokens[0].token)).status).toBe(400);
  expect((await resetWith(tokens[1].token)).status).toBe(200);
});

it('voids the other links when one of them is used', async () => {
  const u = await user('other');
  const invite = await link(u.id, 24 * 7);
  const reset = await link(u.id);

  expect((await resetWith(reset)).status).toBe(200);
  expect((await resetWith(invite, 'YetAnotherPass77!')).status).toBe(400);
});

it('voids outstanding links when the owner changes their password', async () => {
  const u = await user('change');
  const outstanding = await link(u.id);

  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
  const res = await agent.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
  expect(res.status).toBe(200);

  expect((await resetWith(outstanding, 'YetAnotherPass77!')).status).toBe(400);
});

it('voids outstanding links when an admin resets the password', async () => {
  const admin = await createTestUser({ email: `resetlink-admin-${stamp}@test.cozyvtt.local`, role: 'ADMIN' });
  created.push(admin.id);
  const u = await user('admin-reset');
  const outstanding = await link(u.id);

  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: admin.email, password: TEST_PASSWORD })).status).toBe(200);
  expect((await agent.post(`/api/users/${u.id}/reset-password`)).status).toBe(200);

  expect((await resetWith(outstanding)).status).toBe(400);
});

it('sets the password once when two requests carry the same link at the same moment', async () => {
  const u = await user('race');
  const token = await link(u.id);

  const results = await Promise.all([resetWith(token, 'FirstRacerPass1!'), resetWith(token, 'SecondRacerPass2!')]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
});

it('does not spend the link on a password that is too weak', async () => {
  const u = await user('weak');
  const token = await link(u.id);

  expect((await resetWith(token, 'weak')).status).toBe(400);
  expect((await resetWith(token)).status).toBe(200);
});

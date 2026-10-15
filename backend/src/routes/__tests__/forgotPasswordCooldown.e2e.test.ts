/**
 * One reset email per account every five minutes.
 *
 * forgot-password was limited per requesting address only. Anyone with a few
 * addresses could ask for a reset for one victim every few seconds: each
 * request voided the link before it and sent another email, so the inbox
 * filled and no link worked by the time it was clicked, and the old link rows
 * were never removed. A request within five minutes of the account's last
 * link now answers exactly as before, sends nothing and leaves that link
 * working; a request after that issues a new link, voids the old one and
 * removes the account's used and expired rows.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

// Every limiter lets the request through. The rest of the package stays
// real: the sign-in limiter keys an address with its ipKeyGenerator.
jest.mock('express-rate-limit', () => ({
  ...jest.requireActual<typeof import('express-rate-limit')>('express-rate-limit'),
  __esModule: true,
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const sendPasswordResetEmail = jest.fn(() => Promise.resolve());
jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: () => true,
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...(args as [])),
}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';

const app = createTestApp();
const created: string[] = [];

const ask = (email: string) => request(app).post('/api/auth/forgot-password').send({ email });

async function links(userId: string) {
  return prisma.passwordResetToken.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

beforeEach(() => sendPasswordResetEmail.mockClear());

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('sends one email in five minutes, answers the same each time, and keeps the first link working', async () => {
  const user = await createTestUser({ displayName: 'Cooldown' });
  created.push(user.id);

  const first = await ask(user.email);
  const second = await ask(user.email);
  const third = await ask(user.email);

  expect(first.status).toBe(200);
  expect(second.body).toEqual(first.body);
  expect(third.body).toEqual(first.body);
  expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

  const rows = await links(user.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].used).toBe(false);
});

it('issues a new link once five minutes have passed, voiding the old one and removing spent rows', async () => {
  const user = await createTestUser({ displayName: 'Cooldown over' });
  created.push(user.id);
  expect((await ask(user.email)).status).toBe(200);
  const [old] = await links(user.id);

  // Spent rows that have piled up, and a link now older than the cooldown.
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
  await prisma.passwordResetToken.update({ where: { id: old.id }, data: { createdAt: sixMinutesAgo } });
  await prisma.passwordResetToken.create({ data: { userId: user.id, token: `used-${user.id}`, used: true, expiresAt: new Date(Date.now() + 60_000), createdAt: sixMinutesAgo } });
  await prisma.passwordResetToken.create({ data: { userId: user.id, token: `expired-${user.id}`, expiresAt: new Date(Date.now() - 60_000), createdAt: sixMinutesAgo } });

  expect((await ask(user.email)).status).toBe(200);
  expect(sendPasswordResetEmail).toHaveBeenCalledTimes(2);

  const rows = await links(user.id);
  expect(rows.map((r) => r.token)).not.toContain(`used-${user.id}`);
  expect(rows.map((r) => r.token)).not.toContain(`expired-${user.id}`);
  expect(rows.filter((r) => !r.used)).toHaveLength(1);
  expect(rows.find((r) => r.id === old.id)?.used).toBe(true);
});

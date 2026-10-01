/**
 * Forgot-password answers without waiting for the email to be sent.
 *
 * It gives the same answer for a known and an unknown address, so that it
 * cannot be used to find out who has an account. It used to wait for the mail
 * server before answering for a known address only, so the time it took gave
 * the answer away.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

let releaseSend: () => void = () => {};
const sendPasswordResetEmail = jest.fn(
  () => new Promise<void>((resolve) => { releaseSend = resolve; })
);
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

afterAll(async () => {
  releaseSend();
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('answers a known address before the email has been sent', async () => {
  const u = await createTestUser({ email: `forgot-timing-${Date.now()}@test.cozyvtt.local` });
  created.push(u.id);

  // The send never finishes until released, so a route that waits for it
  // does not answer within the test's time limit.
  const res = await request(app).post('/api/auth/forgot-password').send({ email: u.email });

  expect(res.status).toBe(200);
  expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  expect(await prisma.passwordResetToken.count({ where: { userId: u.id } })).toBe(1);
}, 3000);

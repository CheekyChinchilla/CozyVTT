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

// Every limiter lets the request through. The rest of the package stays
// real: the sign-in limiter keys an address with its ipKeyGenerator.
jest.mock('express-rate-limit', () => ({
  ...jest.requireActual<typeof import('express-rate-limit')>('express-rate-limit'),
  __esModule: true,
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

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
import * as passwordResetTokens from '../../services/passwordResetTokens';
import { resetLinksBeingIssued } from '../auth';

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
  await resetLinksBeingIssued.finished();
  expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  expect(await prisma.passwordResetToken.count({ where: { userId: u.id } })).toBe(1);
}, 3000);

// Issuing a link takes several database round trips that an unknown address
// never makes, so waiting for them told the two apart by the time taken.
it('answers a known address before its link has been issued', async () => {
  const u = await createTestUser({ email: `forgot-issue-${Date.now()}@test.cozyvtt.local` });
  created.push(u.id);
  let releaseIssue: () => void = () => {};
  const held = new Promise<string>((resolve) => { releaseIssue = () => resolve('never-sent'); });
  const issuing = jest.spyOn(passwordResetTokens, 'issueResetToken').mockImplementationOnce(() => held);

  try {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If an account with that email exists, a password reset link has been sent.');
    expect(resetLinksBeingIssued.count).toBe(1);
  } finally {
    releaseIssue();
    await resetLinksBeingIssued.finished();
    issuing.mockRestore();
  }
}, 3000);

// Requests while a link is on its way find it as they would find one just
// issued, so a burst of requests still sends one email.
it('issues one link for requests that arrive while one is on its way', async () => {
  const u = await createTestUser({ email: `forgot-burst-${Date.now()}@test.cozyvtt.local` });
  created.push(u.id);
  const issued = jest.spyOn(passwordResetTokens, 'issueResetToken');
  try {
    await Promise.all(Array.from({ length: 3 }, () => request(app).post('/api/auth/forgot-password').send({ email: u.email })));
    await resetLinksBeingIssued.finished();
    expect(issued).toHaveBeenCalledTimes(1);
  } finally {
    issued.mockRestore();
  }
});

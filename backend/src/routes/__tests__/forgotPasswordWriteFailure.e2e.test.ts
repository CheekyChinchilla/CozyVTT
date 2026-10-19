/**
 * Forgot-password answers a known and an unknown address the same when the
 * token writes fail.
 *
 * Only a known address reaches the writes that issue a link, so a failure
 * there (a full disk, a read-only database) answered 500 for known addresses
 * and 200 for unknown ones. That told anyone asking which addresses have
 * accounts for as long as the failure lasted. Now the failure is logged and
 * the answer is the one every address gets.
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

const issueResetToken = jest.fn();
jest.mock('../../services/passwordResetTokens', () => ({
  ...jest.requireActual('../../services/passwordResetTokens'),
  issueResetToken: (...args: unknown[]) => issueResetToken(...args),
}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { resetLinksBeingIssued } from '../auth';
import logger from '../../utils/logger';

const app = createTestApp();
const created: string[] = [];

/** Ask for a link, and wait for it to be issued, which happens after the answer. */
async function ask(email: string) {
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  await resetLinksBeingIssued.finished();
  return res;
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('answers a known address exactly as an unknown one when issuing the link fails', async () => {
  const user = await createTestUser({ displayName: 'Write failure' });
  created.push(user.id);
  issueResetToken.mockRejectedValue(new Error('disk full'));
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  const known = await ask(user.email);
  const unknown = await ask(`nobody-${Date.now()}@test.cozyvtt.local`);

  expect(known.status).toBe(unknown.status);
  expect(known.body).toEqual(unknown.body);
  expect(known.status).toBe(200);
  expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  // The failure is not hidden from the administrator.
  expect(logged).toHaveBeenCalledWith(expect.stringContaining('password reset'), expect.objectContaining({ err: expect.any(Error) }));
  logged.mockRestore();
});

it('answers a known address exactly as an unknown one when clearing old links fails', async () => {
  const user = await createTestUser({ displayName: 'Delete failure' });
  created.push(user.id);
  const failing = jest.spyOn(prisma.passwordResetToken, 'deleteMany').mockRejectedValue(new Error('read-only database'));
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  const known = await ask(user.email);
  const unknown = await ask(`nobody-${Date.now()}-b@test.cozyvtt.local`);

  expect(known.status).toBe(200);
  expect(known.body).toEqual(unknown.body);
  failing.mockRestore();
  logged.mockRestore();
});

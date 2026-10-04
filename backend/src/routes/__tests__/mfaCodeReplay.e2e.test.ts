/**
 * An authenticator code works once.
 *
 * A six-digit code stays valid for up to a minute and a half (its own thirty
 * seconds and one step either side, for clock drift). Anyone who sees one used
 * (over a shoulder, in a proxy log, from a phishing page that forwards it)
 * could sign in with it again inside that time. The server now remembers the
 * last step it accepted for each account and refuses a code from that step or
 * an earlier one.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

import request from 'supertest';
import speakeasy from 'speakeasy';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

// A test may wait up to six seconds for a fresh step before it starts.
jest.setTimeout(30_000);

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];

/** The code for `offset` steps from the step `base`. */
const codeAt = (secret: string, base: number, offset: number) =>
  speakeasy.totp({ secret, encoding: 'base32', time: (base + offset) * 30 });

/**
 * Wait out the end of a step, so the codes a test works out stay inside the
 * server's window of one step either side for the few seconds the test runs.
 */
async function freshStep(): Promise<number> {
  const into = (Date.now() / 1000) % 30;
  if (into > 24) await new Promise((r) => setTimeout(r, (30 - into + 0.5) * 1000));
  return Math.floor(Date.now() / 1000 / 30);
}

/** A user with MFA turned on through the real enrolment, using the code for `enrolOffset`. */
async function enrolled(label: string, base: number, enrolOffset: number) {
  const user = await createTestUser({ email: `mfa-replay-${label}-${stamp}@test.cozyvtt.local` });
  created.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  const setup = await agent.post('/api/auth/mfa/setup').send({ password: TEST_PASSWORD });
  expect(setup.status).toBe(200);
  const secret: string = setup.body.secret;
  expect((await agent.post('/api/auth/mfa/verify').send({ token: codeAt(secret, base, enrolOffset) })).status).toBe(200);
  return { user, secret };
}

/** A fresh sign-in, up to the second factor, then the code. */
async function signInWith(email: string, token: string) {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(login.body.mfaRequired).toBe(true);
  return agent.post('/api/auth/mfa/verify-login').send({ token });
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('refuses a code that has already signed in', async () => {
  const base = await freshStep();
  const { user, secret } = await enrolled('twice', base, -1);

  const code = codeAt(secret, base, 0);
  expect((await signInWith(user.email, code)).status).toBe(200);
  const replay = await signInWith(user.email, code);
  expect(replay.status).toBe(401);
});

it('refuses the code that turned MFA on', async () => {
  const base = await freshStep();
  const { user, secret } = await enrolled('enrol', base, 0);
  expect((await signInWith(user.email, codeAt(secret, base, 0))).status).toBe(401);
});

it('refuses an earlier code once a later one has been used', async () => {
  const base = await freshStep();
  const { user, secret } = await enrolled('earlier', base, -1);

  expect((await signInWith(user.email, codeAt(secret, base, 1))).status).toBe(200);
  expect((await signInWith(user.email, codeAt(secret, base, 0))).status).toBe(401);
});

it('still accepts the next code', async () => {
  const base = await freshStep();
  const { user, secret } = await enrolled('next', base, -1);

  expect((await signInWith(user.email, codeAt(secret, base, 0))).status).toBe(200);
  expect((await signInWith(user.email, codeAt(secret, base, 1))).status).toBe(200);
});

it('refuses a code already used to sign in when turning MFA off', async () => {
  const base = await freshStep();
  const { user, secret } = await enrolled('disable', base, -1);

  const code = codeAt(secret, base, 0);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect((await agent.post('/api/auth/mfa/verify-login').send({ token: code })).status).toBe(200);

  const off = await agent.post('/api/auth/mfa/disable').send({ password: TEST_PASSWORD, token: code });
  expect(off.status).toBe(401);
  expect((await prisma.user.findUnique({ where: { id: user.id } }))?.mfaEnabled).toBe(true);
});

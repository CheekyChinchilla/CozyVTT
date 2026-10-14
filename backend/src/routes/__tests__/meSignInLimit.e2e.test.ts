/**
 * GET /api/auth/me ends a sign-in older than the remember-me window, as the
 * guarded routes do.
 *
 * A sign-in ends REMEMBER_ME_MAX_AGE (30 days) after it was made, however
 * active: every guarded route answers 401 with `code: "SIGN_IN_EXPIRED"` and
 * ends the session. /me checked only the user id, so it went on answering 200
 * for that sign-in, and a script checking its sign-in there was told it was
 * still good. It now answers as the guarded routes do.
 *
 * The clock is moved forward; a request a day before the limit keeps the
 * rolling cookie alive, as a tab left open does.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { rememberMeMaxAge } from '../../config/sessionDurations';

const app = createTestApp();
const created: string[] = [];
const DAY = 24 * 60 * 60 * 1000;

async function rememberedSignIn(email: string): Promise<request.Agent> {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD, rememberMe: true });
  expect(login.status).toBe(200);
  return agent;
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('answers a sign-in past the limit as the guarded routes do, and ends it', async () => {
  const user = await createTestUser({ displayName: 'Long sign-in' });
  created.push(user.id);
  const signedInAt = Date.now();
  const forMe = await rememberedSignIn(user.email);
  const forGuarded = await rememberedSignIn(user.email);

  const clock = jest.spyOn(Date, 'now');
  try {
    // A day before the limit both are still good, and the cookies roll on.
    clock.mockReturnValue(signedInAt + rememberMeMaxAge - DAY);
    expect((await forMe.get('/api/auth/me')).status).toBe(200);
    expect((await forGuarded.get('/api/auth/ping')).status).toBe(200);

    clock.mockReturnValue(signedInAt + rememberMeMaxAge + 60_000);
    const me = await forMe.get('/api/auth/me');
    const guarded = await forGuarded.get('/api/auth/ping');

    expect(guarded.status).toBe(401);
    expect(guarded.body).toEqual({
      error: 'Unauthorized',
      code: 'SIGN_IN_EXPIRED',
      message: 'Your sign-in has reached its 30-day limit. Sign in again.',
    });
    expect(me.status).toBe(guarded.status);
    expect(me.body).toEqual(guarded.body);

    // Ended, not only refused: the next ask is a plain "not signed in".
    const after = await forMe.get('/api/auth/me');
    expect(after.status).toBe(401);
    expect(after.body.code).toBeUndefined();
  } finally {
    clock.mockRestore();
  }
});

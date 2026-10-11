/**
 * A sign-in does its session bookkeeping.
 *
 * At sign-in the new session is stamped with the time, so the guards can end
 * it after the remember-me window however active it stays, and the account's
 * oldest sessions beyond the cap are removed, with the new one kept. The
 * test app keeps sessions in memory, so the cap is pinned by the call that
 * removes rows from the table the real app uses; the SQL has its own test in
 * services/__tests__/sessionStoreCap.test.ts.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import speakeasy from 'speakeasy';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import * as sessionStore from '../../services/sessionStore';

const app = createTestApp();
const created: string[] = [];

/** The session id a response's cookie names, decoded from `s:<sid>.<signature>`. */
function sidOf(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.map((c) => c.split(';')[0]).find((c) => c.startsWith('cozyvtt.sid='));
  if (!cookie) throw new Error('no session cookie was set');
  return decodeURIComponent(cookie.slice('cozyvtt.sid='.length)).slice(2).split('.')[0];
}

let capped: jest.SpyInstance;

beforeEach(() => {
  capped = jest.spyOn(sessionStore, 'capLoginSessions');
});

afterEach(() => capped.mockRestore());

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('caps the account\'s sessions at a password sign-in, keeping the new one', async () => {
  const user = await createTestUser({ displayName: 'Bookkeeping' });
  created.push(user.id);

  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

  expect(res.status).toBe(200);
  expect(capped).toHaveBeenCalledWith(user.id, sidOf(res));
});

it('caps them when the two-factor step completes the sign-in', async () => {
  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const user = await createTestUser({ displayName: 'Bookkeeping MFA' });
  created.push(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: secret } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).body.mfaRequired).toBe(true);
  capped.mockClear();

  const res = await agent.post('/api/auth/mfa/verify-login').send({ token: speakeasy.totp({ secret, encoding: 'base32' }) });

  expect(res.status).toBe(200);
  expect(capped).toHaveBeenCalledWith(user.id, sidOf(res));
});

it('does not touch the table for a wrong password', async () => {
  const user = await createTestUser({ displayName: 'Bookkeeping wrong' });
  created.push(user.id);

  expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' })).status).toBe(401);
  expect(capped).not.toHaveBeenCalled();
});

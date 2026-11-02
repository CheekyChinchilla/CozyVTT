/**
 * A password holding U+0000, the null character, is taken as 1.5.4 took it.
 *
 * A request holding the character is refused before any route reads it
 * (nulCharacterRequests.e2e.test.ts), since the database cannot store it. A
 * password is never stored, only hashed or checked against a hash, and 1.5.4
 * let any client set one holding it: refused, such an account could not sign
 * in, confirm its password, change it or delete itself. So the password
 * fields of the routes that read one are left out of the check, at the top
 * of the body on those routes alone; the rest of each body is checked as
 * before.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('../../services/systemSettings', () => ({
  ...jest.requireActual<typeof import('../../services/systemSettings')>('../../services/systemSettings'),
  getSystemSettings: jest.fn().mockResolvedValue({
    id: 'test-settings',
    setupCompleted: true,
    instanceName: 'CozyVTT Test',
    timezone: 'UTC',
    allowRegistration: true,
    requireAdminApproval: true,
  }),
}));

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const REFUSAL = 'Text cannot contain the null character (U+0000).';
const WITH_NUL = 'Aa1!aaaaaaaa\u0000b';

const userIds: string[] = [];

// Each caller its own address, so the sign-in and password limits, counted
// per address, never decide an answer here.
let addressCounter = 0;
const freshAddress = () => {
  addressCounter += 1;
  return `10.75.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
};
const caller = () => request.agent(app).set('X-Forwarded-For', freshAddress());

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: 'nul-password-' } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

/** A new account, signed in. */
async function signedIn(password = TEST_PASSWORD) {
  const user = await createTestUser({ email: testEmail('nul-pw'), password });
  userIds.push(user.id);
  const agent = caller();
  expect((await agent.post('/api/auth/login').send({ email: user.email, password })).status).toBe(200);
  return { user, agent };
}

describe('a password holding U+0000 reaches the route', () => {
  it('POST /api/auth/login: a wrong one is a wrong password', async () => {
    const { user } = await signedIn();
    const res = await caller().post('/api/auth/login').send({ email: user.email, password: 'wrong\u0000' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
    // As Express routes it: either case, and a trailing slash.
    const routed = await caller().post('/API/Auth/Login/').send({ email: user.email, password: 'wrong\u0000' });
    expect(routed.status).toBe(401);
  });

  it('POST /api/auth/register: the account is made with it, and signs in with it alone', async () => {
    const email = `nul-password-${Date.now()}@test.cozyvtt.local`;
    const res = await caller().post('/api/auth/register').send({ email, password: WITH_NUL, displayName: 'Nul Password' });
    expect(res.status).toBe(201);
    await prisma.user.update({ where: { email }, data: { isApproved: true } });

    expect((await caller().post('/api/auth/login').send({ email, password: WITH_NUL })).status).toBe(200);
    expect((await caller().post('/api/auth/login').send({ email, password: 'Aa1!aaaaaaaa' })).status).toBe(401);
  });

  it('POST /api/setup/init: refused for its setup token, as any', async () => {
    const res = await caller().post('/api/setup/init').send({ email: 'x@test.cozyvtt.local', password: WITH_NUL, displayName: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.message).not.toBe(REFUSAL);
  });

  it('POST /api/auth/reset-password: refused for its token, as any', async () => {
    const res = await caller().post('/api/auth/reset-password').send({ token: 'f'.repeat(64), newPassword: WITH_NUL });
    expect(res.status).toBe(400);
    expect(res.body.message).not.toBe(REFUSAL);
  });

  it('POST /api/auth/change-password: a new one is set, and signs in', async () => {
    const { user, agent } = await signedIn();
    const wrong = await agent.post('/api/auth/change-password').send({ currentPassword: 'wrong\u0000', newPassword: WITH_NUL });
    expect(wrong.status).toBe(401);

    const res = await agent.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: WITH_NUL });
    expect(res.status).toBe(200);
    expect((await caller().post('/api/auth/login').send({ email: user.email, password: WITH_NUL })).status).toBe(200);
  });

  it('an account whose password holds it confirms it to change its email, its password and to delete itself', async () => {
    const { user, agent } = await signedIn(WITH_NUL);

    const email = testEmail('nul-pw-moved');
    expect((await agent.put(`/api/users/${user.id}`).send({ email, currentPassword: WITH_NUL })).status).toBe(200);
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: WITH_NUL, newPassword: WITH_NUL })).status).toBe(200);
    expect((await agent.delete('/api/auth/account').send({ password: WITH_NUL })).status).toBe(200);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
  });

  it.each([
    ['DELETE', '/api/auth/account', { password: 'wrong\u0000' }, 401],
    ['POST', '/api/auth/mfa/setup', { password: 'wrong\u0000' }, 401],
    ['POST', '/api/auth/mfa/disable', { password: 'wrong\u0000', token: '000000' }, 400],
    ['POST', '/api/auth/mfa/backup-codes', { password: 'wrong\u0000' }, 400],
  ] as const)('%s %s: answered by the route', async (method, path, body, status) => {
    const { agent } = await signedIn();
    const res = method === 'DELETE' ? await agent.delete(path).send(body) : await agent.post(path).send(body);
    expect(res.status).toBe(status);
    expect(res.body.message).not.toBe(REFUSAL);
  });

  it('PUT /api/users/:id: a wrong current password is a wrong password', async () => {
    const { user, agent } = await signedIn();
    const res = await agent.put(`/api/users/${user.id}`).send({ email: testEmail('nul-pw-moved'), currentPassword: 'wrong\u0000' });
    expect(res.status).toBe(401);
    expect(res.body.message).not.toBe(REFUSAL);
  });
});

describe('everything else in the same requests is still checked', () => {
  it('refuses U+0000 in the email beside the password', async () => {
    const res = await caller().post('/api/auth/login').send({ email: 'a\u0000@test.cozyvtt.local', password: WITH_NUL });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(REFUSAL);
  });

  it('refuses a password that is not text and holds it', async () => {
    const res = await caller().post('/api/auth/login').send({ email: 'a@test.cozyvtt.local', password: { text: '\u0000' } });
    expect(res.body.message).toBe(REFUSAL);
  });

  it('refuses a password field on any other route, or nested in a body', async () => {
    const { user, agent } = await signedIn();
    expect((await agent.put(`/api/users/${user.id}/preferences`).send({ currentPassword: '\u0000' })).body.message).toBe(REFUSAL);
    expect((await agent.post('/api/characters').send({ name: 'Nul', data: { password: 'a\u0000' } })).body.message).toBe(REFUSAL);
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD, extra: { password: '\u0000' } })).body.message).toBe(REFUSAL);
    expect((await agent.post('/api/auth/mfa/verify').send({ token: '\u0000', password: TEST_PASSWORD })).body.message).toBe(REFUSAL);
  });
});

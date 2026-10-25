/**
 * One address may have at most two requests that hash or check a password
 * running at once.
 *
 * The server runs two hashes at once with fifty more waiting, first come
 * first served, and a correct password is never counted by the sign-in
 * limits. One address posting its own correct password to the sign-in, or to
 * the backup codes route (eleven hashes each), over and over could keep that
 * line full, and every other sign-in on the instance was answered 503. Now a
 * third request at once from one address is answered 429 and counts for
 * nothing, while another address still takes its turn in the line.
 *
 * Argon2's check is held open here until the test finishes it. The app
 * trusts one proxy hop, as app.ts sets up, so each address is sent in
 * X-Forwarded-For.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import argon2 from 'argon2';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { mountedRoutes, routeKey } from '../../__tests__/helpers/routeInventory';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';
import { HASHING_AT_ONCE_MESSAGE } from '../../middleware/hashingPerAddress';

jest.setTimeout(30000);

const app = createTestApp();
const users: string[] = [];
let user: { id: string; email: string };
let addressCounter = 0;

/** An address no other case has used. */
const freshAddress = () => {
  addressCounter += 1;
  return `10.77.0.${addressCounter}`;
};

const signIn = (address: string, password = TEST_PASSWORD) =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', address).send({ email: user.email, password });

/** Argon2 checks held open, finished by `finish`. */
const held: Array<(value: boolean) => void> = [];

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function until(condition: () => boolean) {
  for (let i = 0; i < 500 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(condition()).toBe(true);
}

/** Finish the held checks in order, each as `value`, and those that start meanwhile. */
async function finish(value: boolean) {
  for (let i = 0; i < 200; i++) {
    if (held.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (held.length === 0) return;
    }
    held.shift()?.(value);
    await tick();
  }
}

/** Start a request, so it is sent at once, and note when it is answered. */
function start(test: request.Test) {
  const state: { res: request.Response | null } = { res: null };
  const done = test.then((res) => {
    state.res = res;
    return res;
  });
  return { state, done };
}

beforeAll(async () => {
  const u = await createTestUser({ displayName: 'Hashing per address' });
  users.push(u.id);
  user = u;
});

beforeEach(() => {
  jest.spyOn(argon2, 'verify').mockImplementation(() => new Promise<boolean>((resolve) => held.push(resolve)));
});

afterEach(async () => {
  await finish(false);
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cleanupUsers(users);
  await prisma.$disconnect();
});

function expectRefused(res: request.Response) {
  expect({ status: res.status, body: res.body }).toEqual({ status: 429, body: { error: 'Rate Limited', message: HASHING_AT_ONCE_MESSAGE } });
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
}

it('answers a third sign-in at once from one address with 429, while another address still waits its turn', async () => {
  const a = freshAddress();
  const first = start(signIn(a));
  const second = start(signIn(a));
  await until(() => held.length === 2);

  expectRefused(await signIn(a));

  // Another address is not refused: it waits for a turn behind the two.
  const other = start(signIn(freshAddress()));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(other.state.res).toBeNull();
  expect(held).toHaveLength(2);

  await finish(true);
  expect((await first.done).status).toBe(200);
  expect((await second.done).status).toBe(200);
  expect((await other.done).status).toBe(200);
});

it('counts the refusal as nothing: the address keeps its five wrong passwords', async () => {
  const a = freshAddress();
  const running = [start(signIn(a)), start(signIn(a))];
  await until(() => held.length === 2);
  for (let i = 0; i < 6; i++) expectRefused(await signIn(a, 'wrong-password'));
  await finish(true);
  await Promise.all(running.map((r) => r.done));

  jest.mocked(argon2.verify).mockResolvedValue(false);
  for (let i = 0; i < 5; i++) expect((await signIn(a, 'wrong-password')).status).toBe(401);
});

it('gives the place back when the answer is sent, and when the route fails', async () => {
  const a = freshAddress();
  const running = [start(signIn(a)), start(signIn(a))];
  await until(() => held.length === 2);
  await finish(true);
  await Promise.all(running.map((r) => r.done));

  // Two sign-ins that fail inside the server.
  jest.spyOn(appPrisma.user, 'findUnique').mockRejectedValueOnce(new Error('database gone')).mockRejectedValueOnce(new Error('database gone'));
  expect((await signIn(a)).status).toBe(500);
  expect((await signIn(a)).status).toBe(500);

  // Both places are free again: two more run, and only a third is refused.
  const again = [start(signIn(a)), start(signIn(a))];
  await until(() => held.length === 2);
  expectRefused(await signIn(a));
  await finish(true);
  for (const r of again) expect((await r.done).status).toBe(200);
});

it('holds the backup codes route, eleven hashes a request, to two at once', async () => {
  const a = freshAddress();
  const me = request.agent(app);
  jest.mocked(argon2.verify).mockRestore();
  expect((await me.post('/api/auth/login').set('X-Forwarded-For', a).send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  jest.spyOn(argon2, 'verify').mockImplementation(() => new Promise<boolean>((resolve) => held.push(resolve)));

  const ask = () => me.post('/api/auth/mfa/backup-codes').set('X-Forwarded-For', a).send({ password: TEST_PASSWORD });
  const running = [start(ask()), start(ask())];
  await until(() => held.length === 2);
  expectRefused(await ask());

  await finish(false);
  for (const r of running) expect((await r.done).status).toBe(401);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
});

it('is on every route that hashes or checks a password', () => {
  const capped = mountedRoutes(app)
    .filter((route) => route.handlers.some((h) => typeof h === 'function' && h.name === 'hashingPerAddress'))
    .map(routeKey)
    .sort();
  expect(capped).toEqual([
    'DELETE /api/auth/account',
    'POST /api/admin/users',
    'POST /api/admin/users/invite',
    'POST /api/auth/change-password',
    'POST /api/auth/login',
    'POST /api/auth/mfa/backup-codes',
    'POST /api/auth/mfa/disable',
    'POST /api/auth/mfa/setup',
    'POST /api/auth/mfa/verify',
    'POST /api/auth/mfa/verify-login',
    'POST /api/auth/register',
    'POST /api/auth/reset-password',
    'POST /api/setup/init',
    'POST /api/users/:id/reset-password',
    'PUT /api/users/:id',
  ]);
});

/**
 * An account that must replace an admin-issued password can do nothing else
 * over HTTP until it has.
 *
 * The gate is mounted on /api and its allow list is written relative to that
 * mount, so this drives it through the test app, which mounts it where the
 * server does (both are built by createApp in app.ts); a unit test handing
 * the gate literal paths cannot tell whether the paths Express gives it under
 * the mount are the ones on the list. The
 * account is made the way an admin makes one, through the Admin Dashboard's
 * route, and signs in with the temporary password it is given.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { PASSWORD_CHANGE_REQUIRED } from '../../middleware/passwordChange';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';

const NEW_PASSWORD = 'MyOwnPassword9!';

const app = createTestApp();

const created: string[] = [];
let member: request.Agent;
let memberEmail: string;
let temporaryPassword: string;

beforeAll(async () => {
  const admin = await createTestUser({ role: 'ADMIN' });
  created.push(admin.id);
  const adminAgent = request.agent(app);
  expect((await adminAgent.post('/api/auth/login').send({ email: admin.email, password: TEST_PASSWORD })).status).toBe(200);

  memberEmail = testEmail('mustchange');
  const made = await adminAgent.post('/api/admin/users').send({ email: memberEmail, displayName: 'Must Change' });
  expect(made.status).toBe(201);
  created.push(made.body.user.id);
  temporaryPassword = made.body.temporaryPassword;

  member = request.agent(app);
  const login = await member.post('/api/auth/login').send({ email: memberEmail, password: temporaryPassword });
  expect(login.status).toBe(200);
  expect(login.body.mustChangePassword).toBe(true);
});

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('before the password is changed', () => {
  it.each([
    ['get', '/api/campaigns'],
    ['post', '/api/campaigns'],
    ['get', '/api/characters'],
    ['get', '/api/assets'],
    ['get', '/api/invitations'],
    ['put', '/api/users/me/preferences'],
  ] as const)('%s %s is refused with a code the app can act on', async (method, url) => {
    const res = await member[method](url).send({ name: 'Should not exist' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(PASSWORD_CHANGE_REQUIRED);
  });

  it('creates nothing through a refused request', async () => {
    const userId = created[1];
    expect(await prisma.campaign.count({ where: { ownerId: userId } })).toBe(0);
  });

  it.each([
    ['get', '/api/auth/me'],
    ['get', '/api/auth/ping'],
    ['get', '/api/auth/appearance'],
    ['get', '/api/config'],
  ] as const)('%s %s still answers', async (method, url) => {
    const res = await member[method](url);
    expect(res.status).toBe(200);
  });
});

describe('after the password is changed', () => {
  beforeAll(async () => {
    const res = await member.post('/api/auth/change-password').send({ currentPassword: temporaryPassword, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('opens everything else', async () => {
    expect((await member.get('/api/campaigns')).status).toBe(200);
    expect((await member.get('/api/characters')).status).toBe(200);
  });

  it('is remembered in the database, so a new sign-in is not gated', async () => {
    const fresh = request.agent(app);
    const login = await fresh.post('/api/auth/login').send({ email: memberEmail, password: NEW_PASSWORD });
    expect(login.body.mustChangePassword).toBe(false);
    expect((await fresh.get('/api/campaigns')).status).toBe(200);
  });
});

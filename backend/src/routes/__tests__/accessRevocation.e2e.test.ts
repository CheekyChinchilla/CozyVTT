/**
 * Taking someone's access away has to end the access they already have.
 *
 * `requireAdmin` reads `platformRole` from the session, which is written once
 * at login and never re-read. So demoting an admin changed the database and
 * nothing else: their open session kept every admin power, including creating
 * another admin account and restoring the instance from a backup. Deleting an
 * account behaved the same way, because nothing checks the user still exists.
 * Sessions roll on every response and the client sends a keepalive, so one that
 * stays in use does not expire on its own.
 *
 * `destroyUserLoginSessions` already existed for this and was called from one
 * place, the admin password reset.
 *
 * **What this file can and cannot prove.** The test app uses a memory session
 * store (see `helpers/test-app.ts`), while the real one keeps sessions in a
 * PostgreSQL table that `destroyUserLoginSessions` deletes from with raw SQL.
 * Nothing here can observe a session actually ending, so these tests pin the
 * wiring: that revoking access calls the helper for the right user, and that an
 * ordinary edit does not. The end to end effect was checked by hand against a
 * running instance.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

jest.mock('../../services/sessionStore', () => ({
  destroyUserLoginSessions: jest.fn(async () => 1),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { destroyUserLoginSessions } from '../../services/sessionStore';
import {
  prisma,
  createTestUser,
  cleanupUsers,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();
const destroyed = destroyUserLoginSessions as jest.MockedFunction<typeof destroyUserLoginSessions>;

let actingAdminId: string;
let targetId: string;
let doomedId: string;
let keeperId: string;
let acting: ReturnType<typeof request.agent>;
const extra: string[] = [];

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const stamp = Date.now();
  const [a, t, d, k] = await Promise.all([
    createTestUser({ email: `revoke-admin-${stamp}@test.cozyvtt.local`, displayName: 'Acting Admin', role: 'ADMIN' }),
    createTestUser({ email: `revoke-target-${stamp}@test.cozyvtt.local`, displayName: 'Target Admin', role: 'ADMIN' }),
    createTestUser({ email: `revoke-doomed-${stamp}@test.cozyvtt.local`, displayName: 'Doomed User' }),
    createTestUser({ email: `revoke-keeper-${stamp}@test.cozyvtt.local`, displayName: 'Keeper' }),
  ]);
  actingAdminId = a.id;
  targetId = t.id;
  doomedId = d.id;
  keeperId = k.id;
  acting = await login(a.email);
});

afterAll(async () => {
  await cleanupUsers([actingAdminId, targetId, doomedId, keeperId, ...extra]);
  await prisma.$disconnect();
});

beforeEach(() => destroyed.mockClear());

describe('revoking access ends the sessions already issued', () => {
  it('when an admin is demoted', async () => {
    const res = await acting.put(`/api/users/${targetId}`).send({ platformRole: 'USER' });
    expect(res.status).toBe(200);
    expect(destroyed).toHaveBeenCalledWith(targetId);
  });

  it('when an account is deleted', async () => {
    const res = await acting.delete(`/api/users/${doomedId}`);
    expect(res.status).toBe(200);
    expect(destroyed).toHaveBeenCalledWith(doomedId);
  });

  it('when a user deletes their own account, on every device', async () => {
    // An admin, so what the other devices would keep is the admin role.
    const self = await createTestUser({
      email: `revoke-self-${Date.now()}${Math.random().toString(36).slice(2, 8)}@test.cozyvtt.local`,
      role: 'ADMIN',
    });
    extra.push(self.id);
    const agent = await login(self.email);

    const res = await agent.delete('/api/auth/account').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(destroyed).toHaveBeenCalledWith(self.id);
  });
});

describe('a user recovering their own account', () => {
  it('signs out their other devices when they change their password', async () => {
    const keeper = await prisma.user.findUnique({ where: { id: keeperId } });
    const kept = await login(keeper!.email);

    const res = await kept.post('/api/auth/change-password').send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'AnotherGoodPassword123!',
    });
    expect(res.status).toBe(200);

    // The second argument keeps the device they are holding signed in.
    expect(destroyed).toHaveBeenCalledWith(keeperId, expect.any(String));

    // Put the password back for the tests that follow.
    await kept.post('/api/auth/change-password').send({
      currentPassword: 'AnotherGoodPassword123!',
      newPassword: TEST_PASSWORD,
    });
  });
});

describe('an edit that is not a change of access', () => {
  it('leaves the person signed in', async () => {
    const keeper = await prisma.user.findUnique({ where: { id: keeperId } });
    const kept = await login(keeper!.email);
    const res = await kept.put(`/api/users/${keeperId}`).send({ displayName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(destroyed).not.toHaveBeenCalled();
  });

  it('leaves them signed in when the role is set to what it already was', async () => {
    const current = await prisma.user.findUnique({ where: { id: keeperId } });
    const res = await acting.put(`/api/users/${keeperId}`).send({ platformRole: current!.platformRole });
    expect(res.status).toBe(200);
    expect(destroyed).not.toHaveBeenCalled();
  });

  it('leaves them signed in when a database-read permission flag changes', async () => {
    // globalAssetManager and templateEditor are not session fields, so the
    // change already applies on the next request. Signing the person out would
    // be a cost with no benefit.
    const res = await acting.put(`/api/users/${keeperId}`).send({ templateEditor: true });
    expect(res.status).toBe(200);
    expect(destroyed).not.toHaveBeenCalled();
    await prisma.user.update({ where: { id: keeperId }, data: { templateEditor: false } });
  });
});

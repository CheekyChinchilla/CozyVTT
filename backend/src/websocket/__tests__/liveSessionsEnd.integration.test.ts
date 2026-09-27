/**
 * Ending a sign-in ends its live game connections too.
 *
 * A socket takes its user at the handshake and its campaign and role from
 * `authenticate`, and nothing re-read the session after that. Every route
 * that destroys a user's login sessions (an admin reset or account deletion,
 * a platform-role change, the user's own password change or MFA removal, a
 * reset by emailed link, signing out) therefore left the user's open sockets
 * with every power they had, for as long as they stayed connected. The same
 * routes now end those sockets, each told why, and a reset by link also ends
 * the login sessions it never touched before.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import * as sessionStore from '../../services/sessionStore';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let adminId: string;
let admin: ReturnType<typeof request.agent>;
const created: string[] = [];

async function login(email: string): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** A fresh user with one live socket. */
async function userWithSocket(label: string) {
  const user = await createTestUser({ email: `livesess-${label}-${randomUUID().slice(0, 8)}@test.cozyvtt.local`, displayName: label });
  created.push(user.id);
  const cookie = await server.loginAs(user.id);
  const client = await server.connectClient(cookie);
  return { user, client };
}

/**
 * What a socket that is about to be ended reports. Created only where both
 * promises are awaited: a wait for an event that never comes rejects on its
 * timer, and an unawaited one surfaces in whatever test the worker is running
 * three seconds later.
 */
function expectEnding(client: ClientSocket) {
  return {
    told: waitForEvent<{ message: string }>(client, 'error'),
    dropped: new Promise<string>((resolve) => client.on('disconnect', (reason: string) => resolve(reason))),
  };
}

beforeAll(async () => {
  const a = await createTestUser({ email: `livesess-admin-${randomUUID().slice(0, 8)}@test.cozyvtt.local`, role: PlatformRole.ADMIN });
  adminId = a.id;
  admin = await login(a.email);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupUsers([adminId, ...created]);
  await prisma.$disconnect();
});

describe('an admin acting on an account', () => {
  it('resetting its password ends its live connections', async () => {
    const { user, client } = await userWithSocket('reset');
    const { told, dropped } = expectEnding(client);
    expect((await admin.post(`/api/users/${user.id}/reset-password`)).status).toBe(200);
    expect((await told).message).toMatch(/password/i);
    expect(await dropped).toBe('io server disconnect');
  });

  it('deleting it ends its live connections', async () => {
    const { user, client } = await userWithSocket('deleted');
    const { told, dropped } = expectEnding(client);
    expect((await admin.delete(`/api/users/${user.id}`)).status).toBe(200);
    expect((await told).message).toMatch(/deleted/i);
    expect(await dropped).toBe('io server disconnect');
  });

  it('changing its platform role ends its live connections', async () => {
    const { user, client } = await userWithSocket('promoted');
    const { told, dropped } = expectEnding(client);
    expect((await admin.put(`/api/users/${user.id}`).send({ platformRole: 'ADMIN' })).status).toBe(200);
    expect((await told).message).toMatch(/role/i);
    expect(await dropped).toBe('io server disconnect');
  });
});

describe('the account holder', () => {
  it('changing their password ends their other connections and keeps the one they are on', async () => {
    const { user, client } = await userWithSocket('changer');
    const { told, dropped } = expectEnding(client);
    const me = await login(user.email);
    // The REST session doing the change is not the socket's sign-in, so the
    // socket is one of the "other devices" that has to go.
    const res = await me.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: 'Another-Str0ng-one!' });
    expect(res.status).toBe(200);
    expect((await told).message).toMatch(/password/i);
    expect(await dropped).toBe('io server disconnect');
    expect((await me.get('/api/auth/me')).status).toBe(200);
  });

  it('signing out ends only the connections of that sign-in', async () => {
    const { user, client } = await userWithSocket('leaver');
    const me = await login(user.email);
    const silence = expectNoEvent(client, 'disconnect', 700);
    expect((await me.post('/api/auth/logout')).status).toBe(200);
    // The socket belongs to a different sign-in and stays.
    await expect(silence).resolves.toBeUndefined();
    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('resetting the password by emailed link ends every sign-in, live connections included', async () => {
    const { user, client } = await userWithSocket('recovering');
    const { told, dropped } = expectEnding(client);
    // The test app keeps sessions in memory, so the login sessions' end is
    // pinned by the call that removes them from the store the real app uses.
    const destroyed = jest.spyOn(sessionStore, 'destroyUserLoginSessions');
    const token = randomUUID();
    await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60_000) } });

    try {
      const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Recovered-Str0ng-one!' });
      expect(res.status).toBe(200);

      expect(destroyed).toHaveBeenCalledWith(user.id);
      expect((await told).message).toMatch(/password/i);
      expect(await dropped).toBe('io server disconnect');
    } finally {
      destroyed.mockRestore();
    }
  });
});

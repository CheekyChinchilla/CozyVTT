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
import * as liveSockets from '../utils';
import type { AuthenticatedFields } from '../auth';

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

// The route tests above cannot pin which sign-in a socket belongs to: their
// sockets are opened under the test server's own session store, so no REST
// sign-in ever matches one. The matching is pinned here, on the helper and on
// the id the sign-out route hands it.
describe('which sign-in a live connection belongs to', () => {
  const sessionOf = async (userId: string, client: ClientSocket) => {
    const found = (await server.io.in(userId).fetchSockets()).find((s) => s.id === client.id);
    const sid = (found as unknown as AuthenticatedFields | undefined)?.sessionId;
    if (!sid) throw new Error('socket has no session id');
    return sid;
  };

  it('ends only the connections of the named sign-in, or every one but it', async () => {
    const user = await createTestUser({ email: `livesess-two-${randomUUID().slice(0, 8)}@test.cozyvtt.local`, displayName: 'two' });
    created.push(user.id);
    const [first, second] = await Promise.all([server.loginAs(user.id), server.loginAs(user.id)]);
    const onFirst = await server.connectClient(first);
    const onSecond = await server.connectClient(second);
    const secondSid = await sessionOf(user.id, onSecond);

    // Only the first sign-in's connections.
    const ending = expectEnding(onFirst);
    const stays = expectNoEvent(onSecond, 'disconnect', 700);
    expect(await liveSockets.endLiveSockets(user.id, 'You signed out.', { onlySessionId: await sessionOf(user.id, onFirst) })).toBe(1);
    expect((await ending.told).message).toBe('You signed out.');
    expect(await ending.dropped).toBe('io server disconnect');
    await expect(stays).resolves.toBeUndefined();

    // Every connection but the second sign-in's.
    const again = await server.connectClient(first);
    const endingAgain = expectEnding(again);
    const staysAgain = expectNoEvent(onSecond, 'disconnect', 700);
    expect(await liveSockets.endLiveSockets(user.id, 'Your password was changed.', { exceptSessionId: secondSid })).toBe(1);
    expect(await endingAgain.dropped).toBe('io server disconnect');
    await expect(staysAgain).resolves.toBeUndefined();
    onSecond.disconnect();
  });

  it('signing out hands the helper the sign-in it ends', async () => {
    const user = await createTestUser({ email: `livesess-out-${randomUUID().slice(0, 8)}@test.cozyvtt.local`, displayName: 'out' });
    created.push(user.id);
    const agent = request.agent(app);
    const signedIn = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(signedIn.status).toBe(200);
    const cookie = String(signedIn.headers['set-cookie']?.[0] ?? '');
    // express-session signs the id: s:<sid>.<signature>, URL-encoded.
    const sid = decodeURIComponent(cookie.split(';')[0].split('=')[1]).slice(2).split('.')[0];
    const ended = jest.spyOn(liveSockets, 'endLiveSockets');
    try {
      expect((await agent.post('/api/auth/logout')).status).toBe(200);
      expect(ended).toHaveBeenCalledWith(user.id, 'You signed out.', { onlySessionId: sid });
    } finally {
      ended.mockRestore();
    }
  });
});

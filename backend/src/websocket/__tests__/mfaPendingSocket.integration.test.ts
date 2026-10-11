/**
 * A sign-in waiting at the two-factor step cannot open a live table connection.
 *
 * The REST guards refuse any session with `mfaPending` set, even one that
 * carries a user id. The socket handshake checked only the user id, so the
 * two decided "signed in" by different rules. Both now ask the same question,
 * so a session the REST API refuses is turned away at the handshake too, as a
 * pending password change already is.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { createWsTestServer, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

let server: WsTestServer;
const users: string[] = [];
const clients: ClientSocket[] = [];

/** How a connection attempt ended: accepted, or refused with a message. */
function attempt(cookie: string): Promise<{ accepted: boolean; message?: string }> {
  return new Promise((resolve, reject) => {
    const client = ioc(server.url, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true, reconnection: false });
    clients.push(client);
    const timer = setTimeout(() => reject(new Error('no answer to the connection within 5s')), 5000);
    client.once('connected', () => {
      clearTimeout(timer);
      resolve({ accepted: true });
    });
    client.once('error', (err: { message: string }) => {
      clearTimeout(timer);
      resolve({ accepted: false, message: err.message });
    });
  });
}

beforeAll(async () => {
  server = await createWsTestServer();
});

afterAll(async () => {
  for (const client of clients) client.disconnect();
  await server.close();
  await cleanupUsers(users);
  await prisma.$disconnect();
});

it('refuses a session that is only waiting at the two-factor step', async () => {
  const user = await createTestUser({ displayName: 'Pending' });
  users.push(user.id);

  const cookie = await server.sessionWith({ mfaPending: true, mfaPendingUserId: user.id });

  expect(await attempt(cookie)).toEqual({ accepted: false, message: 'Unauthorized' });
});

it('refuses a session holding a user id while the two-factor step is still pending, as the REST guards do', async () => {
  const user = await createTestUser({ displayName: 'Half signed in' });
  users.push(user.id);

  const cookie = await server.sessionWith({ userId: user.id, mfaPending: true, mfaPendingUserId: user.id });

  expect(await attempt(cookie)).toEqual({ accepted: false, message: 'Unauthorized' });
});

it('accepts the account once it is signed in', async () => {
  const user = await createTestUser({ displayName: 'Signed in' });
  users.push(user.id);

  expect(await attempt(await server.loginAs(user.id))).toEqual({ accepted: true });
});

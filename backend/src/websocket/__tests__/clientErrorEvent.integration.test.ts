/**
 * An event a client names 'error'.
 *
 * Socket.io does not reserve the name, so any signed-in client can emit an
 * event called 'error' carrying up to a megabyte, and it reaches the same
 * listener as the server's own socket errors. That listener logged whatever
 * arrived at error level, to two log files and the console, with no limit on
 * how often, so a client in a loop could fill the server's disk.
 *
 * The listener cannot simply go: socket.io also uses the 'error' event for a
 * packet a middleware refuses, and an 'error' with no listener is thrown,
 * which would end the process.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { Socket } from 'socket.io';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { createTestUser, cleanupUsers, testEmail } from '../../__tests__/helpers/db';
import { captureLogs, objectField } from '../../__tests__/helpers/logCapture';

jest.setTimeout(20000);

const MARKER = 'CLIENT-SENT-THIS';

let server: WsTestServer;
let userId: string;
let cookie: string;

beforeAll(async () => {
  server = await createWsTestServer();
  // A middleware that refuses one event by name, as a socket.use() ceiling
  // would, so the server's own socket errors can be seen arriving.
  server.io.on('connection', (socket: Socket) => {
    socket.use(([event], next) => (event === 'refused-in-test' ? next(new Error('refused by a middleware')) : next()));
  });
  userId = (await createTestUser({ email: testEmail('ws-error-event'), displayName: 'Error Event' })).id;
  cookie = await server.loginAs(userId);
});

afterAll(async () => {
  await server.close();
  await cleanupUsers([userId]);
});

/** A round trip, so every packet sent before it has been handled. */
async function roundTrip(client: Awaited<ReturnType<WsTestServer['connectClient']>>): Promise<void> {
  const pong = waitForEvent(client, 'pong');
  client.emit('ping');
  await pong;
}

describe("a client's 'error' event", () => {
  it('never puts what the client sent into the logs', async () => {
    const client = await server.connectClient(cookie);
    const logs = captureLogs();

    client.emit('error', MARKER + 'x'.repeat(200_000));
    client.emit('error', { message: MARKER, stack: MARKER });
    await roundTrip(client);

    await logs.stop();
    expect(logs.lines.join('')).not.toContain(MARKER);
    client.disconnect();
  });

  it('leaves the connection working', async () => {
    const client = await server.connectClient(cookie);
    client.emit('error', MARKER);
    await roundTrip(client);
    expect(client.connected).toBe(true);
    client.disconnect();
  });
});

describe("the server's own socket errors", () => {
  it('are still logged with their message', async () => {
    const client = await server.connectClient(cookie);
    const logs = captureLogs();

    client.emit('refused-in-test');
    await roundTrip(client);

    const entries = await logs.stop();
    const logged = entries.find((e) => e.message === 'socket error');
    expect(logged).toBeDefined();
    expect(objectField(logged ?? {}, 'err').message).toBe('refused by a middleware');
    client.disconnect();
  });
});

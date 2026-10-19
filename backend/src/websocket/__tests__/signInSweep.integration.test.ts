/**
 * A live connection ends with the sign-in it was opened under.
 *
 * A socket checked its sign-in at the handshake and again when it joined a
 * campaign, and never after. One left open stayed connected past the 30-day
 * sign-in limit, and after its session had idled out of the store, acting
 * with the campaign role it cached. A sweep every minute now ends each socket
 * whose sign-in has passed the limit, and every five minutes also each one
 * whose session the store no longer holds, each told why.
 *
 * The sweep takes its clock and its interval from the caller, so these tests
 * move time instead of waiting for it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { createWsTestServer, expectNoEvent, waitForEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { rememberMeMaxAge } from '../../config/sessionDurations';
import { agedOutMessage } from '../../services/signedIn';
import { sweepLiveSockets, startSignInSweep, SIGN_IN_ENDED_MESSAGE } from '../signInSweep';
import logger from '../../utils/logger';

jest.setTimeout(30000);

const DAY = 24 * 60 * 60 * 1000;

let server: WsTestServer;
const users: string[] = [];

/** A user with one live socket, signed in `daysAgo` days ago. */
async function signedIn(daysAgo: number) {
  const user = await createTestUser({ displayName: 'Sweep user' });
  users.push(user.id);
  const cookie = await server.sessionWith({ userId: user.id, mustChangePassword: false, signedInAt: Date.now() - daysAgo * DAY });
  const client = await server.connectClient(cookie);
  return { user, cookie, client };
}

/** What a socket being ended reports: the typed event, then the drop. */
function expectEnding(client: ClientSocket) {
  return {
    told: waitForEvent<{ reason: string; message: string; campaignId: string | null }>(client, 'campaign.access.revoked'),
    dropped: new Promise<string>((resolve) => client.on('disconnect', (reason: string) => resolve(reason))),
  };
}

beforeAll(async () => {
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupUsers(users);
  await prisma.$disconnect();
});

describe('a sweep', () => {
  it('ends a connection whose sign-in has passed the limit, with the aged-out message, and leaves a newer one', async () => {
    const old = await signedIn(20);
    const fresh = await signedIn(0);
    const ending = expectEnding(old.client);
    const stays = expectNoEvent(fresh.client, 'disconnect', 700);

    // Eleven days on: the first sign-in is 31 days old, the second 11.
    await sweepLiveSockets(server.io, { checkStore: false, now: Date.now() + 11 * DAY });

    await expect(ending.told).resolves.toEqual({ campaignId: null, reason: 'signed-out', message: agedOutMessage() });
    expect(await ending.dropped).toBe('io server disconnect');
    await expect(stays).resolves.toBeUndefined();
    expect(fresh.client.connected).toBe(true);
    fresh.client.disconnect();
  });

  it('ends a connection whose session the store no longer holds, on the pass that checks the store', async () => {
    const gone = await signedIn(0);
    await server.logout(gone.cookie);

    // The every-minute pass reads only the time the socket cached.
    const silence = expectNoEvent(gone.client, 'disconnect', 500);
    await sweepLiveSockets(server.io, { checkStore: false });
    await expect(silence).resolves.toBeUndefined();

    const ending = expectEnding(gone.client);
    await sweepLiveSockets(server.io, { checkStore: true });
    expect((await ending.told).message).toBe(SIGN_IN_ENDED_MESSAGE);
    expect(await ending.dropped).toBe('io server disconnect');
  });

  it('leaves a connection whose session is still there on the store pass', async () => {
    const live = await signedIn(1);
    const stays = expectNoEvent(live.client, 'disconnect', 700);
    await sweepLiveSockets(server.io, { checkStore: true });
    await expect(stays).resolves.toBeUndefined();
    live.client.disconnect();
  });

  // A store that could not be read answered as a session that had ended, so
  // a moment's trouble with the session database signed every player out in
  // the middle of a game. The sweep now leaves them, and logs it once.
  it('leaves every connection when the store cannot be read, logging it once for the sweep', async () => {
    const first = await signedIn(1);
    const second = await signedIn(1);
    const sockets = [...server.io.of('/').sockets.values()];
    const store = (sockets[0].request as unknown as { sessionStore: import('express-session').Store }).sessionStore;
    const failing = jest.spyOn(store, 'get').mockImplementation((_sid, callback) => callback(new Error('session database unreachable')));
    const errors = jest.spyOn(logger, 'error');
    const stay = [expectNoEvent(first.client, 'disconnect', 700), expectNoEvent(second.client, 'disconnect', 700)];

    try {
      expect(await sweepLiveSockets(server.io, { checkStore: true })).toBe(0);
      await expect(Promise.all(stay)).resolves.toEqual([undefined, undefined]);
      expect(failing).toHaveBeenCalled();
      const storeLines = errors.mock.calls.filter(([message]) => typeof message === 'string' && /session store/i.test(message));
      expect(storeLines).toHaveLength(1);
    } finally {
      failing.mockRestore();
      errors.mockRestore();
    }
    first.client.disconnect();
    second.client.disconnect();
  });

  it('takes the limit from the store for a sign-in made before the field existed, once it is stamped there', async () => {
    const user = await createTestUser({ displayName: 'Unstamped' });
    users.push(user.id);
    const cookie = await server.sessionWith({ userId: user.id, mustChangePassword: false });
    const client = await server.connectClient(cookie);

    // Unstamped at the handshake, so the time alone ends nothing.
    const silence = expectNoEvent(client, 'disconnect', 500);
    await sweepLiveSockets(server.io, { checkStore: false, now: Date.now() + 40 * DAY });
    await expect(silence).resolves.toBeUndefined();

    // A REST request stamps the stored session; the store pass reads it.
    const socket = [...server.io.of('/').sockets.values()].find((s) => (s as { userId?: string }).userId === user.id);
    const sid = (socket as { sessionId?: string } | undefined)?.sessionId;
    if (!sid) throw new Error('socket has no session id');
    const stamped = Date.now() - 31 * DAY;
    const store = (socket?.request as unknown as { sessionStore: import('express-session').Store }).sessionStore;
    await new Promise<void>((resolve, reject) => {
      store.get(sid, (err, found) => {
        if (err || !found) return reject(err ?? new Error('session not found'));
        store.set(sid, { ...found, signedInAt: stamped }, (setErr) => (setErr ? reject(setErr) : resolve()));
      });
    });

    const ending = expectEnding(client);
    await sweepLiveSockets(server.io, { checkStore: true });
    expect((await ending.told).message).toBe(agedOutMessage());
    expect(await ending.dropped).toBe('io server disconnect');
  });
});

describe('the sweep timer', () => {
  it('sweeps on its interval, checks the store on every fifth tick, and stops when told', async () => {
    // A server of its own, so the timer under test is the only one sweeping it.
    const own = await createWsTestServer({ sweep: false });
    try {
      const user = await createTestUser({ displayName: 'Timed' });
      users.push(user.id);
      const cookie = await own.sessionWith({ userId: user.id, mustChangePassword: false, signedInAt: Date.now() });
      const client = await own.connectClient(cookie);
      await own.logout(cookie);

      const ending = expectEnding(client);
      const sweep = startSignInSweep(own.io, own.httpServer, { everyMs: 20, storeCheckEvery: 5 });
      expect((await ending.told).message).toBe(SIGN_IN_ENDED_MESSAGE);
      sweep.stop();
      expect(sweep.stopped).toBe(true);

      // Stopped: an aged-out sign-in opened now stays.
      let now = Date.now();
      const stopped = startSignInSweep(own.io, own.httpServer, { everyMs: 20, storeCheckEvery: 5, now: () => now });
      stopped.stop();
      const late = await own.connectClient(await own.sessionWith({ userId: user.id, mustChangePassword: false, signedInAt: Date.now() }));
      now += rememberMeMaxAge + DAY;
      await expect(expectNoEvent(late, 'disconnect', 300)).resolves.toBeUndefined();
    } finally {
      await own.close();
    }
  });

  it('stops when the server it sweeps closes', async () => {
    const httpServer = createServer();
    const io = new IOServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const sweep = startSignInSweep(io, httpServer, { everyMs: 60_000 });
    expect(sweep.stopped).toBe(false);
    await new Promise<void>((resolve) => void io.close(() => resolve()));
    expect(sweep.stopped).toBe(true);
  });
});

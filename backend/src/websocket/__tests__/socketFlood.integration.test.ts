/**
 * One socket cannot make the server work, or hold replies, without limit.
 *
 * `ping` was answered every time with no ceiling, so a client that sent it
 * at line rate and never read its socket made the server queue a `pong` for
 * each: half a million in five seconds from one signed-in account, held in
 * memory until the connection closed. Nothing bounded how many events one
 * socket could send in all, nor how much the server would hold for a
 * client that does not read.
 *
 * A player's wall and light edits were refused for not being the DM's
 * before the edit ceiling was counted, so each one sent an `error`, however
 * many came.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ServerSocket } from 'socket.io';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import fs from 'fs';
import path from 'path';
import {
  SOCKET_CEILINGS, SOCKET_EVENTS_PER_SECOND, MAP_EDITS_PER_SECOND, REJOIN_EVENTS, buildWsFogState, broadcastFogState,
} from '../shared';
import {
  MAX_QUEUED_PACKETS, MAX_QUEUED_BYTES, MAX_QUEUED_BYTES_PER_USER, outgoingQueueOf, queuedBytesOfUser,
} from '../outgoingQueue';

jest.setTimeout(60000);

const runId = randomUUID().slice(0, 8);
let counter = 0;

let server: WsTestServer;
let campaignId: string;
let mapId: string;
const users: string[] = [];
/** Each server socket by its id, as it connects. */
const serverSockets = new Map<string, ServerSocket>();
/** How many `probe` events reached a handler, by server socket id. */
const probes = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Everything `client` receives of `event` from now on. */
function collect<T = unknown>(client: ClientSocket, event: string): T[] {
  const seen: T[] = [];
  client.on(event, (data: T) => seen.push(data));
  return seen;
}

/** The messages of every `error` `client` receives from now on. */
function errorsTo(client: ClientSocket): string[] {
  const seen: string[] = [];
  client.on('error', (data: { message?: string }) => seen.push(String(data?.message)));
  return seen;
}

/** Wait until `done` holds, then a little longer, so anything still coming has arrived. */
async function settle(done: () => boolean, timeoutMs = 10000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!done() && Date.now() < until) await sleep(25);
  await sleep(300);
}

async function newUser(role: 'PLAYER' | 'DM' | null): Promise<{ id: string; cookie: string }> {
  counter += 1;
  const user = await prisma.user.create({
    data: { email: `flood-${counter}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Flood ${counter}` },
  });
  users.push(user.id);
  if (role) await prisma.campaignMembership.create({ data: { userId: user.id, campaignId, role, characterIds: [] } });
  return { id: user.id, cookie: await server.loginAs(user.id) };
}

/** The server's end of a client's connection. */
function serverEnd(client: ClientSocket): ServerSocket {
  const found = client.id ? serverSockets.get(client.id) : undefined;
  if (!found) throw new Error('no server socket for this client');
  return found;
}

beforeAll(async () => {
  counter += 1;
  const owner = await prisma.user.create({
    data: { email: `flood-owner-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: 'Flood owner' },
  });
  users.push(owner.id);
  campaignId = (await prisma.campaign.create({ data: { name: `Flood ${runId}`, ownerId: owner.id, vibeSettings: {}, status: 'ACTIVE' } })).id;
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Flood Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  server.io.on('connection', (socket: ServerSocket) => {
    serverSockets.set(socket.id, socket);
    // An event no handler of the app's takes, counted when it reaches one.
    socket.on('probe', () => probes.set(socket.id, (probes.get(socket.id) ?? 0) + 1));
  });
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('ping', () => {
  it(`is answered ${SOCKET_CEILINGS.ping.windows[0].limit} times a second, and the sender is told once`, async () => {
    const user = await newUser(null);
    const client = await server.connectClient(user.cookie);
    const pongs = collect(client, 'pong');
    const errors = errorsTo(client);

    // Within what one socket may send in all, so only this ceiling is met.
    for (let i = 0; i < SOCKET_EVENTS_PER_SECOND / 2; i += 1) client.emit('ping');
    await settle(() => pongs.length >= SOCKET_CEILINGS.ping.windows[0].limit && errors.length > 0);

    // Sent in far less than a second; at most two windows' worth if not.
    expect(pongs.length).toBeGreaterThanOrEqual(SOCKET_CEILINGS.ping.windows[0].limit);
    expect(pongs.length).toBeLessThanOrEqual(2 * SOCKET_CEILINGS.ping.windows[0].limit);
    expect(errors).toEqual([SOCKET_CEILINGS.ping.refusal]);
    client.disconnect();
  });
});

describe('every event one socket sends', () => {
  it(`is taken ${SOCKET_EVENTS_PER_SECOND} a second, the rest dropped, and the sender told once`, async () => {
    const user = await newUser(null);
    const client = await server.connectClient(user.cookie);
    const errors = errorsTo(client);
    const socket = serverEnd(client);

    for (let i = 0; i < 3 * SOCKET_EVENTS_PER_SECOND; i += 1) client.emit('probe', i);
    await settle(() => (probes.get(socket.id) ?? 0) >= SOCKET_EVENTS_PER_SECOND && errors.length > 0);

    const handled = probes.get(socket.id) ?? 0;
    expect(handled).toBeGreaterThanOrEqual(SOCKET_EVENTS_PER_SECOND);
    expect(handled).toBeLessThanOrEqual(2 * SOCKET_EVENTS_PER_SECOND);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Too many messages at once from this page/);
    client.disconnect();
  });

  it('is counted for each socket on its own', async () => {
    const user = await newUser(null);
    const first = await server.connectClient(user.cookie);
    const second = await server.connectClient(user.cookie);
    for (let i = 0; i < SOCKET_EVENTS_PER_SECOND; i += 1) first.emit('probe', i);
    for (let i = 0; i < SOCKET_EVENTS_PER_SECOND; i += 1) second.emit('probe', i);
    await settle(() => (probes.get(serverEnd(first).id) ?? 0) + (probes.get(serverEnd(second).id) ?? 0) >= 2 * SOCKET_EVENTS_PER_SECOND);

    expect(probes.get(serverEnd(first).id)).toBe(SOCKET_EVENTS_PER_SECOND);
    expect(probes.get(serverEnd(second).id)).toBe(SOCKET_EVENTS_PER_SECOND);
    first.disconnect();
    second.disconnect();
  });
});

describe('what the server holds for a client that does not read', () => {
  /**
   * The client stops reading: its connection's transport cannot take more,
   * as a WebSocket's is while a send waits for the client's network, so
   * every packet after this waits in the server's memory.
   */
  function stopReading(socket: ServerSocket): void {
    socket.conn.transport.writable = false;
  }

  it(`ends the connection past ${MAX_QUEUED_BYTES} bytes waiting`, async () => {
    const user = await newUser(null);
    const client = await server.connectClient(user.cookie);
    const socket = serverEnd(client);
    const closed = new Promise<string>((resolve) => socket.on('disconnect', resolve));
    stopReading(socket);

    const chunk = 'x'.repeat(1024 * 1024);
    for (let sent = 0; sent <= MAX_QUEUED_BYTES + chunk.length && socket.connected; sent += chunk.length) {
      socket.emit('probe-reply', chunk);
    }
    await expect(Promise.race([closed, sleep(3000).then(() => 'still open')])).resolves.not.toBe('still open');
    expect(socket.connected).toBe(false);
  });

  it(`ends the connection past ${MAX_QUEUED_PACKETS} packets waiting`, async () => {
    const user = await newUser(null);
    const client = await server.connectClient(user.cookie);
    const socket = serverEnd(client);
    const closed = new Promise<string>((resolve) => socket.on('disconnect', resolve));
    stopReading(socket);

    for (let i = 0; i <= MAX_QUEUED_PACKETS && socket.connected; i += 1) socket.emit('probe-reply', i);
    await expect(Promise.race([closed, sleep(3000).then(() => 'still open')])).resolves.not.toBe('still open');
    expect(socket.connected).toBe(false);
  });

  it('leaves alone a client that reads what it is sent', async () => {
    const user = await newUser(null);
    const client = await server.connectClient(user.cookie);
    const socket = serverEnd(client);
    const received = collect(client, 'probe-reply');

    const chunk = 'x'.repeat(256 * 1024);
    const count = Math.ceil((2 * MAX_QUEUED_BYTES) / chunk.length);
    for (let i = 0; i < count; i += 1) {
      socket.emit('probe-reply', chunk);
      // A reader keeps up with a sender that waits for the network.
      if (i % 8 === 7) await sleep(5);
    }
    await settle(() => received.length >= count, 20000);
    expect(received).toHaveLength(count);
    expect(socket.connected).toBe(true);
    client.disconnect();
  });
});

describe('what one account holds over all its connections', () => {
  it(`stays within ${MAX_QUEUED_BYTES_PER_USER} bytes however many connections it opens`, async () => {
    const user = await newUser(null);
    const clients: ClientSocket[] = [];
    for (let i = 0; i < 6; i += 1) clients.push(await server.connectClient(user.cookie));
    const ends = clients.map(serverEnd);
    for (const socket of ends) socket.conn.transport.writable = false;

    // Each under one connection's bound, all of them well past the account's.
    const chunk = 'x'.repeat(1024 * 1024);
    for (const socket of ends) {
      for (let i = 0; i < 7 && socket.connected; i += 1) socket.emit('probe-reply', chunk);
    }
    await sleep(300);

    expect(ends.filter((socket) => !socket.connected).length).toBeGreaterThan(0);
    expect(queuedBytesOfUser(user.id)).toBeLessThanOrEqual(MAX_QUEUED_BYTES_PER_USER);
    for (const client of clients) client.disconnect();
  });

  it('counts nothing for a connection once it has closed, and never less than nothing', async () => {
    const user = await newUser(null);
    const first = await server.connectClient(user.cookie);
    const second = await server.connectClient(user.cookie);
    const [a, b] = [serverEnd(first), serverEnd(second)];
    a.conn.transport.writable = false;
    b.conn.transport.writable = false;
    a.emit('probe-reply', 'x'.repeat(100_000));
    b.emit('probe-reply', 'x'.repeat(100_000));
    expect(queuedBytesOfUser(user.id)).toBeGreaterThan(200_000);

    const closed = Promise.all([a, b].map((socket) => new Promise((resolve) => socket.once('disconnect', resolve))));
    first.disconnect();
    b.conn.close(true);
    await closed;
    expect(queuedBytesOfUser(user.id)).toBe(0);
    expect(outgoingQueueOf(a.id)).toBeUndefined();
    expect(outgoingQueueOf(b.id)).toBeUndefined();
  });
});

describe('a whole state sent to a connection that has not taken the last one', () => {
  it("replaces the fog the DM's page has not been sent yet", async () => {
    const dm = await newUser('DM');
    const client = await server.connectAndAuth(dm.cookie, campaignId);
    const socket = serverEnd(client);
    socket.conn.transport.writable = false;
    const fog = buildWsFogState({ width: 20, height: 20, gridSize: 50 });

    await broadcastFogState(server.io, campaignId, mapId, fog);
    const one = outgoingQueueOf(socket.id)?.bytes ?? 0;
    for (let i = 0; i < 20; i += 1) {
      fog.revealed[i] = true;
      await broadcastFogState(server.io, campaignId, mapId, fog);
    }

    expect(one).toBeGreaterThan(0);
    expect(outgoingQueueOf(socket.id)?.bytes).toBeLessThanOrEqual(one + 100);
    client.disconnect();
  });

  it('answers repeated requests for the walls with the newest answer alone', async () => {
    const dm = await newUser('DM');
    const client = await server.connectAndAuth(dm.cookie, campaignId);
    const socket = serverEnd(client);
    socket.conn.transport.writable = false;
    const bytes = () => outgoingQueueOf(socket.id)?.bytes ?? 0;

    client.emit('walls:request', { mapId });
    await settle(() => bytes() > 0);
    const one = bytes();
    for (let i = 0; i < 4; i += 1) client.emit('walls:request', { mapId });
    await sleep(500);

    expect(bytes()).toBe(one);
    client.disconnect();
  });

  it('keeps an earlier state that something else was queued after, so the two arrive in order', async () => {
    const dm = await newUser('DM');
    const client = await server.connectAndAuth(dm.cookie, campaignId);
    const socket = serverEnd(client);
    socket.conn.transport.writable = false;
    const bytes = () => outgoingQueueOf(socket.id)?.bytes ?? 0;

    client.emit('walls:request', { mapId });
    await settle(() => bytes() > 0);
    const one = bytes();
    socket.emit('probe-reply', 'between');
    client.emit('walls:request', { mapId });
    await settle(() => bytes() >= 2 * one);

    expect(bytes()).toBeGreaterThanOrEqual(2 * one);
    client.disconnect();
  });
});

describe('a page joining again after a flood', () => {
  it('is never refused its join by the budget of events a socket may send', async () => {
    const player = await newUser('PLAYER');
    const client = await server.connectClient(player.cookie);
    for (let i = 0; i < 2 * SOCKET_EVENTS_PER_SECOND; i += 1) client.emit('probe', i);
    const joined = waitForEvent(client, 'authenticated', 5000);
    client.emit('authenticate', { campaignId });
    await expect(joined).resolves.toBeDefined();
    client.disconnect();
  });

  it('exempts from the budget the join and every request a page sends to load the map', () => {
    const handlers = path.resolve(__dirname, '../handlers');
    const requested = new Set<string>();
    for (const file of [...fs.readdirSync(handlers).map((f) => path.join(handlers, f)), path.resolve(__dirname, '../events.ts')]) {
      if (!file.endsWith('.ts')) continue;
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/stateRequestAllowed\(socket, '([^']+)'\)/g)) requested.add(m[1]);
    }
    expect([...REJOIN_EVENTS].sort()).toEqual(['authenticate', ...requested].sort());
  });
});

describe("a player's wall and light edits", () => {
  it.each([
    ['wall:add', { segment: {} }],
    ['wall:remove', { segmentId: 'none' }],
    ['walls:replace', { segments: [] }],
    ['light:add', { light: {} }],
    ['light:remove', { lightId: 'none' }],
    ['light:update', { lightId: 'none', updates: {} }],
    ['lights:replace', { lights: [] }],
  ])('%s is refused within the edit ceiling, past which nothing is sent', async (event, payload) => {
    const player = await newUser('PLAYER');
    const client = await server.connectAndAuth(player.cookie, campaignId);
    const errors = errorsTo(client);

    for (let i = 0; i < 4 * MAP_EDITS_PER_SECOND; i += 1) client.emit(event, { mapId, ...payload });
    await settle(() => errors.length >= MAP_EDITS_PER_SECOND);
    // A round trip, so everything sent before it has been answered.
    const pong = waitForEvent(client, 'pong');
    client.emit('ping');
    await pong;

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.length).toBeLessThanOrEqual(MAP_EDITS_PER_SECOND);
    expect(errors.every((message) => /^Only DMs can/.test(message))).toBe(true);
    client.disconnect();
  });
});

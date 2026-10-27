/**
 * A token update is worked out from the token as it is under the map's lock.
 *
 * The update route and the drop of a drag read the map, checked the move
 * against it and clamped it by the token's size, then took the lock and
 * merged the result into the token as it was by then. A change landing in
 * between was judged against the old token: the DM growing a token while
 * a player's move to the far column waited left it hanging off the map, and
 * metadata the DM set meanwhile was written over by a merge with the old
 * copy. The bounds, the clamp and the metadata merge are now worked out
 * under the lock, and who is told of a drop is judged by the token and the
 * map as the drop wrote them: a token the DM hid meanwhile went on reaching
 * players, and so did one on a map the DM lit meanwhile.
 *
 * Each case holds the lock, sends the update, waits until it is in line for
 * the lock (so it has read the map), changes the token and commits.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { withMapsLocked, writersWaitingFor } from '../../utils/mapTokens';
import { readTokens, toJson } from '../../utils/prisma-json';
import type { Token } from '../../websocket/shared';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let otherPlayerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;

const HERO = randomUUID();
const hero = () => ({
  id: HERO, name: 'Hero', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {}, type: 'player',
});
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const tokenUrl = () => `/api/campaigns/${campaignId}/maps/${mapId}/tokens/${HERO}`;
const storedHero = async () =>
  readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens).find((t) => t.id === HERO);

/** Until a write waits in line for the map's lock: it has read the map by then. */
async function writeWaitingForLock(): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    if (writersWaitingFor(mapId) > 0) return;
    await pause(50);
  }
  throw new Error('the write never reached the map lock');
}

/**
 * Hold the map's lock, start `write`, and once it waits for the lock run
 * `change` in the holder's transaction and commit. Resolves with what
 * `write` resolves to.
 */
async function whileWriteWaits<T>(write: () => Promise<T>, change: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const holder = withMapsLocked([mapId], async (tx) => {
    locked();
    await gate;
    await change(tx);
  });
  await holding;
  const writing = write();
  await writeWaitingForLock();
  release();
  await holder;
  return writing;
}

/** whileWriteWaits, the change being one to the token. */
function changeTokenWhileWaiting<T>(write: () => Promise<T>, change: (token: Token) => Token): Promise<T> {
  return whileWriteWaits(write, async (tx) => {
    const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const tokens = readTokens(fresh.tokens).map((t) => (t.id === HERO ? change(t) : t));
    await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
  });
}

const growToTwoByTwo = (t: Token): Token => ({ ...t, size: { width: 2, height: 2 } });

/** The events of `names` a client is sent from now on, in order. */
function recordEvents(client: ClientSocket, names: string[]): string[] {
  const seen: string[] = [];
  for (const name of names) client.on(name, () => seen.push(name));
  return seen;
}

/**
 * A round trip on the client's connection. Everything the server sent it
 * before answering arrives first, so a broadcast that reached another
 * member before this was sent has reached this client too, or never will.
 */
async function roundTrip(client: ClientSocket): Promise<void> {
  const pong = waitForEvent(client, 'pong');
  client.emit('ping');
  await pong;
}

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `tokenlock-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `tokenlock-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  const otherUser = await createTestUser({ email: `tokenlock-other-${stamp}@test.cozyvtt.local`, displayName: 'Other' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  otherPlayerId = otherUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Token lock ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherPlayerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Locked', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  player = request.agent(app);
  expect((await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.map.update({ where: { id: mapId }, data: { width: 10, height: 10, lightingEnabled: false, wallSegments: toJson([]), tokens: toJson([hero()]) } });
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, otherPlayerId]);
  await prisma.$disconnect();
});

describe('a move to the last column while the DM grows the token', () => {
  it('over REST ends one square in, so the whole token is on the map', async () => {
    const res = await changeTokenWhileWaiting(
      () => player.put(tokenUrl()).send({ position: { x: 9, y: 1 } }).then((r) => r),
      growToTwoByTwo
    );
    expect(res.status).toBe(200);
    expect((await storedHero())?.position).toEqual({ x: 8, y: 1 });
    expect((await storedHero())?.size).toEqual({ width: 2, height: 2 });
  });

  it('as the drop of a drag ends one square in, and the table is told so', async () => {
    const page: ClientSocket = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    try {
      const moved = waitForEvent<{ tokenId: string; x: number; y: number }>(page, 'token.moved');
      await changeTokenWhileWaiting(async () => { page.emit('token.move.end', { tokenId: HERO, mapId, x: 9, y: 1 }); }, growToTwoByTwo);
      expect(await moved).toEqual(expect.objectContaining({ tokenId: HERO, x: 8, y: 1 }));
      expect((await storedHero())?.position).toEqual({ x: 8, y: 1 });
    } finally {
      page.disconnect();
    }
  });
});

describe('a drop while the DM hides the token', () => {
  it('is not sent to another player, and the DM is still told', async () => {
    const page = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const other = await server.connectAndAuth(await server.loginAs(otherPlayerId), campaignId);
    const dmPage = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    try {
      const dmTold = waitForEvent<{ tokenId: string; x: number; y: number }>(dmPage, 'token.moved', 5000);
      const otherSaw = recordEvents(other, ['token.moved']);
      await changeTokenWhileWaiting(
        async () => { page.emit('token.move.end', { tokenId: HERO, mapId, x: 5, y: 1 }); },
        (t) => ({ ...t, visible: false })
      );
      expect(await dmTold).toEqual(expect.objectContaining({ tokenId: HERO, x: 5, y: 1 }));
      await roundTrip(other);
      expect(otherSaw).toEqual([]);
      expect(await storedHero()).toEqual(expect.objectContaining({ visible: false, position: { x: 5, y: 1 } }));
    } finally {
      page.disconnect();
      other.disconnect();
      dmPage.disconnect();
    }
  });
});

describe('a drop while the DM turns dynamic lighting on', () => {
  // The other player has no token, so on a lit map they are sent no other.
  it('reaches another player only as the lit map lets them see it', async () => {
    const page = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const other = await server.connectAndAuth(await server.loginAs(otherPlayerId), campaignId);
    const dmPage = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    try {
      const dmTold = waitForEvent<{ tokenId: string; x: number; y: number }>(dmPage, 'token.moved', 5000);
      const otherSaw = recordEvents(other, ['token.moved', 'token:appeared']);
      await whileWriteWaits(
        async () => { page.emit('token.move.end', { tokenId: HERO, mapId, x: 5, y: 1 }); },
        (tx) => tx.map.update({ where: { id: mapId }, data: { lightingEnabled: true } })
      );
      expect(await dmTold).toEqual(expect.objectContaining({ tokenId: HERO, x: 5, y: 1 }));
      await roundTrip(other);
      expect(otherSaw).toEqual([]);
    } finally {
      page.disconnect();
      other.disconnect();
      dmPage.disconnect();
    }
  });
});

describe('a drop while the DM closes a door on a lit map', () => {
  // A door the full height of the map at x = 250 px, between the other
  // player's token in square 1 and the drop in square 7. Everything in line
  // of sight is lit (Global Illumination), so only the door decides.
  const door = (type: 'door-open' | 'door-closed') => [{ id: randomUUID(), x1: 250, y1: 0, x2: 250, y2: 500, type }];
  const otherToken = () => ({ ...hero(), id: randomUUID(), name: 'Other', position: { x: 1, y: 1 }, controlledBy: otherPlayerId });

  it('is not sent to a player the closed door now hides it from', async () => {
    await prisma.map.update({
      where: { id: mapId },
      data: { lightingEnabled: true, globalIllumination: true, wallSegments: toJson(door('door-open')), tokens: toJson([hero(), otherToken()]) },
    });
    const page = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const other = await server.connectAndAuth(await server.loginAs(otherPlayerId), campaignId);
    const dmPage = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    try {
      const dmTold = waitForEvent<{ tokenId: string; x: number; y: number }>(dmPage, 'token.moved', 5000);
      const otherSaw = recordEvents(other, ['token.moved', 'token:appeared']);
      await whileWriteWaits(
        async () => { page.emit('token.move.end', { tokenId: HERO, mapId, x: 7, y: 1 }); },
        (tx) => tx.map.update({ where: { id: mapId }, data: { wallSegments: toJson(door('door-closed')) } })
      );
      expect(await dmTold).toEqual(expect.objectContaining({ tokenId: HERO, x: 7, y: 1 }));
      await roundTrip(other);
      expect(otherSaw).toEqual([]);
    } finally {
      page.disconnect();
      other.disconnect();
      dmPage.disconnect();
    }
  });
});

describe('a move while the DM shrinks the map', () => {
  it('over REST is refused against the map as it is then', async () => {
    let res: { status: number; body: { message?: string } } | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const holding = new Promise<void>((resolve) => { locked = resolve; });
    const holder = withMapsLocked([mapId], async (tx) => {
      locked();
      await gate;
      await tx.map.update({ where: { id: mapId }, data: { width: 5 } });
    });
    await holding;
    const writing = player.put(tokenUrl()).send({ position: { x: 7, y: 1 } }).then((r) => { res = r; });
    await writeWaitingForLock();
    release();
    await holder;
    await writing;
    expect(res?.status).toBe(400);
    expect(res?.body.message).toBe('Position must be within map bounds (0-4, 0-9)');
    expect((await storedHero())?.position).toEqual({ x: 1, y: 1 });
  });
});

describe("the DM's metadata", () => {
  it('is merged into what the token holds under the lock', async () => {
    const res = await changeTokenWhileWaiting(
      () => dm.put(tokenUrl()).send({ metadata: { later: 'b' } }).then((r) => r),
      (t) => ({ ...t, metadata: { earlier: 'a' } })
    );
    expect(res.status).toBe(200);
    expect((await storedHero())?.metadata).toEqual({ earlier: 'a', later: 'b' });
  });
});

describe('a drop whose token the DM deletes while it waits', () => {
  /** Which of `events` the client is sent first, and what it carried. */
  function firstOf(client: ClientSocket, events: string[], timeoutMs = 5000): Promise<{ event: string; data: unknown }> {
    return new Promise((resolve, reject) => {
      const handlers = events.map((event) => {
        const handler = (data: unknown) => { finish(); resolve({ event, data }); };
        client.on(event, handler);
        return { event, handler };
      });
      const timer = setTimeout(() => { finish(); reject(new Error(`none of ${events.join(', ')} within ${timeoutMs}ms`)); }, timeoutMs);
      function finish() {
        clearTimeout(timer);
        for (const { event, handler } of handlers) client.off(event, handler);
      }
    });
  }

  it('is refused, and writes nothing back', async () => {
    const page: ClientSocket = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let locked!: () => void;
      const holding = new Promise<void>((resolve) => { locked = resolve; });
      const holder = withMapsLocked([mapId], async (tx) => {
        locked();
        await gate;
        await tx.map.update({ where: { id: mapId }, data: { tokens: toJson([]) } });
      });
      await holding;
      const answer = firstOf(page, ['error', 'token.moved']);
      page.emit('token.move.end', { tokenId: HERO, mapId, x: 5, y: 1 });
      await writeWaitingForLock();
      release();
      await holder;
      expect(await answer).toEqual({ event: 'error', data: { message: 'Token not found' } });
      expect(await storedHero()).toBeUndefined();
    } finally {
      page.disconnect();
    }
  });
});

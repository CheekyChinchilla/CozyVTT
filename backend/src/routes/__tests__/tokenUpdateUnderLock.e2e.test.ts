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
 * under the lock.
 *
 * Each case holds the lock, sends the update, waits until it is in line for
 * the lock (so it has read the map), changes the token and commits.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { withMapsLocked, writersWaitingFor } from '../../utils/mapTokens';
import { readTokens, toJson } from '../../utils/prisma-json';
import type { Token } from '../../websocket/shared';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
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
 * Hold the map's lock, start `write`, and once it waits for the lock change
 * the token with `change` and commit. Resolves with what `write` resolves to.
 */
async function changeTokenWhileWaiting<T>(write: () => Promise<T>, change: (token: Token) => Token): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const holder = withMapsLocked([mapId], async (tx) => {
    locked();
    await gate;
    const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const tokens = readTokens(fresh.tokens).map((t) => (t.id === HERO ? change(t) : t));
    await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
  });
  await holding;
  const writing = write();
  await writeWaitingForLock();
  release();
  await holder;
  return writing;
}

const growToTwoByTwo = (t: Token): Token => ({ ...t, size: { width: 2, height: 2 } });

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `tokenlock-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `tokenlock-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Token lock ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
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
  await prisma.map.update({ where: { id: mapId }, data: { width: 10, height: 10, tokens: toJson([hero()]) } });
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
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

/**
 * Adding a token, a wall or a light is judged by the map as it is under the
 * map's lock.
 *
 * The three REST adds checked where the new thing may go against the map
 * they read before taking the lock, then appended it under the lock. A
 * change to the map's size landing in between moved the bound, and the add
 * was judged by the old one: a wall or light the new grid puts too far off
 * the map was stored, and a token placed past the new edge was kept there.
 * The socket wall and light adds already judged it under the lock.
 *
 * Each case holds the lock, sends the add, waits until it is in line for
 * the lock (so it has read the map), changes the map and commits.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { withMapsLocked, writersWaitingFor } from '../../utils/mapTokens';
import { readTokens } from '../../utils/prisma-json';
import { WALL_OUTSIDE_MAP_MESSAGE, LIGHT_OUTSIDE_MAP_MESSAGE } from '../../validators/maps';

jest.setTimeout(30000);

const app = createTestApp();
let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
// The adds tell open pages of each change, so they need a socket server.
let server: WsTestServer;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const base = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}`;

/** 20 by 20 squares at 50 px: walls and lights may reach 500 squares (25,000 px) past the edges. */
async function newMap(): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Shifting', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [], wallSegments: [], lights: [],
    },
  });
  return map.id;
}
const stored = (mapId: string) =>
  prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true, wallSegments: true, lights: true } });

/** Until a write waits in line for the map's lock: it has read the map by then. */
async function writeWaitingForLock(mapId: string): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    if (writersWaitingFor(mapId) > 0) return;
    await pause(50);
  }
  throw new Error('the write never reached the map lock');
}

/**
 * Hold the map's lock, send `add`, and once it waits for the lock write
 * `change` to the map and commit. Resolves with the add's answer.
 */
async function changeMapWhileWaiting(
  mapId: string,
  add: () => Promise<{ status: number; body: { message?: string; token?: { position: { x: number; y: number } } } }>,
  change: Prisma.MapUpdateInput
) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const holder = withMapsLocked([mapId], async (tx) => {
    locked();
    await gate;
    await tx.map.update({ where: { id: mapId }, data: change });
  });
  await holding;
  const answer = add();
  await writeWaitingForLock(mapId);
  release();
  await holder;
  return answer;
}

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const user = await createTestUser({ email: `addslock-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Adds under lock ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

// At x = 10,000 px a wall or light fits the margin at a 50 px grid (26,000)
// and not at a 10 px one (5,200).
describe('an add while the DM cuts the grid size from 50 to 10', () => {
  it('refuses a wall the new grid puts too far off the map', async () => {
    const mapId = await newMap();
    const res = await changeMapWhileWaiting(
      mapId,
      () => dm.post(`${base(mapId)}/walls`).send({ x1: 100, y1: 100, x2: 10000, y2: 100, type: 'wall' }).then((r) => r),
      { gridSize: 10 }
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(WALL_OUTSIDE_MAP_MESSAGE);
    expect((await stored(mapId)).wallSegments).toEqual([]);
  });

  it('refuses a light the new grid puts too far off the map', async () => {
    const mapId = await newMap();
    const res = await changeMapWhileWaiting(
      mapId,
      () => dm.post(`${base(mapId)}/lights`).send({ x: 10000, y: 100, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true }).then((r) => r),
      { gridSize: 10 }
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(LIGHT_OUTSIDE_MAP_MESSAGE);
    expect((await stored(mapId)).lights).toEqual([]);
  });
});

describe('a token added while the DM narrows the map from 20 squares to 5', () => {
  it('is refused past the new edge', async () => {
    const mapId = await newMap();
    const res = await changeMapWhileWaiting(
      mapId,
      () => dm.post(`${base(mapId)}/tokens`).send({ name: 'Ogre', position: { x: 12, y: 1 } }).then((r) => r),
      { width: 5 }
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Token position must be within map bounds (0-4, 0-19)');
    expect(readTokens((await stored(mapId)).tokens)).toEqual([]);
  });

  it('is kept whole on the map as it is then', async () => {
    const mapId = await newMap();
    const res = await changeMapWhileWaiting(
      mapId,
      () => dm.post(`${base(mapId)}/tokens`).send({ name: 'Ogre', position: { x: 4, y: 1 }, size: { width: 2, height: 2 } }).then((r) => r),
      { width: 5 }
    );
    expect(res.status).toBe(201);
    expect(res.body.token?.position).toEqual({ x: 3, y: 1 });
    expect(readTokens((await stored(mapId)).tokens).map((t) => t.position)).toEqual([{ x: 3, y: 1 }]);
  });
});

/**
 * Walls, doors and lights stay on the picture when a map is resized.
 *
 * The picture is drawn across the map's width and height in squares at its
 * grid size, and walls and lights are stored in map pixels. Changing the
 * grid size, the width or the height stretched the picture and left every
 * wall, door and light where it was, so none lined up with the art any more.
 * They now scale with the picture, each axis by its own change. Light radii
 * are in squares and tokens in squares, so neither moves.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { toJson } from '../../utils/prisma-json';
import { withMapsLocked, writersWaitingFor } from '../../utils/mapTokens';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const app = createTestApp();
let dmId: string;
let campaignId: string;
let agent: ReturnType<typeof request.agent>;
let server: WsTestServer;

const WALL = { id: 'w1', x1: 100, y1: 200, x2: 300, y2: 200, type: 'door-closed' };
const LAMP = { id: 'l1', x: 150, y: 250, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true };

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dm = await createTestUser({ email: `resize-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  dmId = dm.id;
  campaignId = (await createTestCampaign(dmId, { name: `Resize ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

async function newMap(): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Hall', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 10, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson([WALL]), lights: toJson([LAMP]),
    },
  });
  return map.id;
}

const edit = (mapId: string, body: Record<string, unknown>) =>
  agent.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send(body);
const stored = async (mapId: string) => {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
  return { walls: map.wallSegments as unknown as typeof WALL[], lights: map.lights as unknown as typeof LAMP[] };
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Until `count` edits wait in line for the map's lock. Each has read the map
 * before the lock by then; a slow machine only waits longer.
 */
async function editsWaiting(mapId: string, count: number): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    if (writersWaitingFor(mapId) >= count) return;
    await pause(50);
  }
  throw new Error(`fewer than ${count} edits reached the map lock`);
}

/**
 * Send `bodies` one after another while the map's lock is held, each once
 * the one before it waits for the lock, then release it: every edit reads
 * the map as it was before any of them, and they write in the order sent.
 */
async function editsQueuedBehindLock(mapId: string, bodies: Array<Record<string, unknown>>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const holder = withMapsLocked([mapId], async () => { locked(); await gate; });
  await holding;
  const answers: Array<Promise<{ status: number }>> = [];
  for (const body of bodies) {
    answers.push(edit(mapId, body).then((res) => res));
    await editsWaiting(mapId, answers.length);
  }
  release();
  await holder;
  return Promise.all(answers);
}

describe('resizing a map', () => {
  it('scales walls and lights with the grid size', async () => {
    const mapId = await newMap();
    expect((await edit(mapId, { gridSize: 100 })).status).toBe(200);
    const { walls, lights } = await stored(mapId);
    expect(walls).toEqual([{ ...WALL, x1: 200, y1: 400, x2: 600, y2: 400 }]);
    expect(lights).toEqual([{ ...LAMP, x: 300, y: 500 }]);
  });

  it('scales each axis by its own change when only the width changes', async () => {
    const mapId = await newMap();
    expect((await edit(mapId, { width: 40 })).status).toBe(200);
    const { walls, lights } = await stored(mapId);
    expect(walls).toEqual([{ ...WALL, x1: 200, x2: 600 }]);
    expect(lights).toEqual([{ ...LAMP, x: 300 }]);
  });

  it('leaves walls and lights alone for any other change', async () => {
    const mapId = await newMap();
    expect((await edit(mapId, { name: 'Great Hall', feetPerSquare: 10 })).status).toBe(200);
    expect(await stored(mapId)).toEqual({ walls: [WALL], lights: [LAMP] });
  });
});

// Each edit took its scale from the map it read before taking the lock, so
// two that overlapped both scaled from the old grid.
describe('two edits at once', () => {
  it('scale walls and lights once when both set the same new grid size', async () => {
    const mapId = await newMap();
    const answers = await editsQueuedBehindLock(mapId, [{ gridSize: 100 }, { gridSize: 100 }]);
    expect(answers.map((res) => res.status)).toEqual([200, 200]);
    const { walls, lights } = await stored(mapId);
    expect(walls).toEqual([{ ...WALL, x1: 200, y1: 400, x2: 600, y2: 400 }]);
    expect(lights).toEqual([{ ...LAMP, x: 300, y: 500 }]);
  });

  // Edit Map sends every field, so a form opened before another edit sends
  // the old grid size back as if unchanged.
  it('put walls and lights back where they began when the second sends the old grid size', async () => {
    const mapId = await newMap();
    const answers = await editsQueuedBehindLock(mapId, [{ gridSize: 100 }, { name: 'Hall', gridSize: 50 }]);
    expect(answers.map((res) => res.status)).toEqual([200, 200]);
    expect((await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).gridSize).toBe(50);
    expect(await stored(mapId)).toEqual({ walls: [WALL], lights: [LAMP] });
  });
});

describe('a page open on the map', () => {
  // The page held its walls and lights from when it loaded them; a resize
  // left it drawing them where they were, and its next bulk wall edit would
  // have put them back there.
  it('is sent the moved walls and lights', async () => {
    const mapId = await newMap();
    const page = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    try {
      const walls = waitForEvent<{ mapId: string; segments: typeof WALL[] }>(page, 'walls:replaced');
      const lights = waitForEvent<{ mapId: string; lights: typeof LAMP[] }>(page, 'lights:replaced');
      expect((await edit(mapId, { gridSize: 100 })).status).toBe(200);
      expect((await walls).segments).toEqual([{ ...WALL, x1: 200, y1: 400, x2: 600, y2: 400 }]);
      expect((await lights).lights).toEqual([{ ...LAMP, x: 300, y: 500 }]);
    } finally {
      page.disconnect();
    }
  });
});

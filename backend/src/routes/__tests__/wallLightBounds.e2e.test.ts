/**
 * Where walls and lights may be put.
 *
 * Their coordinates were any number at all. Sight on a map with more than
 * 200 walls walks a grid over every wall's extent, so one wall reaching ten
 * million pixels froze the server. Walls and lights are now held to two
 * bounds: no coordinate past 250,000 pixels either way (a 500-square map at a
 * 500-pixel grid), and nothing more than 500 squares outside the map it is on.
 * The second is generous on purpose: a Universal VTT export can carry walls
 * well outside its picture, and a DM can draw past the edge.
 *
 * A wall or light already stored outside the map, before these bounds, is
 * left alone: a whole-list save that sends it back unchanged is accepted.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(async (buffer: Buffer) =>
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? { ext: 'png', mime: 'image/png' }
      : undefined
  ),
  fileTypeFromFile: jest.fn(async () => undefined),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

const app = createTestApp();

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
// The wall and light routes tell open pages of each change, so they need a
// socket server to tell.
let server: WsTestServer;

// 20 by 20 squares at 50 px: the map is 1,000 px square, and walls may reach
// 500 squares (25,000 px) past its edges.
const FAR_OFF = 1e7;
const PAST_MARGIN = 1000 + 25000 + 50;
const JUST_OFF = 1400;

const wall = (over: Partial<{ id: string; x1: number; y1: number; x2: number; y2: number; type: string }> = {}) => ({
  id: randomUUID(), x1: 100, y1: 100, x2: 300, y2: 100, type: 'wall', ...over,
});
const light = (over: Partial<{ id: string; x: number; y: number }> = {}) => ({
  id: randomUUID(), x: 500, y: 500, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true, ...over,
});

async function newMap(data: { wallSegments?: unknown[]; lights?: unknown[] } = {}) {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Bounds', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(data.wallSegments ?? []), lights: toJson(data.lights ?? []),
    },
  });
  return map.id;
}
const stored = async (mapId: string) => prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true } });
const base = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}`;

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `wallbounds-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Wall bounds ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

describe('walls', () => {
  it.each([['ten million pixels away', FAR_OFF], ['more than 500 squares off the map', PAST_MARGIN]])(
    'POST refuses a wall reaching %s, and stores nothing',
    async (_label, x2) => {
      const mapId = await newMap();

      const res = await dm.post(`${base(mapId)}/walls`).send(wall({ x2, y2: x2 }));

      expect(res.status).toBe(400);
      expect((await stored(mapId)).wallSegments).toEqual([]);
    }
  );

  it('POST takes a wall drawn a little past the edge', async () => {
    const mapId = await newMap();

    expect((await dm.post(`${base(mapId)}/walls`).send(wall({ x2: JUST_OFF }))).status).toBe(201);
  });

  it('PUT refuses a list with one wall out of bounds, and stores nothing', async () => {
    const mapId = await newMap();

    const res = await dm.put(`${base(mapId)}/walls`).send({ segments: [wall(), wall({ x1: -FAR_OFF })] });

    expect(res.status).toBe(400);
    expect((await stored(mapId)).wallSegments).toEqual([]);
  });

  it('PUT keeps a wall stored outside the bounds before they existed, sent back unchanged', async () => {
    const legacy = wall({ x2: PAST_MARGIN });
    const mapId = await newMap({ wallSegments: [legacy] });

    const res = await dm.put(`${base(mapId)}/walls`).send({ segments: [legacy, wall()] });

    expect(res.status).toBe(200);
    expect((await stored(mapId)).wallSegments).toHaveLength(2);
  });

  it('PUT refuses that wall moved somewhere else outside the bounds', async () => {
    const legacy = wall({ x2: PAST_MARGIN });
    const mapId = await newMap({ wallSegments: [legacy] });

    const res = await dm.put(`${base(mapId)}/walls`).send({ segments: [{ ...legacy, y2: PAST_MARGIN }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too far outside the map/);
  });
});

describe('lights', () => {
  it.each([['ten million pixels away', FAR_OFF], ['more than 500 squares off the map', PAST_MARGIN]])(
    'POST refuses a light %s',
    async (_label, x) => {
      const mapId = await newMap();

      expect((await dm.post(`${base(mapId)}/lights`).send(light({ x }))).status).toBe(400);
      expect((await stored(mapId)).lights).toEqual([]);
    }
  );

  it('PUT refuses a list with a light out of bounds', async () => {
    const mapId = await newMap();

    expect((await dm.put(`${base(mapId)}/lights`).send({ lights: [light(), light({ y: PAST_MARGIN })] })).status).toBe(400);
  });

  it('PUT keeps a light stored outside the bounds, sent back unchanged', async () => {
    const legacy = light({ x: PAST_MARGIN });
    const mapId = await newMap({ lights: [legacy] });

    expect((await dm.put(`${base(mapId)}/lights`).send({ lights: [legacy, light()] })).status).toBe(200);
  });

  it.each([['ten million pixels away', FAR_OFF], ['more than 500 squares off the map', PAST_MARGIN]])(
    'PATCH refuses moving a light %s',
    async (_label, x) => {
      const existing = light();
      const mapId = await newMap({ lights: [existing] });

      const res = await dm.patch(`${base(mapId)}/lights/${existing.id}`).send({ x });

      expect(res.status).toBe(400);
      expect((await stored(mapId)).lights).toEqual([existing]);
    }
  );
});

describe('Universal VTT import', () => {
  const file = (lineOfSight: Array<Array<{ x: number; y: number }>>) =>
    Buffer.from(JSON.stringify({
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
      line_of_sight: lineOfSight,
      portals: [],
      lights: [],
      image: PNG_BASE64,
    }));

  it('refuses a file with walls more than 500 squares outside its map, and saves nothing', async () => {
    const before = await prisma.asset.count({ where: { campaignId } });

    const res = await dm
      .post(`/api/campaigns/${campaignId}/maps/import-uvtt`)
      .attach('file', file([[{ x: 1, y: 1 }, { x: 2, y: 1 }], [{ x: 600, y: 1 }, { x: 601, y: 1 }]]), 'far.uvtt')
      .field('confirm', 'true');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/outside its map/);
    expect(await prisma.asset.count({ where: { campaignId } })).toBe(before);
  });

  it('still imports walls a little outside the picture, as a cropped export has', async () => {
    const res = await dm
      .post(`/api/campaigns/${campaignId}/maps/import-uvtt`)
      .attach('file', file([[{ x: 1, y: 1 }, { x: 2, y: 1 }], [{ x: 30, y: 1 }, { x: 31, y: 1 }]]), 'cropped.uvtt')
      .field('confirm', 'true');

    expect(res.status).toBe(201);
    expect(res.body.totalSegments).toBe(2);
  });
});

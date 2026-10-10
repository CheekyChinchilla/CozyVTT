/**
 * Wall and light ids are unique within their map.
 *
 * The routes kept whatever id a caller sent and never checked it against the
 * list. Two walls with one id broke sight on a map of more than 200 walls,
 * which takes its candidates from a grid that de-duplicated by id, so players
 * saw through the second; deleting removed both and an edit changed only the
 * first. A list with a repeated id, or an add naming an id already on the
 * map, is now refused.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

const wall = (id = randomUUID(), x = 100) => ({ id, x1: x, y1: 100, x2: x + 100, y2: 100, type: 'wall' });
const light = (id = randomUUID(), x = 500) => ({ id, x, y: 500, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true });

async function newMap(data: { wallSegments?: unknown[]; lights?: unknown[] } = {}): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Ids', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(data.wallSegments ?? []), lights: toJson(data.lights ?? []),
    },
  });
  return map.id;
}
const base = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}`;
const stored = (mapId: string) => prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true } });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `wallids-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Wall ids ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

it('PUT /walls refuses a list that repeats an id, and stores nothing', async () => {
  const mapId = await newMap();
  const id = randomUUID();

  const res = await dm.put(`${base(mapId)}/walls`).send({ segments: [wall(id), wall(id, 400)] });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/same id/);
  expect((await stored(mapId)).wallSegments).toEqual([]);
});

it('POST /walls refuses an id already on the map', async () => {
  const existing = wall();
  const mapId = await newMap({ wallSegments: [existing] });

  const res = await dm.post(`${base(mapId)}/walls`).send(wall(existing.id, 400));

  expect(res.status).toBe(400);
  expect((await stored(mapId)).wallSegments).toEqual([existing]);
});

it('PUT /lights refuses a list that repeats an id', async () => {
  const mapId = await newMap();
  const id = randomUUID();

  const res = await dm.put(`${base(mapId)}/lights`).send({ lights: [light(id), light(id, 700)] });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/same id/);
});

it('POST /lights refuses an id already on the map', async () => {
  const existing = light();
  const mapId = await newMap({ lights: [existing] });

  expect((await dm.post(`${base(mapId)}/lights`).send(light(existing.id, 700))).status).toBe(400);
  expect((await stored(mapId)).lights).toEqual([existing]);
});

it('POST still gives a wall or light sent without an id a fresh one', async () => {
  const mapId = await newMap({ wallSegments: [wall()], lights: [light()] });
  const { id: _w, ...newWall } = wall();
  const { id: _l, ...newLight } = light();

  expect((await dm.post(`${base(mapId)}/walls`).send(newWall)).status).toBe(201);
  expect((await dm.post(`${base(mapId)}/lights`).send(newLight)).status).toBe(201);
});

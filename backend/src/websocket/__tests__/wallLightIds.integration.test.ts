/**
 * The socket wall and light edits keep ids unique within a map, as the REST
 * routes do; see wallLightIds.e2e.test.ts.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let gmId: string;
let campaignId: string;
let gmCookie: string;

const wall = (id = randomUUID(), x = 100) => ({ id, x1: x, y1: 100, x2: x + 100, y2: 100, type: 'wall' });
const light = (id = randomUUID(), x = 500) => ({ id, x, y: 500, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true });

async function newMap(data: { wallSegments?: unknown[]; lights?: unknown[] } = {}): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Socket ids', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(data.wallSegments ?? []), lights: toJson(data.lights ?? []),
    },
  });
  return map.id;
}
const stored = (mapId: string) => prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true } });

beforeAll(async () => {
  const gm = await prisma.user.create({ data: { email: `wli-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Ids GM' } });
  gmId = gm.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Socket ids ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.create({ data: { userId: gmId, campaignId, role: 'GM', characterIds: [] } });
  server = await createWsTestServer();
  gmCookie = await server.loginAs(gmId);
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: gmId } });
  await prisma.$disconnect();
});

async function refused(event: string, payload: object, broadcast: string): Promise<void> {
  const gm = await server.connectAndAuth(gmCookie, campaignId);
  const error = waitForEvent<{ message: string }>(gm, 'error');
  const none = expectNoEvent(gm, broadcast, 500);
  gm.emit(event, payload);
  await error;
  await none;
  gm.disconnect();
}

it('wall:add refuses an id already on the map', async () => {
  const existing = wall();
  const mapId = await newMap({ wallSegments: [existing] });
  await refused('wall:add', { mapId, segment: wall(existing.id, 400) }, 'wall:added');
  expect((await stored(mapId)).wallSegments).toEqual([existing]);
});

it('walls:replace refuses a list that repeats an id', async () => {
  const mapId = await newMap();
  const id = randomUUID();
  await refused('walls:replace', { mapId, segments: [wall(id), wall(id, 400)] }, 'walls:replaced');
  expect((await stored(mapId)).wallSegments).toEqual([]);
});

it('light:add refuses an id already on the map', async () => {
  const existing = light();
  const mapId = await newMap({ lights: [existing] });
  await refused('light:add', { mapId, light: light(existing.id, 700) }, 'light:added');
  expect((await stored(mapId)).lights).toEqual([existing]);
});

it('lights:replace refuses a list that repeats an id', async () => {
  const mapId = await newMap();
  const id = randomUUID();
  await refused('lights:replace', { mapId, lights: [light(id), light(id, 700)] }, 'lights:replaced');
  expect((await stored(mapId)).lights).toEqual([]);
});

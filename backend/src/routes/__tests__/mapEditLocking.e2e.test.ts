/**
 * The REST wall, light and fog routes keep every one of several edits sent at
 * once, and share the map's lock with the socket edits.
 *
 * Each route read the map's whole list (or fog grid), changed it and wrote it
 * back with no lock, so of two overlapping requests the later write dropped
 * the earlier change while both answered success.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; type: string };
type Light = { id: string; x: number; y: number; brightRadius: number; dimRadius: number; color: string; enabled: boolean };

const wall = (x: number, id = randomUUID()): Wall => ({ id, x1: x, y1: 100, x2: x + 50, y2: 100, type: 'wall' });
const light = (x: number, id = randomUUID()): Light => ({ id, x, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true });
const byId = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => a.id.localeCompare(b.id));

async function newMap(data: { wallSegments?: Wall[]; lights?: Light[]; fogEnabled?: boolean } = {}): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'REST locking', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(data.wallSegments ?? []), lights: toJson(data.lights ?? []),
      fogEnabled: data.fogEnabled ?? false,
    },
  });
  return map.id;
}
const base = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}`;
const stored = (mapId: string) =>
  prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true, fogData: true } });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `restlock-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `REST locking ${stamp}` })).id;
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

it('keeps every wall of several adds, a remove and a door toggle sent at once', async () => {
  const gone = wall(10);
  const door = { ...wall(200), type: 'door-closed' };
  const mapId = await newMap({ wallSegments: [gone, door] });
  const added = [wall(300), wall(400), wall(500)];

  const answers = await Promise.all([
    ...added.map((w) => dm.post(`${base(mapId)}/walls`).send(w)),
    dm.delete(`${base(mapId)}/walls/${gone.id}`),
    dm.patch(`${base(mapId)}/walls/${door.id}`).send({ type: 'door-open' }),
  ]);
  expect(answers.map((r) => r.status)).toEqual([201, 201, 201, 200, 200]);

  const walls = (await stored(mapId)).wallSegments as unknown as Wall[];
  expect(byId(walls)).toEqual(byId([{ ...door, type: 'door-open' }, ...added]));
});

it('keeps every light of several adds, a remove and an update sent at once', async () => {
  const gone = light(100);
  const dimmed = light(200);
  const mapId = await newMap({ lights: [gone, dimmed] });
  const added = [light(300), light(400), light(500)];

  const answers = await Promise.all([
    ...added.map((l) => dm.post(`${base(mapId)}/lights`).send(l)),
    dm.delete(`${base(mapId)}/lights/${gone.id}`),
    dm.patch(`${base(mapId)}/lights/${dimmed.id}`).send({ enabled: false }),
  ]);
  expect(answers.map((r) => r.status)).toEqual([201, 201, 201, 200, 200]);

  const lights = (await stored(mapId)).lights as unknown as Light[];
  expect(byId(lights)).toEqual(byId([{ ...dimmed, enabled: false }, ...added]));
});

it('keeps both of two fog operations sent at once', async () => {
  const mapId = await newMap({ fogEnabled: true });

  const answers = await Promise.all([
    dm.post(`${base(mapId)}/fog/operation`).send({ op: 'reveal', cells: [0, 1, 2] }),
    dm.post(`${base(mapId)}/fog/operation`).send({ op: 'reveal', cells: [40, 41, 42] }),
  ]);
  expect(answers.map((r) => r.status)).toEqual([200, 200]);

  const fog = (await stored(mapId)).fogData as unknown as { revealed: boolean[] };
  expect(fog.revealed.flatMap((v, i) => (v ? [i] : []))).toEqual([0, 1, 2, 40, 41, 42]);
});

it('keeps a wall added over REST while the page adds one over the socket', async () => {
  const mapId = await newMap();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  const socket = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const fromRest = wall(100);
  const fromSocket = wall(300);

  // Both writes are told to the map's readers, this socket among them.
  const bothAdded = new Promise<void>((resolve) => {
    let seen = 0;
    socket.on('wall:added', () => { seen += 1; if (seen === 2) resolve(); });
  });
  socket.emit('wall:add', { mapId, segment: fromSocket });
  const res = await dm.post(`${base(mapId)}/walls`).send(fromRest);
  expect(res.status).toBe(201);
  await bothAdded;

  const walls = (await stored(mapId)).wallSegments as unknown as Wall[];
  expect(byId(walls)).toEqual(byId([fromRest, fromSocket]));
  socket.disconnect();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
});

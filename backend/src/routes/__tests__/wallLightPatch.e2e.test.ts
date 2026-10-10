/**
 * The single-wall and single-light PATCH routes accept what the rest of the
 * wall and light routes accept, and refuse what they refuse.
 *
 * A light PATCH checked each radius on its own, so a patch could store a dim
 * radius smaller than the bright one, which then made the next save of the
 * whole light list fail. A wall PATCH refused the locked-door type, which
 * creating walls, saving the list and the DM's live wall edit all accept.
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

const torch = { id: randomUUID(), x: 500, y: 500, brightRadius: 4, dimRadius: 8, color: '#ffcc66', enabled: true };
const door = { id: randomUUID(), x1: 100, y1: 100, x2: 150, y2: 100, type: 'door-closed' };

async function newMap(): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Patch', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson([door]), lights: toJson([torch]),
    },
  });
  return map.id;
}
const base = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}`;
const stored = (mapId: string) => prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true } });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `patch-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Patch ${stamp}` })).id;
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

describe('PATCH /lights/:lightId', () => {
  it.each([[{ dimRadius: 2 }], [{ brightRadius: 10 }]])('refuses %j, which would leave dim smaller than bright', async (patch) => {
    const mapId = await newMap();

    const res = await dm.patch(`${base(mapId)}/lights/${torch.id}`).send(patch);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/dimRadius must be >= brightRadius/);
    expect((await stored(mapId)).lights).toEqual([torch]);
  });

  it('takes both radii changed together when the result is sound', async () => {
    const mapId = await newMap();

    const res = await dm.patch(`${base(mapId)}/lights/${torch.id}`).send({ brightRadius: 10, dimRadius: 12 });

    expect(res.status).toBe(200);
    expect(res.body.light).toMatchObject({ brightRadius: 10, dimRadius: 12 });
  });

  it('leaves the whole list saveable afterwards', async () => {
    const mapId = await newMap();
    await dm.patch(`${base(mapId)}/lights/${torch.id}`).send({ dimRadius: 2 });

    const { lights } = await stored(mapId);
    expect((await dm.put(`${base(mapId)}/lights`).send({ lights })).status).toBe(200);
  });
});

describe('PATCH /walls/:sid', () => {
  it('locks a door', async () => {
    const mapId = await newMap();

    const res = await dm.patch(`${base(mapId)}/walls/${door.id}`).send({ type: 'door-locked' });

    expect(res.status).toBe(200);
    expect(res.body.segment.type).toBe('door-locked');
  });

  it('still refuses a type no wall can have', async () => {
    const mapId = await newMap();

    expect((await dm.patch(`${base(mapId)}/walls/${door.id}`).send({ type: 'portcullis' })).status).toBe(400);
  });
});

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

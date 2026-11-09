/**
 * A map holds at most 5,000 wall segments and 200 light sources.
 *
 * The cap is checked in three places for each: the whole-list schema, the
 * REST add and the socket add. Each used to write its own number and its
 * own message, so one could change without the others. All three now take
 * both from validators/walls.ts, and these cases hold each path to the
 * message exported there.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, waitForEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { MAX_LIGHT_SOURCES, MAX_WALL_SEGMENTS, TOO_MANY_LIGHTS_MESSAGE, TOO_MANY_WALLS_MESSAGE } from '../../validators/walls';

jest.setTimeout(30000);

const app = createTestApp();
let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
let server: WsTestServer;
let page: ClientSocket;

const wall = () => ({ id: randomUUID(), x1: 100, y1: 100, x2: 300, y2: 100, type: 'wall' });
const light = () => ({ id: randomUUID(), x: 500, y: 500, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true });

/** A map already holding as many walls and lights as a map may. */
async function fullMap(): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Full', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(Array.from({ length: MAX_WALL_SEGMENTS }, wall)),
      lights: toJson(Array.from({ length: MAX_LIGHT_SOURCES }, light)),
    },
  });
  return map.id;
}
const counts = async (mapId: string) => {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true } });
  return { walls: (map.wallSegments as unknown[]).length, lights: (map.lights as unknown[]).length };
};
const base = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}`;

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const user = await createTestUser({ email: `wallcaps-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Wall caps ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
  page = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
});

afterAll(async () => {
  page?.disconnect();
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

describe('a map at its wall cap', () => {
  it('refuses a REST add with the exported message', async () => {
    const mapId = await fullMap();
    const res = await dm.post(`${base(mapId)}/walls`).send(wall());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Limit Exceeded', message: TOO_MANY_WALLS_MESSAGE });
    expect((await counts(mapId)).walls).toBe(MAX_WALL_SEGMENTS);
  });

  it('refuses a socket add with the same message', async () => {
    const mapId = await fullMap();
    const refused = waitForEvent<{ message: string }>(page, 'error');
    page.emit('wall:add', { mapId, segment: wall() });
    expect((await refused).message).toBe(TOO_MANY_WALLS_MESSAGE);
    expect((await counts(mapId)).walls).toBe(MAX_WALL_SEGMENTS);
  });

  it('refuses a whole list one over the cap with the same message', async () => {
    const mapId = await fullMap();
    const res = await dm.put(`${base(mapId)}/walls`).send({ segments: Array.from({ length: MAX_WALL_SEGMENTS + 1 }, wall) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(TOO_MANY_WALLS_MESSAGE);
  });
});

describe('a map at its light cap', () => {
  it('refuses a REST add with the exported message', async () => {
    const mapId = await fullMap();
    const res = await dm.post(`${base(mapId)}/lights`).send(light());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Limit Exceeded', message: TOO_MANY_LIGHTS_MESSAGE });
    expect((await counts(mapId)).lights).toBe(MAX_LIGHT_SOURCES);
  });

  it('refuses a socket add with the same message', async () => {
    const mapId = await fullMap();
    const refused = waitForEvent<{ message: string }>(page, 'error');
    page.emit('light:add', { mapId, light: light() });
    expect((await refused).message).toBe(TOO_MANY_LIGHTS_MESSAGE);
    expect((await counts(mapId)).lights).toBe(MAX_LIGHT_SOURCES);
  });

  it('refuses a whole list one over the cap with the same message', async () => {
    const mapId = await fullMap();
    const res = await dm.put(`${base(mapId)}/lights`).send({ lights: Array.from({ length: MAX_LIGHT_SOURCES + 1 }, light) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(TOO_MANY_LIGHTS_MESSAGE);
  });
});

describe('the messages', () => {
  it('state the caps', () => {
    expect(TOO_MANY_WALLS_MESSAGE).toBe('Maximum 5000 wall segments per map');
    expect(TOO_MANY_LIGHTS_MESSAGE).toBe('Maximum 200 light sources per map');
  });
});

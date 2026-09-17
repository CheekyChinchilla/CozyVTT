/**
 * Per-map flags over REST: defaults on create, validation on update, and the
 * one broadcast every client listens to.
 *
 * Before `fogEnabled` existed every map was fogged for players from creation
 * with no way off. Now a new map starts with fog off, the DM can set it on the
 * update route, and any flag change reaches connected clients as a single
 * `map:settings:updated` event carrying every flag.
 *
 * The REST app and the socket server are separate here, as they are in the
 * server, joined by the shared socket instance the routes broadcast through.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let assetId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = Date.now();
  const dm = await createTestUser({ email: `ms-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const player = await createTestUser({ email: `ms-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dm.id;
  playerId = player.id;
  const campaign = await createTestCampaign(dmId, { name: `Map settings ${stamp}` });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  // The create route refuses a map image the caller cannot read, so the DM owns one.
  const asset = await prisma.asset.create({
    data: {
      type: 'MAP', scope: 'USER', uploadedById: dmId,
      filename: `ms-${stamp}.png`, originalName: 'map.png', mimeType: 'image/png',
      fileSize: 1, filePath: `maps/ms-${stamp}.png`, name: 'map',
    },
  });
  assetId = asset.id;

  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.asset.deleteMany({ where: { id: assetId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

async function createMap(): Promise<{ id: string; fogEnabled: boolean; lightingEnabled: boolean }> {
  const res = await agent
    .post(`/api/campaigns/${campaignId}/maps`)
    .send({ name: `Map ${randomUUID().slice(0, 8)}`, imageUrl: assetId, width: 10, height: 10 });
  expect(res.status).toBe(201);
  return res.body.map;
}

describe('creating a map', () => {
  it('starts with fog and dynamic lighting off', async () => {
    const map = await createMap();
    expect(map.fogEnabled).toBe(false);
    expect(map.lightingEnabled).toBe(false);
  });

  it('is listed with its flags', async () => {
    const map = await createMap();
    const res = await agent.get(`/api/campaigns/${campaignId}/maps`);
    expect(res.status).toBe(200);
    const listed = (res.body.maps as Array<{ id: string; fogEnabled: boolean }>).find((m) => m.id === map.id);
    expect(listed?.fogEnabled).toBe(false);
  });
});

describe('updating the flags', () => {
  it('refuses a fogEnabled that is not a boolean', async () => {
    const map = await createMap();
    const res = await agent.put(`/api/campaigns/${campaignId}/maps/${map.id}`).send({ fogEnabled: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fogEnabled/);
  });

  it('stores the change and tells every client about every flag at once', async () => {
    const map = await createMap();
    const playerCookie = await server.loginAs(playerId);
    const client = await server.connectAndAuth(playerCookie, campaignId);

    const seen = waitForEvent<{ mapId: string; lightingEnabled: boolean; fogEnabled: boolean }>(client, 'map:settings:updated');
    const res = await agent.put(`/api/campaigns/${campaignId}/maps/${map.id}`).send({ fogEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body.map.fogEnabled).toBe(true);

    expect(await seen).toEqual({ mapId: map.id, lightingEnabled: false, fogEnabled: true });
    const stored = await prisma.map.findUniqueOrThrow({ where: { id: map.id }, select: { fogEnabled: true } });
    expect(stored.fogEnabled).toBe(true);
    client.disconnect();
  });

  it('the lighting toggle route reports both flags too', async () => {
    const map = await createMap();
    const playerCookie = await server.loginAs(playerId);
    const client = await server.connectAndAuth(playerCookie, campaignId);

    const seen = waitForEvent<{ mapId: string; lightingEnabled: boolean; fogEnabled: boolean }>(client, 'map:settings:updated');
    const res = await agent.put(`/api/campaigns/${campaignId}/maps/${map.id}/lighting`).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(await seen).toEqual({ mapId: map.id, lightingEnabled: true, fogEnabled: false });
    client.disconnect();
  });
});

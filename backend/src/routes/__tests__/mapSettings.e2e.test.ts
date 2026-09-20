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
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';

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

async function createMap(): Promise<{ id: string; fogEnabled: boolean; lightingEnabled: boolean; globalIllumination: boolean; explorationEnabled: boolean }> {
  const res = await agent
    .post(`/api/campaigns/${campaignId}/maps`)
    .send({ name: `Map ${randomUUID().slice(0, 8)}`, imageUrl: assetId, width: 10, height: 10 });
  expect(res.status).toBe(201);
  return res.body.map;
}

describe('creating a map', () => {
  it('starts with fog, dynamic lighting, global illumination and explored memory off', async () => {
    const map = await createMap();
    expect(map.fogEnabled).toBe(false);
    expect(map.lightingEnabled).toBe(false);
    expect(map.globalIllumination).toBe(false);
    expect(map.explorationEnabled).toBe(false);
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
  it.each([['fogEnabled'], ['globalIllumination'], ['lightingEnabled'], ['explorationEnabled']])('refuses a %s that is not a boolean', async (flag) => {
    const map = await createMap();
    const res = await agent.put(`/api/campaigns/${campaignId}/maps/${map.id}`).send({ [flag]: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(flag);
  });

  it('stores the change and tells every client about every flag at once', async () => {
    const map = await createMap();
    const playerCookie = await server.loginAs(playerId);
    const client = await server.connectAndAuth(playerCookie, campaignId);

    const seen = waitForEvent<{ mapId: string; lightingEnabled: boolean; fogEnabled: boolean; globalIllumination: boolean; explorationEnabled: boolean }>(client, 'map:settings:updated');
    const res = await agent.put(`/api/campaigns/${campaignId}/maps/${map.id}`).send({ fogEnabled: true, globalIllumination: true });
    expect(res.status).toBe(200);
    expect(res.body.map.fogEnabled).toBe(true);
    expect(res.body.map.globalIllumination).toBe(true);

    expect(await seen).toEqual({ mapId: map.id, lightingEnabled: false, fogEnabled: true, globalIllumination: true, explorationEnabled: false });
    const stored = await prisma.map.findUniqueOrThrow({ where: { id: map.id }, select: { fogEnabled: true } });
    expect(stored.fogEnabled).toBe(true);
    client.disconnect();
  });

  it('the lighting toggle route reports both flags too', async () => {
    const map = await createMap();
    const playerCookie = await server.loginAs(playerId);
    const client = await server.connectAndAuth(playerCookie, campaignId);

    const seen = waitForEvent<{ mapId: string; lightingEnabled: boolean; fogEnabled: boolean; globalIllumination: boolean; explorationEnabled: boolean }>(client, 'map:settings:updated');
    const res = await agent.put(`/api/campaigns/${campaignId}/maps/${map.id}/lighting`).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(await seen).toEqual({ mapId: map.id, lightingEnabled: true, fogEnabled: false, globalIllumination: false, explorationEnabled: false });
    client.disconnect();
  });
});

describe('a change that alters what players can see', () => {
  const HERO = 'aaaaaaaa-0000-4000-8000-000000000001';
  const GOBLIN = 'aaaaaaaa-0000-4000-8000-000000000002';
  type Resync = { mapId: string; mapData: { tokens: Array<{ name: string }> } };
  const names = (r: Resync) => r.mapData.tokens.map((t) => t.name).sort();

  /**
   * A lit map with no lights and no walls. The hero has no darkvision, so
   * the goblin across the map is in line of sight but dark: sent only when
   * Global Illumination is on or lighting is off altogether.
   */
  async function createLitMap(current = true): Promise<string> {
    const map = await createMap();
    const base = { imageUrl: '', size: { width: 1, height: 1 }, visible: true, rotation: 0, conditions: [] as string[], metadata: {} as Record<string, unknown>, layer: 'token' };
    await prisma.map.update({
      where: { id: map.id },
      data: {
        lightingEnabled: true,
        tokens: toJson([
          { ...base, id: HERO, name: 'Hero', type: 'player', position: { x: 1, y: 1 }, controlledBy: playerId, sightRadius: 0 },
          { ...base, id: GOBLIN, name: 'Goblin', type: 'npc', position: { x: 8, y: 8 }, controlledBy: null },
        ]),
      },
    });
    // The re-send is for the map the table is on; a map being edited in the
    // library is nobody's canvas.
    if (current) await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
    return map.id;
  }

  it('re-sends each player the map as they can now see it when Global Illumination changes', async () => {
    const mapId = await createLitMap();
    const client = await server.connectAndAuth(await server.loginAs(playerId), campaignId);

    const lit = waitForEvent<Resync>(client, 'map.changed');
    expect((await agent.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ globalIllumination: true })).status).toBe(200);
    expect(names(await lit)).toEqual(['Goblin', 'Hero']);

    const dark = waitForEvent<Resync>(client, 'map.changed');
    expect((await agent.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ globalIllumination: false })).status).toBe(200);
    expect(names(await dark)).toEqual(['Hero']);
    client.disconnect();
  });

  it('the lighting toggle route re-sends too', async () => {
    const mapId = await createLitMap();
    const client = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const all = waitForEvent<Resync>(client, 'map.changed');
    expect((await agent.put(`/api/campaigns/${campaignId}/maps/${mapId}/lighting`).send({ enabled: false })).status).toBe(200);
    expect(names(await all)).toEqual(['Goblin', 'Hero']);
    client.disconnect();
  });

  it('a change to a map the table is not on sends the flags and nothing more', async () => {
    const current = await createLitMap();
    const other = await createLitMap(false);
    const client = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const flags = waitForEvent<{ mapId: string }>(client, 'map:settings:updated');
    const quiet = expectNoEvent(client, 'map.changed', 500);
    expect((await agent.put(`/api/campaigns/${campaignId}/maps/${other}`).send({ globalIllumination: true })).status).toBe(200);
    expect((await flags).mapId).toBe(other);
    await quiet;
    expect(current).not.toBe(other);
    client.disconnect();
  });

  it('a change that leaves sight alone sends the flags and nothing more', async () => {
    const mapId = await createLitMap();
    const client = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const flags = waitForEvent(client, 'map:settings:updated');
    const quiet = expectNoEvent(client, 'map.changed', 500);
    // Global Illumination is already off, so naming it changes nothing.
    expect((await agent.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ fogEnabled: true, explorationEnabled: true, globalIllumination: false })).status).toBe(200);
    await flags;
    await quiet;
    client.disconnect();
  });
});

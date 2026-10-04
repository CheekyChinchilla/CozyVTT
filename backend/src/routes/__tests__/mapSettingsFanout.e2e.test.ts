/**
 * A map setting that has been saved is not reported as failed because
 * telling the table about it failed.
 *
 * Switching lighting or Global Illumination re-sends the map to the table
 * when it is the map on screen, which first reads the campaign. That read
 * sat outside the guard around the re-send, so an error there answered the
 * DM 500 "Failed to update map" for a change that had been saved.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { prisma as appPrisma } from '../../config/database';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `mapset-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  dmId = dmUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Map settings ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Settings', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [], lightingEnabled: false },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterEach(() => { jest.restoreAllMocks(); });

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  await appPrisma.$disconnect();
});

/** Fail every read of the campaign's current map, the one the re-send makes, on the app's client. */
function failCurrentMapReads() {
  const original = appPrisma.campaign.findUnique.bind(appPrisma.campaign);
  jest.spyOn(appPrisma.campaign, 'findUnique').mockImplementation(((args: { select?: { currentMapId?: boolean } }) =>
    args?.select?.currentMapId ? Promise.reject(new Error('database went away')) : original(args as never)) as never);
}

it.each([
  ['the map update', (on: boolean) => dm.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ lightingEnabled: on })],
  ['the lighting switch', (on: boolean) => dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/lighting`).send({ enabled: on })],
])('%s answers 200 for a saved change when re-sending the map fails', async (_route, send) => {
  const before = (await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { lightingEnabled: true } })).lightingEnabled;
  failCurrentMapReads();
  const res = await send(!before);
  expect(res.status).toBe(200);
  const after = (await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { lightingEnabled: true } })).lightingEnabled;
  expect(after).toBe(!before);
});

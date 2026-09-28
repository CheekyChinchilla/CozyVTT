/**
 * A light added through the API shows a creature to a player at once, as one
 * added on the live connection does (see sightResend.integration.test.ts).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';

jest.setTimeout(20000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;

const token = (id: string, x: number, y: number, controlledBy: string | null) => ({
  id, name: id, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 }, layer: 'token', visible: true,
  controlledBy, rotation: 0, conditions: [], metadata: {}, type: controlledBy ? 'player' : 'npc', sightRadius: 0,
});

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `sightrest-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `sightrest-p-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Sight over REST ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Dark field', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, annotations: [], lightingEnabled: true, globalIllumination: false,
      tokens: toJson([token('hero', 2, 2, playerId), token('goblin', 8, 2, null)]), wallSegments: toJson([]), lights: toJson([]),
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it('sends a player the creature a light added through the API reveals', async () => {
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const shown = new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no map.changed with the goblin')), 4000);
    player.on('map.changed', (e: { mapData: { tokens: { id: string }[] } }) => {
      const ids = e.mapData.tokens.map((t) => t.id);
      if (ids.includes('goblin')) { clearTimeout(timer); resolve(ids); }
    });
  });

  const res = await dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/lights`)
    .send({ id: randomUUID(), x: 425, y: 875, brightRadius: 2, dimRadius: 4, color: '#ffaa33', enabled: true });
  expect(res.status).toBeLessThan(300);
  expect(await shown).toEqual(expect.arrayContaining(['hero', 'goblin']));
  player.disconnect();
});

/**
 * A stroke being drawn follows the campaign's map switch at once.
 *
 * The server decides once a second, at most, for each stroke whether its
 * frames go on and who may read the map; that decision included which map
 * the campaign was showing. For up to a second after the DM switched the
 * table to another map, a stroke under way on the old one, now a prepared
 * map, still reached the players. A switch makes every stroke be decided
 * again on its next frame.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let nextId: string;
let dmRest: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `preview-switch-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `preview-switch-p-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Preview switch ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = (name: string) => prisma.map.create({
    data: { campaignId, name, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, tokens: [], annotations: [] },
  });
  shownId = (await map('Shown')).id;
  nextId = (await map('Next')).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId, status: 'ACTIVE' } });
  dmRest = request.agent(app);
  expect((await dmRest.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it('stops a stroke on the old map reaching players as soon as the table switches maps', async () => {
  const dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const frame = (x: number) => ({ mapId: shownId, preview: { previewId: 'stroke-1', kind: 'pen', color: '#3d8bd9', width: 3, points: [[x, x]] } });

  const first = waitForEvent(player, 'drawing:previewed');
  dm.emit('drawing:preview', frame(1));
  await first;

  const switched = waitForEvent(player, 'map.changed');
  expect((await dmRest.put(`/api/campaigns/${campaignId}/maps/${nextId}/set-current`)).status).toBe(200);
  await switched;
  const quiet = expectNoEvent(player, 'drawing:previewed', 600);
  dm.emit('drawing:preview', frame(2));
  await quiet;

  dm.disconnect();
  player.disconnect();
});

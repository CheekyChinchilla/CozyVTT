/**
 * A wall changed over the API reaches the open pages, as a light does.
 *
 * The REST wall routes stored the change and told nobody, so a page kept its
 * old walls (and, on a lit map, its old sight) until it fetched the map
 * again. They now send the same events as the socket wall edits, through
 * the same rule: everyone for the map on screen, the DM for a prepared one.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;
const wall = () => ({ id: randomUUID(), x1: 0, y1: 0, x2: 50, y2: 0, type: 'wall' });

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `wallrest-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `wallrest-p-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Wall REST ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Walls', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it('tells an open page of every wall change made over the API', async () => {
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const base = `/api/campaigns/${campaignId}/maps/${mapId}/walls`;
  const first = wall();

  const added = waitForEvent<{ mapId: string; segment: { id: string } }>(player, 'wall:added');
  expect((await dm.post(base).send(first)).status).toBe(201);
  expect((await added).segment.id).toBe(first.id);

  const updated = waitForEvent<{ segment: { id: string; type: string } }>(player, 'wall:updated');
  expect((await dm.patch(`${base}/${first.id}`).send({ type: 'door-closed' })).status).toBe(200);
  expect((await updated).segment).toMatchObject({ id: first.id, type: 'door-closed' });

  const removed = waitForEvent<{ segmentId: string }>(player, 'wall:removed');
  expect((await dm.delete(`${base}/${first.id}`)).status).toBe(200);
  expect((await removed).segmentId).toBe(first.id);

  const replaced = waitForEvent<{ segments: unknown[] }>(player, 'walls:replaced');
  expect((await dm.put(base).send({ segments: [wall(), wall()] })).status).toBe(200);
  expect((await replaced).segments).toHaveLength(2);
  player.disconnect();
});

// The same rule as the socket edits: a map the DM is preparing is theirs
// alone, so its walls reach the DM's pages and no player's.
it("tells only the DM's pages of a wall added to a prepared map", async () => {
  const preparedId = (await prisma.map.create({
    data: { campaignId, name: 'Prepared', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  })).id;
  try {
    const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const dmPage = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    const quiet = expectNoEvent(player, 'wall:added', 800);
    const toDm = waitForEvent<{ mapId: string }>(dmPage, 'wall:added');
    expect((await dm.post(`/api/campaigns/${campaignId}/maps/${preparedId}/walls`).send(wall())).status).toBe(201);
    expect((await toDm).mapId).toBe(preparedId);
    await quiet;
    player.disconnect();
    dmPage.disconnect();
  } finally {
    await prisma.map.deleteMany({ where: { id: preparedId } });
  }
});

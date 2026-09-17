/**
 * A fog operation applied over REST reaches the table like one applied over
 * the socket.
 *
 * The REST route kept its own copies of the fog helpers and told nobody what
 * it changed: a reveal made through the API landed in the database and on the
 * DM's next reload, and nowhere else. Both paths now share one implementation
 * and one broadcast, and both refuse to touch a map whose fog is off.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
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

jest.setTimeout(20000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = Date.now();
  const dm = await createTestUser({ email: `fr-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const player = await createTestUser({ email: `fr-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dm.id;
  playerId = player.id;
  const campaign = await createTestCampaign(dmId, { name: `Fog REST ${stamp}` });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Fogged', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 4, height: 4, gridSize: 50, tokens: [], annotations: [], fogEnabled: true,
    },
  });
  mapId = map.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

const operation = (body: object) => agent.post(`/api/campaigns/${campaignId}/maps/${mapId}/fog/operation`).send(body);

it('a reveal over REST is broadcast: the DM gets the grid, a player gets revealed cells', async () => {
  const dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);

  const dmSees = waitForEvent<{ mapId: string; fogState: { revealed: boolean[] } }>(dm, 'fog:updated');
  const playerSees = waitForEvent<{ mapId: string; revealedCells: number[]; fogCols: number }>(player, 'fog:cells');

  const res = await operation({ op: 'reveal', cells: [0, 1, 5] });
  expect(res.status).toBe(200);
  expect(res.body.fogState.revealed[5]).toBe(true);

  expect((await dmSees).fogState.revealed[1]).toBe(true);
  const forPlayer = await playerSees;
  expect(forPlayer.mapId).toBe(mapId);
  expect(forPlayer.revealedCells).toEqual([0, 1, 5]);
  expect(forPlayer.fogCols).toBe(4);

  dm.disconnect();
  player.disconnect();
});

it('refuses to change fog while fog is off for the map, and broadcasts nothing', async () => {
  await prisma.map.update({ where: { id: mapId }, data: { fogEnabled: false } });
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const nothing = expectNoEvent(player, 'fog:cells');

  const res = await operation({ op: 'reveal_all' });
  expect(res.status).toBe(409);
  expect(res.body.message).toMatch(/off/);
  await nothing;

  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { fogData: true } });
  expect((map.fogData as unknown as { revealed: boolean[] }).revealed.every((v) => v === true)).toBe(false);
  player.disconnect();
});

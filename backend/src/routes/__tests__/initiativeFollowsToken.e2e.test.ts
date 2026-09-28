/**
 * A token in the initiative order is re-sent to the table when the DM changes
 * it over REST, so the tracker follows the token: new hit points show, and a
 * token the DM hides leaves the players' trackers at once.
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
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { clearState } from '../../websocket/initiativeState';

jest.setTimeout(20000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;
let dmCookie: string;
let playerCookie: string;

const GOBLIN = 'goblin-in-order';
type State = { combatants: Array<{ tokenId: string; hp: { current: number; max: number; temp: number } | null }> };

beforeAll(async () => {
  const stamp = Date.now();
  const dmUser = await createTestUser({ email: `if-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `if-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  const campaign = await createTestCampaign(dmId, { name: `Initiative follows ${stamp}` });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Arena', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 8, height: 8, gridSize: 50, annotations: [],
      tokens: [{
        id: GOBLIN, name: 'Goblin', imageUrl: '', position: { x: 2, y: 2 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
        hp: { current: 7, max: 7, temp: 0 }, showHpBar: true,
      }],
    },
  });
  mapId = map.id;
  // The table is on this map; a player is sent the order for no other.
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

beforeEach(() => { clearState(campaignId); });

const update = (body: object) => dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${GOBLIN}`).send(body);

it('new hit points set over REST reach the players\' trackers without any initiative action', async () => {
  const dmSocket = await server.connectAndAuth(dmCookie, campaignId);
  const player = await server.connectAndAuth(playerCookie, campaignId);
  const added = waitForEvent<State>(player, 'initiative.state');
  dmSocket.emit('initiative.add', { tokenId: GOBLIN, mapId });
  expect((await added).combatants[0].hp).toEqual({ current: 7, max: 7, temp: 0 });

  const changed = waitForEvent<State>(player, 'initiative.state');
  expect((await update({ hp: { current: 2, max: 7, temp: 0 } })).status).toBe(200);
  expect((await changed).combatants[0].hp).toEqual({ current: 2, max: 7, temp: 0 });
  dmSocket.disconnect();
  player.disconnect();
});

it('a token the DM hides over REST leaves the players\' trackers at once', async () => {
  const dmSocket = await server.connectAndAuth(dmCookie, campaignId);
  const player = await server.connectAndAuth(playerCookie, campaignId);
  const added = waitForEvent<State>(player, 'initiative.state');
  dmSocket.emit('initiative.add', { tokenId: GOBLIN, mapId });
  expect((await added).combatants).toHaveLength(1);

  const hidden = waitForEvent<State>(player, 'initiative.state');
  expect((await update({ visible: false })).status).toBe(200);
  expect((await hidden).combatants).toHaveLength(0);
  const dmSees = waitForEvent<State>(dmSocket, 'initiative.state');
  dmSocket.emit('initiative.request_state');
  expect((await dmSees).combatants).toHaveLength(1);
  await update({ visible: true });
  dmSocket.disconnect();
  player.disconnect();
});

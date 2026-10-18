/**
 * A token created, changed or deleted over REST reaches the table.
 *
 * Only the route that moves tokens between maps sent the map again. Creating,
 * updating or deleting a token sent nothing but the initiative order; the DM's
 * page followed each call with `map.change` of its own, so a change from a
 * script, a second tab, or a player editing a token they control reached
 * nobody until something else sent the map. These routes now send each member
 * the map as they may see it, for the map the campaign is showing and no
 * other, as `map.change` does.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import type { Socket as ClientSocket } from 'socket.io-client';

jest.setTimeout(30000);

type MapChanged = { mapId: string; mapData: { tokens: Array<{ id: string; name: string; conditions?: string[] }> } };

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let preparedId: string;
let dmRest: ReturnType<typeof request.agent>;
let playerRest: ReturnType<typeof request.agent>;
let dm: ClientSocket;
let player: ClientSocket;

const token = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...extra,
});

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `tokrest-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `tokrest-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Token routes reach the table ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const base = {
    campaignId, imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 10, height: 10, gridSize: 50,
    annotations: [], fogEnabled: false, lightingEnabled: false,
  };
  shownId = (await prisma.map.create({ data: { ...base, name: 'Shown', tokens: [] } })).id;
  preparedId = (await prisma.map.create({ data: { ...base, name: 'Prepared', tokens: [] } })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId, status: 'ACTIVE' } });
  dmRest = request.agent(app);
  expect((await dmRest.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  playerRest = request.agent(app);
  expect((await playerRest.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.map.updateMany({ where: { campaignId }, data: { tokens: [] } });
  dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
});

afterEach(() => {
  dm.disconnect();
  player.disconnect();
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

const tokens = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}/tokens`;
const names = (event: MapChanged) => event.mapData.tokens.map((t) => t.name).sort();

it('sends a created token to the table, as each member may see it', async () => {
  const toPlayer = waitForEvent<MapChanged>(player, 'map.changed');
  const toDm = waitForEvent<MapChanged>(dm, 'map.changed');
  expect((await dmRest.post(tokens(shownId)).send({ name: 'Goblin', position: { x: 2, y: 2 } })).status).toBe(201);
  expect(names(await toPlayer)).toEqual(['Goblin']);
  expect(names(await toDm)).toEqual(['Goblin']);

  const hiddenToPlayer = waitForEvent<MapChanged>(player, 'map.changed');
  const hiddenToDm = waitForEvent<MapChanged>(dm, 'map.changed');
  expect((await dmRest.post(tokens(shownId)).send({ name: 'Assassin', position: { x: 3, y: 3 }, visible: false })).status).toBe(201);
  expect(names(await hiddenToPlayer)).toEqual(['Goblin']);
  expect(names(await hiddenToDm)).toEqual(['Assassin', 'Goblin']);
});

it('sends a changed token to the table, a player\'s change to their own included', async () => {
  await prisma.map.update({ where: { id: shownId }, data: { tokens: [token('hero', { controlledBy: playerId })] } });

  const renamed = waitForEvent<MapChanged>(player, 'map.changed');
  expect((await dmRest.put(`${tokens(shownId)}/hero`).send({ name: 'Brann' })).status).toBe(200);
  expect(names(await renamed)).toEqual(['Brann']);

  const toDm = waitForEvent<MapChanged>(dm, 'map.changed');
  expect((await playerRest.put(`${tokens(shownId)}/hero`).send({ conditions: ['Prone'] })).status).toBe(200);
  expect((await toDm).mapData.tokens[0].conditions).toEqual(['Prone']);
});

it('sends the table the map without a deleted token', async () => {
  await prisma.map.update({ where: { id: shownId }, data: { tokens: [token('goblin'), token('orc')] } });
  const toPlayer = waitForEvent<MapChanged>(player, 'map.changed');
  expect((await dmRest.delete(`${tokens(shownId)}/goblin`)).status).toBe(200);
  expect(names(await toPlayer)).toEqual(['orc']);
});

it('sends nothing for a map the DM has not switched to', async () => {
  const nothingToPlayer = expectNoEvent(player, 'map.changed', 500);
  const nothingToDm = expectNoEvent(dm, 'map.changed', 500);
  expect((await dmRest.post(tokens(preparedId)).send({ name: 'Ambusher', position: { x: 2, y: 2 } })).status).toBe(201);
  await nothingToPlayer;
  await nothingToDm;
});

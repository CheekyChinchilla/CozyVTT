/**
 * A token created, changed or deleted over REST reaches the table.
 *
 * Only the route that moves tokens between maps sent the map again. Creating,
 * updating or deleting a token sent nothing but the initiative order; the GM's
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
let gmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let preparedId: string;
let gmRest: ReturnType<typeof request.agent>;
let playerRest: ReturnType<typeof request.agent>;
let gm: ClientSocket;
let player: ClientSocket;

const token = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...extra,
});

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const gmUser = await createTestUser({ email: `tokrest-dm-${stamp}@test.cozyvtt.local`, displayName: 'GM' });
  const playerUser = await createTestUser({ email: `tokrest-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  gmId = gmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(gmId, { name: `Token routes reach the table ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
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
  gmRest = request.agent(app);
  expect((await gmRest.post('/api/auth/login').send({ email: gmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  playerRest = request.agent(app);
  expect((await playerRest.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.map.updateMany({ where: { campaignId }, data: { tokens: [] } });
  gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
});

afterEach(() => {
  gm.disconnect();
  player.disconnect();
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId, playerId]);
  await prisma.$disconnect();
});

const tokens = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}/tokens`;
const names = (event: MapChanged) => event.mapData.tokens.map((t) => t.name).sort();

it('sends a created token to the table, as each member may see it', async () => {
  const toPlayer = waitForEvent<MapChanged>(player, 'map.changed');
  const toGm = waitForEvent<MapChanged>(gm, 'map.changed');
  expect((await gmRest.post(tokens(shownId)).send({ name: 'Goblin', position: { x: 2, y: 2 } })).status).toBe(201);
  expect(names(await toPlayer)).toEqual(['Goblin']);
  expect(names(await toGm)).toEqual(['Goblin']);

  const hiddenToPlayer = waitForEvent<MapChanged>(player, 'map.changed');
  const hiddenToGm = waitForEvent<MapChanged>(gm, 'map.changed');
  expect((await gmRest.post(tokens(shownId)).send({ name: 'Assassin', position: { x: 3, y: 3 }, visible: false })).status).toBe(201);
  expect(names(await hiddenToPlayer)).toEqual(['Goblin']);
  expect(names(await hiddenToGm)).toEqual(['Assassin', 'Goblin']);
});

it('sends a changed token to the table, a player\'s change to their own included', async () => {
  await prisma.map.update({ where: { id: shownId }, data: { tokens: [token('hero', { controlledBy: playerId })] } });

  const renamed = waitForEvent<MapChanged>(player, 'map.changed');
  expect((await gmRest.put(`${tokens(shownId)}/hero`).send({ name: 'Corvel' })).status).toBe(200);
  expect(names(await renamed)).toEqual(['Corvel']);

  const toGm = waitForEvent<MapChanged>(gm, 'map.changed');
  expect((await playerRest.put(`${tokens(shownId)}/hero`).send({ conditions: ['Prone'] })).status).toBe(200);
  expect((await toGm).mapData.tokens[0].conditions).toEqual(['Prone']);
});

it('sends the table the map without a deleted token', async () => {
  await prisma.map.update({ where: { id: shownId }, data: { tokens: [token('goblin'), token('orc')] } });
  const toPlayer = waitForEvent<MapChanged>(player, 'map.changed');
  expect((await gmRest.delete(`${tokens(shownId)}/goblin`)).status).toBe(200);
  expect(names(await toPlayer)).toEqual(['orc']);
});

it('sends nothing for a map the GM has not switched to', async () => {
  const nothingToPlayer = expectNoEvent(player, 'map.changed', 500);
  const nothingToGm = expectNoEvent(gm, 'map.changed', 500);
  expect((await gmRest.post(tokens(preparedId)).send({ name: 'Ambusher', position: { x: 2, y: 2 } })).status).toBe(201);
  await nothingToPlayer;
  await nothingToGm;
});

it('sends nothing for a token changed or deleted on a map the GM has not switched to', async () => {
  await prisma.map.update({ where: { id: preparedId }, data: { tokens: [token('lich'), token('ghoul')] } });
  const nothingToPlayer = expectNoEvent(player, 'map.changed', 800);
  const nothingToGm = expectNoEvent(gm, 'map.changed', 800);
  expect((await gmRest.put(`${tokens(preparedId)}/lich`).send({ name: 'Lich' })).status).toBe(200);
  expect((await gmRest.delete(`${tokens(preparedId)}/ghoul`)).status).toBe(200);
  await nothingToPlayer;
  await nothingToGm;
});

it('sends the table only the map a token left when it is moved onto a map the GM has not switched to', async () => {
  await prisma.map.update({ where: { id: shownId }, data: { tokens: [token('scout'), token('guard')] } });
  const seen: string[] = [];
  player.on('map.changed', (event: MapChanged) => seen.push(event.mapId));
  const toPlayer = waitForEvent<MapChanged>(player, 'map.changed');
  const moved = await gmRest.post(`${tokens(shownId)}/move`).send({ tokenIds: ['scout'], targetMapId: preparedId });
  expect(moved.status).toBe(200);
  expect(names(await toPlayer)).toEqual(['guard']);
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(seen).not.toContain(preparedId);
});

// A player may change a token they control as often as the request limit
// lets them, and each re-send builds the map for every member, with sight on
// a lit map. The map goes at most once in a short window, read as it stands
// then, so a burst of changes reaches the table as one map carrying them all.
it('sends a burst of changes as one map carrying them all', async () => {
  const seen: MapChanged[] = [];
  player.on('map.changed', (event: MapChanged) => seen.push(event));
  const burst = ['a', 'b', 'c', 'd', 'e'];
  await Promise.all(burst.map((name) => gmRest.post(tokens(shownId)).send({ name, position: { x: 1, y: 1 } }).expect(201)));
  await new Promise((resolve) => setTimeout(resolve, 600));

  expect(seen.length).toBeGreaterThan(0);
  expect(seen.length).toBeLessThan(burst.length);
  expect(names(seen[seen.length - 1])).toEqual(burst);
});

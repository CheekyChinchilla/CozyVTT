/**
 * A map the GM is preparing is theirs alone, and so are its live edits.
 *
 * Walls, lights, fog, pings, the explored-memory reset and the map's
 * settings were broadcast to the whole campaign for any map, so a player's
 * socket was sent the layout of a map it may not fetch. They now go to
 * everyone only for the map the campaign is showing, and to the GM's sockets
 * for any other, over the socket events and the REST routes alike.
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

const app = createTestApp();
let server: WsTestServer;
let gmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let preparedId: string;
let rest: ReturnType<typeof request.agent>;
let gm: ClientSocket;
let player: ClientSocket;

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const gmUser = await createTestUser({ email: `pmb-dm-${stamp}@test.cozyvtt.local`, displayName: 'GM' });
  const playerUser = await createTestUser({ email: `pmb-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  gmId = gmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(gmId, { name: `Prepared broadcasts ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const base = {
    campaignId, imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 4, height: 4, gridSize: 50,
    tokens: [], annotations: [], fogEnabled: true, lightingEnabled: true, explorationEnabled: true,
  };
  shownId = (await prisma.map.create({ data: { ...base, name: 'Shown' } })).id;
  preparedId = (await prisma.map.create({ data: { ...base, name: 'Prepared' } })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId } });
  rest = request.agent(app);
  expect((await rest.post('/api/auth/login').send({ email: gmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
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

const wallFor = () => ({ id: randomUUID(), x1: 0, y1: 0, x2: 50, y2: 0, type: 'wall' });
const doorFor = () => ({ ...wallFor(), type: 'door-closed' });
const lightFor = () => ({ id: randomUUID(), x: 25, y: 25, brightRadius: 1, dimRadius: 2, color: '#ffcc88', enabled: true });
const maps = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}`;

/** A wall or a light already on the map, for the edits that change or remove one. */
async function withWall<T extends { id: string }>(mapId: string, segment: T): Promise<T> {
  await prisma.map.update({ where: { id: mapId }, data: { wallSegments: [segment] } });
  return segment;
}
async function withLight<T extends { id: string }>(mapId: string, light: T): Promise<T> {
  await prisma.map.update({ where: { id: mapId }, data: { lights: [light] } });
  return light;
}

/** Each source of a map's live edit: what the GM does, and what it sends. */
const SOURCES: Array<[string, string, string, (mapId: string) => Promise<unknown> | void]> = [
  ['wall:add', 'wall:added', 'GM', (mapId) => { gm.emit('wall:add', { mapId, segment: wallFor() }); }],
  ['light:add', 'light:added', 'GM', (mapId) => { gm.emit('light:add', { mapId, light: lightFor() }); }],
  ['fog:operation', 'fog:cells', 'fog:updated', (mapId) => { gm.emit('fog:operation', { mapId, operation: { op: 'reveal', cells: [0] } }); }],
  ['map.ping', 'map.pinged', 'GM', (mapId) => { gm.emit('map.ping', { mapId, x: 10, y: 10 }); }],
  ['exploration:reset', 'exploration:state', 'GM', (mapId) => { gm.emit('exploration:reset', { mapId }); }],
  ['POST lights', 'light:added', 'GM', (mapId) => rest.post(`/api/campaigns/${campaignId}/maps/${mapId}/lights`).send(lightFor())],
  ['PUT map settings', 'map:settings:updated', 'GM', (mapId) => rest.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ fogEnabled: true, globalIllumination: false })],
  ['wall:remove', 'wall:removed', 'GM', async (mapId) => {
    const wall = await withWall(mapId, wallFor());
    gm.emit('wall:remove', { mapId, segmentId: wall.id });
  }],
  ["wall:update, the GM's door", 'wall:updated', 'GM', async (mapId) => {
    const door = await withWall(mapId, doorFor());
    gm.emit('wall:update', { mapId, segment: { ...door, type: 'door-open' } });
  }],
  ['walls:replace', 'walls:replaced', 'GM', (mapId) => { gm.emit('walls:replace', { mapId, segments: [wallFor()] }); }],
  ['light:update', 'light:updated', 'GM', async (mapId) => {
    const light = await withLight(mapId, lightFor());
    gm.emit('light:update', { mapId, light: { ...light, brightRadius: 2, dimRadius: 3 } });
  }],
  ['light:remove', 'light:removed', 'GM', async (mapId) => {
    const light = await withLight(mapId, lightFor());
    gm.emit('light:remove', { mapId, lightId: light.id });
  }],
  ['lights:replace', 'lights:replaced', 'GM', (mapId) => { gm.emit('lights:replace', { mapId, lights: [lightFor()] }); }],
  ['PUT walls', 'walls:replaced', 'GM', (mapId) => rest.put(`${maps(mapId)}/walls`).send({ segments: [wallFor()] })],
  ['POST walls', 'wall:added', 'GM', (mapId) => rest.post(`${maps(mapId)}/walls`).send(wallFor())],
  ['POST walls/batch', 'walls:replaced', 'GM', (mapId) => rest.post(`${maps(mapId)}/walls/batch`).send({ segments: [wallFor()] })],
  ['PATCH walls', 'wall:updated', 'GM', async (mapId) => {
    const door = await withWall(mapId, doorFor());
    return rest.patch(`${maps(mapId)}/walls/${door.id}`).send({ type: 'door-open' });
  }],
  ['DELETE walls', 'wall:removed', 'GM', async (mapId) => {
    const wall = await withWall(mapId, wallFor());
    return rest.delete(`${maps(mapId)}/walls/${wall.id}`);
  }],
  ['PUT lighting', 'map:settings:updated', 'GM', (mapId) => rest.put(`${maps(mapId)}/lighting`).send({ enabled: true })],
];

describe.each(SOURCES)('%s', (_source, event, gmEvent, act) => {
  const gmHears = gmEvent === 'GM' ? event : gmEvent;

  it('reaches no player for a prepared map, and reaches the GM', async () => {
    const quiet = expectNoEvent(player, event, 800);
    const heard = waitForEvent<{ mapId: string }>(gm, gmHears);
    await act(preparedId);
    expect((await heard).mapId).toBe(preparedId);
    await quiet;
  });

  it('reaches a player for the map the campaign is showing', async () => {
    const heard = waitForEvent<{ mapId: string }>(player, event);
    await act(shownId);
    expect((await heard).mapId).toBe(shownId);
  });
});

// A GM's other tab showing a map being prepared was told nothing when the
// map was deleted, and every edit made there failed until a reload.
describe('deleting a map the table is not on', () => {
  it("tells the GM's sockets which map went, and no player", async () => {
    const doomed = (await prisma.map.create({
      data: {
        campaignId, name: 'Doomed', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
        width: 4, height: 4, gridSize: 50, tokens: [], annotations: [],
      },
    })).id;
    const quiet = expectNoEvent(player, 'map.deleted', 800);
    const heard = waitForEvent<{ mapId: string }>(gm, 'map.deleted');
    expect((await rest.delete(`/api/campaigns/${campaignId}/maps/${doomed}`)).status).toBe(200);
    expect((await heard).mapId).toBe(doomed);
    await quiet;
  });
});

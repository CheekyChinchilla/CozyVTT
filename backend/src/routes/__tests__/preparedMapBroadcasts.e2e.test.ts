/**
 * A map the DM is preparing is theirs alone, and so are its live edits.
 *
 * Walls, lights, fog, pings, the explored-memory reset, the DM's editing
 * notice and the map's settings were broadcast to the whole campaign for any
 * map, so a player's socket was sent the layout of a map it may not fetch.
 * They now go to everyone only for the map the campaign is showing, and to
 * the DM's sockets for any other, over the socket events and the REST routes
 * alike.
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
let dmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let preparedId: string;
let rest: ReturnType<typeof request.agent>;
let dm: ClientSocket;
let player: ClientSocket;

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `pmb-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `pmb-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Prepared broadcasts ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
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
  expect((await rest.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
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

const wallFor = () => ({ id: randomUUID(), x1: 0, y1: 0, x2: 50, y2: 0, type: 'wall' });
const lightFor = () => ({ id: randomUUID(), x: 25, y: 25, brightRadius: 1, dimRadius: 2, color: '#ffcc88', enabled: true });

/** Each source of a map's live edit: what the DM does, and what it sends. */
const SOURCES: Array<[string, string, string, (mapId: string) => Promise<unknown> | void]> = [
  ['wall:add', 'wall:added', 'DM', (mapId) => { dm.emit('wall:add', { mapId, segment: wallFor() }); }],
  ['light:add', 'light:added', 'DM', (mapId) => { dm.emit('light:add', { mapId, light: lightFor() }); }],
  ['fog:operation', 'fog:cells', 'fog:updated', (mapId) => { dm.emit('fog:operation', { mapId, operation: { op: 'reveal', cells: [0] } }); }],
  ['map.ping', 'map.pinged', 'DM', (mapId) => { dm.emit('map.ping', { mapId, x: 10, y: 10 }); }],
  ['exploration:reset', 'exploration:state', 'DM', (mapId) => { dm.emit('exploration:reset', { mapId }); }],
  ['POST lights', 'light:added', 'DM', (mapId) => rest.post(`/api/campaigns/${campaignId}/maps/${mapId}/lights`).send(lightFor())],
  ['PUT map settings', 'map:settings:updated', 'DM', (mapId) => rest.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ fogEnabled: true, globalIllumination: false })],
];

describe.each(SOURCES)('%s', (_source, event, dmEvent, act) => {
  const dmHears = dmEvent === 'DM' ? event : dmEvent;

  it('reaches no player for a prepared map, and reaches the DM', async () => {
    const quiet = expectNoEvent(player, event, 800);
    const heard = waitForEvent<{ mapId: string }>(dm, dmHears);
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

it("keeps the DM's editing notice for a prepared map from players", async () => {
  const quiet = expectNoEvent(player, 'dm:editing', 800);
  dm.emit('dm:editing', { mapId: preparedId });
  await quiet;
  const heard = waitForEvent<{ mapId: string }>(player, 'dm:editing');
  // The notice is throttled per socket; a fresh DM socket sends at once.
  const other = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  other.emit('dm:editing', { mapId: shownId });
  expect((await heard).mapId).toBe(shownId);
  other.disconnect();
});

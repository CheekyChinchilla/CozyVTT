/**
 * A change to the map on screen reaches the table without the DM's page
 * having to send it (F039).
 *
 * Editing the current map's picture, size, grid, scale or name reached
 * players only as far as its lighting and fog flags, and setting a map
 * current through the REST route moved nobody: the DM's page sent
 * `map.change` itself after each, so a script or a second tab left the table
 * on what it had. The routes now send each member the map as they may see
 * it, for the map the campaign is showing and no other.
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
  const dmUser = await createTestUser({ email: `merp-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `merp-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Map edits reach players ${stamp}` })).id;
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

const put = (mapId: string, body: Record<string, unknown>) => rest.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send(body);

describe('an edit to the map on screen', () => {
  it('sends the players the map again, as they may see it', async () => {
    const changed = waitForEvent<{ mapId: string; mapData: { name: string; gridSize: number } }>(player, 'map.changed');
    expect((await put(shownId, { name: 'Shown Again', gridSize: 60 })).status).toBe(200);
    const sent = await changed;
    expect(sent.mapId).toBe(shownId);
    expect(sent.mapData).toEqual(expect.objectContaining({ name: 'Shown Again', gridSize: 60 }));
  });

  it('sends nothing for a flag the settings event already carries', async () => {
    const quiet = expectNoEvent(player, 'map.changed', 600);
    expect((await put(shownId, { fogEnabled: false })).status).toBe(200);
    await quiet;
    await put(shownId, { fogEnabled: true });
  });
});

describe('an edit to a map being prepared', () => {
  it('sends nobody the map, so no page is moved onto it', async () => {
    const playerQuiet = expectNoEvent(player, 'map.changed', 600);
    const dmQuiet = expectNoEvent(dm, 'map.changed', 600);
    expect((await put(preparedId, { name: 'Prepared Again', gridSize: 40 })).status).toBe(200);
    await playerQuiet;
    await dmQuiet;
  });
});

describe('setting a map current over REST', () => {
  it('moves every page onto it', async () => {
    try {
      const playerMoved = waitForEvent<{ mapId: string }>(player, 'map.changed');
      const dmMoved = waitForEvent<{ mapId: string }>(dm, 'map.changed');
      expect((await rest.put(`/api/campaigns/${campaignId}/maps/${preparedId}/set-current`)).status).toBe(200);
      expect((await playerMoved).mapId).toBe(preparedId);
      expect((await dmMoved).mapId).toBe(preparedId);
    } finally {
      await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId } });
    }
  });
});

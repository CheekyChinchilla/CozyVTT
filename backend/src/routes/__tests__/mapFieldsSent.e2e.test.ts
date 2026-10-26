/**
 * What a member is sent of a map is built from the lists in
 * utils/spirit-layer.ts, on every path that sends one.
 *
 * The map list and the campaign fetch send every map's metadata without its
 * tokens, walls, lights or fog: the fields everyone is sent, and the spirit
 * layer address where its reader may have it.
 *
 * A map's annotations are sent to nobody. Nothing in the app reads them, and
 * a campaign import stores whatever array its archive held, which every
 * member was then sent with the map.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import type { Socket as ClientSocket } from 'socket.io-client';
import { MAP_FIELDS_SENT_TO_EVERYONE } from '../../utils/spirit-layer';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;

const annotation = { id: 'note', type: 'circle', position: { x: 1, y: 1 }, color: '#ff0000', text: 'The trap is under the rug' };

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `mfs-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `mfs-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Map fields sent ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Imported', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 4, height: 4, gridSize: 50, tokens: [], annotations: [annotation],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  player = request.agent(app);
  expect((await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

describe('a map with a stored annotation', () => {
  it('is fetched by nobody with the annotation', async () => {
    for (const agent of [dm, player]) {
      const res = await agent.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      expect(res.status).toBe(200);
      expect(res.body.map.annotations).toEqual([]);
      expect(JSON.stringify(res.body)).not.toContain('under the rug');
    }
  });

  it('reaches nobody with the annotation when the table is sent it again', async () => {
    const sockets: ClientSocket[] = [
      await server.connectAndAuth(await server.loginAs(dmId), campaignId),
      await server.connectAndAuth(await server.loginAs(playerId), campaignId),
    ];
    try {
      const changed = sockets.map((s) => waitForEvent<{ mapData: { annotations: unknown } }>(s, 'map.changed'));
      expect((await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ name: 'Imported Again' })).status).toBe(200);
      for (const sent of await Promise.all(changed)) {
        expect(sent.mapData.annotations).toEqual([]);
        expect(JSON.stringify(sent)).not.toContain('under the rug');
      }
    } finally {
      for (const s of sockets) s.disconnect();
    }
  });
});

describe('the map list and the campaign fetch', () => {
  const everyone = [...MAP_FIELDS_SENT_TO_EVERYONE].sort();
  const withSpiritLayer = [...MAP_FIELDS_SENT_TO_EVERYONE, 'spiritLayerUrl'].sort();

  it('list each map with the fields everyone is sent, and its spirit layer for the DM alone', async () => {
    const mine = await dm.get(`/api/campaigns/${campaignId}/maps`);
    expect(mine.status).toBe(200);
    expect(Object.keys(mine.body.maps[0]).sort()).toEqual(withSpiritLayer);
    const theirs = await player.get(`/api/campaigns/${campaignId}/maps`);
    expect(theirs.status).toBe(200);
    expect(Object.keys(theirs.body.maps[0]).sort()).toEqual(everyone);
  });

  it("give each of the campaign's maps the fields everyone is sent and its spirit layer", async () => {
    for (const agent of [dm, player]) {
      const res = await agent.get(`/api/campaigns/${campaignId}`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.campaign.maps[0]).sort()).toEqual(withSpiritLayer);
    }
  });
});

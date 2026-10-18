/**
 * A ping is for a map of the campaign that the sender may read.
 *
 * The map a ping names was not checked, as every other map event's is, so a
 * ping naming a map from another campaign, or a player's ping on a map the DM
 * is preparing, still went to the DM's screens. Such a ping is dropped, as a
 * ping over the limit is.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let otherCampaignId: string;
let currentMapId: string;
let preparedMapId: string;
let foreignMapId: string;
let dmCookie: string;
let playerCookie: string;

const mapData = (campaign: string, name: string) => ({
  campaignId: campaign, name, imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none', width: 10, height: 10, tokens: [], annotations: [],
});

beforeAll(async () => {
  const [dm, player] = await Promise.all(['dm', 'player'].map((name) =>
    prisma.user.create({ data: { email: `pingmap-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Ping ${name}` } })));
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Ping ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  otherCampaignId = (await prisma.campaign.create({ data: { name: `Ping other ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  currentMapId = (await prisma.map.create({ data: mapData(campaignId, 'Current') })).id;
  preparedMapId = (await prisma.map.create({ data: mapData(campaignId, 'Prepared') })).id;
  foreignMapId = (await prisma.map.create({ data: mapData(otherCampaignId, 'Foreign') })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId: { in: [campaignId, otherCampaignId] } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

it('drops a ping naming a map from another campaign', async () => {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const player = await server.connectAndAuth(playerCookie, campaignId);
  const nothing = expectNoEvent(dm, 'map.pinged', 500);
  player.emit('map.ping', { mapId: foreignMapId, x: 5, y: 5 });
  await nothing;
});

it('drops a player\'s ping on a map the DM is preparing', async () => {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const player = await server.connectAndAuth(playerCookie, campaignId);
  const nothing = expectNoEvent(dm, 'map.pinged', 500);
  player.emit('map.ping', { mapId: preparedMapId, x: 5, y: 5 });
  await nothing;
});

it('still sends a ping on the map on screen', async () => {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const player = await server.connectAndAuth(playerCookie, campaignId);
  const pinged = waitForEvent<{ mapId: string }>(dm, 'map.pinged');
  player.emit('map.ping', { mapId: currentMapId, x: 5, y: 5 });
  expect((await pinged).mapId).toBe(currentMapId);
});

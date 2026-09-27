/**
 * `map.change` only ever puts the table onto the map the campaign is showing.
 *
 * It broadcast `map.changed` for any map of the campaign, and every client
 * follows that event onto the map it carries, so a token moved to another
 * map (which emitted `map.change` for the target as well) switched every
 * player onto a map the DM never set current. The switch itself sets the
 * current map first, so it is unaffected.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `mapchange-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let otherId: string;
let dmCookie: string;
let playerCookie: string;

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `MapChange ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `MapChange ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const mapData = (name: string) => ({
    campaignId, name, imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
  });
  shownId = (await prisma.map.create({ data: mapData('Shown') })).id;
  otherId = (await prisma.map.create({ data: mapData('Other') })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('map.change', () => {
  it('sends the table the map the campaign is showing', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const changed = waitForEvent<{ mapId: string }>(player, 'map.changed');
    dm.emit('map.change', { mapId: shownId });
    expect((await changed).mapId).toBe(shownId);
    dm.disconnect();
    player.disconnect();
  });

  it('sends nothing for another map of the campaign, and tells the DM why', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const silence = expectNoEvent(player, 'map.changed');
    const refusal = waitForEvent<{ message: string }>(dm, 'error');
    dm.emit('map.change', { mapId: otherId });
    expect((await refusal).message).toMatch(/current/i);
    await silence;
    dm.disconnect();
    player.disconnect();
  });
});

/**
 * The live requests for a map's walls, lights, fog and explored memory
 * answer a player only for the campaign's current map.
 *
 * They checked that the map belonged to the campaign and nothing else, so a
 * scripted player could pull the layout of a map the DM had prepared but
 * not shown. The DM is answered for any map of the campaign.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `prepared-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let preparedId: string;
let dmCookie: string;
let playerCookie: string;

const wall = { id: 'w1', x1: 0, y1: 0, x2: 100, y2: 0, type: 'wall' };
const lamp = { id: 'l1', x: 50, y: 50, brightRadius: 2, dimRadius: 4, color: '#ffcc88', enabled: true };

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Prepared ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Prepared ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const base = {
    campaignId, imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none', width: 10, height: 10, gridSize: 50,
    annotations: [], tokens: [], wallSegments: [wall], lights: [lamp], fogEnabled: true, explorationEnabled: true, lightingEnabled: true,
  };
  shownId = (await prisma.map.create({ data: { ...base, name: 'Shown' } })).id;
  preparedId = (await prisma.map.create({ data: { ...base, name: 'Prepared' } })).id;
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

const REQUESTS: Array<[string, string, string]> = [
  ['walls:request', 'walls:replaced', 'walls'],
  ['lights:request', 'lights:replaced', 'lights'],
  ['fog:request_state', 'fog:cells', 'fog'],
  ['exploration:request', 'exploration:state', 'explored memory'],
];

describe.each(REQUESTS)('%s', (request, reply, what) => {
  it(`answers a player nothing about a prepared map's ${what}`, async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const silence = expectNoEvent(player, reply);
    player.emit(request, { mapId: preparedId });
    await silence;
    player.disconnect();
  });

  it(`answers a player about the current map's ${what}`, async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const answered = waitForEvent<{ mapId: string }>(player, reply);
    player.emit(request, { mapId: shownId });
    expect((await answered).mapId).toBe(shownId);
    player.disconnect();
  });

  it(`answers the DM about a prepared map's ${what}`, async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const answered = waitForEvent<{ mapId: string }>(dm, reply === 'fog:cells' ? 'fog:updated' : reply);
    dm.emit(request, { mapId: preparedId });
    expect((await answered).mapId).toBe(preparedId);
    dm.disconnect();
  });
});

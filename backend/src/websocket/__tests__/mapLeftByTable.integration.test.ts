/**
 * Once the table leaves a map, nothing more of it reaches a player.
 *
 * Three sends decided who was told before a switch, or not at all: a drag's
 * frames went for up to a second to the players decided at its start, a
 * resend of a map that had passed its "is it current" check could still put
 * the table back on it, and a member's explored memory of any map went to
 * their own screens. Each now asks whether the map is the table's at the
 * moment it sends. A GM's report of another member's memory of a map the
 * table is not on is not stored either: only Player Preview sends one, and
 * a preview shows the table's map.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { broadcastExplorationState, broadcastMapData } from '../shared';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `left-${name}-${runId}@test.cozyvtt.local`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let server: WsTestServer;
let gmId: string;
let playerId: string;
let campaignId: string;
let villageId: string;
let cryptId: string;
let gmCookie: string;
let playerCookie: string;

const GOBLIN = 'goblin';

beforeAll(async () => {
  const [gm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Left ${name}` } })
    )
  );
  gmId = gm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Left ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const base = {
    campaignId, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, annotations: [],
    lightingEnabled: false, fogEnabled: false, explorationEnabled: true,
  };
  villageId = (await prisma.map.create({
    data: {
      ...base, name: 'Village',
      tokens: [{
        id: GOBLIN, name: 'Goblin', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
      }],
    },
  })).id;
  cryptId = (await prisma.map.create({ data: { ...base, name: 'Crypt', tokens: [] } })).id;
  server = await createWsTestServer();
  [gmCookie, playerCookie] = await Promise.all([server.loginAs(gmId), server.loginAs(playerId)]);
});

beforeEach(() => prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: villageId } }));

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.mapExploration.deleteMany({ where: { mapId: { in: [villageId, cryptId] } } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, playerId] } } });
  await prisma.$disconnect();
});

/** The table goes to the crypt from somewhere else: another tab of the GM's, or a script. */
const tableGoesToTheCrypt = () => prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: cryptId } });

describe("a drag still going on the map the table has left", () => {
  it('stops reaching players at the switch, and still reaches the GM', async () => {
    const mover = await server.connectAndAuth(gmCookie, campaignId);
    const otherGmTab = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const firstFrame = waitForEvent<{ x: number }>(player, 'token.moved');
    mover.emit('token.move.start', { tokenId: GOBLIN, mapId: villageId });
    mover.emit('token.move', { tokenId: GOBLIN, mapId: villageId, x: 2, y: 1 });
    expect((await firstFrame).x).toBe(2);

    await tableGoesToTheCrypt();
    await pause(50);
    const nothing = expectNoEvent(player, 'token.moved', 600);
    const toTheGm = waitForEvent<{ x: number }>(otherGmTab, 'token.moved');
    // Within the second the drag's audience is kept for.
    mover.emit('token.move', { tokenId: GOBLIN, mapId: villageId, x: 3, y: 1 });
    expect((await toTheGm).x).toBe(3);
    await nothing;

    mover.disconnect();
    otherGmTab.disconnect();
    player.disconnect();
  });
});

describe('a drag let go on the map the table has left', () => {
  it('tells players nothing more of it, the token going included', async () => {
    const mover = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const firstFrame = waitForEvent<{ x: number }>(player, 'token.moved');
    mover.emit('token.move.start', { tokenId: GOBLIN, mapId: villageId });
    mover.emit('token.move', { tokenId: GOBLIN, mapId: villageId, x: 2, y: 1 });
    expect((await firstFrame).x).toBe(2);

    await tableGoesToTheCrypt();
    const quiet = Promise.all([
      expectNoEvent(player, 'token:disappeared', 800),
      expectNoEvent(player, 'token.moved', 800),
    ]);
    // The carrier's page closes with the token still held.
    mover.disconnect();
    await quiet;
    player.disconnect();
  });
});

describe('a map resent after the table has left it', () => {
  it('reaches nobody, the GM included', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const village = await prisma.map.findUniqueOrThrow({ where: { id: villageId } });
    await tableGoesToTheCrypt();
    const quiet = Promise.all([expectNoEvent(gm, 'map.changed', 500), expectNoEvent(player, 'map.changed', 500)]);
    await broadcastMapData(server.io, campaignId, village);
    await quiet;
    gm.disconnect();
    player.disconnect();
  });

  it('reaches everyone for the map the table is on', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const village = await prisma.map.findUniqueOrThrow({ where: { id: villageId } });
    const heard = Promise.all([waitForEvent<{ mapId: string }>(gm, 'map.changed'), waitForEvent<{ mapId: string }>(player, 'map.changed')]);
    await broadcastMapData(server.io, campaignId, village);
    expect((await heard).map((e) => e.mapId)).toEqual([villageId, villageId]);
    gm.disconnect();
    player.disconnect();
  });
});

describe("a member's explored memory of a map", () => {
  /** A GM socket whose Player Preview shows the player. */
  async function previewing(mapId: string) {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const answered = waitForEvent(gm, 'exploration:state');
    gm.emit('exploration:request', { mapId, userId: playerId });
    await answered;
    return gm;
  }

  it('the table is not on reaches only the GM previewing them, not their own screen', async () => {
    const preview = await previewing(cryptId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const quiet = expectNoEvent(player, 'exploration:state', 500);
    const toPreview = waitForEvent<{ mapId: string }>(preview, 'exploration:state');
    await broadcastExplorationState(server.io, campaignId, cryptId, playerId, [1, 2]);
    expect((await toPreview).mapId).toBe(cryptId);
    await quiet;
    preview.disconnect();
    player.disconnect();
  });

  it('the table is on reaches their own screen', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const heard = waitForEvent<{ mapId: string; cells: number[] }>(player, 'exploration:state');
    await broadcastExplorationState(server.io, campaignId, villageId, playerId, [1, 2]);
    expect(await heard).toMatchObject({ mapId: villageId, cells: [1, 2] });
    player.disconnect();
  });
});

describe("the GM's report of a player's explored memory", () => {
  const remembered = (mapId: string) => prisma.mapExploration.count({ where: { mapId, userId: playerId } });

  it('of a map the table is not on is not stored, and answered with no error', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const quiet = expectNoEvent(gm, 'error', 1500);
    gm.emit('exploration:reveal', { mapId: cryptId, userId: playerId, cells: [3, 4] });
    await quiet;
    expect(await remembered(cryptId)).toBe(0);
    gm.disconnect();
  });

  it('of the map the table is on is stored', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    gm.emit('exploration:reveal', { mapId: villageId, userId: playerId, cells: [3, 4] });
    for (let i = 0; i < 30 && (await remembered(villageId)) === 0; i += 1) await pause(100);
    expect(await remembered(villageId)).toBe(1);
    gm.disconnect();
  });
});

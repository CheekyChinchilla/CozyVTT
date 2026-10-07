/**
 * Explored-memory reports are written at most once a second per map and
 * player, and not at all when they add nothing.
 *
 * Each report read and rewrote the player's whole memory of the map, a
 * boolean per grid cell, even when every cell in it was already remembered,
 * and sent the whole memory back. Ten a second of those on a large map is a
 * steady stream of large writes. The ceiling was ten reports a second per
 * player, which two open tabs of one player, each reporting every 300 ms,
 * come close to; a report past it was dropped, and the cells in it were never
 * remembered, since the page does not send them again.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

type StateEvent = { mapId: string; userId: string; cells: number[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The cells the player's stored memory of the map holds. */
async function remembered(): Promise<number[]> {
  const row = await prisma.mapExploration.findUnique({ where: { mapId_userId: { mapId, userId: playerId } } });
  const revealed = (row?.explored as { revealed?: boolean[] } | null)?.revealed ?? [];
  return revealed.flatMap((on, i) => (on ? [i] : []));
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: `explorewrites-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Explore ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Explore writes ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Explore Writes Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 30, height: 30, gridSize: 50, tokens: [], annotations: [], lightingEnabled: true, explorationEnabled: true,
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
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

beforeEach(async () => {
  // A fresh second for the writes and for the ceiling.
  await sleep(1100);
  await prisma.mapExploration.deleteMany({ where: { mapId } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('exploration:reveal', () => {
  it('writes a burst of reports once, the next a second later, and loses none of their cells', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const states: StateEvent[] = [];
    player.on('exploration:state', (d: StateEvent) => states.push(d));
    const writes = jest.spyOn(prisma, '$transaction');

    for (let i = 0; i < 10; i += 1) player.emit('exploration:reveal', { mapId, cells: [i] });
    await sleep(1600);

    expect(writes.mock.calls.length).toBeLessThanOrEqual(2);
    expect(await remembered()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(states[states.length - 1].cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    player.disconnect();
  });

  it('writes and sends nothing for cells already remembered', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    player.emit('exploration:reveal', { mapId, cells: [1, 2, 3] });
    await sleep(1200);
    const writes = jest.spyOn(prisma, '$transaction');

    const quiet = expectNoEvent(player, 'exploration:state', 1500);
    player.emit('exploration:reveal', { mapId, cells: [1, 2, 3] });
    await quiet;

    expect(writes).toHaveBeenCalledTimes(0);
    player.disconnect();
  });

  it("keeps every report from two of a player's tabs reporting at once", async () => {
    const first = await server.connectAndAuth(playerCookie, campaignId);
    const second = await server.connectAndAuth(playerCookie, campaignId);

    // Each tab every 70 ms for a second: 28 reports between them, more than
    // two tabs send at the page's 300 ms pace, and past the old ceiling of ten.
    for (let i = 0; i < 14; i += 1) {
      first.emit('exploration:reveal', { mapId, cells: [100 + i] });
      second.emit('exploration:reveal', { mapId, cells: [200 + i] });
      await sleep(70);
    }
    await sleep(1600);

    const cells = await remembered();
    for (let i = 0; i < 14; i += 1) {
      expect(cells).toContain(100 + i);
      expect(cells).toContain(200 + i);
    }
    first.disconnect();
    second.disconnect();
  });

  it('forgets reports still waiting to be written when the DM resets the map', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    player.emit('exploration:reveal', { mapId, cells: [7] });
    await sleep(200);
    player.emit('exploration:reveal', { mapId, cells: [8] });
    // Queued by now, and not due to be written for most of a second. (A
    // report that reaches the server after the reset is written, as it should
    // be: the player saw those cells after it.)
    await sleep(150);
    dm.emit('exploration:reset', { mapId });
    await sleep(1600);

    expect(await remembered()).toEqual([]);
    player.disconnect();
    dm.disconnect();
  });
});

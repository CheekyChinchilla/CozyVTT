/**
 * Reset Explored Areas is not undone by a player's memory being written at
 * that moment.
 *
 * A write of a player's explored memory reads the row and writes it back
 * with the new cells, holding that player's lock. The reset took no lock, so
 * a write that had read the old row before the reset deleted it wrote the
 * old memory back after, and the player kept every area the DM had just
 * cleared. The reset now takes each player's lock before it deletes, so a
 * write in flight finishes first and is deleted with the rest.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const memory = (cells: number[]) => ({ cellPx: 50, cols: 4, rows: 4, revealed: Array.from({ length: 16 }, (_, i) => cells.includes(i)) });

beforeAll(async () => {
  const [dm, player] = await Promise.all(['dm', 'player'].map((name) =>
    prisma.user.create({ data: { email: `explorerace-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Race ${name}` } })));
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Explore race ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Race', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 4, height: 4, gridSize: 50, tokens: [], annotations: [], lightingEnabled: true, explorationEnabled: true,
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
});

afterAll(async () => {
  await server?.close();
  await prisma.mapExploration.deleteMany({ where: { mapId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

it('deletes a memory written while the reset was asked for', async () => {
  await prisma.mapExploration.create({ data: { mapId, userId: playerId, explored: toJson(memory([0, 1, 2])) } });
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const resetDone = waitForEvent(dm, 'exploration:state', 10000);

  // A write of the player's memory under way: it has read the old row and
  // holds the player's lock while the DM resets.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${mapId}), hashtext(${playerId}))`;
    const row = await tx.mapExploration.findUniqueOrThrow({ where: { mapId_userId: { mapId, userId: playerId } } });
    dm.emit('exploration:reset', { mapId });
    await pause(500);
    const explored = row.explored as { revealed: boolean[] };
    explored.revealed[3] = true;
    await tx.mapExploration.upsert({
      where: { mapId_userId: { mapId, userId: playerId } },
      create: { mapId, userId: playerId, explored: toJson(explored) },
      update: { explored: toJson(explored) },
    });
  });
  await resetDone;

  expect(await prisma.mapExploration.findUnique({ where: { mapId_userId: { mapId, userId: playerId } } })).toBeNull();
});

/**
 * Fog on a map stored larger than the size limits.
 *
 * Fog is one cell per grid square, built as a dense array every time it is
 * loaded. A map created before the limits could be any size, and a large
 * enough one exhausted the heap the moment fog was read, which no try/catch
 * survives. Every fog path now refuses a grid over 250,000 cells and tells
 * the caller why, and the server goes on answering.
 *
 * The rows here are 1,000 by 1,000: past the ceiling, yet small enough that
 * the code before the ceiling answers rather than dying, so the test can fail.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import {
  createWsTestServer,
  expectNoEvent,
  waitForEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `fogcap-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let gmId: string;
let playerId: string;
let campaignId: string;
let bigMapId: string;
let gmCookie: string;
let playerCookie: string;

type ErrorEvent = { message: string };

beforeAll(async () => {
  const [gm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Fog cap ${name}` } })
    )
  );
  gmId = gm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Fog cap ${runId}`, ownerId: gmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  // Inserted straight into the table, as a map made before the limits is.
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Huge', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 1000, height: 1000, gridSize: 50, tokens: [], annotations: [],
      fogEnabled: true, explorationEnabled: true,
    },
  });
  bigMapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: bigMapId } });
  server = await createWsTestServer();
  [gmCookie, playerCookie] = await Promise.all([server.loginAs(gmId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, playerId] } } });
  await prisma.$disconnect();
});

describe('fog:request_state', () => {
  it('answers the GM with an error saying why, and no grid', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const noGrid = expectNoEvent(gm, 'fog:updated', 1000);
    const error = waitForEvent<ErrorEvent>(gm, 'error');

    gm.emit('fog:request_state', { mapId: bigMapId });

    expect((await error).message).toMatch(/too big for fog of war/);
    await noGrid;
    gm.disconnect();
  });

  it('answers a player the same way', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const noCells = expectNoEvent(player, 'fog:cells', 1000);
    const error = waitForEvent<ErrorEvent>(player, 'error');

    player.emit('fog:request_state', { mapId: bigMapId });

    expect((await error).message).toMatch(/too big for fog of war/);
    await noCells;
    player.disconnect();
  });
});

describe('fog:operation', () => {
  it('refuses with a reason and stores nothing', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const error = waitForEvent<ErrorEvent>(gm, 'error');

    gm.emit('fog:operation', { mapId: bigMapId, operation: { op: 'reveal_all' } });

    expect((await error).message).toMatch(/too big for fog of war/);
    expect((await prisma.map.findUniqueOrThrow({ where: { id: bigMapId } })).fogData).toBeNull();
    gm.disconnect();
  });
});

describe('explored areas', () => {
  it('exploration:request answers with an error saying why', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const error = waitForEvent<ErrorEvent>(player, 'error');

    player.emit('exploration:request', { mapId: bigMapId });

    expect((await error).message).toMatch(/too big for fog of war/);
    player.disconnect();
  });

  it('exploration:reveal, which the page sends on its own, stores nothing', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const noState = expectNoEvent(player, 'exploration:state', 1000);

    player.emit('exploration:reveal', { mapId: bigMapId, cells: [0, 1, 2] });

    await noState;
    expect(await prisma.mapExploration.count({ where: { mapId: bigMapId } })).toBe(0);
    player.disconnect();
  });
});

it('keeps answering everyone afterwards', async () => {
  const gm = await server.connectAndAuth(gmCookie, campaignId);
  const walls = waitForEvent<{ mapId: string }>(gm, 'walls:replaced');

  gm.emit('walls:request', { mapId: bigMapId });

  expect((await walls).mapId).toBe(bigMapId);
  gm.disconnect();
});

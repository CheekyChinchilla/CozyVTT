/**
 * Flood ceilings are counted per user, across every socket that user opens,
 * and cover the events that do database work before they refuse.
 *
 * The wall, light and fog ceilings were counted per socket, so a player who
 * opened more sockets got another 40 door toggles a second with each one.
 * `token.move.start` had no ceiling at all and read the whole map before any
 * of its refusals, and a spectator's `initiative.roll` read the whole map
 * before being refused, uncounted.
 *
 * Each flood here is of requests that fail validation, which the ceiling is
 * checked ahead of: every one that gets past the ceiling is answered with an
 * `error`, and none of them touches the database, so counting the errors
 * counts what the ceiling let through.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { clearState } from '../initiativeState';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `flood-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let spectatorId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;
let spectatorCookie: string;

const HERO = 'hero';
const PAWN = 'pawn';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Emit `event` with `data` `times` over, and count the `error` replies that arrive within `windowMs`. */
async function errorsFrom(client: ClientSocket, event: string, data: unknown, times: number, windowMs = 700): Promise<number> {
  let count = 0;
  const onError = () => { count += 1; };
  client.on('error', onError);
  for (let i = 0; i < times; i += 1) client.emit(event, data);
  await sleep(windowMs);
  client.off('error', onError);
  return count;
}

beforeAll(async () => {
  const [dm, player, spectator] = await Promise.all(
    ['dm', 'player', 'spectator'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Flood ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  spectatorId = spectator.id;
  const campaign = await prisma.campaign.create({ data: { name: `Flood ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', rotation: 0, conditions: [], metadata: {}, visible: true };
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Flood Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [], fogEnabled: true,
      // Still marked as the spectator's from before a demotion, which is the case a spectator's roll has to be refused on.
      tokens: [
        { ...base, id: HERO, name: 'Hero', position: { x: 1, y: 1 }, controlledBy: spectatorId },
        { ...base, id: PAWN, name: 'Pawn', position: { x: 2, y: 2 }, controlledBy: playerId },
      ],
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie, spectatorCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId), server.loginAs(spectatorId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId, spectatorId] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  clearState(campaignId);
  jest.restoreAllMocks();
  // Each case starts with a fresh limit window.
  await sleep(1100);
});

describe.each([
  ['wall:update', 'a player', () => playerCookie, 40, { segment: {} }],
  ['light:add', 'the DM', () => dmCookie, 40, { light: {} }],
  ['fog:operation', 'the DM', () => dmCookie, 10, { operation: {} }],
])('%s', (event, who, cookie, ceiling, payload) => {
  it(`is one budget for ${who}, however many sockets they open`, async () => {
    const first = await server.connectAndAuth(cookie(), campaignId);
    const second = await server.connectAndAuth(cookie(), campaignId);

    expect(await errorsFrom(first, event, { mapId, ...payload }, ceiling)).toBe(ceiling);
    expect(await errorsFrom(second, event, { mapId, ...payload }, 5)).toBe(0);

    first.disconnect();
    second.disconnect();
  });
});

describe('token.move.start', () => {
  it('drops starts over the ceiling silently', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);

    expect(await errorsFrom(player, 'token.move.start', { mapId }, 160)).toBe(150);

    player.disconnect();
  });

  it("shares the user's move budget across sockets, and reads nothing once it is spent", async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const first = await server.connectAndAuth(playerCookie, campaignId);
    const second = await server.connectAndAuth(playerCookie, campaignId);
    expect(await errorsFrom(first, 'token.move.end', { tokenId: PAWN, mapId }, 150)).toBe(150);
    const reads = jest.spyOn(prisma.map, 'findUnique');

    const quiet = expectNoEvent(dm, 'token.move.start', 500);
    second.emit('token.move.start', { tokenId: PAWN, mapId });
    await quiet;
    expect(reads).not.toHaveBeenCalled();

    dm.disconnect();
    first.disconnect();
    second.disconnect();
  });
});

describe('initiative.roll', () => {
  it("refuses a spectator's roll before reading anything", async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const added = waitForEvent(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: HERO, mapId });
    await added;
    const spectator = await server.connectAndAuth(spectatorCookie, campaignId);
    const reads = jest.spyOn(prisma.map, 'findUnique');

    const denial = waitForEvent<{ message: string }>(spectator, 'error');
    spectator.emit('initiative.roll', { tokenId: HERO, mapId });
    expect((await denial).message).toBe('Spectators cannot roll initiative');
    expect(reads).not.toHaveBeenCalled();

    dm.disconnect();
    spectator.disconnect();
  });
});

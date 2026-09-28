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
import { setState, getState, clearState } from '../initiativeState';

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

// A DM staging a prepared map moves tokens on it. The moves went to every
// player the role filter kept the token for, so their ids and coordinates
// reached screens that are not sent that map at all.
describe('a token moved on a prepared map', () => {
  const STAGED = 'staged-token';
  const staged = (lightingEnabled: boolean) => prisma.map.update({
    where: { id: preparedId },
    data: {
      lightingEnabled, globalIllumination: true,
      tokens: [{
        id: STAGED, name: 'Staged', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
      }, {
        // The party staged beside it: on a lit map this token would see the
        // staged one, so what keeps its moves from the player is the map
        // rule, not the dark.
        id: 'party-token', name: 'Party', imageUrl: '', position: { x: 2, y: 1 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {}, type: 'player',
      }],
    },
  });

  it.each([[false, 'an unlit'], [true, 'a lit']])('reaches no player, drag or drop, on %s map', async (lit) => {
    await staged(lit as boolean);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const quiet = Promise.all([
      expectNoEvent(player, 'token.move.start', 800),
      expectNoEvent(player, 'token.moved', 800),
      expectNoEvent(player, 'token:appeared', 800),
    ]);
    const done = waitForEvent<{ tokenId: string }>(dm, 'token.moved');
    dm.emit('token.move.start', { tokenId: STAGED, mapId: preparedId });
    dm.emit('token.move', { tokenId: STAGED, mapId: preparedId, x: 2, y: 1 });
    dm.emit('token.move.end', { tokenId: STAGED, mapId: preparedId, x: 3, y: 1 });
    expect((await done).tokenId).toBe(STAGED);
    await expect(quiet).resolves.toBeDefined();
    dm.disconnect();
    player.disconnect();
  });
});

// A player's writes follow the same rule as their reads: a map the DM has
// prepared is not theirs to change until it is shown, even where it holds a
// token they control or an unlocked door.
describe('a player writing to a prepared map', () => {
  const SCOUT = 'scout-token';
  const door = { id: randomUUID(), x1: 0, y1: 50, x2: 50, y2: 50, type: 'door-closed' };
  beforeEach(() => prisma.map.update({
    where: { id: preparedId },
    data: {
      wallSegments: [wall, door],
      tokens: [{
        id: SCOUT, name: 'Scout', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {},
      }],
    },
  }));
  const stored = () => prisma.map.findUniqueOrThrow({ where: { id: preparedId }, select: { tokens: true, wallSegments: true } });

  it.each(['token.move.start', 'token.move.end'])('refuses %s on their own token there', async (event) => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    player.emit(event, { tokenId: SCOUT, mapId: preparedId, x: 4, y: 4 });
    expect((await refused).message).toBe('Map not found');
    const tokens = (await stored()).tokens as Array<{ id: string; position: { x: number } }>;
    expect(tokens.find((t) => t.id === SCOUT)?.position.x).toBe(1);
    player.disconnect();
  });

  it('drops their drag frames for a token there', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const quiet = expectNoEvent(dm, 'token.moved', 800);
    player.emit('token.move', { tokenId: SCOUT, mapId: preparedId, x: 4, y: 4 });
    await quiet;
    player.disconnect();
    dm.disconnect();
  });

  it('refuses writing explored memory there', async () => {
    await prisma.map.update({ where: { id: preparedId }, data: { lightingEnabled: true, explorationEnabled: true } });
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    player.emit('exploration:reveal', { mapId: preparedId, cells: [1, 2] });
    expect((await refused).message).toBe('Map not found');
    expect(await prisma.mapExploration.count({ where: { mapId: preparedId, userId: playerId } })).toBe(0);
    player.disconnect();
  });

  it('refuses rolling initiative for their token there', async () => {
    setState(campaignId, {
      active: true, round: 1, currentTokenId: null,
      combatants: [{ tokenId: SCOUT, mapId: preparedId, name: 'Scout', imageUrl: '', initiative: null, hp: null, type: 'player', disposition: null }],
    });
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    player.emit('initiative.roll', { tokenId: SCOUT, mapId: preparedId });
    expect((await refused).message).toBe('Map not found');
    expect(getState(campaignId).combatants[0].initiative).toBeNull();
    clearState(campaignId);
    player.disconnect();
  });

  it('refuses opening a door there', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    player.emit('wall:update', { mapId: preparedId, segment: { ...door, type: 'door-open' } });
    expect((await refused).message).toBe('Map not found');
    const walls = (await stored()).wallSegments as Array<{ id: string; type: string }>;
    expect(walls.find((w) => w.id === door.id)?.type).toBe('door-closed');
    player.disconnect();
  });
});

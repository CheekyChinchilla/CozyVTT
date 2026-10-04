/**
 * What a spectator is sent, on the paths no test put a spectator on.
 *
 * Every per-recipient fan-out treats the DM as seeing everything and
 * everyone else through the role filter. The tests of those paths used
 * players only, so widening the DM's branch to "anyone but a player" passed
 * the whole suite while sending spectators hidden creatures' moves, hidden
 * creatures' rolls and other members' explored memory. These put a
 * spectator on each path. The last case pins that revealing the spirit
 * layer to everyone sends the initiative order again, which nothing checked.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { setState, clearState } from '../initiativeState';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `specrecv-${name}-${runId}@test.cozyvtt.local`;
const HIDDEN = randomUUID();
const WRAITH = randomUUID();
const HERO = randomUUID();

let server: WsTestServer;
let dmId: string;
let playerId: string;
let spectatorId: string;
let campaignId: string;
let mapId: string;
let dm: ClientSocket;
let player: ClientSocket;
let spectator: ClientSocket;

const token = (id: string, extra: Record<string, unknown>) => ({
  id, name: id, imageUrl: '', position: { x: 2, y: 2 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, type: 'npc', ...extra,
});
const entry = (tokenId: string) => ({ tokenId, mapId, name: tokenId, imageUrl: '', initiative: null, hp: null, type: 'npc' as const, disposition: null });

beforeAll(async () => {
  const [dmUser, playerUser, spectatorUser] = await Promise.all(['dm', 'player', 'spectator'].map((name) =>
    prisma.user.create({ data: { email: email(name), passwordHash: 'x', displayName: `Recv ${name}` } })));
  dmId = dmUser.id;
  playerId = playerUser.id;
  spectatorId = spectatorUser.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Spectator recipients ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Recipients', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
});

beforeEach(async () => {
  clearState(campaignId);
  await prisma.mapExploration.deleteMany({ where: { mapId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });
  await prisma.map.update({
    where: { id: mapId },
    data: {
      lightingEnabled: false, globalIllumination: true, explorationEnabled: true,
      tokens: toJson([
        token(HIDDEN, { visible: false }),
        token(WRAITH, { layer: 'spirit' }),
        token(HERO, { controlledBy: playerId, type: 'player', position: { x: 1, y: 1 } }),
      ]),
    },
  });
  dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  spectator = await server.connectAndAuth(await server.loginAs(spectatorId), campaignId);
});

afterEach(() => { dm.disconnect(); player.disconnect(); spectator.disconnect(); });

afterAll(async () => {
  await server.close();
  clearState(campaignId);
  await prisma.mapExploration.deleteMany({ where: { mapId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId, spectatorId] } } });
  await prisma.$disconnect();
});

describe('a hidden creature the DM moves', () => {
  it.each([[false, 'an unlit'], [true, 'a lit']])('reaches no spectator, drag or drop, on %s map', async (lit) => {
    await prisma.map.update({ where: { id: mapId }, data: { lightingEnabled: lit as boolean } });
    const quiet = Promise.all([
      expectNoEvent(spectator, 'token.move.start', 800),
      expectNoEvent(spectator, 'token.moved', 800),
      expectNoEvent(spectator, 'token:appeared', 800),
    ]);
    const done = waitForEvent<{ tokenId: string }>(dm, 'token.moved');
    dm.emit('token.move.start', { tokenId: HIDDEN, mapId });
    dm.emit('token.move', { tokenId: HIDDEN, mapId, x: 3, y: 2 });
    dm.emit('token.move.end', { tokenId: HIDDEN, mapId, x: 4, y: 2 });
    expect((await done).tokenId).toBe(HIDDEN);
    await expect(quiet).resolves.toBeDefined();
  });
});

it("never tells a spectator a hidden creature's initiative roll", async () => {
  setState(campaignId, { active: true, round: 1, currentTokenId: null, combatants: [entry(HIDDEN)] });
  const quiet = expectNoEvent(spectator, 'dice.rolled', 800);
  const logged = waitForEvent<{ purpose: string }>(dm, 'dice.rolled');
  dm.emit('initiative.roll', { tokenId: HIDDEN, mapId });
  expect((await logged).purpose).toMatch(/Initiative/);
  await expect(quiet).resolves.toBeUndefined();
});

it("answers a spectator who names another member with their own explored memory, not that member's", async () => {
  await prisma.map.update({ where: { id: mapId }, data: { lightingEnabled: true } });
  const echoed = waitForEvent<{ cells: number[] }>(player, 'exploration:state');
  player.emit('exploration:reveal', { mapId, cells: [1, 2, 3] });
  expect((await echoed).cells).toEqual([1, 2, 3]);

  const answer = waitForEvent<{ userId: string; cells: number[] }>(spectator, 'exploration:state');
  spectator.emit('exploration:request', { mapId, userId: playerId });
  const got = await answer;
  expect(got.userId).toBe(spectatorId);
  expect(got.cells).toEqual([]);
});

it('sends the initiative order again when the spirit layer is revealed to everyone', async () => {
  setState(campaignId, { active: true, round: 1, currentTokenId: null, combatants: [entry(WRAITH)] });
  // On the material plane the player is not sent the wraith; once the layer
  // is revealed to everyone they are, and the order has to follow.
  const resent = new Promise<void>((resolve) => {
    player.on('initiative.state', (state: { combatants: Array<{ tokenId: string }> }) => {
      if (state.combatants.some((c) => c.tokenId === WRAITH)) resolve();
    });
  });
  dm.emit('spirit_layer.toggle', { visible: true });
  await expect(Promise.race([resent, new Promise((_r, reject) => setTimeout(() => reject(new Error('order not re-sent')), 3000))])).resolves.toBeUndefined();
});

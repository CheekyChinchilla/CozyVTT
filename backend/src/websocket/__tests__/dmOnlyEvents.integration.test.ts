/**
 * Every live-table event that is the DM's alone refuses a player and a
 * spectator: they are told no (one event answers nothing at all), nobody else
 * hears of it, and nothing is stored.
 *
 * The events are those the WebSocket guide's event table marks "DM only".
 * That table is generated from the handlers and checked against them by
 * scripts/websocket-events.py, so an event the handlers make the DM's alone
 * appears here, and this file fails until it has a payload below.
 *
 * The payloads name real things (the map, a wall, a light, a combatant), and
 * the DM sending some of them is shown to work, so a refusal is the role
 * check and not a malformed request.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, waitForEvent, expectNoEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { setState, getState, clearState, type CombatantEntry } from '../initiativeState';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let campaignId: string;
let mapId: string;
const userIds: string[] = [];
const cookies: Record<'DM' | 'PLAYER' | 'SPECTATOR', string> = { DM: '', PLAYER: '', SPECTATOR: '' };

const wallId = randomUUID();
const lightId = randomUUID();
const tokenA = randomUUID();
const tokenB = randomUUID();
const wall = { id: wallId, x1: 100, y1: 100, x2: 200, y2: 100, type: 'wall' };
const light = { id: lightId, x: 300, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true };
const token = (id: string) => ({ id, name: id, x: 1, y: 1, size: 1, imageUrl: '', type: 'npc', visible: true });
const entry = (tokenId: string, initiative: number): CombatantEntry => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative, hp: null, type: 'npc', disposition: null,
});

/** One payload per DM-only event, naming things that exist. */
const PAYLOADS: Record<string, () => unknown> = {
  'atmosphere.audio.set': () => ({ assetId: null }),
  'atmosphere.effect.set': () => ({ effect: 'rain' }),
  'dice.clearHistory': () => undefined,
  'dm:editing': () => ({ mapId }),
  'exploration:reset': () => ({ mapId }),
  'fog:operation': () => ({ mapId, operation: { type: 'reveal-all' } }),
  'initiative.add': () => ({ tokenId: tokenA, mapId }),
  'initiative.end': () => undefined,
  'initiative.next': () => undefined,
  'initiative.remove': () => ({ tokenId: tokenA }),
  'initiative.reorder': () => ({ orderedTokenIds: [tokenB, tokenA] }),
  'initiative.set': () => ({ tokenId: tokenA, mapId, value: 20 }),
  'initiative.start': () => undefined,
  'light:add': () => ({ mapId, light: { ...light, id: randomUUID() } }),
  'light:remove': () => ({ mapId, lightId }),
  'light:update': () => ({ mapId, light: { ...light, brightRadius: 3, dimRadius: 6 } }),
  'lights:replace': () => ({ mapId, lights: [] }),
  'map.change': () => ({ mapId }),
  'spirit_layer.style_change': () => ({ style: 'ethereal' }),
  'spirit_layer.toggle': () => ({ visible: true }),
  'spirit_layer.token.toggle': () => ({ mapId, tokenId: tokenA, visible: false }),
  'vibe.update': () => ({ period: 'night' }),
  'wall:add': () => ({ mapId, segment: { ...wall, id: randomUUID(), x2: 250 } }),
  'wall:remove': () => ({ mapId, segmentId: wallId }),
  'walls:replace': () => ({ mapId, segments: [] }),
};

/** The one DM-only event that answers a non-DM with nothing at all. */
const SILENT = new Set(['dm:editing']);

/** What the guide's event table marks "DM only". */
function dmOnlyInGuide(): string[] {
  const guide = fs.readFileSync(path.resolve(__dirname, '../../../docs/WEBSOCKET_DOCUMENTATION.md'), 'utf8');
  return [...guide.matchAll(/^\| `([^`]+)` \| DM only \|/gm)].map((m) => m[1]);
}

/** Everything the refusals could have changed, as stored. */
async function snapshot(): Promise<string> {
  const [campaign, map, rolls] = await Promise.all([
    prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } }),
    prisma.map.findUniqueOrThrow({ where: { id: mapId } }),
    prisma.diceRoll.count({ where: { campaignId } }),
  ]);
  return JSON.stringify({ campaign, map, rolls, combat: getState(campaignId) });
}

/** Who is at the table, sent as sockets join; not anyone's action. */
const PRESENCE = new Set(['user.joined', 'user.left', 'presence.state']);

/** Every event a socket receives from now on, presence aside. */
function record(client: ClientSocket): string[] {
  const heard: string[] = [];
  client.onAny((event: string) => {
    if (!PRESENCE.has(event)) heard.push(event);
  });
  return heard;
}

beforeAll(async () => {
  const roles = ['DM', 'PLAYER', 'SPECTATOR'] as const;
  const users = await Promise.all(
    roles.map((role) =>
      prisma.user.create({ data: { email: `dmonly-${role}-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: role } })
    )
  );
  userIds.push(...users.map((u) => u.id));
  campaignId = (await prisma.campaign.create({ data: { name: `DM only ${runId}`, ownerId: users[0].id, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: roles.map((role, i) => ({ userId: users[i].id, campaignId, role, characterIds: [] })),
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'DM only', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, annotations: [], fogEnabled: true,
      tokens: toJson([token(tokenA), token(tokenB)]), wallSegments: toJson([wall]), lights: toJson([light]),
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });

  server = await createWsTestServer();
  for (const [i, role] of roles.entries()) cookies[role] = await server.loginAs(users[i].id);
});

beforeEach(() => {
  clearState(campaignId);
  setState(campaignId, { active: true, round: 1, currentTokenId: tokenA, combatants: [entry(tokenA, 15), entry(tokenB, 10)] });
});

afterAll(async () => {
  await server.close();
  clearState(campaignId);
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

it('has a payload for every event the guide marks DM only, and none for any other', () => {
  expect(Object.keys(PAYLOADS).sort()).toEqual(dmOnlyInGuide().sort());
});

describe.each(['PLAYER', 'SPECTATOR'] as const)('a %s', (role) => {
  it('is refused every DM-only event, and nobody else hears of it or sees it stored', async () => {
    const dm = await server.connectAndAuth(cookies.DM, campaignId);
    const otherRole = role === 'PLAYER' ? 'SPECTATOR' : 'PLAYER';
    const other = await server.connectAndAuth(cookies[otherRole], campaignId);
    const sender = await server.connectAndAuth(cookies[role], campaignId);
    const heardByDm = record(dm);
    const heardByOther = record(other);
    const before = await snapshot();

    const notRefused: string[] = [];
    for (const [event, payload] of Object.entries(PAYLOADS)) {
      if (SILENT.has(event)) {
        sender.emit(event, payload());
        continue;
      }
      const told = waitForEvent<{ message: string }>(sender, 'error', 2000).then(() => true, () => false);
      sender.emit(event, payload());
      if (!(await told)) notRefused.push(event);
    }
    // Long enough for a broadcast that a refusal let through to arrive.
    await expectNoEvent(dm, 'never-sent', 400);

    expect(notRefused).toEqual([]);
    expect(heardByDm).toEqual([]);
    expect(heardByOther).toEqual([]);
    expect(await snapshot()).toBe(before);

    for (const client of [dm, other, sender]) client.disconnect();
  });
});

describe('the DM, sending the same payloads', () => {
  let dm: ClientSocket;
  let player: ClientSocket;

  beforeEach(async () => {
    dm = await server.connectAndAuth(cookies.DM, campaignId);
    player = await server.connectAndAuth(cookies.PLAYER, campaignId);
  });

  afterEach(() => {
    dm.disconnect();
    player.disconnect();
  });

  it.each([
    ['wall:remove', 'wall:removed'],
    ['walls:replace', 'walls:replaced'],
    ['light:update', 'light:updated'],
    ['lights:replace', 'lights:replaced'],
    ['atmosphere.effect.set', 'atmosphere.effect.updated'],
    ['initiative.reorder', 'initiative.state'],
  ])('%s reaches the table as %s', async (event, broadcast) => {
    const heard = waitForEvent(player, broadcast);
    dm.emit(event, PAYLOADS[event]());
    await heard;
  });

  it('initiative.reorder puts the combatants in the order sent', async () => {
    const state = waitForEvent<{ combatants: Array<{ tokenId: string }> }>(dm, 'initiative.state');
    dm.emit('initiative.reorder', PAYLOADS['initiative.reorder']());
    expect((await state).combatants.map((c) => c.tokenId)).toEqual([tokenB, tokenA]);
  });
});

describe('ping', () => {
  it('is answered to the socket that sent it, and to nobody else', async () => {
    const dm = await server.connectAndAuth(cookies.DM, campaignId);
    const player = await server.connectAndAuth(cookies.PLAYER, campaignId);
    const heardByDm = record(dm);

    const pong = waitForEvent<{ timestamp: string }>(player, 'pong');
    player.emit('ping');
    expect(typeof (await pong).timestamp).toBe('string');
    await expectNoEvent(dm, 'pong', 300);
    expect(heardByDm).toEqual([]);

    dm.disconnect();
    player.disconnect();
  });
});

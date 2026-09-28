/**
 * The newest initiative order is the one that arrives last.
 *
 * A send reads the combatants' tokens, which takes a moment, and a change
 * landing meanwhile starts a send of its own. Changes to the order already
 * dropped an older send that a newer one overtook, but a send started by a
 * token change (hit points edited, a token hidden) did not count as newer,
 * so an older copy could still arrive after it and put the old hit points
 * back on every screen.
 *
 * A roll reads the order, then awaits the sheet, the dice and the token
 * write, then wrote back the copy it had read: a DM ending combat in that
 * gap saw the ended fight come back.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { withMapsLocked } from '../../utils/mapTokens';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { setState, getState, clearState } from '../initiativeState';
import { sendInitiativeState } from '../handlers/initiative';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `sendorder-${name}-${runId}@test.cozyvtt.local`;
const GOBLIN = randomUUID();
const HERO = randomUUID();

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ClientSocket;

const token = (id: string, extra: Record<string, unknown>) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...extra,
});
const entry = (tokenId: string, type: 'npc' | 'player') => ({
  tokenId, mapId, name: tokenId, imageUrl: '', initiative: null, hp: null, type, disposition: null,
});
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  const [dmUser, playerUser] = await Promise.all(['dm', 'player'].map((name) =>
    prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Order ${name}` } })));
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Send order ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Order', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.map.update({
    where: { id: mapId },
    data: {
      tokens: toJson([
        token(GOBLIN, { hp: { current: 5, max: 10, temp: 0 }, showHpBar: true }),
        token(HERO, { controlledBy: playerId, type: 'player' }),
      ]),
    },
  });
  clearState(campaignId);
  dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
});

afterEach(() => dm.disconnect());

afterAll(async () => {
  await server.close();
  clearState(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

it('drops an older send that a send started by a token change overtakes', async () => {
  setState(campaignId, { active: true, round: 1, currentTokenId: null, combatants: [entry(GOBLIN, 'npc')] });
  const seen: number[] = [];
  dm.on('initiative.state', (state: { combatants: Array<{ tokenId: string; hp: { current: number } | null }> }) => {
    const goblin = state.combatants.find((c) => c.tokenId === GOBLIN);
    if (goblin?.hp) seen.push(goblin.hp.current);
  });

  // The first send has read the tokens (hit points 5) and is held there.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reading!: () => void;
  const hasRead = new Promise<void>((resolve) => { reading = resolve; });
  const findMany = prisma.map.findMany.bind(prisma.map);
  const held = jest.spyOn(prisma.map, 'findMany').mockImplementationOnce(((args: never) =>
    findMany(args).then(async (rows) => { reading(); await gate; return rows; })) as never);
  const first = sendInitiativeState(server.io, campaignId);
  await hasRead;

  // The DM edits the goblin's hit points; that change sends the order again.
  const tokens = (await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens as Array<Record<string, unknown>>;
  await prisma.map.update({
    where: { id: mapId },
    data: { tokens: toJson(tokens.map((t) => (t.id === GOBLIN ? { ...t, hp: { current: 3, max: 10, temp: 0 } } : t))) },
  });
  await sendInitiativeState(server.io, campaignId);

  release();
  await first;
  await pause(300);
  held.mockRestore();
  expect(seen[seen.length - 1]).toBe(3);
});

it('does not bring back a fight the DM ended while a roll was in progress', async () => {
  setState(campaignId, { active: false, round: 0, currentTokenId: null, combatants: [entry(HERO, 'player')] });
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);

  // Hold the map so the roll waits at its token write.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const holder = withMapsLocked([mapId], async () => { locked(); await gate; });
  await holding;

  player.emit('initiative.roll', { tokenId: HERO, mapId });
  await pause(400);
  const ended = waitForEvent<{ combatants: unknown[] }>(dm, 'initiative.state');
  dm.emit('initiative.end');
  expect((await ended).combatants).toEqual([]);

  release();
  await holder;
  await pause(600);
  expect(getState(campaignId).combatants).toEqual([]);
  player.disconnect();
});

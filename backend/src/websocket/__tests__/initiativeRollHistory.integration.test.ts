/**
 * Initiative rolls go into the dice history, named for whoever reads them,
 * and a player rolls once for each time their token joins the order.
 *
 * - An initiative roll was announced in the dice log and never stored, so it
 *   was gone after a reload. It is stored now, with its id on the live entry
 *   so the two are one entry. A roll for a token that is not sent to every
 *   player (hidden, on the spirit plane, on a map the table is not showing)
 *   is stored and sent as a secret roll: to the roller, and to the DM.
 * - A player rolling for their own obscured token saw it logged as "Unknown
 *   creature". The roller is sent the token's name; everyone else, and the
 *   history, the placeholder.
 * - A player could roll again and again until combat started, keeping the
 *   best. They roll once; the DM can still change the number.
 * - A DM's roll for a token deleted while it was being worked out added a
 *   combatant for a token that no longer existed.
 * - A player's roll was counted against the dice ceiling only after its
 *   checks, so a flood of rolls refused by them was never counted.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { readTokens, toJson } from '../../utils/prisma-json';
import { withMapsLocked, writersWaitingFor } from '../../utils/mapTokens';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { getState, setState, clearState } from '../initiativeState';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `inithistory-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let floodId: string;
let campaignId: string;
let mapId: string;
const cookies: Record<string, string> = {};

type Rolled = { id?: string; characterName: string | null; purpose: string | null; secret: boolean; result: number };

const token = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...extra,
});
const entry = (tokenId: string) => ({ tokenId, mapId, name: tokenId, imageUrl: '', initiative: null, hp: null, type: 'npc' as const, disposition: null });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function placeTokens(tokens: ReturnType<typeof token>[], inOrder: string[] = []) {
  await prisma.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
  clearState(campaignId);
  if (inOrder.length) setState(campaignId, { active: false, round: 0, currentTokenId: null, combatants: inOrder.map(entry) });
}

const connect = (who: string): Promise<ClientSocket> => server.connectAndAuth(cookies[who], campaignId);

beforeAll(async () => {
  const users = await Promise.all(['dm', 'player', 'flood'].map((name) =>
    prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `History ${name}` } })));
  [dmId, playerId, floodId] = users.map((u) => u.id);
  campaignId = (await prisma.campaign.create({ data: { name: `Initiative history ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: floodId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'History', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [], fogEnabled: false,
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  for (const [name, id] of [['dm', dmId], ['player', playerId], ['flood', floodId]] as const) cookies[name] = await server.loginAs(id);
});

beforeEach(async () => {
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  await server?.close();
  clearState(campaignId);
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId, floodId] } } });
  await prisma.$disconnect();
});

describe('the dice history', () => {
  it('stores a roll for a token everyone is sent, and the live entry carries its id', async () => {
    await placeTokens([token('Goblin')]);
    const dm = await connect('dm');
    const player = await connect('player');
    const toPlayer = waitForEvent<Rolled>(player, 'dice.rolled');

    dm.emit('initiative.roll', { tokenId: 'Goblin', mapId });

    const live = await toPlayer;
    const stored = await prisma.diceRoll.findFirstOrThrow({ where: { campaignId } });
    expect(stored).toMatchObject({ userId: dmId, characterName: 'Goblin', purpose: 'Goblin Initiative', secret: false, result: live.result });
    expect(live).toMatchObject({ id: stored.id, characterName: 'Goblin', secret: false });
  });

  it('stores a roll for a hidden token as a secret roll, sent to no player', async () => {
    await placeTokens([token('Assassin', { visible: false })]);
    const dm = await connect('dm');
    const player = await connect('player');
    const toDm = waitForEvent<Rolled>(dm, 'dice.rolled');
    const nothingToPlayer = expectNoEvent(player, 'dice.rolled', 500);

    dm.emit('initiative.roll', { tokenId: 'Assassin', mapId });

    const live = await toDm;
    const stored = await prisma.diceRoll.findFirstOrThrow({ where: { campaignId } });
    expect(stored.secret).toBe(true);
    expect(live).toMatchObject({ id: stored.id, secret: true });
    await nothingToPlayer;
  });

  it('names an obscured token for the player who rolled it, and no one else', async () => {
    await placeTokens([token('Seelah', { obscured: true, controlledBy: playerId })], ['Seelah']);
    const dm = await connect('dm');
    const player = await connect('player');
    const toPlayer = waitForEvent<Rolled>(player, 'dice.rolled');
    const toDm = waitForEvent<Rolled>(dm, 'dice.rolled');

    player.emit('initiative.roll', { tokenId: 'Seelah', mapId });

    expect(await toPlayer).toMatchObject({ characterName: 'Seelah', purpose: 'Seelah Initiative' });
    expect(await toDm).toMatchObject({ characterName: 'Unknown creature', purpose: 'Unknown creature Initiative' });
    expect(await prisma.diceRoll.findFirstOrThrow({ where: { campaignId } })).toMatchObject({ characterName: 'Unknown creature' });
  });
});

describe('a player\'s roll', () => {
  it('is made once for each time the token joins the order', async () => {
    await placeTokens([token('Brann', { controlledBy: playerId })], ['Brann']);
    const player = await connect('player');
    const dm = await connect('dm');

    const first = waitForEvent<Rolled>(player, 'dice.rolled');
    player.emit('initiative.roll', { tokenId: 'Brann', mapId });
    await first;

    const refused = waitForEvent<{ message: string }>(player, 'error');
    player.emit('initiative.roll', { tokenId: 'Brann', mapId });
    expect((await refused).message).toBe('You have rolled initiative for this fight already. Ask your DM to change it.');
    expect(await prisma.diceRoll.count({ where: { campaignId } })).toBe(1);

    // Out of the order and back in: a new roll.
    const removed = waitForEvent(dm, 'initiative.state');
    dm.emit('initiative.remove', { tokenId: 'Brann' });
    await removed;
    const added = waitForEvent(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: 'Brann', mapId });
    await added;
    const again = waitForEvent<Rolled>(player, 'dice.rolled');
    player.emit('initiative.roll', { tokenId: 'Brann', mapId });
    await again;
    expect(await prisma.diceRoll.count({ where: { campaignId } })).toBe(2);
  });

  it('is counted against the dice ceiling before its checks', async () => {
    const flood = await connect('flood');
    const messages: string[] = [];
    flood.on('error', (data: { message: string }) => messages.push(data.message));

    for (let i = 0; i < 55; i++) flood.emit('initiative.roll', {});
    await pause(1000);

    expect(messages.some((m) => m.startsWith('Rate limit exceeded'))).toBe(true);
  });
});

describe('a token deleted while its roll is worked out', () => {
  it('is not added to the order', async () => {
    await placeTokens([token('Ghost')]);
    const dm = await connect('dm');
    const refused = waitForEvent<{ message: string }>(dm, 'error', 5000);

    await withMapsLocked([mapId], async (tx) => {
      dm.emit('initiative.roll', { tokenId: 'Ghost', mapId });
      for (let tries = 0; tries < 100 && writersWaitingFor(mapId) === 0; tries++) await pause(50);
      const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(readTokens(fresh.tokens).filter((t) => t.id !== 'Ghost')) } });
    });

    expect((await refused).message).toBe('Token not found');
    expect(getState(campaignId).combatants).toHaveLength(0);
    expect(await prisma.diceRoll.count({ where: { campaignId } })).toBe(0);
  });
});

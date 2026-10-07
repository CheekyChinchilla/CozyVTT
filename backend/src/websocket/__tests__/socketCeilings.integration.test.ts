/**
 * Every socket event a member can send has a per-user ceiling, counted across
 * all of that user's sockets, and the events past it change nothing.
 *
 * Chat had a ceiling only while the DM's cooldown was on, which it is not by
 * default. Hit points and hit dice had none, and each event takes a row lock
 * for the length of a transaction, so a burst of them held every database
 * connection. Picking a token up and putting it down shared the 150-a-second
 * budget of the drag frames, so a player could write the map 150 times a
 * second, each write under the map's lock and, on a lit map, followed by line
 * of sight for every player.
 *
 * Joining a campaign (`authenticate`) had no ceiling either, and each one
 * told the whole table the player had arrived, and nothing capped how many
 * sockets one user could hold open: every fan-out to a campaign is computed
 * per socket, so a thousand of them multiplied what everyone else's moves
 * cost the server.
 *
 * The numbers are abuse ceilings: well above anything a busy table sends
 * (see busyTable.integration.test.ts). The sender is told once, not once per
 * refused event.
 *
 * Each case uses a player of its own, since the ceilings are per user and
 * some windows are a minute long.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson, readTokens } from '../../utils/prisma-json';
import logger from '../../utils/logger';

jest.setTimeout(60000);

const runId = randomUUID().slice(0, 8);
let counter = 0;

let server: WsTestServer;
let dmId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
const users: string[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A refusal from one of the flood ceilings, as opposed to any other error. */
const CEILING_REFUSAL = /at once/;

/** Everything `client` receives of `event` from now on. */
function collect<T = unknown>(client: ClientSocket, event: string): T[] {
  const seen: T[] = [];
  client.on(event, (data: T) => seen.push(data));
  return seen;
}

/** The ceiling refusals `client` receives from now on. */
function refusals(client: ClientSocket): string[] {
  const seen: string[] = [];
  client.on('error', (data: { message?: string }) => {
    if (data?.message && CEILING_REFUSAL.test(data.message)) seen.push(data.message);
  });
  return seen;
}

/** Wait until `done` holds, then a little longer, so anything still coming has arrived. */
async function settle(done: () => boolean | Promise<boolean>, timeoutMs = 15000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await done()) && Date.now() < until) await sleep(50);
  await sleep(400);
}

type Sheet = {
  hp: { current: number; maximum: number; temporary: number };
  hitDice: Array<{ class: string; die: string; maximum: number; remaining: number }>;
};

/** A player of their own in the campaign, with a character and a token. */
async function newPlayer(): Promise<{ id: string; cookie: string; characterId: string; tokenId: string }> {
  counter += 1;
  const user = await prisma.user.create({
    data: { email: `ceiling-${counter}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Ceiling ${counter}` },
  });
  users.push(user.id);
  const sheet: Sheet = {
    hp: { current: 500, maximum: 1000, temporary: 0 },
    hitDice: [{ class: 'fighter', die: 'd10', maximum: 200, remaining: 200 }],
  };
  const character = await prisma.character.create({
    data: { userId: user.id, campaignId, name: `Hero ${counter}`, gameSystem: 'DND_5E', data: toJson(sheet) },
  });
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId, role: 'PLAYER', characterIds: [character.id] } });
  const tokenId = `token-${counter}`;
  const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
  await prisma.map.update({
    where: { id: mapId },
    data: {
      tokens: toJson([
        ...readTokens(row.tokens),
        {
          id: tokenId, name: tokenId, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
          visible: true, controlledBy: user.id, rotation: 0, conditions: [], metadata: {},
        },
      ]),
    },
  });
  return { id: user.id, cookie: await server.loginAs(user.id), characterId: character.id, tokenId };
}

const sheetOf = async (characterId: string): Promise<Sheet> =>
  (await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).data as unknown as Sheet;

beforeAll(async () => {
  const dm = await prisma.user.create({
    data: { email: `ceiling-dm-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: 'Ceiling DM' },
  });
  dmId = dm.id;
  users.push(dmId);
  // A live session, so a player may move their token.
  const campaign = await prisma.campaign.create({ data: { name: `Ceilings ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } });
  campaignId = campaign.id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Ceiling Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, gridSize: 50, annotations: [], tokens: [],
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.character.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('chat.message', () => {
  const stored = (userId: string) => prisma.message.count({ where: { campaignId, userId } });

  it('takes 50 a second from one user across their sockets, with the cooldown off, and says so once', async () => {
    const player = await newPlayer();
    const first = await server.connectAndAuth(player.cookie, campaignId);
    const second = await server.connectAndAuth(player.cookie, campaignId);
    const toldFirst = refusals(first);
    const toldSecond = refusals(second);

    for (let i = 0; i < 30; i += 1) {
      first.emit('chat.message', { content: `first ${i}` });
      second.emit('chat.message', { content: `second ${i}` });
    }
    await settle(async () => (await stored(player.id)) >= 50);

    expect(await stored(player.id)).toBe(50);
    // Once to each socket that was refused, whichever of them that was.
    const told = toldFirst.length + toldSecond.length;
    expect(told).toBeGreaterThanOrEqual(1);
    expect(told).toBeLessThanOrEqual(2);
    first.disconnect();
    second.disconnect();
  });

  it('takes 300 a minute', async () => {
    const player = await newPlayer();
    const client = await server.connectAndAuth(player.cookie, campaignId);

    for (let burst = 0; burst < 7; burst += 1) {
      for (let i = 0; i < 50; i += 1) client.emit('chat.message', { content: `burst ${burst} message ${i}` });
      await sleep(1050);
    }
    await settle(async () => (await stored(player.id)) >= 300);

    expect(await stored(player.id)).toBe(300);
    client.disconnect();
  });
});

describe('character.hp.update', () => {
  it('applies 50 a second, and writes nothing for the rest', async () => {
    const player = await newPlayer();
    const client = await server.connectAndAuth(player.cookie, campaignId);
    const told = refusals(client);
    const warned = jest.spyOn(logger, 'warn');
    const failed = jest.spyOn(logger, 'error');
    const updated = collect(client, 'character.hp.updated');

    for (let i = 0; i < 60; i += 1) client.emit('character.hp.update', { characterId: player.characterId, delta: -1 });
    await settle(() => updated.length >= 50);

    expect(updated).toHaveLength(50);
    expect((await sheetOf(player.characterId)).hp.current).toBe(450);
    expect(told).toHaveLength(1);
    // Refusals are not logged one by one: a flood would fill the log.
    expect(warned).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();

    // The next second has its own allowance.
    await sleep(1100);
    client.emit('character.hp.update', { characterId: player.characterId, delta: -1 });
    await settle(() => updated.length >= 51);
    expect((await sheetOf(player.characterId)).hp.current).toBe(449);
    client.disconnect();
  });
});

describe('character.hitdice.spend', () => {
  it('spends 50 a second, and nothing for the rest', async () => {
    const player = await newPlayer();
    const client = await server.connectAndAuth(player.cookie, campaignId);
    const told = refusals(client);
    const updated = collect(client, 'character.updated');

    for (let i = 0; i < 60; i += 1) client.emit('character.hitdice.spend', { characterId: player.characterId, index: 0 });
    await settle(() => updated.length >= 50);

    expect(updated).toHaveLength(50);
    expect((await sheetOf(player.characterId)).hitDice[0].remaining).toBe(150);
    expect(told).toHaveLength(1);
    client.disconnect();
  });
});

describe('picking a token up and putting it down', () => {
  it('takes 30 token.move.start a second, of its own', async () => {
    const player = await newPlayer();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const client = await server.connectAndAuth(player.cookie, campaignId);
    const told = refusals(client);
    const started = collect(dm, 'token.move.start');

    for (let i = 0; i < 40; i += 1) client.emit('token.move.start', { tokenId: player.tokenId, mapId });
    await settle(() => started.length >= 30);

    expect(started).toHaveLength(30);
    expect(told).toHaveLength(1);
    dm.disconnect();
    client.disconnect();
  });

  it('writes 30 token.move.end a second, of its own, and leaves the frames their budget', async () => {
    const player = await newPlayer();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const client = await server.connectAndAuth(player.cookie, campaignId);
    const told = refusals(client);
    const moved = collect<{ tokenId: string; dragging?: boolean }>(dm, 'token.moved');
    const writes = jest.spyOn(prisma, '$transaction');

    // Past the frames' 150 too, which the drops used to spend.
    for (let i = 0; i < 160; i += 1) client.emit('token.move.end', { tokenId: player.tokenId, mapId, x: i % 10, y: 2 });
    await settle(() => moved.length >= 30);

    expect(moved).toHaveLength(30);
    expect(writes).toHaveBeenCalledTimes(30);
    expect(told).toHaveLength(1);

    // The drops did not spend the drag frames' allowance.
    client.emit('token.move', { tokenId: player.tokenId, mapId, x: 3, y: 3 });
    await settle(() => moved.some((m) => m.dragging === true), 3000);
    expect(moved.some((m) => m.dragging === true)).toBe(true);
    dm.disconnect();
    client.disconnect();
  });
});

describe('authenticate', () => {
  it('answers 50 joins every ten seconds per user, and says so once', async () => {
    const player = await newPlayer();
    const client = await server.connectClient(player.cookie);
    const told = refusals(client);
    const joined = collect(client, 'authenticated');

    for (let i = 0; i < 60; i += 1) client.emit('authenticate', { campaignId });
    await settle(() => joined.length >= 50);

    expect(joined).toHaveLength(50);
    expect(told).toHaveLength(1);
    client.disconnect();
  });

  it('does not announce a socket again when it re-joins the campaign it is in', async () => {
    const player = await newPlayer();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const client = await server.connectAndAuth(player.cookie, campaignId);
    await sleep(300);

    const quiet = expectNoEvent(dm, 'user.joined', 600);
    const again = waitForEvent(client, 'authenticated');
    const presence = waitForEvent<{ onlineUserIds: string[] }>(client, 'presence.state');
    client.emit('authenticate', { campaignId });
    await again;
    expect((await presence).onlineUserIds).toContain(player.id);
    await quiet;

    dm.disconnect();
    client.disconnect();
  });
});

describe('sockets per user', () => {
  /** A raw connection: resolves with what the server says first, the connected ack or a refusal. */
  function open(cookie: string): Promise<{ client: ClientSocket; answer: 'connected' | string }> {
    return new Promise((resolve, reject) => {
      const client = ioc(server.url, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true, reconnection: false });
      const timer = setTimeout(() => reject(new Error('no answer within 5s')), 5000);
      client.once('connected', () => { clearTimeout(timer); resolve({ client, answer: 'connected' }); });
      client.once('error', (data: { message: string }) => { clearTimeout(timer); resolve({ client, answer: data.message }); });
    });
  }

  it('refuses the 41st socket one user opens, and takes a new one once another closes', async () => {
    const player = await newPlayer();
    const held: ClientSocket[] = [];
    for (let i = 0; i < 40; i += 1) {
      const { client, answer } = await open(player.cookie);
      expect(answer).toBe('connected');
      held.push(client);
    }

    const refused = await open(player.cookie);
    expect(refused.answer).toMatch(CEILING_REFUSAL);
    await settle(() => !refused.client.connected, 3000);
    expect(refused.client.connected).toBe(false);

    held[0].disconnect();
    await sleep(300);
    const after = await open(player.cookie);
    expect(after.answer).toBe('connected');

    for (const client of [...held, after.client]) client.disconnect();
  });
});

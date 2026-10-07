/**
 * A fast combat reaches none of the socket ceilings, with room to spare.
 *
 * The ceilings are abuse ceilings: each must sit at least five times above
 * the busiest real use of its event, by the web client at a fast table or by
 * the community MCP bridge, whichever is higher. This plays that use at the
 * rates the clients actually send, measures the busiest window for each user
 * and event from what was sent, and fails if any ceiling is under five times
 * it, or if anything sent was refused or lost.
 *
 * The web client, at its fastest:
 * - a drag is a pick-up, a frame at most every 16 ms, and a drop; a fast
 *   player picks up and drops a token every 200 ms;
 * - an HP button is one change per click, ten clicks a second at a frantic
 *   pace (holding Enter on a focused button repeats at about 30 a second,
 *   under the ceiling too);
 * - chat is one message per send, two a second at most;
 * - each open tab reports explored cells at most every 300 ms, and a player
 *   may have the map open on two devices;
 * - the DM's controls are a click apiece: ten map updates in a second while
 *   clicking through token edits;
 * - a player who opens the campaign on four devices, each of which then drops
 *   and reconnects, joins eight times and holds eight sockets until the
 *   dropped ones time out.
 *
 * The MCP bridge (github.com/yanjingzhaisun/cozyvtt-mcp) opens one socket per
 * campaign, joins once per connection with a backoff of at least a second
 * between attempts, sends one event per tool call with no pacing of its own,
 * and paces dice at one roll per 2.1 seconds. Its busiest moment is a model
 * turn of parallel tool calls; this plays turns of ten (ten combatants added
 * to initiative, eight hit point changes, three narration messages, a map
 * switch), on the DM's account, which is how it is run.
 *
 * Windows of a minute cannot be played in a test, so the busiest real minute
 * is stated: a chatty player and the bridge's narration on one account, 60
 * messages; a DM clicking through a mob's attacks and damage, 40 rolls.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson, readTokens } from '../../utils/prisma-json';
import { SOCKET_CEILINGS, MAX_SOCKETS_PER_USER, type CeilingEvent } from '../shared';
import { REVEALS_PER_SECOND } from '../handlers/exploration';

jest.setTimeout(90000);

const runId = randomUUID().slice(0, 8);
const HEADROOM = 5;
const MINUTE = 60 * 1000;

/** The busiest real minute of the events whose ceiling has a minute window. */
const BUSIEST_MINUTE: Partial<Record<CeilingEvent, number>> = {
  'chat.message': 60,
  'dice.roll': 40,
};

let server: WsTestServer;
let campaignId: string;
let mapId: string;
const userIds: string[] = [];

type Player = { id: string; cookie: string; characterId: string; tokenId: string };
let dm: { id: string; cookie: string };
const players: Player[] = [];

/**
 * Everything sent, by whom and when. The bridge's sends are labelled apart
 * from the DM's own clicks on the same account: the measure is the busier of
 * the two, since a table run by the bridge is not also clicked through by
 * hand at full speed.
 */
const sent: Array<{ user: string; event: string; at: number }> = [];
/** Every error any socket received. */
const errors: string[] = [];
/** The most sockets each user held open at once. */
const openSockets = new Map<string, number>();
const peakSockets = new Map<string, number>();
const sockets: ClientSocket[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function send(user: string, socket: ClientSocket, event: string, payload?: unknown): void {
  sent.push({ user, event, at: Date.now() });
  if (payload === undefined) socket.emit(event);
  else socket.emit(event, payload);
}

async function join(user: string, cookie: string, label = user): Promise<ClientSocket> {
  sent.push({ user: label, event: 'authenticate', at: Date.now() });
  const socket = await server.connectAndAuth(cookie, campaignId);
  socket.on('error', (data: { message?: string }) => errors.push(String(data?.message)));
  sockets.push(socket);
  const open = (openSockets.get(label) ?? 0) + 1;
  openSockets.set(label, open);
  peakSockets.set(label, Math.max(peakSockets.get(label) ?? 0, open));
  return socket;
}

/** The most of `event` one user sent in any `windowMs`. */
function busiest(event: string, windowMs: number): number {
  let peak = 0;
  const byUser = new Map<string, number[]>();
  for (const entry of sent) {
    if (entry.event !== event) continue;
    byUser.set(entry.user, [...(byUser.get(entry.user) ?? []), entry.at]);
  }
  for (const times of byUser.values()) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] >= windowMs) start += 1;
      peak = Math.max(peak, end - start + 1);
    }
  }
  return peak;
}

/** `count` of `step`, `everyMs` apart. */
async function repeat(count: number, everyMs: number, step: (i: number) => void): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    step(i);
    await sleep(everyMs);
  }
}

/** A drag every 200 ms: pick-up, frames every 16 ms, drop. */
async function drags(player: Player, socket: ClientSocket, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    send(player.id, socket, 'token.move.start', { tokenId: player.tokenId, mapId });
    for (let f = 0; f < 9; f += 1) {
      await sleep(16);
      send(player.id, socket, 'token.move', { tokenId: player.tokenId, mapId, x: (i + f) % 20, y: 5 });
    }
    send(player.id, socket, 'token.move.end', { tokenId: player.tokenId, mapId, x: i % 20, y: 6 });
    await sleep(200 - 9 * 16);
  }
}

let cellCounter = 0;

beforeAll(async () => {
  const names = ['dm', 'p1', 'p2', 'p3', 'p4'];
  const created = await Promise.all(
    names.map((name) =>
      prisma.user.create({ data: { email: `busy-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Busy ${name}` } })
    )
  );
  userIds.push(...created.map((u) => u.id));
  const campaign = await prisma.campaign.create({ data: { name: `Busy table ${runId}`, ownerId: created[0].id, vibeSettings: {}, status: 'ACTIVE' } });
  campaignId = campaign.id;
  const tokens: Array<Record<string, unknown>> = [];
  const token = (id: string, controlledBy: string | null) => ({
    id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true,
    controlledBy, rotation: 0, conditions: [], metadata: {},
  });
  for (let i = 0; i < 10; i += 1) tokens.push(token(`goblin-${i}`, null));
  const characters = await Promise.all(
    created.slice(1).map((user, i) =>
      prisma.character.create({
        data: {
          userId: user.id, campaignId, name: `Hero ${i}`, gameSystem: 'DND_5E',
          data: toJson({ hp: { current: 500, maximum: 1000, temporary: 0 }, hitDice: [] }),
        },
      })
    )
  );
  created.slice(1).forEach((user, i) => tokens.push(token(`hero-${i}`, user.id)));
  await prisma.campaignMembership.createMany({
    data: [
      { userId: created[0].id, campaignId, role: 'DM', characterIds: [] },
      ...created.slice(1).map((user, i) => ({ userId: user.id, campaignId, role: 'PLAYER' as const, characterIds: [characters[i].id] })),
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Busy Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, gridSize: 50, annotations: [], tokens: toJson(tokens), explorationEnabled: true,
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  dm = { id: created[0].id, cookie: await server.loginAs(created[0].id) };
  for (let i = 1; i < created.length; i += 1) {
    players.push({ id: created[i].id, cookie: await server.loginAs(created[i].id), characterId: characters[i - 1].id, tokenId: `hero-${i - 1}` });
  }
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  await prisma.mapExploration.deleteMany({ where: { mapId } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.character.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('a fast combat', () => {
  it('reaches no ceiling, loses nothing, and stays five times under every one', async () => {
    // Every player on two devices; the DM on a laptop and a screen for the
    // table; the bridge on the DM's account.
    const tabs = new Map<string, ClientSocket[]>();
    for (const player of players) tabs.set(player.id, [await join(player.id, player.cookie), await join(player.id, player.cookie)]);
    const dmTabs = [await join(dm.id, dm.cookie), await join(dm.id, dm.cookie)];
    const asBridge = `${dm.id}:bridge`;
    const bridge = await join(dm.id, dm.cookie, asBridge);

    const p1 = players[0];
    const play: Array<Promise<void>> = [];

    // One player opens the campaign on two more devices; then all four of
    // theirs drop and reconnect, the dropped ones lingering.
    play.push((async () => {
      for (let i = 0; i < 2; i += 1) await join(p1.id, p1.cookie);
      await sleep(1500);
      for (let i = 0; i < 4; i += 1) await join(p1.id, p1.cookie);
    })());

    for (const player of players) {
      const [laptop, tablet] = tabs.get(player.id)!;
      play.push(drags(player, laptop, 15));
      play.push(repeat(10, 100, (i) => send(player.id, laptop, 'character.hp.update', { characterId: player.characterId, delta: i % 2 ? 1 : -1 })));
      play.push(repeat(6, 500, (i) => send(player.id, laptop, 'chat.message', { content: `${player.id} says ${i}` })));
      play.push(repeat(2, 2000, () => send(player.id, laptop, 'dice.roll', { expression: '1d20+5', purpose: 'Longsword Attack' })));
      for (const device of [laptop, tablet]) {
        play.push(repeat(10, 300, () => {
          cellCounter += 1;
          send(player.id, device, 'exploration:reveal', { mapId, cells: [cellCounter] });
        }));
      }
    }

    // The DM, clicking.
    const [dmLaptop] = dmTabs;
    play.push(repeat(10, 100, () => send(dm.id, dmLaptop, 'map.change', { mapId })));
    play.push(repeat(10, 100, (i) => send(dm.id, dmLaptop, 'character.hp.update', { characterId: players[i % 4].characterId, delta: -1 })));
    play.push(repeat(3, 1000, (i) => send(dm.id, dmLaptop, 'dice.roll', { expression: '1d20+4', purpose: `Goblin ${i} Scimitar Attack` })));
    play.push(repeat(4, 500, (i) => send(dm.id, dmLaptop, 'chat.message', { content: `The goblins shriek ${i}` })));
    play.push(repeat(2, 1000, (i) => send(dm.id, dmLaptop, 'atmosphere.effect.set', { effect: i % 2 ? 'mist' : 'rain' })));

    // The bridge: turns of parallel tool calls, two seconds apart.
    play.push((async () => {
      for (let i = 0; i < 10; i += 1) send(asBridge, bridge, 'initiative.add', { tokenId: `goblin-${i}`, mapId });
      for (let i = 0; i < 8; i += 1) send(asBridge, bridge, 'character.hp.update', { characterId: players[i % 4].characterId, delta: -2 });
      for (let i = 0; i < 3; i += 1) send(asBridge, bridge, 'chat.message', { content: `Narration ${i}` });
      send(asBridge, bridge, 'map.change', { mapId });
      await sleep(2000);
      send(asBridge, bridge, 'initiative.start');
      for (let i = 0; i < 8; i += 1) send(asBridge, bridge, 'character.hp.update', { characterId: players[i % 4].characterId, delta: 2 });
      for (let i = 0; i < 3; i += 1) send(asBridge, bridge, 'chat.message', { content: `More narration ${i}` });
      await sleep(2000);
      send(asBridge, bridge, 'initiative.next');
    })());
    play.push(repeat(2, 2100, () => send(asBridge, bridge, 'dice.roll', { expression: '2d6+3', purpose: 'Bridge roll' })));

    await Promise.all(play);
    // Explored cells are written a second after the last report.
    await sleep(2000);

    // Nothing refused, nothing failed.
    expect(errors).toEqual([]);

    // Nothing lost.
    const count = (event: string, user?: string) => sent.filter((e) => e.event === event && (!user || e.user === user)).length;
    expect(await prisma.message.count({ where: { campaignId } })).toBe(count('chat.message'));
    expect(await prisma.diceRoll.count({ where: { campaignId } })).toBe(count('dice.roll'));
    for (const player of players) {
      // Each player's own clicks cancel out; the DM took ten, a quarter each
      // way round the table, and the bridge's two turns cancel out.
      const sheet = (await prisma.character.findUniqueOrThrow({ where: { id: player.characterId } })).data as { hp: { current: number } };
      expect(sheet.hp.current).toBe(500 - (players.indexOf(player) < 2 ? 3 : 2));
    }
    const stored = readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens);
    for (const player of players) expect(stored.find((t) => t.id === player.tokenId)?.position).toEqual({ x: 14, y: 6 });
    for (const player of players) {
      const row = await prisma.mapExploration.findUniqueOrThrow({ where: { mapId_userId: { mapId, userId: player.id } } });
      const remembered = ((row.explored as { revealed: boolean[] }).revealed).filter(Boolean).length;
      expect(remembered).toBe(20);
    }

    // Five times under every ceiling.
    const measured: Array<{ event: string; window: string; peak: number; ceiling: number }> = [];
    for (const [event, ceiling] of Object.entries(SOCKET_CEILINGS) as Array<[CeilingEvent, (typeof SOCKET_CEILINGS)[CeilingEvent]]>) {
      for (const { limit, windowMs } of ceiling.windows) {
        const peak = windowMs >= MINUTE ? Math.max(busiest(event, windowMs), BUSIEST_MINUTE[event] ?? 0) : busiest(event, windowMs);
        measured.push({ event, window: `${windowMs / 1000}s`, peak, ceiling: limit });
      }
    }
    measured.push({ event: 'exploration:reveal', window: '1s', peak: busiest('exploration:reveal', 1000), ceiling: REVEALS_PER_SECOND });
    measured.push({ event: 'sockets per user', window: 'open at once', peak: Math.max(...peakSockets.values()), ceiling: MAX_SOCKETS_PER_USER });
    if (process.env.PRINT_PEAKS) console.table(measured);

    for (const row of measured) {
      expect({ ...row, ok: row.ceiling >= HEADROOM * row.peak }).toMatchObject({ ...row, ok: true });
    }
  });
});

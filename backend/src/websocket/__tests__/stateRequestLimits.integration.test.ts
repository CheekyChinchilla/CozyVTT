/**
 * The state requests a client makes on load are rate limited per user, an
 * empty initiative order is answered from memory, a player's initiative
 * rolls count against their dice budget, and a failed fan-out never reports
 * the change it follows as failed.
 *
 * `initiative.request_state` grew from an in-memory reply into three or four
 * database queries per event, with no limit on who could send it or how
 * fast: one spectator socket flooding it stalled unrelated requests for
 * seconds. The other on-load requests (walls, lights, fog, explored memory,
 * presence) had no limit either, and `initiative.roll` bypassed the dice
 * limit. Separately, the fan-out after a change was awaited inside the
 * change's own try/catch, so a database blip in the fan-out told the DM the
 * change had failed when it had already been made.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { clearState } from '../initiativeState';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `limits-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

const HERO = 'hero';
const GOBLIN = 'goblin';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Emit `event` `times` over, and count the `reply` events that arrive within `windowMs`. */
async function flood(client: { emit: (e: string, d?: unknown) => void; on: (e: string, h: () => void) => void }, event: string, reply: string, times: number, windowMs = 600): Promise<number> {
  let count = 0;
  client.on(reply, () => { count += 1; });
  for (let i = 0; i < times; i += 1) client.emit(event, { mapId });
  await sleep(windowMs);
  return count;
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Limits ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Limits ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', rotation: 0, conditions: [], metadata: {}, visible: true };
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Limits Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [], fogEnabled: true, explorationEnabled: true, lightingEnabled: true,
      tokens: [
        { ...base, id: HERO, name: 'Hero', position: { x: 1, y: 1 }, controlledBy: playerId },
        { ...base, id: GOBLIN, name: 'Goblin', position: { x: 2, y: 2 }, controlledBy: null },
      ],
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
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

beforeEach(async () => {
  clearState(campaignId);
  jest.restoreAllMocks();
  // Each case starts with a fresh limit window for the player.
  await sleep(1100);
});

describe('initiative.request_state', () => {
  it('answers an empty order without touching the database', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const maps = jest.spyOn(prisma.map, 'findMany');
    const memberships = jest.spyOn(prisma.campaignMembership, 'findMany');
    const campaigns = jest.spyOn(prisma.campaign, 'findUnique');

    const answered = waitForEvent<{ combatants: unknown[] }>(player, 'initiative.state');
    player.emit('initiative.request_state');
    expect((await answered).combatants).toEqual([]);
    expect(maps).not.toHaveBeenCalled();
    expect(memberships).not.toHaveBeenCalled();
    expect(campaigns).not.toHaveBeenCalled();
    player.disconnect();
  });
});

describe.each([
  ['initiative.request_state', 'initiative.state'],
  ['walls:request', 'walls:replaced'],
  ['lights:request', 'lights:replaced'],
  ['fog:request_state', 'fog:cells'],
  ['exploration:request', 'exploration:state'],
  ['presence.request', 'presence.state'],
])('%s', (request, reply) => {
  it('answers at most five a second per user, and drops the rest silently', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const denial = expectNoEvent(player, 'error', 700);
    expect(await flood(player, request, reply, 20)).toBe(5);
    await denial;
    player.disconnect();
  });
});

describe('initiative.roll', () => {
  it("counts a player's rolls against their dice budget", async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const added = waitForEvent(player, 'initiative.state');
    dm.emit('initiative.add', { tokenId: HERO, mapId });
    await added;

    const refusals: string[] = [];
    player.on('error', (e: { message: string }) => { refusals.push(e.message); });
    // A second's worth of dice rolls spends the budget; the initiative roll
    // after them is refused from the same one.
    for (let i = 0; i < 50; i += 1) player.emit('dice.roll', { expression: '1d20' });
    const refused = waitForEvent<{ message: string }>(player, 'error', 3000);
    player.emit('initiative.roll', { tokenId: HERO, mapId });
    expect((await refused).message).toMatch(/rate limit/i);
    expect(refusals.every((m) => /rate limit/i.test(m))).toBe(true);
    dm.disconnect();
    player.disconnect();
  });
});

describe('a fan-out that fails', () => {
  it('does not report the initiative change as failed, and the change stands', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    jest.spyOn(prisma.map, 'findMany').mockRejectedValueOnce(new Error('database blip'));

    const silence = expectNoEvent(dm, 'error', 500);
    dm.emit('initiative.add', { tokenId: GOBLIN, mapId });
    await silence;

    const asked = waitForEvent<{ combatants: Array<{ tokenId: string }> }>(dm, 'initiative.state');
    dm.emit('initiative.request_state');
    expect((await asked).combatants.map((c) => c.tokenId)).toEqual([GOBLIN]);
    dm.disconnect();
  });

  it('does not report the spirit layer toggle as failed, and the table is still told', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const added = waitForEvent(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: GOBLIN, mapId });
    await added;
    jest.spyOn(prisma.map, 'findMany').mockRejectedValueOnce(new Error('database blip'));

    const silence = expectNoEvent(dm, 'error', 500);
    const told = waitForEvent<{ content: string }>(dm, 'chat.system');
    dm.emit('spirit_layer.toggle', { visible: true });
    await silence;
    expect((await told).content).toMatch(/spirit layer/i);
    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });
    dm.disconnect();
  });
});

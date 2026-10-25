/**
 * Hit points changed at the table follow the rules, and the REST rule for
 * which characters belong to the campaign.
 *
 * - Damage from the roster's minus button came straight off current hit
 *   points. In D&D 5e and Pathfinder 2e damage takes temporary hit points
 *   first, and only what is left comes off the rest (checked against the D&D
 *   5e Basic Rules and the Pathfinder 2e Core Rulebook); healing does not
 *   restore temporary hit points.
 * - A change of half a hit point was stored as 7.5, which the sheet's schema
 *   then refused on every save. A change must be a whole number.
 * - The socket decided "in this campaign" from the members' lists of
 *   character ids, the REST routes from the character's own campaign and
 *   its owner still being a member. The socket now asks the same as REST.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `hprules-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let leftId: string;
let campaignId: string;
let characterId: string;
let strayId: string;
let dmCookie: string;

type Hp = { current: number; maximum: number; temporary: number };
const sheet = (hp: Hp) => ({ hp, hitDice: [{ class: 'fighter', die: 'd10', maximum: 3, remaining: 3 }] });
const storedHp = async (id = characterId): Promise<Hp> =>
  ((await prisma.character.findUniqueOrThrow({ where: { id } })).data as unknown as { hp: Hp }).hp;

beforeAll(async () => {
  const users = await Promise.all(['dm', 'player', 'left'].map((name) =>
    prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `HP ${name}` } })));
  [dmId, playerId, leftId] = users.map((u) => u.id);
  campaignId = (await prisma.campaign.create({ data: { name: `HP rules ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  characterId = (await prisma.character.create({
    data: { userId: playerId, campaignId, name: 'Brann', gameSystem: 'DND_5E', data: toJson(sheet({ current: 20, maximum: 30, temporary: 8 })) },
  })).id;
  // A character whose owner has left the campaign, though a member's list
  // still names it, as data from before removals took characters out could.
  strayId = (await prisma.character.create({
    data: { userId: leftId, campaignId, name: 'Stray', gameSystem: 'DND_5E', data: toJson(sheet({ current: 10, maximum: 10, temporary: 0 })) },
  })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [strayId] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [characterId] },
    ],
  });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
});

beforeEach(async () => {
  await prisma.character.update({ where: { id: characterId }, data: { data: toJson(sheet({ current: 20, maximum: 30, temporary: 8 })) } });
});

afterAll(async () => {
  await server?.close();
  await prisma.character.deleteMany({ where: { id: { in: [characterId, strayId] } } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId, leftId] } } });
  await prisma.$disconnect();
});

describe('damage and healing', () => {
  it('takes damage from temporary hit points first', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const updated = waitForEvent<{ hp: { current: number; max: number; temp: number } }>(dm, 'character.hp.updated');

    dm.emit('character.hp.update', { characterId, delta: -5 });

    expect((await updated).hp).toEqual({ current: 20, max: 30, temp: 3 });
    expect(await storedHp()).toEqual({ current: 20, maximum: 30, temporary: 3 });
  });

  it('carries damage past the temporary hit points over to the rest', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const updated = waitForEvent(dm, 'character.hp.updated');
    dm.emit('character.hp.update', { characterId, delta: -12 });
    await updated;
    expect(await storedHp()).toEqual({ current: 16, maximum: 30, temporary: 0 });
  });

  it('heals current hit points alone', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const updated = waitForEvent(dm, 'character.hp.updated');
    dm.emit('character.hp.update', { characterId, delta: 4 });
    await updated;
    expect(await storedHp()).toEqual({ current: 24, maximum: 30, temporary: 8 });
  });

  it.each([0.5, -2.25, 1e9])('refuses a change of %d hit points', async (delta) => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(dm, 'error');
    dm.emit('character.hp.update', { characterId, delta });
    expect((await refused).message).toMatch(/whole number/);
    expect(await storedHp()).toEqual({ current: 20, maximum: 30, temporary: 8 });
  });
});

describe('which characters are the campaign\'s', () => {
  it('refuses a character whose owner has left, though a member\'s list names it', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    for (const [event, payload] of [['character.hp.update', { characterId: strayId, delta: -1 }], ['character.hitdice.spend', { characterId: strayId, index: 0 }]] as const) {
      const refused = waitForEvent<{ message: string }>(dm, 'error');
      dm.emit(event, payload);
      expect((await refused).message).toBe('Character is not in this campaign');
    }
    expect(await storedHp(strayId)).toEqual({ current: 10, maximum: 10, temporary: 0 });
  });

  it('accepts a character of the campaign that no member\'s list names', async () => {
    await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { characterIds: [] } });
    try {
      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const updated = waitForEvent(dm, 'character.hp.updated');
      dm.emit('character.hp.update', { characterId, delta: 2 });
      await updated;
      expect((await storedHp()).current).toBe(22);
    } finally {
      await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { characterIds: [characterId] } });
    }
  });
});

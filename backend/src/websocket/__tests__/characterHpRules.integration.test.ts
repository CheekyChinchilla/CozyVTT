/**
 * Hit points changed at the table follow the rules, and the REST rule for
 * which characters belong to the campaign.
 *
 * - Damage from the roster's minus button came straight off current hit
 *   points. In 5E and Fantasy d20 damage takes temporary hit points
 *   first, and only what is left comes off the rest (checked against the
 *   SRD 5.1 and the Fantasy d20 rules); healing does not restore
 *   temporary hit points.
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
import fs from 'fs';
import path from 'path';
import { toJson } from '../../utils/prisma-json';
import { isOldHorrorD100Sheet } from '../../legacy/horrorD100Sheet';

jest.setTimeout(20000);

/** A Horror d100 sheet as versions before 1.7.0 stored it, from the server's fixtures of that shape. */
function oldHorrorD100Sheet(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../legacy/__fixtures__/horror-d100-sheets/${name}.json`), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${name}.json holds no sheet`);
  return { ...parsed };
}

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `hprules-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let gmId: string;
let playerId: string;
let leftId: string;
let campaignId: string;
let characterId: string;
let strayId: string;
let horrorId: string;
let gmCookie: string;

type Hp = { current: number; maximum: number; temporary: number };
const sheet = (hp: Hp) => ({ hp, hitDice: [{ class: 'fighter', die: 'd10', maximum: 3, remaining: 3 }] });
const storedHp = async (id = characterId): Promise<Hp> =>
  ((await prisma.character.findUniqueOrThrow({ where: { id } })).data as unknown as { hp: Hp }).hp;

beforeAll(async () => {
  const users = await Promise.all(['dm', 'player', 'left'].map((name) =>
    prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `HP ${name}` } })));
  [gmId, playerId, leftId] = users.map((u) => u.id);
  campaignId = (await prisma.campaign.create({ data: { name: `HP rules ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  characterId = (await prisma.character.create({
    data: { userId: playerId, campaignId, name: 'Corvel', gameSystem: 'FIFTH_EDITION', data: toJson(sheet({ current: 20, maximum: 30, temporary: 8 })) },
  })).id;
  // A character whose owner has left the campaign, though a member's list
  // still names it, as data from before removals took characters out could.
  strayId = (await prisma.character.create({
    data: { userId: leftId, campaignId, name: 'Stray', gameSystem: 'FIFTH_EDITION', data: toJson(sheet({ current: 10, maximum: 10, temporary: 0 })) },
  })).id;
  horrorId = (await prisma.character.create({
    data: { userId: playerId, campaignId, name: 'Wren', gameSystem: 'HORROR_D100', data: toJson({ characterName: 'Wren', hitPoints: { maximum: 12, current: 9 } }) },
  })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [strayId] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [characterId, horrorId] },
    ],
  });
  server = await createWsTestServer();
  gmCookie = await server.loginAs(gmId);
});

beforeEach(async () => {
  await prisma.character.update({ where: { id: characterId }, data: { data: toJson(sheet({ current: 20, maximum: 30, temporary: 8 })) } });
});

afterAll(async () => {
  await server?.close();
  await prisma.character.deleteMany({ where: { id: { in: [characterId, strayId, horrorId] } } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, playerId, leftId] } } });
  await prisma.$disconnect();
});

describe('damage and healing', () => {
  it('takes damage from temporary hit points first', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const updated = waitForEvent<{ hp: { current: number; max: number; temp: number } }>(gm, 'character.hp.updated');

    gm.emit('character.hp.update', { characterId, delta: -5 });

    expect((await updated).hp).toEqual({ current: 20, max: 30, temp: 3 });
    expect(await storedHp()).toEqual({ current: 20, maximum: 30, temporary: 3 });
  });

  it('carries damage past the temporary hit points over to the rest', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const updated = waitForEvent(gm, 'character.hp.updated');
    gm.emit('character.hp.update', { characterId, delta: -12 });
    await updated;
    expect(await storedHp()).toEqual({ current: 16, maximum: 30, temporary: 0 });
  });

  it('heals current hit points alone', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const updated = waitForEvent(gm, 'character.hp.updated');
    gm.emit('character.hp.update', { characterId, delta: 4 });
    await updated;
    expect(await storedHp()).toEqual({ current: 24, maximum: 30, temporary: 8 });
  });

  it.each([0.5, -2.25, 1e9])('refuses a change of %d hit points', async (delta) => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(gm, 'error');
    gm.emit('character.hp.update', { characterId, delta });
    expect((await refused).message).toMatch(/whole number/);
    expect(await storedHp()).toEqual({ current: 20, maximum: 30, temporary: 8 });
  });
});

// The open d100 rules have a character lose more hit points than they have
// and keep track of the number below 0, so damage does not stop at 0 as it
// does in 5E and Fantasy d20. Healing still stops at the maximum.
describe('a Horror d100 character', () => {
  type Sent = { hp: { current: number; max: number; temp: number } };
  const stored = async () => ((await prisma.character.findUniqueOrThrow({ where: { id: horrorId } })).data as { hitPoints: unknown }).hitPoints;

  it('takes damage on its hit points, below 0 when it is more than it has left', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);

    const hurt = waitForEvent<Sent>(gm, 'character.hp.updated');
    gm.emit('character.hp.update', { characterId: horrorId, delta: -4 });
    expect((await hurt).hp).toEqual({ current: 5, max: 12, temp: 0 });
    expect(await stored()).toEqual({ maximum: 12, current: 5 });

    const downed = waitForEvent<Sent>(gm, 'character.hp.updated');
    gm.emit('character.hp.update', { characterId: horrorId, delta: -8 });
    expect((await downed).hp).toEqual({ current: -3, max: 12, temp: 0 });
    expect(await stored()).toEqual({ maximum: 12, current: -3 });
    gm.disconnect();
  });

  it('heals from below 0 a point at a time, and no higher than the maximum', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);

    const tended = waitForEvent<Sent>(gm, 'character.hp.updated');
    gm.emit('character.hp.update', { characterId: horrorId, delta: 1 });
    expect((await tended).hp).toEqual({ current: -2, max: 12, temp: 0 });
    expect(await stored()).toEqual({ maximum: 12, current: -2 });

    const healed = waitForEvent<Sent>(gm, 'character.hp.updated');
    gm.emit('character.hp.update', { characterId: horrorId, delta: 20 });
    expect((await healed).hp).toEqual({ current: 12, max: 12, temp: 0 });
    expect(await stored()).toEqual({ maximum: 12, current: 12 });
    gm.disconnect();
  });
});

describe('a Horror d100 character still stored in the shape before 1.7.0', () => {
  it('is converted when its hit points change, keeping the damage it had taken', async () => {
    // CON 60 and SIZ 65 give 13 hit points on the open rules' scale; 12 of 7
    // on the old one was 5 taken, so 8 of 13, and 4 more damage leaves 4.
    const old = oldHorrorD100Sheet('v1.6.0-detective-played');
    const id = (await prisma.character.create({ data: { userId: playerId, campaignId, name: 'Old Wren', gameSystem: 'HORROR_D100', data: toJson(old) } })).id;
    await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { characterIds: { push: id } } });
    const gm = await server.connectAndAuth(gmCookie, campaignId);

    const hurt = waitForEvent<{ hp: { current: number; max: number; temp: number } }>(gm, 'character.hp.updated');
    gm.emit('character.hp.update', { characterId: id, delta: -4 });
    expect((await hurt).hp).toEqual({ current: 4, max: 13, temp: 0 });
    const stored = (await prisma.character.findUniqueOrThrow({ where: { id } })).data as Record<string, unknown>;
    expect(isOldHorrorD100Sheet(stored)).toBe(false);
    expect(stored).toMatchObject({ hitPoints: { maximum: 13, current: 4 }, converted: { from: 1, hitPoints: { maximum: 12, current: 7 } } });
    gm.disconnect();
    await prisma.character.delete({ where: { id } });
  });
});

describe('which characters are the campaign\'s', () => {
  it('refuses a character whose owner has left, though a member\'s list names it', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    for (const [event, payload] of [['character.hp.update', { characterId: strayId, delta: -1 }], ['character.hitdice.spend', { characterId: strayId, index: 0 }]] as const) {
      const refused = waitForEvent<{ message: string }>(gm, 'error');
      gm.emit(event, payload);
      expect((await refused).message).toBe('Character is not in this campaign');
    }
    expect(await storedHp(strayId)).toEqual({ current: 10, maximum: 10, temporary: 0 });
  });

  it('accepts a character of the campaign that no member\'s list names', async () => {
    await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { characterIds: [] } });
    try {
      const gm = await server.connectAndAuth(gmCookie, campaignId);
      const updated = waitForEvent(gm, 'character.hp.updated');
      gm.emit('character.hp.update', { characterId, delta: 2 });
      await updated;
      expect((await storedHp()).current).toBe(22);
    } finally {
      await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { characterIds: [characterId] } });
    }
  });
});

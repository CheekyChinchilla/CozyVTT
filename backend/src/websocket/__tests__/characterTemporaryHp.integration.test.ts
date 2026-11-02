/**
 * Granting a character temporary hit points at the table, with
 * `character.hp.temporary`.
 *
 * The roster and a character's token offer Temporary HP...: a number, then,
 * for a character that already has some, the choice the rules give, keeping
 * those or taking the new ones (temporary hit points never add together, in
 * D&D 5e and Pathfinder 2e alike). Keeping changes nothing, so the event is
 * the taking: the character's temporary hit points become the number sent.
 * Whoever may change the character's hit points may send it, its owner while
 * a player and the DM, as for the roster's damage buttons; the number is a
 * whole one from 1 to 99,999; and a Call of Cthulhu character, whose sheet
 * keeps no temporary hit points a grant could add to, refuses it. The
 * payload is held to its schema: a character's id and the number, and
 * nothing else.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `temphp-${name}-${runId}@test.cozyvtt.local`;

type Client = Awaited<ReturnType<WsTestServer['connectAndAuth']>>;
type Hp = { current: number; maximum: number; temporary: number };
type Updated = { characterId: string; hp: { current: number; max: number; temp: number } };

let server: WsTestServer;
const ids: Record<'dm' | 'owner' | 'other' | 'spectator', string> = { dm: '', owner: '', other: '', spectator: '' };
const cookies: Record<keyof typeof ids, string> = { dm: '', owner: '', other: '', spectator: '' };
let campaignId: string;
let elsewhereId: string;
/** The owner's D&D 5e fighter, with 10 temporary hit points before each test. */
let fighterId: string;
let clericId: string;
let investigatorId: string;
let blankId: string;
let watcherId: string;
let strangerId: string;

const dndSheet = (hp: Hp) => ({ hp });
const storedHp = async (id: string): Promise<Hp> =>
  ((await prisma.character.findUniqueOrThrow({ where: { id } })).data as unknown as { hp: Hp }).hp;

beforeAll(async () => {
  const users = await Promise.all((Object.keys(ids) as Array<keyof typeof ids>).map((name) =>
    prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Temp ${name}` } })));
  [ids.dm, ids.owner, ids.other, ids.spectator] = users.map((u) => u.id);
  campaignId = (await prisma.campaign.create({ data: { name: `Temp HP ${runId}`, ownerId: ids.dm, vibeSettings: {} } })).id;
  elsewhereId = (await prisma.campaign.create({ data: { name: `Temp HP elsewhere ${runId}`, ownerId: ids.dm, vibeSettings: {} } })).id;
  const character = async (userId: string, gameSystem: 'DND_5E' | 'PATHFINDER_2E' | 'CALL_OF_CTHULHU_7E', data: object, inCampaign = campaignId) =>
    (await prisma.character.create({ data: { userId, campaignId: inCampaign, name: `${gameSystem} ${userId.slice(0, 4)}`, gameSystem, data: toJson(data) } })).id;
  fighterId = await character(ids.owner, 'DND_5E', dndSheet({ current: 20, maximum: 30, temporary: 10 }));
  clericId = await character(ids.owner, 'PATHFINDER_2E', dndSheet({ current: 15, maximum: 18, temporary: 0 }));
  investigatorId = await character(ids.owner, 'CALL_OF_CTHULHU_7E', { derivedStats: { hp: { current: 11, maximum: 11 } } });
  blankId = await character(ids.owner, 'DND_5E', {});
  watcherId = await character(ids.spectator, 'DND_5E', dndSheet({ current: 8, maximum: 8, temporary: 0 }));
  strangerId = await character(ids.owner, 'DND_5E', dndSheet({ current: 8, maximum: 8, temporary: 0 }), elsewhereId);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: ids.dm, campaignId, role: 'DM', characterIds: [] },
      { userId: ids.owner, campaignId, role: 'PLAYER', characterIds: [fighterId, clericId, investigatorId, blankId] },
      { userId: ids.other, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.spectator, campaignId, role: 'SPECTATOR', characterIds: [watcherId] },
      { userId: ids.owner, campaignId: elsewhereId, role: 'PLAYER', characterIds: [strangerId] },
    ],
  });
  server = await createWsTestServer();
  for (const name of Object.keys(ids) as Array<keyof typeof ids>) cookies[name] = await server.loginAs(ids[name]);
});

beforeEach(async () => {
  await prisma.character.update({ where: { id: fighterId }, data: { data: toJson(dndSheet({ current: 20, maximum: 30, temporary: 10 })) } });
});

afterAll(async () => {
  await server?.close();
  await prisma.character.deleteMany({ where: { userId: { in: Object.values(ids) } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, elsewhereId] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.$disconnect();
});

/** Connect as `who`, run `body`, and disconnect. */
async function as(who: keyof typeof ids, body: (client: Client) => Promise<void>): Promise<void> {
  const client = await server.connectAndAuth(cookies[who], campaignId);
  try {
    await body(client);
  } finally {
    client.disconnect();
  }
}

/** Send a grant and wait for the refusal, checking nothing was broadcast. */
async function refused(client: Client, payload: Record<string, unknown>): Promise<string> {
  const error = waitForEvent<{ message: string }>(client, 'error');
  const silence = expectNoEvent(client, 'character.hp.updated', 500);
  client.emit('character.hp.temporary', payload);
  const { message } = await error;
  await silence;
  return message;
}

describe('the character\'s owner', () => {
  it('takes new temporary hit points in place of the ones the character has, never both added', async () => {
    await as('owner', async (owner) => {
      const updated = waitForEvent<Updated>(owner, 'character.hp.updated');
      owner.emit('character.hp.temporary', { characterId: fighterId, temporary: 12 });
      expect(await updated).toEqual({ characterId: fighterId, hp: { current: 20, max: 30, temp: 12 } });
      expect(await storedHp(fighterId)).toEqual({ current: 20, maximum: 30, temporary: 12 });

      const fewer = waitForEvent<Updated>(owner, 'character.hp.updated');
      owner.emit('character.hp.temporary', { characterId: fighterId, temporary: 4 });
      expect((await fewer).hp.temp).toBe(4);
      expect(await storedHp(fighterId)).toEqual({ current: 20, maximum: 30, temporary: 4 });
    });
  });

  it('grants them in Pathfinder 2e too', async () => {
    await as('owner', async (owner) => {
      const updated = waitForEvent<Updated>(owner, 'character.hp.updated');
      owner.emit('character.hp.temporary', { characterId: clericId, temporary: 7 });
      expect((await updated).hp).toEqual({ current: 15, max: 18, temp: 7 });
    });
  });

  it('is told a Call of Cthulhu sheet keeps none, and a sheet with no hit points has nothing to add them to', async () => {
    await as('owner', async (owner) => {
      expect(await refused(owner, { characterId: investigatorId, temporary: 3 })).toBe('Call of Cthulhu sheets keep no temporary hit points');
      expect(await refused(owner, { characterId: blankId, temporary: 3 })).toBe('Character does not have HP tracking');
    });
  });

  it('cannot reach a character of another campaign', async () => {
    await as('owner', async (owner) => {
      expect(await refused(owner, { characterId: strangerId, temporary: 3 })).toBe('Character is not in this campaign');
    });
  });

  it.each([
    ['a character id that is not an id', { characterId: 'not-an-id', temporary: 3 }],
    ['a field it does not take', { characterId: 'FIGHTER', temporary: 3, current: 99 }],
    ['no payload at all', 'grant three'],
  ])('is refused %s', async (_what, payload) => {
    const sent = typeof payload === 'object' && payload.characterId === 'FIGHTER' ? { ...payload, characterId: fighterId } : payload;
    await as('owner', async (owner) => {
      const error = waitForEvent<{ message: string }>(owner, 'error');
      const silence = expectNoEvent(owner, 'character.hp.updated', 500);
      owner.emit('character.hp.temporary', sent);
      expect((await error).message).toBe('characterId (string) and temporary (number) are required');
      await silence;
    });
    expect((await storedHp(fighterId)).temporary).toBe(10);
  });

  it.each([
    ['none', 0], ['a negative number', -5], ['part of a hit point', 2.5], ['more than 99,999', 100_000], ['text', 'ten'], ['nothing', undefined],
  ])('is refused %s, and the character keeps what it had', async (_what, temporary) => {
    await as('owner', async (owner) => {
      expect(await refused(owner, { characterId: fighterId, temporary })).toBe('temporary must be a whole number of hit points from 1 to 99,999');
    });
    expect((await storedHp(fighterId)).temporary).toBe(10);
  });
});

describe('who else may grant them', () => {
  it('is the DM, on any character of the campaign', async () => {
    await as('dm', async (dm) => {
      const updated = waitForEvent<Updated>(dm, 'character.hp.updated');
      dm.emit('character.hp.temporary', { characterId: fighterId, temporary: 15 });
      expect((await updated).hp.temp).toBe(15);
    });
  });

  it('is not another player', async () => {
    await as('other', async (other) => {
      expect(await refused(other, { characterId: fighterId, temporary: 15 })).toBe("You do not have permission to update this character's HP");
    });
    expect((await storedHp(fighterId)).temporary).toBe(10);
  });

  it('is not a spectator, even on a character of their own', async () => {
    await as('spectator', async (spectator) => {
      expect(await refused(spectator, { characterId: watcherId, temporary: 5 })).toBe('Spectators cannot change a character');
    });
    expect((await storedHp(watcherId)).temporary).toBe(0);
  });
});

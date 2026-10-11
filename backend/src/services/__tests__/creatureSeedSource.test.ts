/**
 * Seeding the SRD creatures: what is fetched, from where, and what is kept.
 *
 * The seed followed the `next` address in each Open5e page to whatever host
 * it named, waited on a stalled answer for as long as the network let it
 * (several minutes, holding every other seed back), and stored whatever came
 * back as a shared stat block, one with no speed aborting the whole run. Two
 * seeds at once (the command-line script and the web app, or two backend
 * processes) each read the same library and each added every creature, so
 * the library held them twice.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import {
  fetchAllSrdMonsters,
  seedSrdCreatures,
  SeedSourceError,
  SEED_PAGE_TIMEOUT_MS,
  MAX_SEED_PAGES,
} from '../creatureSeed';

const run = randomUUID().slice(0, 8);
const FIRST = 'https://api.open5e.com/v1/monsters/?format=json&limit=50&document__slug=wotc-srd';

/** An Open5e monster with the fields the seed reads, named for this run. */
function monster(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: name.toLowerCase(),
    name: `${name} ${run}`,
    size: 'Small',
    type: 'humanoid',
    subtype: '',
    group: null,
    alignment: 'neutral evil',
    armor_class: 15,
    armor_desc: '',
    hit_points: 7,
    hit_dice: '2d6',
    speed: { walk: 30 },
    strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8,
    strength_save: null, dexterity_save: null, constitution_save: null,
    intelligence_save: null, wisdom_save: null, charisma_save: null,
    skills: {},
    senses: '',
    languages: '',
    challenge_rating: '1/4',
    cr: 0.25,
    actions: null, bonus_actions: null, reactions: null, special_abilities: null,
    legendary_desc: '', legendary_actions: null,
    damage_vulnerabilities: '', damage_resistances: '', damage_immunities: '', condition_immunities: '',
    document__slug: 'wotc-srd',
    document__title: 'Systems Reference Document',
    ...overrides,
  };
}

const page = (results: unknown[], next: string | null = null) =>
  new Response(JSON.stringify({ count: results.length, next, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const fetchSpy = () => jest.spyOn(globalThis, 'fetch');

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await prisma.creatureTemplate.deleteMany({ where: { source: 'srd', name: { endsWith: ` ${run}` } } });
  await prisma.$disconnect();
});

const rowsNamed = (name: string) => prisma.creatureTemplate.count({ where: { source: 'srd', name: `${name} ${run}` } });

describe('fetchAllSrdMonsters', () => {
  it('follows the next page only on api.open5e.com', async () => {
    const spy = fetchSpy().mockResolvedValueOnce(page([monster('Lure')], 'https://evil.example/v1/monsters/?page=2'));

    await expect(fetchAllSrdMonsters({ pageDelayMs: 0 })).rejects.toThrow(SeedSourceError);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toBe(FIRST);
  });

  it('gives each page a time limit, and says when Open5e did not answer in time', async () => {
    const spy = fetchSpy().mockRejectedValueOnce(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));

    await expect(fetchAllSrdMonsters({ pageDelayMs: 0 })).rejects.toThrow(
      `api.open5e.com did not answer within ${SEED_PAGE_TIMEOUT_MS / 1000} seconds`
    );
    const init = spy.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it(`stops after ${MAX_SEED_PAGES} pages`, async () => {
    const spy = fetchSpy().mockImplementation(async () => page([monster('Loop')], `${FIRST}&page=2`));

    await expect(fetchAllSrdMonsters({ pageDelayMs: 0 })).rejects.toThrow(SeedSourceError);
    expect(spy).toHaveBeenCalledTimes(MAX_SEED_PAGES);
  });

  it('refuses a page that is not a list of creatures', async () => {
    fetchSpy().mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'nope' }), { status: 200 }));
    await expect(fetchAllSrdMonsters({ pageDelayMs: 0 })).rejects.toThrow(SeedSourceError);
  });
});

describe('seedSrdCreatures', () => {
  it('skips a stat block the creature library would refuse, and one it cannot read', async () => {
    fetchSpy().mockResolvedValueOnce(page([
      monster('Kept'),
      monster('Armoured', { armor_class: 500 }),
      monster('Speedless', { speed: null }),
    ]));

    const result = await seedSrdCreatures(prisma, { pageDelayMs: 0 });

    expect(await rowsNamed('Kept')).toBe(1);
    expect(await rowsNamed('Armoured')).toBe(0);
    // No speed is read as none, not a reason to stop the whole seed.
    expect(await rowsNamed('Speedless')).toBe(1);
    expect(result.rejected).toBe(1);
  });

  it('creates each creature once when two seeds run at the same time', async () => {
    fetchSpy().mockImplementation(async () => page([monster('Twice')]));

    await Promise.all([seedSrdCreatures(prisma, { pageDelayMs: 0 }), seedSrdCreatures(prisma, { pageDelayMs: 0 })]);

    expect(await rowsNamed('Twice')).toBe(1);
  });
});

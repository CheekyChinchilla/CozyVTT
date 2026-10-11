/**
 * The lists on a typed sheet are held to a count, and a sheet stored over it
 * keeps loading.
 *
 * Only the 1 MB request body limited them, so a player could store tens of
 * thousands of inventory rows, spells or attacks, and every member of the
 * campaign who opened the sheet drew them all.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { getBlankCharacterTemplate } from '../../validators/game-systems';
import { PF2E_ITEM_BONUS_MAX, SHEET_LIST_MAX, SPELL_SLOTS_MAX } from '../../validators/game-systems/sheetLimits';
import { GameSystem } from '../../game-systems';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const u = await createTestUser({ displayName: 'Packrat' });
  userId = u.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.characterTemplate.deleteMany({ where: { createdById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

/** What a refused save names: each field and its reason. */
const named = (body: { validationErrors: Array<{ path: string; message: string }> }) =>
  body.validationErrors.map((issue) => `${issue.path}: ${issue.message}`);

const refusal = (path: string) => [`${path}: Can hold at most ${SHEET_LIST_MAX} entries`];

describe('a D&D 5e sheet', () => {
  const gameSystem = GameSystem.DND_5E;
  const blank = () => getBlankCharacterTemplate(gameSystem) as Record<string, unknown>;
  const rows = (count: number) => Array.from({ length: count }, (_unused, i) => ({ name: `Item ${i}` }));

  async function create(): Promise<string> {
    const res = await agent.post('/api/characters').send({ name: 'Hoarder', gameSystem, data: blank() });
    expect(res.status).toBe(201);
    return res.body.character.id as string;
  }

  it(`refuses a save with ${SHEET_LIST_MAX + 1} inventory rows, naming the list`, async () => {
    const id = await create();
    const res = await agent.put(`/api/characters/${id}`).send({ data: { ...blank(), inventory: rows(SHEET_LIST_MAX + 1) } });

    expect(res.status).toBe(400);
    expect(named(res.body)).toEqual(refusal('inventory'));
    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect((stored.data as { inventory: unknown[] }).inventory).toEqual([]);
  });

  it(`takes ${SHEET_LIST_MAX} inventory rows`, async () => {
    const id = await create();
    const res = await agent.put(`/api/characters/${id}`).send({ data: { ...blank(), inventory: rows(SHEET_LIST_MAX) } });
    expect(res.status).toBe(200);
    expect(res.body.character.data.inventory).toHaveLength(SHEET_LIST_MAX);
  });

  it('keeps loading a sheet stored over the limit, and refuses its next save until the list is shortened', async () => {
    const id = await create();
    const over = rows(SHEET_LIST_MAX + 100);
    await prisma.character.update({ where: { id }, data: { data: { ...blank(), inventory: over } as Prisma.InputJsonValue } });

    const loaded = await agent.get(`/api/characters/${id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.character.data.inventory).toHaveLength(SHEET_LIST_MAX + 100);

    const unchanged = await agent.put(`/api/characters/${id}`).send({ data: loaded.body.character.data });
    expect(unchanged.status).toBe(400);
    expect(named(unchanged.body)).toEqual(refusal('inventory'));

    const shortened = await agent
      .put(`/api/characters/${id}`)
      .send({ data: { ...loaded.body.character.data, inventory: over.slice(0, SHEET_LIST_MAX) } });
    expect(shortened.status).toBe(200);
  });

  it('refuses a template with too many spells, naming the list', async () => {
    const spell = { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false };
    const data = { ...blank(), spellcasting: { spells: Array.from({ length: SHEET_LIST_MAX + 1 }, () => spell) } };
    const res = await agent.post('/api/character-templates').send({ name: 'Spellbook', gameSystem, data });

    expect(res.status).toBe(400);
    expect(named(res.body)).toEqual(refusal('spellcasting.spells'));
  });
});

describe('a Pathfinder 2e sheet', () => {
  const gameSystem = GameSystem.PATHFINDER_2E;
  const blank = () => getBlankCharacterTemplate(gameSystem) as Record<string, unknown>;

  async function create(): Promise<string> {
    const res = await agent.post('/api/characters').send({ name: 'Seelah', gameSystem, data: blank() });
    expect(res.status).toBe(201);
    return res.body.character.id as string;
  }

  it('refuses too many languages, an item bonus out of range and a slot total no caster has, naming each', async () => {
    const id = await create();
    const sheet = blank() as {
      savingThrows: { will: Record<string, unknown> };
      languages: string[];
      spellcasting?: unknown;
    };
    sheet.languages = Array.from({ length: SHEET_LIST_MAX + 1 }, () => 'Common');
    sheet.savingThrows = { ...sheet.savingThrows, will: { ...sheet.savingThrows.will, itemBonus: PF2E_ITEM_BONUS_MAX + 1 } };
    const slots = Object.fromEntries(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((rank) => [rank, { total: 0, expended: 0 }])
    );
    sheet.spellcasting = { slots: { ...slots, '2': { total: SPELL_SLOTS_MAX + 1, expended: 0 } } };

    const res = await agent.put(`/api/characters/${id}`).send({ data: sheet });

    expect(res.status).toBe(400);
    expect(named(res.body).sort()).toEqual(
      [
        `languages: Can hold at most ${SHEET_LIST_MAX} entries`,
        `savingThrows.will.itemBonus: Must be from -30 to 30`,
        `spellcasting.slots.2.total: Must be from 0 to ${SPELL_SLOTS_MAX}`,
      ].sort()
    );
  });

  it('keeps loading a sheet stored with an item bonus out of range, and refuses its next save', async () => {
    const id = await create();
    const stored = blank() as { skills: { stealth: Record<string, unknown> } };
    stored.skills = { ...stored.skills, stealth: { ...stored.skills.stealth, itemBonus: 900 } };
    await prisma.character.update({ where: { id }, data: { data: stored as unknown as Prisma.InputJsonValue } });

    const loaded = await agent.get(`/api/characters/${id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.character.data.skills.stealth.itemBonus).toBe(900);

    const unchanged = await agent.put(`/api/characters/${id}`).send({ data: loaded.body.character.data });
    expect(unchanged.status).toBe(400);
    expect(named(unchanged.body)).toEqual(['skills.stealth.itemBonus: Must be from -30 to 30']);
  });
});

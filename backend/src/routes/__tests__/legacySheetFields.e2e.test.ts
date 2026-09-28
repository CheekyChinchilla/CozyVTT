/**
 * A sheet written before 1.3.0 keeps what its old fields held when it is saved.
 *
 * The built-in templates of those versions wrote fields that were later
 * renamed or folded into others, and `npm run migrate:sheet-fields` moves them.
 * The routes store the schema's parsed sheet, which drops a field the schema
 * does not declare, so a sheet saved before anyone ran the script lost that
 * content outright. The routes now move it first, the same way the script does.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { getBlankTemplate } from '../../utils/character-templates';
import { GameSystem } from '../../game-systems';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const u = await createTestUser({ email: `legacy-${Date.now()}@test.cozyvtt.local`, displayName: 'Legacy' });
  userId = u.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

type Sheet = Record<string, unknown>;

const without = (sheet: Sheet, keys: string[]): Sheet =>
  Object.fromEntries(Object.entries(sheet).filter(([key]) => !keys.includes(key)));

/** A D&D 5e sheet in the shape the 1.2.2 Fighter template wrote. */
function dnd122(): Sheet {
  return {
    ...without(getBlankTemplate(GameSystem.DND_5E).data, [
      'proficiencies', 'proficienciesAndLanguages', 'featuresAndTraits', 'personality', 'alliesAndOrganizations',
    ]),
    languages: ['Common'],
    proficiencies: ['All armor', 'Simple weapons'],
    features: [{ name: 'Second Wind', description: 'Regain 1d10 + level hit points.' }],
    personalityTraits: 'I can stare down a hell hound.',
    ideals: 'Greater Good.',
    bonds: 'My unit.',
    flaws: 'Little respect for the untested.',
    allies: 'Former members of the military unit',
  };
}

/** A Pathfinder 2e sheet in the shape the 1.2.2 Fighter template wrote. */
function pf2e122(): Sheet {
  return {
    ...without(getBlankTemplate(GameSystem.PATHFINDER_2E).data, ['strikes', 'classFeatures']),
    attacks: [{ name: 'Warhammer', range: 'melee', damageRoll: '1d8', damageType: 'bludgeoning' }],
    specialAbilities: [{ name: 'Shield Block', description: 'Use your shield to prevent damage.' }],
  };
}

/** A Call of Cthulhu sheet with the player recorded under its old name. */
function coc122(): Sheet {
  return { ...without(getBlankTemplate(GameSystem.CALL_OF_CTHULHU_7E).data, ['playerName']), player: 'Pat' };
}

async function createThenPut(gameSystem: string, data: Sheet): Promise<{ id: string; stored: Sheet }> {
  const created = await agent
    .post('/api/characters')
    .send({ name: 'Legacy', gameSystem, data: getBlankTemplate(gameSystem as GameSystem).data });
  expect(created.status).toBe(201);
  const id: string = created.body.character.id;
  const res = await agent.put(`/api/characters/${id}`).send({ data });
  expect(res.status).toBe(200);
  const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
  return { id, stored: stored.data as Sheet };
}

describe('saving a sheet written before 1.3.0', () => {
  it('moves the old D&D 5e fields where the sheet reads them', async () => {
    const { stored } = await createThenPut('DND_5E', dnd122());

    expect(stored.personality).toEqual({
      traits: 'I can stare down a hell hound.',
      ideals: 'Greater Good.',
      bonds: 'My unit.',
      flaws: 'Little respect for the untested.',
    });
    expect(stored.alliesAndOrganizations).toEqual({ name: 'Former members of the military unit' });
    expect(stored.featuresAndTraits).toEqual([
      { name: 'Second Wind', description: 'Regain 1d10 + level hit points.' },
    ]);
    expect(stored.proficienciesAndLanguages).toEqual(['All armor', 'Simple weapons', 'Common']);
    for (const old of ['languages', 'proficiencies', 'features', 'personalityTraits', 'ideals', 'bonds', 'flaws', 'allies']) {
      expect(stored).not.toHaveProperty(old);
    }
  });

  it('moves the old Pathfinder 2e fields where the sheet reads them', async () => {
    const { stored } = await createThenPut('PATHFINDER_2E', pf2e122());

    expect(stored.strikes).toEqual([
      { name: 'Warhammer', type: 'melee', damageRoll: '1d8', damageType: 'bludgeoning' },
    ]);
    expect(stored.classFeatures).toEqual([
      { name: 'Shield Block', description: 'Use your shield to prevent damage.' },
    ]);
    expect(stored).not.toHaveProperty('attacks');
    expect(stored).not.toHaveProperty('specialAbilities');
  });

  it('moves a Call of Cthulhu player name where the sheet reads it', async () => {
    const { stored } = await createThenPut('CALL_OF_CTHULHU_7E', coc122());

    expect(stored.playerName).toBe('Pat');
    expect(stored).not.toHaveProperty('player');
  });

  it('moves them when a character is created from such a sheet', async () => {
    const res = await agent.post('/api/characters').send({ name: 'Imported', gameSystem: 'DND_5E', data: dnd122() });
    expect(res.status).toBe(201);

    const stored = (await prisma.character.findUniqueOrThrow({ where: { id: res.body.character.id } })).data as Sheet;
    expect((stored.personality as Sheet).traits).toBe('I can stare down a hell hound.');
    expect(stored.proficienciesAndLanguages).toEqual(['All armor', 'Simple weapons', 'Common']);
  });

  it('changes nothing on a second save', async () => {
    const { id, stored } = await createThenPut('PATHFINDER_2E', pf2e122());

    expect((await agent.put(`/api/characters/${id}`).send({ data: stored })).status).toBe(200);

    const again = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(again.data).toEqual(stored);
  });
});

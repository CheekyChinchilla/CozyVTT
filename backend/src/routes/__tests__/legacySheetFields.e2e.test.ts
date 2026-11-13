/**
 * A sheet written before 1.3.0 keeps what its old fields held when it is saved.
 *
 * The built-in templates of those versions wrote fields that were later
 * renamed or folded into others, and `npm run migrate:sheet-fields` moves them.
 * The routes store the schema's parsed sheet, which drops a field the schema
 * does not declare, so a sheet saved before anyone ran the script lost that
 * content outright. The routes now move it first, the same way the script does.
 *
 * Published character templates are older than 1.3.0 too, and the script
 * moves only characters, so the template routes move the fields the same way.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { getBlankTemplate } from '../../utils/character-templates';
import { toJson } from '../../utils/prisma-json';
import { GameSystem, type SupportedGameSystem } from '../../game-systems';

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
  // A template outlives its author, so it is removed first.
  await prisma.characterTemplate.deleteMany({ where: { createdById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

type Sheet = Record<string, unknown>;

const without = (sheet: Sheet, keys: string[]): Sheet =>
  Object.fromEntries(Object.entries(sheet).filter(([key]) => !keys.includes(key)));

/** A 5E sheet in the shape the 1.2.2 Fighter template wrote. */
function fifthEditionFrom122(): Sheet {
  return {
    ...without(getBlankTemplate(GameSystem.FIFTH_EDITION).data, [
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

/** A Fantasy d20 sheet in the shape the 1.2.2 Fighter template wrote. */
function fantasyD20From122(): Sheet {
  return {
    ...without(getBlankTemplate(GameSystem.FANTASY_D20).data, ['strikes', 'classFeatures']),
    attacks: [{ name: 'Warhammer', range: 'melee', damageRoll: '1d8', damageType: 'bludgeoning' }],
    specialAbilities: [{ name: 'Shield Block', description: 'Use your shield to prevent damage.' }],
  };
}

/** A Horror d100 sheet with the player recorded under its old name. */
function horrorD100From122(): Sheet {
  return { ...without(getBlankTemplate(GameSystem.HORROR_D100).data, ['playerName']), player: 'Pat' };
}

async function createThenPut(gameSystem: SupportedGameSystem, data: Sheet): Promise<{ id: string; stored: Sheet }> {
  const created = await agent
    .post('/api/characters')
    .send({ name: 'Legacy', gameSystem, data: getBlankTemplate(gameSystem).data });
  expect(created.status).toBe(201);
  const id: string = created.body.character.id;
  const res = await agent.put(`/api/characters/${id}`).send({ data });
  expect(res.status).toBe(200);
  const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
  return { id, stored: stored.data as Sheet };
}

describe('saving a sheet written before 1.3.0', () => {
  it('moves the old 5E fields where the sheet reads them', async () => {
    const { stored } = await createThenPut('FIFTH_EDITION', fifthEditionFrom122());

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

  it('moves the old Fantasy d20 fields where the sheet reads them', async () => {
    const { stored } = await createThenPut('FANTASY_D20', fantasyD20From122());

    expect(stored.strikes).toEqual([
      { name: 'Warhammer', type: 'melee', damageRoll: '1d8', damageType: 'bludgeoning' },
    ]);
    expect(stored.classFeatures).toEqual([
      { name: 'Shield Block', description: 'Use your shield to prevent damage.' },
    ]);
    expect(stored).not.toHaveProperty('attacks');
    expect(stored).not.toHaveProperty('specialAbilities');
  });

  it('moves a Horror d100 player name where the sheet reads it', async () => {
    const { stored } = await createThenPut('HORROR_D100', horrorD100From122());

    expect(stored.playerName).toBe('Pat');
    expect(stored).not.toHaveProperty('player');
  });

  it('moves them when a character is created from such a sheet', async () => {
    const res = await agent.post('/api/characters').send({ name: 'Imported', gameSystem: 'FIFTH_EDITION', data: fifthEditionFrom122() });
    expect(res.status).toBe(201);

    const stored = (await prisma.character.findUniqueOrThrow({ where: { id: res.body.character.id } })).data as Sheet;
    expect((stored.personality as Sheet).traits).toBe('I can stare down a hell hound.');
    expect(stored.proficienciesAndLanguages).toEqual(['All armor', 'Simple weapons', 'Common']);
  });

  it('changes nothing on a second save', async () => {
    const { id, stored } = await createThenPut('FANTASY_D20', fantasyD20From122());

    expect((await agent.put(`/api/characters/${id}`).send({ data: stored })).status).toBe(200);

    const again = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(again.data).toEqual(stored);
  });
});

describe('a character template written before 1.3.0', () => {
  async function publish(gameSystem: string, data: Sheet): Promise<{ body: Sheet; stored: Sheet }> {
    const res = await agent.post('/api/character-templates').send({ name: 'Legacy Template', gameSystem, data });
    expect(res.status).toBe(201);
    const stored = await prisma.characterTemplate.findUniqueOrThrow({ where: { id: res.body.id } });
    return { body: res.body.data as Sheet, stored: stored.data as Sheet };
  }

  it('moves the old Fantasy d20 fields where the sheet reads them when it is published', async () => {
    const { body, stored } = await publish('FANTASY_D20', fantasyD20From122());

    expect(stored.strikes).toEqual([
      { name: 'Warhammer', type: 'melee', damageRoll: '1d8', damageType: 'bludgeoning' },
    ]);
    expect(stored.classFeatures).toEqual([
      { name: 'Shield Block', description: 'Use your shield to prevent damage.' },
    ]);
    expect(stored).not.toHaveProperty('attacks');
    expect(stored).not.toHaveProperty('specialAbilities');
    expect(body).toEqual(stored);
  });

  it('moves the old 5E fields where the sheet reads them when it is published', async () => {
    const { stored } = await publish('FIFTH_EDITION', fifthEditionFrom122());

    expect(stored.personality).toEqual({
      traits: 'I can stare down a hell hound.',
      ideals: 'Greater Good.',
      bonds: 'My unit.',
      flaws: 'Little respect for the untested.',
    });
    expect(stored.alliesAndOrganizations).toEqual({ name: 'Former members of the military unit' });
    expect(stored.proficienciesAndLanguages).toEqual(['All armor', 'Simple weapons', 'Common']);
  });

  // A template carries no player's name, under either the old field or the
  // one the sheet reads now: everyone can read a template.
  it('drops a Horror d100 player name, under its old field too, when it is published', async () => {
    const { stored } = await publish('HORROR_D100', horrorD100From122());

    expect(stored).not.toHaveProperty('playerName');
    expect(stored).not.toHaveProperty('player');
  });

  it('keeps what a template stored before 1.3.0 holds when its editor saves it back', async () => {
    // As an older version stored it, which the one-off script does not touch.
    const older = fantasyD20From122();
    const template = await prisma.characterTemplate.create({
      data: { name: 'Published in 1.2', gameSystem: 'FANTASY_D20', data: toJson(older), createdById: userId },
    });

    // The template editor sends the sheet it loaded back with the change made.
    const res = await agent
      .put(`/api/character-templates/${template.id}`)
      .send({ data: { ...older, characterName: 'Renamed' } });
    expect(res.status).toBe(200);

    const stored = (await prisma.characterTemplate.findUniqueOrThrow({ where: { id: template.id } })).data as Sheet;
    expect(stored.characterName).toBe('Renamed');
    expect(stored.classFeatures).toEqual([
      { name: 'Shield Block', description: 'Use your shield to prevent damage.' },
    ]);
    expect(stored.strikes).toEqual([
      { name: 'Warhammer', type: 'melee', damageRoll: '1d8', damageType: 'bludgeoning' },
    ]);
  });
});

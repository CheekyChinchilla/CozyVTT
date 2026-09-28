/**
 * A character's sheet blob is stored as its schema returns it.
 *
 * Before this test the routes validated `data` against the game-system schema
 * and then stored the original object, so any key the schema does not declare
 * went into the database untouched. The parsed result is stored now, and a
 * key the sheet does not declare is dropped on the way in. The companion
 * template test proves the built-in sheets lose nothing to this.
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
  const u = await createTestUser({ email: `strip-${Date.now()}@test.cozyvtt.local`, displayName: 'Strip' });
  userId = u.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

const blank = (): Record<string, unknown> => getBlankTemplate(GameSystem.DND_5E).data;
const keyCount = (v: unknown): number => Object.keys(v as object).length;

it('drops a key the schema does not declare when a character is created', async () => {
  const res = await agent
    .post('/api/characters')
    .send({ name: 'Strip Me', gameSystem: 'DND_5E', data: { ...blank(), injected: 'nope' } });
  expect(res.status).toBe(201);

  const stored = await prisma.character.findUniqueOrThrow({ where: { id: res.body.character.id } });
  expect(stored.data).not.toHaveProperty('injected');
  expect(keyCount(stored.data)).toBeGreaterThanOrEqual(keyCount(blank()));
});

it('drops a key the schema does not declare when a character is updated', async () => {
  const created = await agent
    .post('/api/characters')
    .send({ name: 'Strip Me Too', gameSystem: 'DND_5E', data: blank() });
  expect(created.status).toBe(201);
  const id: string = created.body.character.id;

  const res = await agent
    .put(`/api/characters/${id}`)
    .send({ data: { ...blank(), injected: 'nope', nested: { deeper: 1 } } });
  expect(res.status).toBe(200);

  const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
  expect(stored.data).not.toHaveProperty('injected');
  expect(stored.data).not.toHaveProperty('nested');
  expect(keyCount(stored.data)).toBeGreaterThanOrEqual(keyCount(blank()));
});

/**
 * A field the editor writes has to be one the schema declares, or it is lost on
 * the first save. The Pathfinder 2e editor gives every feat a description box.
 */
describe('Pathfinder 2e feat descriptions', () => {
  const pf2e = (): Record<string, unknown> => getBlankTemplate(GameSystem.PATHFINDER_2E).data;
  const withFeat = (): Record<string, unknown> => ({
    ...pf2e(),
    feats: {
      ancestryAndHeritage: [],
      class: [{ name: 'Power Attack', level: 1, description: 'Two actions, one extra die.' }],
      skill: [],
      general: [],
      bonus: [],
    },
  });
  const storedFeat = async (id: string): Promise<unknown> => {
    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    return (stored.data as { feats: { class: unknown[] } }).feats.class[0];
  };

  it('keeps a feat description when a character is created', async () => {
    const res = await agent
      .post('/api/characters')
      .send({ name: 'Feat Keeper', gameSystem: 'PATHFINDER_2E', data: withFeat() });
    expect(res.status).toBe(201);

    expect(await storedFeat(res.body.character.id)).toEqual({
      name: 'Power Attack',
      level: 1,
      description: 'Two actions, one extra die.',
    });
  });

  it('keeps a feat description when a character is updated', async () => {
    const created = await agent
      .post('/api/characters')
      .send({ name: 'Feat Keeper Too', gameSystem: 'PATHFINDER_2E', data: pf2e() });
    expect(created.status).toBe(201);
    const id: string = created.body.character.id;

    const res = await agent.put(`/api/characters/${id}`).send({ data: withFeat() });
    expect(res.status).toBe(200);

    expect(await storedFeat(id)).toEqual({
      name: 'Power Attack',
      level: 1,
      description: 'Two actions, one extra die.',
    });
  });
});

/** A Call of Cthulhu custom skill carries its own name, which the sheet shows. */
describe('Call of Cthulhu custom skill names', () => {
  const coc = (): Record<string, unknown> & { skills: Record<string, unknown> } =>
    getBlankTemplate(GameSystem.CALL_OF_CTHULHU_7E).data as Record<string, unknown> & { skills: Record<string, unknown> };
  const withCustomSkill = (): Record<string, unknown> => {
    const sheet = coc();
    return {
      ...sheet,
      skills: {
        ...sheet.skills,
        customSkills: [{ name: 'Cryptography', baseValue: 1, currentValue: 40, improvementChecked: false }],
      },
    };
  };

  it('keeps a custom skill name when a character is updated', async () => {
    const created = await agent
      .post('/api/characters')
      .send({ name: 'Custom Skill Keeper', gameSystem: 'CALL_OF_CTHULHU_7E', data: coc() });
    expect(created.status).toBe(201);
    const id: string = created.body.character.id;

    const res = await agent.put(`/api/characters/${id}`).send({ data: withCustomSkill() });
    expect(res.status).toBe(200);

    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect((stored.data as { skills: { customSkills: unknown[] } }).skills.customSkills).toEqual([
      { name: 'Cryptography', baseValue: 1, currentValue: 40, improvementChecked: false },
    ]);
  });
});

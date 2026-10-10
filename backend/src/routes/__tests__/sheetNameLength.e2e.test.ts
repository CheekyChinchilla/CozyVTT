/**
 * The name on a sheet is held to the 200 characters a character's name is.
 *
 * Saving a sheet copies the name written on it into the character's name
 * column, and no sheet schema bounded that field, so a save could make the
 * name any length up to the request limit. That name goes to the whole
 * campaign: the roster, tokens, initiative and the dice log.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { getBlankCharacterTemplate } from '../../validators/game-systems';
import { GameSystem } from '../../game-systems';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const u = await createTestUser({ displayName: 'Namer' });
  userId = u.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.characterTemplate.deleteMany({ where: { createdById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

const systems: Array<[GameSystem, string]> = [
  [GameSystem.DND_5E, 'characterName'],
  [GameSystem.PATHFINDER_2E, 'characterName'],
  [GameSystem.CALL_OF_CTHULHU_7E, 'investigatorName'],
  [GameSystem.SHADOWRUN_6E, 'characterName'],
];

describe.each(systems)('a %s sheet', (gameSystem, field) => {
  const blank = () => getBlankCharacterTemplate(gameSystem) as Record<string, unknown>;

  async function create(): Promise<string> {
    const res = await agent.post('/api/characters').send({ name: 'Short Name', gameSystem, data: blank() });
    expect(res.status).toBe(201);
    return res.body.character.id as string;
  }

  it(`refuses a ${field} of 500,000 characters and keeps the name`, async () => {
    const id = await create();
    const res = await agent.put(`/api/characters/${id}`).send({ data: { ...blank(), [field]: 'x'.repeat(500_000) } });

    expect(res.status).toBe(400);
    expect(res.body.validationErrors.map((issue: { path: string }) => issue.path)).toContain(field);
    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(stored.name).toBe('Short Name');
  });

  it(`refuses a ${field} of 201 characters`, async () => {
    const id = await create();
    const res = await agent.put(`/api/characters/${id}`).send({ data: { ...blank(), [field]: 'x'.repeat(201) } });
    expect(res.status).toBe(400);
  });

  it(`takes a ${field} of 200 characters as the character's name`, async () => {
    const id = await create();
    const res = await agent.put(`/api/characters/${id}`).send({ data: { ...blank(), [field]: 'y'.repeat(200) } });
    expect(res.status).toBe(200);
    expect(res.body.character.name).toBe('y'.repeat(200));
  });

  it(`refuses a template whose ${field} is over 200 characters`, async () => {
    const res = await agent
      .post('/api/character-templates')
      .send({ name: 'Long', gameSystem, data: { ...blank(), [field]: 'x'.repeat(201) } });
    expect(res.status).toBe(400);
  });
});

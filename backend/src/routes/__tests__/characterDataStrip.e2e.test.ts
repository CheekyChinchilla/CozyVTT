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

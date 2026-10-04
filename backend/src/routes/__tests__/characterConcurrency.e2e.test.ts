/**
 * A save made from a sheet that has changed since it was loaded is refused.
 *
 * A player's open sheet holds the hit points it loaded. When the DM took some
 * away in the meantime, the player's next save put the old number back, with
 * everything else on the sheet. `PUT /api/characters/:id` now takes the
 * `updatedAt` the sheet was loaded with and answers 409 when the character has
 * changed since. A request without one is saved as before, so a program that
 * does not send it keeps working.
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
  const u = await createTestUser({ email: `concurrency-${Date.now()}@test.cozyvtt.local`, displayName: 'Concurrent' });
  userId = u.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

type Sheet = Record<string, unknown> & { hp: { current: number; maximum: number; temporary: number } };

const sheet = (current: number): Sheet => {
  const blank = getBlankTemplate(GameSystem.DND_5E).data as Sheet;
  return { ...blank, hp: { ...blank.hp, maximum: 20, current } };
};

async function create(): Promise<{ id: string; updatedAt: string }> {
  const res = await agent.post('/api/characters').send({ name: 'Versioned', gameSystem: 'DND_5E', data: sheet(20) });
  expect(res.status).toBe(201);
  return { id: res.body.character.id, updatedAt: res.body.character.updatedAt };
}

const storedHp = async (id: string): Promise<number> =>
  ((await prisma.character.findUniqueOrThrow({ where: { id } })).data as unknown as Sheet).hp.current;

describe('PUT /api/characters/:id with the updatedAt it was loaded with', () => {
  it('saves when nothing has changed since, and returns the new updatedAt', async () => {
    const { id, updatedAt } = await create();

    const res = await agent.put(`/api/characters/${id}`).send({ data: sheet(15), updatedAt });

    expect(res.status).toBe(200);
    expect(new Date(res.body.character.updatedAt).getTime()).toBeGreaterThan(new Date(updatedAt).getTime());
    expect(await storedHp(id)).toBe(15);
  });

  it('refuses with 409 when the character changed after it was loaded', async () => {
    const { id, updatedAt } = await create();
    // The DM takes 12 hit points while the player's sheet is open.
    expect((await agent.put(`/api/characters/${id}`).send({ data: sheet(8) })).status).toBe(200);

    const res = await agent.put(`/api/characters/${id}`).send({ data: sheet(20), updatedAt });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHARACTER_CHANGED');
    expect(await storedHp(id)).toBe(8);
  });

  it('saves as before when no updatedAt is sent', async () => {
    const { id } = await create();
    expect((await agent.put(`/api/characters/${id}`).send({ data: sheet(8) })).status).toBe(200);

    const res = await agent.put(`/api/characters/${id}`).send({ data: sheet(20) });

    expect(res.status).toBe(200);
    expect(await storedHp(id)).toBe(20);
  });

  it('refuses an updatedAt that is not a date', async () => {
    const { id } = await create();

    const res = await agent.put(`/api/characters/${id}`).send({ data: sheet(5), updatedAt: 'yesterday' });

    expect(res.status).toBe(400);
    expect(await storedHp(id)).toBe(20);
  });
});

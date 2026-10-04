/**
 * Saving someone else's character is refused before anything about it is told.
 *
 * The update compared the sent `gameSystem` with the character's before
 * checking who was asking, so a stranger holding the id got 400 for a wrong
 * guess and 403 for a right one, and could learn which system it uses. The
 * permission check now comes first; the owner still gets the 400.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { getBlankTemplate } from '../../utils/character-templates';
import { GameSystem } from '../../game-systems';

const app = createTestApp();
const created: string[] = [];
let owner: ReturnType<typeof request.agent>;
let stranger: ReturnType<typeof request.agent>;
let characterId: string;

async function signIn(label: string) {
  const u = await createTestUser({ email: `permfirst-${label}-${Date.now()}@test.cozyvtt.local` });
  created.push(u.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

beforeAll(async () => {
  owner = await signIn('owner');
  stranger = await signIn('stranger');
  const res = await owner
    .post('/api/characters')
    .send({ name: 'Probed', gameSystem: 'DND_5E', data: getBlankTemplate(GameSystem.DND_5E).data });
  expect(res.status).toBe(201);
  characterId = res.body.character.id;
});

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it.each(['DND_5E', 'PATHFINDER_2E'])(
  'answers a stranger 403 whichever system they name (%s)',
  async (gameSystem) => {
    const res = await stranger.put(`/api/characters/${characterId}`).send({ gameSystem });

    expect(res.status).toBe(403);
  },
);

it('still tells the owner the game system cannot change', async () => {
  const res = await owner.put(`/api/characters/${characterId}`).send({ gameSystem: 'PATHFINDER_2E' });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/Cannot change game system/);
});

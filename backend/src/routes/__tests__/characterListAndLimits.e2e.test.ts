/**
 * The character list carries no sheets, and one account owns at most 1,000
 * characters.
 *
 * GET /api/characters returned every sheet the user owned in full, unpaged,
 * and nothing limited how many characters one account could create or copy,
 * each up to the 1 MB body limit. A script could fill the database, and its
 * own list request then had the backend load every sheet at once. A copy also
 * added " (Copy)" past the 200 characters a name may have.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const users: string[] = [];

async function signedIn(): Promise<{ id: string; agent: request.Agent }> {
  const user = await createTestUser({ displayName: 'Character limits' });
  users.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

afterAll(async () => {
  await prisma.character.deleteMany({ where: { userId: { in: users } } });
  await cleanupUsers(users);
  await prisma.$disconnect();
});

const LIMIT_MESSAGE =
  'You already have 1000 characters, the most one account can. Delete one you no longer need to make room.';

describe('GET /api/characters', () => {
  it('lists characters without their sheets, and serves the sheet by id', async () => {
    const { agent } = await signedIn();
    const created = await agent.post('/api/characters').send({ name: 'Summary Only', data: { notes: 'long sheet text' } });
    expect(created.status).toBe(201);

    const list = await agent.get('/api/characters');
    expect(list.status).toBe(200);
    expect(list.body.characters).toHaveLength(1);
    expect(list.body.characters[0]).not.toHaveProperty('data');
    expect(list.body.characters[0]).toMatchObject({ id: created.body.character.id, name: 'Summary Only', gameSystem: null, campaign: null });

    const one = await agent.get(`/api/characters/${created.body.character.id}`);
    expect(one.status).toBe(200);
    expect(one.body.character.data).toBeDefined();
  });
});

describe('how many characters one account may own', () => {
  it('refuses a new character or a copy past 1,000, and takes one again after a delete', async () => {
    const { id, agent } = await signedIn();
    await prisma.character.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({ userId: id, name: `Bulk ${i}`, data: {} })),
    });
    const one = await prisma.character.findFirstOrThrow({ where: { userId: id } });

    const refused = await agent.post('/api/characters').send({ name: 'One Too Many' });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(LIMIT_MESSAGE);

    const copy = await agent.post(`/api/characters/${one.id}/copy`);
    expect(copy.status).toBe(400);
    expect(copy.body.message).toBe(LIMIT_MESSAGE);
    expect(await prisma.character.count({ where: { userId: id } })).toBe(1000);

    await prisma.character.delete({ where: { id: one.id } });
    expect((await agent.post('/api/characters').send({ name: 'Room Again' })).status).toBe(201);
  });
});

describe('POST /api/characters/:id/copy', () => {
  it('keeps the copy within the 200 characters a name may have', async () => {
    const { agent } = await signedIn();
    const name = 'n'.repeat(200);
    const created = await agent.post('/api/characters').send({ name });
    expect(created.status).toBe(201);

    const copy = await agent.post(`/api/characters/${created.body.character.id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.body.character.name).toHaveLength(200);
    expect(copy.body.character.name.endsWith(' (Copy)')).toBe(true);
  });

  it('does not cut a character in two where it shortens the name', async () => {
    const { agent } = await signedIn();
    // The emoji takes two UTF-16 units, the 193rd and 194th, where the cut falls.
    const name = `${'n'.repeat(192)}\u{1F409}tail`;
    const created = await agent.post('/api/characters').send({ name });
    expect(created.status).toBe(201);

    const copy = await agent.post(`/api/characters/${created.body.character.id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.body.character.name).toBe(`${'n'.repeat(192)} (Copy)`);
    const stored = await prisma.character.findUnique({ where: { id: copy.body.character.id }, select: { name: true } });
    expect(stored?.name).toBe(`${'n'.repeat(192)} (Copy)`);
  });

  it('writes the copy name into the sheet, so the first save keeps it', async () => {
    const { id, agent } = await signedIn();
    const dnd = await prisma.character.create({
      data: { userId: id, name: 'Aldra', gameSystem: 'DND_5E', data: { characterName: 'Aldra', level: 3 } },
    });
    const coc = await prisma.character.create({
      data: { userId: id, name: 'Harvey', gameSystem: 'CALL_OF_CTHULHU_7E', data: { investigatorName: 'Harvey' } },
    });

    const dndCopy = await agent.post(`/api/characters/${dnd.id}/copy`);
    expect(dndCopy.status).toBe(201);
    expect(dndCopy.body.character.data).toEqual({ characterName: 'Aldra (Copy)', level: 3 });
    const cocCopy = await agent.post(`/api/characters/${coc.id}/copy`);
    expect(cocCopy.status).toBe(201);
    expect(cocCopy.body.character.data.investigatorName).toBe('Harvey (Copy)');
  });
});

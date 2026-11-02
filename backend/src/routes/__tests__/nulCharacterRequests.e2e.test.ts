/**
 * A request holding U+0000, the null character, is refused before any route
 * reads it.
 *
 * PostgreSQL cannot store the character, in a text column or in a jsonb
 * one, in a value or a key, so a request carrying it answered 500 wherever
 * it reached the database: a campaign's description, a key in a
 * character's sheet, a search. Every request is now refused with 400 and
 * one message, whatever field holds it. Uploads are refused the same way
 * once their form is read (uploadMetadata.e2e.test.ts,
 * campaignImport.e2e.test.ts).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const REFUSED = { error: 'Validation Error', message: 'Text cannot contain the null character (U+0000).' };

let userId: string;
let agent: request.Agent;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Null Character' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

describe('a request holding U+0000', () => {
  it('is refused in a text field of a JSON body, and nothing is stored', async () => {
    const res = await agent.post('/api/campaigns').send({ name: 'Nul', description: 'Under\u0000 the hill' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(REFUSED);
    expect(await prisma.campaign.count({ where: { ownerId: userId } })).toBe(0);
  });

  it('is refused in a key of data stored as JSON, and nothing is stored', async () => {
    const res = await agent.post('/api/characters').send({ name: 'Nul', data: { notes: { 'sec\u0000ret': 'kept' } } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(REFUSED);
    expect(await prisma.character.count({ where: { userId } })).toBe(0);
  });

  it('is refused in a query string', async () => {
    const res = await agent.get('/api/assets').query({ search: 'gob\u0000lin' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(REFUSED);
  });

  it('is refused before the sign-in is checked', async () => {
    const res = await request(app).post('/api/campaigns').send({ name: '\u0000' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(REFUSED);
  });

  it('leaves text without one alone, a backslash and the letters u0000 included', async () => {
    const res = await agent.post('/api/campaigns').send({ name: 'Nul', description: 'Written as \\u0000' });
    expect(res.status).toBe(201);
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: res.body.campaign.id } });
    expect(campaign.description).toBe('Written as \\u0000');
  });
});

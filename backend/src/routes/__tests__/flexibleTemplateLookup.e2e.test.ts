/**
 * The built-in Flexible starter sheets are looked up by name, and only the
 * names the server defines are found. The list is a plain object, so a name
 * such as `constructor` used to find a property every object inherits and
 * answer 200 with no sheet in it.
 *
 * A game system's templates come through the same route, and both lookups
 * are checked here end to end, so a template module the route cannot load
 * fails a test.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const u = await createTestUser({ displayName: 'Lookup' });
  userId = u.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

describe('GET /api/characters/templates/null/:templateName', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('answers 404 for %s', async (name) => {
    const res = await agent.get(`/api/characters/templates/null/${name}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Template Not Found');
  });

  it('still finds the starter sheets it defines', async () => {
    const res = await agent.get('/api/characters/templates/null/basic');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.sections)).toBe(true);
  });

  // Every character made from the Basic sheet used to get the same section and
  // field ids, made once when the server started.
  it('gives each Basic sheet ids of its own', async () => {
    const ids = (body: { data: { sections: { id: string; fields?: { id: string }[] }[] } }) =>
      body.data.sections.flatMap((s) => [s.id, ...(s.fields ?? []).map((f) => f.id)]);
    const first = ids((await agent.get('/api/characters/templates/null/basic')).body);
    const second = ids((await agent.get('/api/characters/templates/null/basic')).body);
    expect(first.length).toBeGreaterThan(4);
    expect(new Set(first).size).toBe(first.length);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });
});

describe('GET /api/characters/templates/:gameSystem/:templateName', () => {
  it('finds a game system\'s template', async () => {
    const res = await agent.get('/api/characters/templates/DND_5E/fighter');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Level 1 Fighter');
  });
});

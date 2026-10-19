/**
 * The Asset Library searches and sorts the whole library.
 *
 * The library page fetched one page of 24, newest first, and searched and
 * sorted only that page in the browser, so an asset on another page could not
 * be found and "by name" sorted 24 assets. GET /api/assets now takes
 * `search`, matching a name in part or a tag whole, and `sort`.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;
/** A word only this file's assets hold. */
const tag = `srt${Date.now()}`;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Search Sort' });
  userId = user.id;
  const rows = [
    { name: `${tag} Zephyr keep`, fileSize: 300, tags: ['Castle'], at: '2026-01-03' },
    { name: `${tag} Abbey ruins`, fileSize: 100, tags: ['ruins'], at: '2026-01-01' },
    { name: `${tag} Mill`, fileSize: 200, tags: ['Dragon', 'lair'], at: '2026-01-02' },
    { name: `${tag} Dragonfly pond`, fileSize: 50, tags: [], at: '2026-01-04' },
  ];
  for (const r of rows) {
    await prisma.asset.create({
      data: {
        type: 'MAP', scope: 'USER', uploadedById: userId, filename: 'x.png', originalName: 'x.png', mimeType: 'image/png',
        fileSize: r.fileSize, filePath: '/nonexistent/x.png', name: r.name, tags: r.tags, createdAt: new Date(r.at),
      },
    });
  }
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

const names = async (query: Record<string, string>) => {
  const res = await agent.get('/api/assets').query({ scope: 'USER', ...query });
  expect(res.status).toBe(200);
  return (res.body.assets as Array<{ name: string }>).map((a) => a.name.replace(`${tag} `, ''));
};

describe('search', () => {
  it('finds a name in part, on any page', async () => {
    expect(await names({ search: `${tag} abbey`, limit: '1' })).toEqual(['Abbey ruins']);
  });

  it('finds a whole tag, whatever its case', async () => {
    expect(await names({ search: 'dragon' })).toEqual(expect.arrayContaining(['Mill']));
    expect(await names({ search: 'CASTLE' })).toEqual(['Zephyr keep']);
  });

  it('does not find part of a tag', async () => {
    expect(await names({ search: 'lai' })).not.toContain('Mill');
  });
});

describe('sort', () => {
  it('is newest first by default', async () => {
    expect(await names({ search: tag })).toEqual(['Dragonfly pond', 'Zephyr keep', 'Mill', 'Abbey ruins']);
  });

  it('is by name across the whole library', async () => {
    expect(await names({ search: tag, sort: 'name', limit: '2' })).toEqual(['Abbey ruins', 'Dragonfly pond']);
  });

  it('is largest first by size', async () => {
    expect(await names({ search: tag, sort: 'size' })).toEqual(['Zephyr keep', 'Mill', 'Abbey ruins', 'Dragonfly pond']);
  });

  it('refuses a sort it does not know', async () => {
    const res = await agent.get('/api/assets').query({ sort: 'colour' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('sort must be one of: date, name, size');
  });
});

// The tag search found up to 10,000 tagged assets across the whole instance,
// in no order, before the caller's visibility was applied, so on a large
// instance the caller's own match could be left out.
describe('a tag many assets on the instance share', () => {
  let strangerId: string;

  beforeAll(async () => {
    strangerId = (await createTestUser({ displayName: 'Bulk Tagger' })).id;
    const bulkTag = `${tag}bulk`;
    // Just past the 10,000 the old search gathered, in one statement: built
    // as objects, twice as many slowed the suites running beside this one.
    await prisma.$executeRaw`
      INSERT INTO "Asset" (id, type, scope, "uploadedById", filename, "originalName", "mimeType", "fileSize", "filePath", name, tags)
      SELECT gen_random_uuid()::text, 'TOKEN', 'USER', ${strangerId}, 'b.png', 'b.png', 'image/png', 1, '/nonexistent/b.png', 'Bulk ' || n, ARRAY[${bulkTag}]
      FROM generate_series(1, 10050) AS n`;
    await prisma.asset.create({
      data: {
        type: 'TOKEN', scope: 'USER', uploadedById: userId, filename: 'm.png', originalName: 'm.png', mimeType: 'image/png',
        fileSize: 1, filePath: '/nonexistent/m.png', name: 'Mine among many', tags: [bulkTag.toUpperCase()],
      },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { uploadedById: strangerId } });
    await cleanupUsers([strangerId]);
  });

  it('still finds the caller\'s own asset with it', async () => {
    const res = await agent.get('/api/assets').query({ search: `${tag}bulk` });
    expect(res.status).toBe(200);
    expect((res.body.assets as Array<{ name: string }>).map((a) => a.name)).toEqual(['Mine among many']);
  });
});


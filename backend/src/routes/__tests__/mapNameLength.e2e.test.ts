/**
 * A map's name is at most 200 characters on every path that stores one.
 *
 * Create Map and Edit Map took a name of any length, while a Universal VTT
 * import and a campaign archive import took at most 200, so a map named at
 * length through the API later fell out of an archive import. A name stored
 * longer before the limit existed still saves an edit that sends it back
 * unchanged.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(async () => undefined),
  fileTypeFromFile: jest.fn(async () => undefined),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Map Name DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Map names' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

const create = (name: string) =>
  dm.post(`/api/campaigns/${campaignId}/maps`).send({ name, imageUrl: randomUUID(), width: 10, height: 10 });

async function storedMap(name: string) {
  return prisma.map.create({
    data: { campaignId, name, imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 10, height: 10, tokens: [], annotations: [] },
  });
}

describe('POST /maps', () => {
  it('takes a name of 200 characters', async () => {
    const res = await create('n'.repeat(200));
    expect(res.status).toBe(201);
  });

  it('refuses a name over 200 characters, saying so', async () => {
    const res = await create('n'.repeat(201));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A map name can be at most 200 characters.');
  });

  it('counts the name after trimming it', async () => {
    const res = await create(`  ${'n'.repeat(200)}  `);
    expect(res.status).toBe(201);
  });
});

describe('PUT /maps/:id', () => {
  it('refuses a new name over 200 characters, and keeps the old one', async () => {
    const map = await storedMap('Cellar');

    const res = await dm.put(`/api/campaigns/${campaignId}/maps/${map.id}`).send({ name: 'n'.repeat(201) });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A map name can be at most 200 characters.');
    expect((await prisma.map.findUniqueOrThrow({ where: { id: map.id } })).name).toBe('Cellar');
  });

  it('saves an edit to a map whose name was stored longer when the name is sent back unchanged', async () => {
    // Edit Map sends every field, the name included.
    const long = 'n'.repeat(300);
    const map = await storedMap(long);

    const res = await dm.put(`/api/campaigns/${campaignId}/maps/${map.id}`).send({ name: long, gridSize: 60 });

    expect(res.status).toBe(200);
    expect(res.body.map).toMatchObject({ name: long, gridSize: 60 });
  });
});

/**
 * A `%` or `_` typed into a library search matches only itself.
 *
 * The Asset Library, the creature library, the token templates and the
 * character templates handed the search to PostgreSQL as a LIKE pattern
 * without escaping it, so `%` matched every name and `_` any one character.
 * Each now escapes it, as the Invite Player search does.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let campaignId: string;
let agent: ReturnType<typeof request.agent>;
/** A word only these rows hold, so other tests' rows do not match. */
const tag = `wild${Date.now()}`;
const names = { percent: `${tag} 50% off`, underscore: `${tag} snake_case`, plain: `${tag} plain sign` };

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Search Wildcards' });
  userId = user.id;
  campaignId = (await createTestCampaign(userId, { name: 'Wildcards' })).id;
  await prisma.campaignMembership.create({ data: { userId, campaignId, role: 'DM', characterIds: [] } });
  for (const name of Object.values(names)) {
    await prisma.asset.create({
      data: {
        type: 'TOKEN', scope: 'USER', uploadedById: userId, filename: 'x.png', originalName: 'x.png',
        mimeType: 'image/png', fileSize: 1, filePath: '/nonexistent/x.png', name,
      },
    });
    await prisma.creatureTemplate.create({ data: { name, source: 'custom', statBlock: {}, campaignId, createdById: userId } });
    await prisma.tokenTemplate.create({ data: { name, campaignId } });
    await prisma.characterTemplate.create({ data: { name, data: {}, createdById: userId } });
  }
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.characterTemplate.deleteMany({ where: { createdById: userId } });
  await prisma.creatureTemplate.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

const lists: Array<[string, (search: string) => Promise<string[]>]> = [
  ['the Asset Library', async (search) =>
    (await agent.get('/api/assets').query({ search })).body.assets.map((a: { name: string }) => a.name)],
  ['the creature library', async (search) =>
    (await agent.get(`/api/campaigns/${campaignId}/creatures`).query({ search })).body.creatures.map((c: { name: string }) => c.name)],
  ['the token templates', async (search) =>
    (await agent.get(`/api/campaigns/${campaignId}/token-templates`).query({ search })).body.templates.map((t: { name: string }) => t.name)],
  ['the character templates', async (search) =>
    (await agent.get('/api/character-templates').query({ search, mine: 'true' })).body.templates.map((t: { name: string }) => t.name)],
];

describe.each(lists)('%s', (_label, find) => {
  it('finds only the name holding a %', async () => {
    expect(await find(`${tag} 50%`)).toEqual([names.percent]);
    expect(await find('%')).toEqual([names.percent]);
  });

  it('finds only the name holding an _', async () => {
    expect(await find(`${tag} snake_`)).toEqual([names.underscore]);
    // As a wildcard, the _ would stand for the l of "plain".
    expect(await find(`${tag} p_ain`)).toEqual([]);
  });

  it('still finds a name by part of it', async () => {
    expect((await find(tag)).sort()).toEqual(Object.values(names).sort());
  });
});

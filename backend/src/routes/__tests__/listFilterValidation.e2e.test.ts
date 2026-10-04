/**
 * List filters with an unknown value answer 400, not 500.
 *
 * The asset, creature and character-template lists passed their `type`,
 * `scope` and `gameSystem` filters straight to Prisma, whose enum columns throw
 * on a value they do not know, and a negative asset page became a negative
 * skip. Unknown values are refused now, and the page is clamped, as the
 * character-template list already clamps its paging.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let campaignId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const u = await createTestUser({ email: `filters-${Date.now()}@test.cozyvtt.local` });
  userId = u.id;
  campaignId = (await createTestCampaign(userId, { name: `Filters ${Date.now()}` })).id;
  await prisma.campaignMembership.create({ data: { userId, campaignId, role: 'DM', characterIds: [] } });
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

describe('GET /api/assets', () => {
  it.each(['type=NOPE', 'scope=NOPE', 'type=MAP&type=TOKEN'])('refuses %s with 400', async (query) => {
    const res = await agent.get(`/api/assets?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it.each(['type=MAP', 'scope=USER', 'type=DOCUMENT&scope=GLOBAL', 'page=-3', 'page=0&limit=-5'])(
    'answers %s with 200',
    async (query) => {
      const res = await agent.get(`/api/assets?${query}`);

      expect(res.status).toBe(200);
    },
  );
});

describe('GET /api/campaigns/:campaignId/creatures', () => {
  it('refuses an unknown gameSystem with 400', async () => {
    const res = await agent.get(`/api/campaigns/${campaignId}/creatures?gameSystem=NOPE`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('answers a known gameSystem with 200', async () => {
    const res = await agent.get(`/api/campaigns/${campaignId}/creatures?gameSystem=DND_5E`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/character-templates', () => {
  it('refuses an unknown gameSystem with 400', async () => {
    const res = await agent.get('/api/character-templates?gameSystem=NOPE');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it.each(['PATHFINDER_2E', 'flexible'])('answers gameSystem=%s with 200', async (gameSystem) => {
    const res = await agent.get(`/api/character-templates?gameSystem=${gameSystem}`);

    expect(res.status).toBe(200);
  });
});

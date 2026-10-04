/**
 * Character assign and campaign invite refuse malformed fields with 400.
 *
 * Assign read `campaignId` as sent, so a number reached Prisma and answered
 * 500. The invite added `expiresInDays` to the day of the month, so "7" sent as
 * a string was concatenated (on the 3rd, a 34-day expiry) and a huge number
 * gave an invalid date and a 500; a `userId` that was not text was a 500 too.
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
const DAY_MS = 24 * 60 * 60 * 1000;
let dmId: string;
let playerId: string;
let campaignId: string;
let characterId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = Date.now();
  const d = await createTestUser({ email: `invite-dm-${stamp}@test.cozyvtt.local` });
  const p = await createTestUser({ email: `invite-player-${stamp}@test.cozyvtt.local` });
  dmId = d.id;
  playerId = p.id;
  campaignId = (await createTestCampaign(dmId, { name: `Invites ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  characterId = (await prisma.character.create({ data: { userId: dmId, name: 'Assignee', data: {} } })).id;
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: d.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterEach(async () => {
  await prisma.campaignInvitation.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: characterId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

describe('POST /api/characters/:id/assign', () => {
  it.each([['a number', 42], ['a list', ['x']], ['an object', { id: 'x' }]])(
    'refuses campaignId sent as %s with 400',
    async (_label, campaignIdValue) => {
      const res = await dm.post(`/api/characters/${characterId}/assign`).send({ campaignId: campaignIdValue });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    },
  );
});

describe('POST /api/campaigns/:campaignId/invite', () => {
  const invite = (body: Record<string, unknown>) =>
    dm.post(`/api/campaigns/${campaignId}/invite`).send({ userId: playerId, ...body });

  it('sets the expiry that many days from now', async () => {
    const res = await invite({ expiresInDays: 7 });

    expect(res.status).toBe(201);
    const expiresIn = new Date(res.body.invitation.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(6.9 * DAY_MS);
    expect(expiresIn).toBeLessThan(7.1 * DAY_MS);
  });

  it.each([['omitted', undefined], ['null', null], ['zero', 0], ['negative', -3]])(
    'never expires when expiresInDays is %s',
    async (_label, expiresInDays) => {
      const res = await invite({ expiresInDays });

      expect(res.status).toBe(201);
      expect(res.body.invitation.expiresAt).toBeNull();
    },
  );

  it.each([
    ['a numeric string', '7'],
    ['a fraction', 1.5],
    ['more than a year', 366],
    ['a huge number', 1e12],
  ])('refuses expiresInDays as %s with 400 and creates nothing', async (_label, expiresInDays) => {
    const res = await invite({ expiresInDays });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(await prisma.campaignInvitation.count({ where: { campaignId } })).toBe(0);
  });

  it.each([['a number', 42], ['an object', { equals: 'x' }]])(
    'refuses userId sent as %s with 400',
    async (_label, userId) => {
      const res = await dm.post(`/api/campaigns/${campaignId}/invite`).send({ userId });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    },
  );
});

/**
 * PUT /api/campaigns/:campaignId validates its body.
 *
 * Before this test the route copied whatever it was given into the update: a
 * name of any length was stored, an unknown status reached Prisma and came
 * back as a 500, and vibeSettings could be a bare string. Every field now goes
 * through UpdateCampaignSchema, and a bad one is a 400 with a message, the
 * same shape the create route has always returned.
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
let dmId: string;
let campaignId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const dm = await createTestUser({ email: `cu-dm-${Date.now()}@test.cozyvtt.local`, displayName: 'DM' });
  dmId = dm.id;
  const campaign = await createTestCampaign(dm.id, { name: 'Update me' });
  campaignId = campaign.id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

const put = (body: Record<string, unknown>) => agent.put(`/api/campaigns/${campaignId}`).send(body);

describe('rejected bodies', () => {
  it.each<[string, Record<string, unknown>]>([
    ['an empty name', { name: '   ' }],
    ['a name over 200 characters', { name: 'x'.repeat(201) }],
    ['a description over 5000 characters', { description: 'x'.repeat(5001) }],
    ['an unknown status', { status: 'BOGUS' }],
    ['an unknown game system', { gameSystem: 'GURPS' }],
    ['spiritLayerEnabled that is not a boolean', { spiritLayerEnabled: 'yes' }],
    ['spiritLayerStyle that is not a string', { spiritLayerStyle: 123 }],
    ['vibeSettings that is not an object', { vibeSettings: 'night' }],
    ['vibeSettings whose periods is not a list', { vibeSettings: { periods: 'dawn' } }],
    ['chatCooldownSeconds of 0', { chatCooldownSeconds: 0 }],
    ['chatCooldownSeconds over 300', { chatCooldownSeconds: 301 }],
    ['chatCooldownSeconds that is not a number', { chatCooldownSeconds: 'soon' }],
    ['chatCooldownEnabled that is not a boolean', { chatCooldownEnabled: 1 }],
  ])('refuses %s with a 400', async (_label, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(typeof res.body.message).toBe('string');
  });
});

describe('accepted bodies', () => {
  it('stores every valid field, keeps extra keys inside vibeSettings, and ignores fields the route does not own', async () => {
    const res = await put({
      name: '  Renamed  ',
      description: 'A description',
      status: 'PAUSED',
      gameSystem: 'DND_5E',
      spiritLayerEnabled: true,
      spiritLayerStyle: 'custom:#7c3aed:wispy',
      vibeSettings: { periods: [{ name: 'Day', hue: '#fff', filter: 'none' }], currentPeriod: 'Day' },
      chatCooldownEnabled: true,
      chatCooldownSeconds: 30,
      // A mass-assignment attempt: neither is a field the route updates.
      ownerId: 'not-yours',
      id: 'nope',
    });
    expect(res.status).toBe(200);

    const stored = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(stored.name).toBe('Renamed');
    expect(stored.description).toBe('A description');
    expect(stored.status).toBe('PAUSED');
    expect(stored.gameSystem).toBe('DND_5E');
    expect(stored.spiritLayerEnabled).toBe(true);
    expect(stored.spiritLayerStyle).toBe('custom:#7c3aed:wispy');
    expect(stored.vibeSettings).toMatchObject({ currentPeriod: 'Day' });
    expect(stored.chatCooldownEnabled).toBe(true);
    expect(stored.chatCooldownSeconds).toBe(30);
    expect(stored.ownerId).toBe(dmId);
    expect(stored.id).toBe(campaignId);
  });

  it('clears the description and the game system with null', async () => {
    expect((await put({ description: null, gameSystem: null })).status).toBe(200);
    const stored = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(stored.description).toBeNull();
    expect(stored.gameSystem).toBeNull();
  });

  it('accepts an empty body as a no-op', async () => {
    expect((await put({})).status).toBe(200);
  });
});

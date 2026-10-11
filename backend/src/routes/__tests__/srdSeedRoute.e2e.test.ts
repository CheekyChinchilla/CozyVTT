/**
 * Only an administrator can import the SRD creatures.
 *
 * The import writes creatures every campaign shares and fetches from
 * api.open5e.com on every run, and any campaign's DM could start it, which
 * means any user: anyone can create a campaign. A loop of it kept the server
 * fetching from Open5e and held every other DM's import back. It is now an
 * administrator's action, and an Open5e that cannot be read answers 502 with
 * a message saying so, within a time limit, instead of a gateway error after
 * minutes.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const run = randomUUID().slice(0, 8);
const users: string[] = [];
const campaigns: string[] = [];

async function signedIn(role: 'ADMIN' | 'USER'): Promise<{ id: string; agent: request.Agent; campaignId: string }> {
  const user = await createTestUser({ role, displayName: `Seeder ${role}` });
  users.push(user.id);
  const campaign = await createTestCampaign(user.id);
  campaigns.push(campaign.id);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId: campaign.id, role: 'DM', characterIds: [] } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent, campaignId: campaign.id };
}

const page = (names: string[]) =>
  new Response(
    JSON.stringify({
      count: names.length,
      next: null,
      results: names.map((name) => ({
        slug: name, name: `${name} ${run}`, size: 'Medium', type: 'beast', subtype: '', group: null, alignment: 'unaligned',
        armor_class: 12, armor_desc: '', hit_points: 11, hit_dice: '2d8', speed: { walk: 40 },
        strength: 12, dexterity: 15, constitution: 12, intelligence: 2, wisdom: 12, charisma: 6,
        strength_save: null, dexterity_save: null, constitution_save: null, intelligence_save: null, wisdom_save: null, charisma_save: null,
        skills: {}, senses: '', languages: '', challenge_rating: '1/4', cr: 0.25,
        actions: null, bonus_actions: null, reactions: null, special_abilities: null, legendary_desc: '', legendary_actions: null,
        damage_vulnerabilities: '', damage_resistances: '', damage_immunities: '', condition_immunities: '',
        document__slug: 'wotc-srd', document__title: 'Systems Reference Document',
      })),
    }),
    { status: 200 }
  );

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await prisma.creatureTemplate.deleteMany({ where: { source: 'srd', name: { endsWith: ` ${run}` } } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

describe('POST /api/campaigns/:campaignId/creatures/seed', () => {
  it('refuses a DM who is not an administrator, and fetches nothing', async () => {
    const dm = await signedIn('USER');
    const fetch = jest.spyOn(globalThis, 'fetch');

    const res = await dm.agent.post(`/api/campaigns/${dm.campaignId}/creatures/seed`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(
      'Only an administrator can import the SRD creatures, because every campaign on this server shares them. Ask an administrator to import them.'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets an administrator import them', async () => {
    const admin = await signedIn('ADMIN');
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(page(['Wolf']));

    const res = await admin.agent.post(`/api/campaigns/${admin.campaignId}/creatures/seed`);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(await prisma.creatureTemplate.count({ where: { source: 'srd', name: `Wolf ${run}` } })).toBe(1);
  });

  it('answers 502, saying why, when Open5e cannot be reached', async () => {
    const admin = await signedIn('ADMIN');
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));

    const res = await admin.agent.post(`/api/campaigns/${admin.campaignId}/creatures/seed`);

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/^Could not reach api\.open5e\.com\. Nothing was imported/);
  });
});

describe('GET /api/campaigns/:campaignId/creatures/seed/status', () => {
  it('says whether the caller may run the import', async () => {
    const dm = await signedIn('USER');
    const admin = await signedIn('ADMIN');
    expect((await dm.agent.get(`/api/campaigns/${dm.campaignId}/creatures/seed/status`)).body.canSeed).toBe(false);
    expect((await admin.agent.get(`/api/campaigns/${admin.campaignId}/creatures/seed/status`)).body.canSeed).toBe(true);
  });
});

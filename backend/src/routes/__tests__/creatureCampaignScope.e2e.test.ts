/**
 * A creature template belongs to one campaign, and stays there.
 *
 * The creature routes are mounted under a campaign, so `campaignMember` and
 * `campaignDM` prove the caller belongs to the campaign named in the URL. They
 * say nothing about the campaign the requested creature actually belongs to.
 * Reading, duplicating and favouriting all looked a template up by id alone and
 * never compared the two, so a DM of any campaign could name another campaign's
 * homebrew and read its full stat block. Duplicating turned that into a copy
 * filed under their own campaign, which outlives the original being deleted.
 * The editing routes in the same file already made this comparison.
 *
 * Creature ids are not secret: every token placed from a template carries one.
 *
 * Templates with no campaign are the shipped SRD content and stay readable by
 * everyone, so the check has to let those through.
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

let outsiderId: string;
let victimId: string;
let outsiderCampaignId: string;
let victimCampaignId: string;
let outsider: ReturnType<typeof request.agent>;
/** Homebrew belonging to the victim's campaign, never shared. */
let privateCreatureId: string;
/** Shipped SRD content, which belongs to no campaign. */
let globalCreatureId: string;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function makeCreature(name: string, campaignId: string | null, createdById: string | null) {
  const created = await prisma.creatureTemplate.create({
    data: {
      name,
      source: campaignId ? 'custom' : 'srd',
      statBlock: { armorClass: 15, hitPoints: 32, secret: 'MY HOMEBREW STATS' },
      campaignId,
      createdById,
    },
  });
  return created.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  // Neither is a platform admin: an admin may read everything by design, which
  // would hide the bug under test.
  const [o, v] = await Promise.all([
    createTestUser({ email: `creature-out-${stamp}@test.cozyvtt.local`, displayName: 'Outsider DM' }),
    createTestUser({ email: `creature-vic-${stamp}@test.cozyvtt.local`, displayName: 'Victim DM' }),
  ]);
  outsiderId = o.id;
  victimId = v.id;

  outsiderCampaignId = (await createTestCampaign(outsiderId, { name: `Outsider ${stamp}` })).id;
  victimCampaignId = (await createTestCampaign(victimId, { name: `Victim ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: outsiderId, campaignId: outsiderCampaignId, role: 'DM', characterIds: [] },
      { userId: victimId, campaignId: victimCampaignId, role: 'DM', characterIds: [] },
    ],
  });

  privateCreatureId = await makeCreature(`Victim homebrew ${stamp}`, victimCampaignId, victimId);
  globalCreatureId = await makeCreature(`SRD goblin ${stamp}`, null, null);

  outsider = await login(o.email);
});

afterAll(async () => {
  await prisma.creatureFavorite.deleteMany({ where: { userId: { in: [outsiderId, victimId] } } });
  await prisma.creatureTemplate.deleteMany({
    where: { OR: [{ id: globalCreatureId }, { campaignId: { in: [outsiderCampaignId, victimCampaignId] } }] },
  });
  await cleanupCampaigns([outsiderCampaignId, victimCampaignId]);
  await cleanupUsers([outsiderId, victimId]);
  await prisma.$disconnect();
});

const base = () => `/api/campaigns/${outsiderCampaignId}/creatures`;

describe("a DM naming another campaign's creature", () => {
  it('cannot read it', async () => {
    const res = await outsider.get(`${base()}/${privateCreatureId}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('MY HOMEBREW STATS');
  });

  it('cannot duplicate it into their own campaign', async () => {
    const res = await outsider.post(`${base()}/${privateCreatureId}/duplicate`);
    expect(res.status).toBe(404);

    const copies = await prisma.creatureTemplate.count({
      where: { campaignId: outsiderCampaignId },
    });
    expect(copies).toBe(0);
  });

  it('cannot favourite it', async () => {
    const res = await outsider.post(`${base()}/${privateCreatureId}/favorite`);
    expect(res.status).toBe(404);

    const favorites = await prisma.creatureFavorite.count({ where: { userId: outsiderId } });
    expect(favorites).toBe(0);
  });

  it('is not handed it through the favourites list either', async () => {
    // A row planted before this rule existed must not still be served.
    await prisma.creatureFavorite.create({
      data: { campaignId: outsiderCampaignId, userId: outsiderId, creatureId: privateCreatureId },
    });

    const res = await outsider.get(`${base()}/favorites/list`);
    expect(res.status).toBe(200);
    expect(res.body.creatures).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain('MY HOMEBREW STATS');

    await prisma.creatureFavorite.deleteMany({ where: { userId: outsiderId } });
  });
});

describe('the shipped SRD content and their own campaign', () => {
  it('still reads a global creature', async () => {
    const res = await outsider.get(`${base()}/${globalCreatureId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(globalCreatureId);
  });

  it('still duplicates a global creature', async () => {
    const res = await outsider.post(`${base()}/${globalCreatureId}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.campaignId).toBe(outsiderCampaignId);
    await prisma.creatureTemplate.delete({ where: { id: res.body.id } });
  });

  it('still favourites a global creature', async () => {
    const res = await outsider.post(`${base()}/${globalCreatureId}/favorite`);
    expect(res.status).toBe(200);
    expect(res.body.favorited).toBe(true);

    const listed = await outsider.get(`${base()}/favorites/list`);
    expect(listed.body.creatures).toHaveLength(1);

    await outsider.post(`${base()}/${globalCreatureId}/favorite`);
  });

  it('still reads a creature of their own campaign', async () => {
    const mine = await makeCreature('My own homebrew', outsiderCampaignId, outsiderId);
    const res = await outsider.get(`${base()}/${mine}`);
    expect(res.status).toBe(200);
    await prisma.creatureTemplate.delete({ where: { id: mine } });
  });
});

describe('the seed status count of homebrew', () => {
  it("counts only creatures this campaign can see, not another campaign's homebrew", async () => {
    const res = await outsider.get(`/api/campaigns/${outsiderCampaignId}/creatures/seed/status`);
    expect(res.status).toBe(200);

    const visible = await prisma.creatureTemplate.count({
      where: { source: 'custom', OR: [{ campaignId: null }, { campaignId: outsiderCampaignId }] },
    });
    expect(res.body.customCount).toBe(visible);
  });
});

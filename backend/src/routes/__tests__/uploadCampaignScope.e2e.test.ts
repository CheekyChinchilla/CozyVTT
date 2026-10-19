/**
 * Which campaign an uploaded asset is filed under.
 *
 * Scope decides who may read an asset; `Asset.campaignId` decides which
 * campaign lists it. A USER-scoped upload belongs to no campaign, but the
 * upload route stored whatever the client sent alongside the file, so anyone
 * holding a campaign's id could put named rows in that campaign's library
 * without being a member of it, and a player could do it to their own campaign
 * despite uploads there being the DM's alone.
 *
 * The permitted id now comes back from `canPlaceAssetAtScope` with the rest of
 * the decision, so the route stores what the rules allow and not what was
 * asked for.
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
let playerId: string;
let outsiderId: string;
let campaignId: string;
let otherCampaignId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let outsider: ReturnType<typeof request.agent>;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const upload = (
  agent: ReturnType<typeof request.agent>,
  scope: string,
  campaign: string | undefined,
  name: string
) => {
  const req = agent
    .post('/api/assets/upload')
    .attach('file', tinyPng, 'tiny.png')
    .field('type', 'MAP')
    .field('scope', scope)
    .field('name', name);
  if (campaign) req.field('campaignId', campaign);
  return req;
};

beforeAll(async () => {
  const stamp = Date.now();
  // Not platform admins: an admin is allowed more, which would hide the bug.
  const [d, p, o] = await Promise.all([
    createTestUser({ email: `scope-dm-${stamp}@test.cozyvtt.local`, displayName: 'Scope DM' }),
    createTestUser({ email: `scope-player-${stamp}@test.cozyvtt.local`, displayName: 'Scope Player' }),
    createTestUser({ email: `scope-outsider-${stamp}@test.cozyvtt.local`, displayName: 'Scope Outsider' }),
  ]);
  dmId = d.id; playerId = p.id; outsiderId = o.id;

  campaignId = (await createTestCampaign(dmId, { name: `Scope ${stamp}` })).id;
  otherCampaignId = (await createTestCampaign(outsiderId, { name: `Other ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: outsiderId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
    ],
  });

  // One at a time: one address may have only two sign-ins checked at once.
  dm = await login(d.email);
  player = await login(p.email);
  outsider = await login(o.email);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: [dmId, playerId, outsiderId] } } });
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers([dmId, playerId, outsiderId]);
  await prisma.$disconnect();
});

describe('uploading with a campaign id the caller has no right to use', () => {
  it('stores no campaign on a personal upload, whatever the client sends', async () => {
    const res = await upload(player, 'USER', campaignId, 'Personal map');
    expect(res.status).toBe(201);
    expect(res.body.asset.campaignId).toBeNull();
  });

  it('does not let an outsider plant a row in a campaign they are not in', async () => {
    const res = await upload(outsider, 'USER', campaignId, 'INJECTED');
    expect(res.status).toBe(201);
    expect(res.body.asset.campaignId).toBeNull();

    // And it must not appear in that campaign's library.
    const listed = await dm.get('/api/assets').query({ campaignId });
    const names = (listed.body.assets as { name: string }[]).map((a) => a.name);
    expect(names).not.toContain('INJECTED');
  });

  it('still refuses a campaign-scoped upload from someone with no rights there', async () => {
    expect((await upload(outsider, 'CAMPAIGN', campaignId, 'nope')).status).toBe(403);
  });

  it('still lets the DM upload into their own campaign', async () => {
    const res = await upload(dm, 'CAMPAIGN', campaignId, 'Proper campaign map');
    expect(res.status).toBe(201);
    expect(res.body.asset.campaignId).toBe(campaignId);
  });
});

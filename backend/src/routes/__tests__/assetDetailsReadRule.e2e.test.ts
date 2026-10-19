/**
 * An asset's details follow the same read rule as its file.
 *
 * GET /api/assets/:id had a rule of its own: a personal asset was its
 * uploader's, a campaign asset its campaign's members'. A player whose table
 * showed the DM's own map could load the picture but not its details, and a
 * campaign asset whose campaign was gone (no campaign recorded) was shown to
 * anyone signed in. It now asks what the file routes ask (canReadAsset). A
 * reader who is not a member of the asset's campaign is not told which
 * campaign it is, by name or by id.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const users: string[] = [];
const campaigns: string[] = [];
const agents: Record<'dm' | 'player' | 'otherDm' | 'stranger', ReturnType<typeof request.agent>> = {} as never;
const ids = { dmMap: '', otherCampaignArt: '', orphan: '' };
let otherCampaign: string;

const asset = (type: 'MAP' | 'TOKEN', scope: 'USER' | 'CAMPAIGN', uploadedById: string, campaignId: string | null, name: string) =>
  prisma.asset.create({
    data: {
      type, scope, uploadedById, campaignId, filename: 'x.png', originalName: 'x.png', mimeType: 'image/png',
      fileSize: 1, filePath: '/nonexistent/x.png', name,
    },
  }).then((a) => a.id);

beforeAll(async () => {
  const [dm, player, otherDm, stranger] = await Promise.all(
    ['Details DM', 'Details Player', 'Details Other DM', 'Details Stranger'].map((displayName) => createTestUser({ displayName })),
  );
  users.push(dm.id, player.id, otherDm.id, stranger.id);
  const table = (await createTestCampaign(dm.id, { name: 'The Table' })).id;
  otherCampaign = (await createTestCampaign(otherDm.id, { name: 'The Other Table' })).id;
  campaigns.push(table, otherCampaign);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dm.id, campaignId: table, role: 'DM', characterIds: [] },
      { userId: player.id, campaignId: table, role: 'PLAYER', characterIds: [] },
      { userId: otherDm.id, campaignId: otherCampaign, role: 'DM', characterIds: [] },
      // Who brought the goblin from their own campaign to this table.
      { userId: otherDm.id, campaignId: table, role: 'PLAYER', characterIds: [] },
    ],
  });

  ids.dmMap = await asset('MAP', 'USER', dm.id, null, 'The ravine');
  ids.otherCampaignArt = await asset('TOKEN', 'CAMPAIGN', otherDm.id, otherCampaign, 'Borrowed goblin');
  ids.orphan = await asset('MAP', 'CAMPAIGN', otherDm.id, null, 'Left behind');
  const shown = await prisma.map.create({
    data: {
      campaignId: table, name: 'Ravine', imageUrl: `/api/assets/maps/${ids.dmMap}`, baseLayerUrl: `/api/assets/maps/${ids.dmMap}`,
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [{ id: 't1', name: 'Goblin', imageUrl: `/api/assets/tokens/${ids.otherCampaignArt}`, position: { x: 1, y: 1 }, size: { width: 1, height: 1 } }],
    },
  });
  await prisma.campaign.update({ where: { id: table }, data: { currentMapId: shown.id } });

  for (const [key, user] of [['dm', dm], ['player', player], ['otherDm', otherDm], ['stranger', stranger]] as const) {
    agents[key] = request.agent(app);
    await agents[key].post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  }
});

afterAll(async () => {
  for (const campaignId of campaigns) await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.asset.deleteMany({ where: { uploadedById: { in: users } } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

const details = (who: keyof typeof agents, id: string) => agents[who].get(`/api/assets/${id}`);

it('shows a player the details of the DM\'s own map the table is showing', async () => {
  const res = await details('player', ids.dmMap);
  expect(res.status).toBe(200);
  expect(res.body.asset).toMatchObject({ id: ids.dmMap, name: 'The ravine' });
});

it('shows a player another campaign\'s picture their table uses, without that campaign\'s name', async () => {
  const res = await details('player', ids.otherCampaignArt);
  expect(res.status).toBe(200);
  expect(res.body.asset).toMatchObject({ id: ids.otherCampaignArt, name: 'Borrowed goblin', campaign: null, campaignId: null });
  expect(JSON.stringify(res.body)).not.toContain('The Other Table');
  expect(JSON.stringify(res.body)).not.toContain(otherCampaign);
});

it('names the campaign to its own members', async () => {
  const res = await details('otherDm', ids.otherCampaignArt);
  expect(res.status).toBe(200);
  expect(res.body.asset.campaign).toEqual({ id: otherCampaign, name: 'The Other Table' });
});

it('answers a stranger as for an asset that is not there', async () => {
  for (const id of [ids.dmMap, ids.otherCampaignArt]) {
    expect((await details('stranger', id)).status).toBe(404);
  }
});

it('keeps a campaign asset whose campaign is gone from anyone but its uploader', async () => {
  expect((await details('stranger', ids.orphan)).status).toBe(404);
  expect((await details('dm', ids.orphan)).status).toBe(404);
  expect((await details('otherDm', ids.orphan)).status).toBe(200);
});

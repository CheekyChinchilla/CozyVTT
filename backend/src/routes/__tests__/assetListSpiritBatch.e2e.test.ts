/**
 * The asset list hides spirit-layer pictures in a fixed number of queries.
 *
 * A player's asset list leaves out the spirit-layer pictures of maps whose
 * spirit plane they may not see. That was worked out one campaign at a time,
 * several queries each, one after another, so a player in many campaigns
 * made the list run hundreds. It is now a fixed number whatever the count,
 * and hides the same pictures.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';

const app = createTestApp();
const CAMPAIGNS = 6;
let dmId: string;
let playerId: string;
const campaigns: string[] = [];
let player: ReturnType<typeof request.agent>;
/** Each campaign's spirit-layer picture, and whether the player may see it. */
const spirit: Array<{ id: string; visible: boolean }> = [];

beforeAll(async () => {
  const [dm, p] = await Promise.all([createTestUser({ displayName: 'Spirit DM' }), createTestUser({ displayName: 'Spirit Player' })]);
  dmId = dm.id;
  playerId = p.id;
  for (let i = 0; i < CAMPAIGNS; i += 1) {
    // Every other campaign has its spirit plane open to everyone.
    const open = i % 2 === 0;
    const campaignId = (await createTestCampaign(dmId, { name: `Spirit ${i}` })).id;
    campaigns.push(campaignId);
    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: open } });
    await prisma.campaignMembership.createMany({
      data: [
        { userId: dmId, campaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
    const art = await prisma.asset.create({
      data: {
        type: 'MAP', scope: 'CAMPAIGN', campaignId, uploadedById: dmId, filename: 's.png', originalName: 's.png',
        mimeType: 'image/png', fileSize: 1, filePath: '/nonexistent/s.png', name: `Spirit art ${i}`,
      },
    });
    const map = await prisma.map.create({
      data: {
        campaignId, name: `Map ${i}`, imageUrl: '', baseLayerUrl: '', spiritLayerUrl: `/api/assets/maps/${art.id}`,
        width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
      },
    });
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
    spirit.push({ id: art.id, visible: open });
  }
  player = request.agent(app);
  await player.post('/api/auth/login').send({ email: p.email, password: TEST_PASSWORD }).expect(200);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  for (const id of campaigns) await prisma.campaign.update({ where: { id }, data: { currentMapId: null } });
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it('hides the spirit pictures the player may not see, and only those', async () => {
  const res = await player.get('/api/assets').query({ type: 'MAP', limit: '100' });
  expect(res.status).toBe(200);
  const listed = new Set((res.body.assets as Array<{ id: string }>).map((a) => a.id));
  for (const s of spirit) expect(listed.has(s.id)).toBe(s.visible);
});

it('reads the maps in a fixed number of queries, whatever the number of campaigns', async () => {
  const findMany = jest.spyOn(appPrisma.map, 'findMany');
  const findUnique = jest.spyOn(appPrisma.map, 'findUnique');
  await player.get('/api/assets').query({ type: 'MAP' }).expect(200);
  expect(findMany.mock.calls.length + findUnique.mock.calls.length).toBeLessThanOrEqual(2);
});

/**
 * The campaign overview lists every map's metadata for every member. A map's
 * spirit layer is only for the DM and for players who have crossed over, and
 * the map fetch already hides its address from everyone else; the overview
 * must too, since a member of the campaign can fetch the image by that
 * address alone.
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

describe('campaign overview map metadata', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let dm: ReturnType<typeof request.agent>;
  let player: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Map Meta DM' });
    dmId = dmUser.id;
    const campaign = await createTestCampaign(dmId, { name: 'Map Meta' });
    campaignId = campaign.id;
    await prisma.campaignMembership.create({
      data: { userId: dmId, campaignId, role: 'DM', characterIds: [] },
    });
    const playerUser = await createTestUser({ displayName: 'Map Meta Player' });
    playerId = playerUser.id;
    await prisma.campaignMembership.create({
      data: { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    });
    const map = await prisma.map.create({
      data: {
        campaignId,
        name: 'Two Layers',
        imageUrl: '/api/assets/maps/material',
        baseLayerUrl: '/api/assets/maps/material',
        spiritLayerUrl: '/api/assets/maps/spirit-secret',
        width: 10,
        height: 10,
        gridSize: 50,
        tokens: [],
        annotations: [],
      },
    });
    // The campaign is showing this map: a player is told about the current map only.
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });

    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
    player = request.agent(app);
    await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId]);
    await prisma.$disconnect();
  });

  it('keeps the spirit layer address from a player who cannot see that plane', async () => {
    const res = await player.get(`/api/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.body.campaign.maps).toHaveLength(1);
    expect(res.body.campaign.maps[0].spiritLayerUrl).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('spirit-secret');
  });

  it('gives the DM the address', async () => {
    const res = await dm.get(`/api/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.body.campaign.maps[0].spiritLayerUrl).toBe('/api/assets/maps/spirit-secret');
  });
});

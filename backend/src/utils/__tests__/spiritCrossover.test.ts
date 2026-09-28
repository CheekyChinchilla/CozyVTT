/**
 * Who has crossed into the spirit realm.
 *
 * A player crosses over when the DM puts a token they control onto the spirit
 * layer on the map the table is on. A spectator who was a player once can
 * still be named on a token, since demotion does not clear controlledBy; the
 * rest of the server treats that name as nobody's, and so must this, or the
 * spectator is sent the spirit plane, its artwork and its tokens.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { getSpiritVisibility, getSpiritVisibilityBatch } from '../spirit-layer';

let dmId: string;
let playerId: string;
let spectatorId: string;
let campaignId: string;

const spiritToken = (id: string, controlledBy: string) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 },
  layer: 'spirit', visible: true, controlledBy, rotation: 0, conditions: [], metadata: {},
});

beforeAll(async () => {
  dmId = (await createTestUser({ displayName: 'Crossover DM' })).id;
  playerId = (await createTestUser({ displayName: 'Crossover Player' })).id;
  spectatorId = (await createTestUser({ displayName: 'Crossover Spectator' })).id;
  campaignId = (await createTestCampaign(dmId, { name: 'Crossover' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Veil', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [spiritToken('ghost', playerId), spiritToken('shade', spectatorId)],
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id, spiritLayerEnabled: false } });
});

afterAll(async () => {
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, spectatorId]);
  await prisma.$disconnect();
});

describe('crossing into the spirit realm', () => {
  it('counts a player whose token is on the spirit layer', async () => {
    expect(await getSpiritVisibility(campaignId, playerId)).toBe(true);
    expect((await getSpiritVisibilityBatch(campaignId, [playerId])).get(playerId)).toBe(true);
  });

  it('never counts a spectator still named on a spirit token', async () => {
    expect(await getSpiritVisibility(campaignId, spectatorId)).toBe(false);
    expect((await getSpiritVisibilityBatch(campaignId, [spectatorId, playerId])).get(spectatorId)).toBe(false);
  });
});

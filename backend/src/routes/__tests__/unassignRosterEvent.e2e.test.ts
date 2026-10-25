/**
 * Taking a character out of a campaign tells the campaign which campaign it
 * was.
 *
 * Every other `roster.updated` names its campaign; this one did not, so the
 * campaign page, which follows the event only for its own campaign, kept
 * offering the character's sheet and rolls until it was reloaded.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

const broadcastToCampaign = jest.fn();
jest.mock('../../websocket/utils', () => ({
  ...jest.requireActual('../../websocket/utils'),
  broadcastToCampaign: (...args: unknown[]) => broadcastToCampaign(...args),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let dmId: string;
let playerId: string;
let campaignId: string;
let characterId: string;
let player: ReturnType<typeof request.agent>;

beforeAll(async () => {
  dmId = (await createTestUser({ displayName: 'Unassign DM' })).id;
  const playerUser = await createTestUser({ displayName: 'Unassign Player' });
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Unassign' })).id;
  characterId = (await prisma.character.create({ data: { userId: playerId, campaignId, name: 'Aldra', gameSystem: null, data: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [characterId] },
    ],
  });
  player = request.agent(app);
  await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: characterId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it('names the campaign in the roster event', async () => {
  const res = await player.post(`/api/characters/${characterId}/assign`).send({ campaignId: null });
  expect(res.status).toBe(200);

  expect(broadcastToCampaign).toHaveBeenCalledWith(campaignId, 'roster.updated', expect.objectContaining({
    action: 'character.unassigned', characterId, userId: playerId, campaignId,
  }));
});

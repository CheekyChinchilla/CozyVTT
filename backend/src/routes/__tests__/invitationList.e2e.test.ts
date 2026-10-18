/**
 * What a player's list of invitations says about each campaign.
 *
 * Each invitation named the campaign's owner, which the dashboard and the
 * invitation dialog showed as "DM:". Once the owner hands the game over, that
 * names someone who no longer runs it. The list now carries the member who
 * is the DM as well, and keeps the owner for anything that reads it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let ownerId: string;
let dmId: string;
let inviteeId: string;
let campaignId: string;
let invitee: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const [owner, dm, guest] = await Promise.all([
    createTestUser({ displayName: 'Olwen the Owner' }),
    createTestUser({ displayName: 'Dara the DM' }),
    createTestUser({ displayName: 'Ivo the Invitee' }),
  ]);
  [ownerId, dmId, inviteeId] = [owner.id, dm.id, guest.id];
  campaignId = (await createTestCampaign(ownerId, { name: 'Handed over' })).id;
  // The owner handed the DM seat to Dara and stayed as a player.
  await prisma.campaignMembership.createMany({
    data: [
      { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
    ],
  });
  invitee = request.agent(app);
  await invitee.post('/api/auth/login').send({ email: guest.email, password: TEST_PASSWORD }).expect(200);
});

beforeEach(async () => {
  await prisma.campaignInvitation.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([ownerId, dmId, inviteeId]);
  await prisma.$disconnect();
});

it('names the member who runs the campaign, not only its owner', async () => {
  await prisma.campaignInvitation.create({ data: { campaignId, userId: inviteeId, status: 'PENDING' } });
  const res = await invitee.get('/api/invitations');

  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].campaign.dm).toEqual({ displayName: 'Dara the DM' });
  expect(res.body[0].campaign.owner).toEqual({ displayName: 'Olwen the Owner' });
});

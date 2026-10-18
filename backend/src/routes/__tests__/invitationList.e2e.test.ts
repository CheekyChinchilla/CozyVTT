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
let dmAgent: ReturnType<typeof request.agent>;

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
  dmAgent = request.agent(app);
  await dmAgent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD }).expect(200);
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

// An invitation past its expiry stayed PENDING for good: the player was
// still shown it (and refused when accepting), the DM could not find them in
// the invite search, and inviting them again answered that they already had
// a pending invitation. One that has run out now counts as none.
describe('an invitation that has run out', () => {
  beforeEach(async () => {
    await prisma.campaignInvitation.create({
      data: { campaignId, userId: inviteeId, status: 'PENDING', expiresAt: new Date(Date.now() - 60_000) },
    });
  });

  it('is left out of the player\'s list', async () => {
    const res = await invitee.get('/api/invitations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('leaves the player in the DM\'s invite search', async () => {
    const res = await dmAgent.get(`/api/campaigns/${campaignId}/invitable-users`).query({ search: 'Ivo' });
    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { id: string }) => u.id)).toContain(inviteeId);
  });

  it('lets the DM invite the player again', async () => {
    const res = await dmAgent.post(`/api/campaigns/${campaignId}/invite`).send({ userId: inviteeId });
    expect(res.status).toBe(201);
    const stored = await prisma.campaignInvitation.findUniqueOrThrow({ where: { userId_campaignId: { userId: inviteeId, campaignId } } });
    expect(stored.status).toBe('PENDING');
    expect(stored.expiresAt === null || stored.expiresAt > new Date()).toBe(true);
  });
});

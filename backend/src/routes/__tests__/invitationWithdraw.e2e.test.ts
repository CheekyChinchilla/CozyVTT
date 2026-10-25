/**
 * A DM can see and withdraw their campaign's invitations.
 *
 * Nothing let a DM take an invitation back: one sent to the wrong person, or
 * no longer wanted, stood until the player declined it. The DM can now list
 * the invitations that still stand and withdraw one, which deletes it, so the
 * player no longer sees it and can be invited again later. Only the
 * campaign's DM may; another campaign's DM is answered as if it did not exist.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let dmId: string;
let playerId: string;
let guestId: string;
let otherDmId: string;
let campaignId: string;
let otherCampaignId: string;
let invitationId: string;
const agents: Record<string, ReturnType<typeof request.agent>> = {};

beforeAll(async () => {
  const [dm, player, guest, otherDm] = await Promise.all([
    createTestUser({ displayName: 'Dara the DM' }),
    createTestUser({ displayName: 'Pip the Player' }),
    createTestUser({ displayName: 'Gwen the Guest' }),
    createTestUser({ displayName: 'Otto the Other DM' }),
  ]);
  [dmId, playerId, guestId, otherDmId] = [dm.id, player.id, guest.id, otherDm.id];
  campaignId = (await createTestCampaign(dmId, { name: 'Withdrawn' })).id;
  otherCampaignId = (await createTestCampaign(otherDmId, { name: 'Elsewhere' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherDmId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
    ],
  });
  for (const [name, user] of [['dm', dm], ['player', player], ['guest', guest], ['otherDm', otherDm]] as const) {
    agents[name] = request.agent(app);
    await agents[name].post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  }
});

beforeEach(async () => {
  await prisma.campaignInvitation.deleteMany({ where: { campaignId } });
  invitationId = (await prisma.campaignInvitation.create({
    data: { campaignId, userId: guestId, status: 'PENDING', expiresAt: new Date(Date.now() + 14 * 86_400_000) },
  })).id;
});

afterAll(async () => {
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers([dmId, playerId, guestId, otherDmId]);
  await prisma.$disconnect();
});

const list = (who: string, id = campaignId) => agents[who].get(`/api/campaigns/${id}/invitations`);
const withdraw = (who: string, id = campaignId, inv = invitationId) => agents[who].delete(`/api/campaigns/${id}/invitations/${inv}`);

it('lists the invitations that still stand, with who and until when', async () => {
  // One that ran out is not listed.
  await prisma.campaignInvitation.create({
    data: { campaignId, userId: playerId, status: 'PENDING', expiresAt: new Date(Date.now() - 60_000) },
  });
  const res = await list('dm');

  expect(res.status).toBe(200);
  expect(res.body.invitations).toHaveLength(1);
  expect(res.body.invitations[0]).toMatchObject({ id: invitationId, userId: guestId, user: { displayName: 'Gwen the Guest' } });
  expect(typeof res.body.invitations[0].expiresAt).toBe('string');
});

it('withdraws an invitation, which the player then no longer has', async () => {
  const res = await withdraw('dm');

  expect(res.status).toBe(200);
  expect(await prisma.campaignInvitation.findUnique({ where: { id: invitationId } })).toBeNull();
  expect((await agents.guest.get('/api/invitations')).body).toEqual([]);
  expect((await agents.guest.post(`/api/invitations/${invitationId}/accept`).send({ characterIds: [] })).status).toBe(404);
});

it.each([
  ['a player of the campaign', 'player', 403],
])('refuses %s', async (_who, who, status) => {
  expect((await list(who)).status).toBe(status);
  expect((await withdraw(who)).status).toBe(status);
  expect(await prisma.campaignInvitation.findUnique({ where: { id: invitationId } })).not.toBeNull();
});

it('answers another campaign\'s DM as if the invitation did not exist', async () => {
  const res = await withdraw('otherDm', otherCampaignId);
  expect(res.status).toBe(404);
  expect(await prisma.campaignInvitation.findUnique({ where: { id: invitationId } })).not.toBeNull();
});

it('answers 404 for an invitation already answered', async () => {
  await prisma.campaignInvitation.update({ where: { id: invitationId }, data: { status: 'DECLINED' } });
  expect((await withdraw('dm')).status).toBe(404);
});

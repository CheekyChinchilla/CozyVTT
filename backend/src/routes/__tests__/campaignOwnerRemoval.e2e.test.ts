/**
 * The campaign owner cannot be removed from their own campaign.
 *
 * Owning a campaign and running it are separate facts, which is what lets an
 * owner hand the DM seat to someone else and stay at the table as a player.
 * `canTransferDM` documents the guarantee that goes with it: the owner keeps
 * the right to take the seat back, "so a campaign they own cannot be locked
 * away from them by whoever holds the seat".
 *
 * Removing a member only refused to remove the sitting DM, so the new DM could
 * remove the owner outright. There was no way back: taking the seat back
 * requires being a member, and the only route that adds a member is the DM's.
 * The owner's one remaining power was deleting the whole campaign.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
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

let ownerId: string;
let coHostId: string;
let playerId: string;
let campaignId: string;
let owner: ReturnType<typeof request.agent>;
let coHost: ReturnType<typeof request.agent>;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const stamp = Date.now();
  const [o, c, p] = await Promise.all([
    createTestUser({ email: `owner-${stamp}@test.cozyvtt.local`, displayName: 'Owner' }),
    createTestUser({ email: `cohost-${stamp}@test.cozyvtt.local`, displayName: 'Co-host' }),
    createTestUser({ email: `player-${stamp}@test.cozyvtt.local`, displayName: 'Ordinary Player' }),
  ]);
  ownerId = o.id;
  coHostId = c.id;
  playerId = p.id;

  campaignId = (await createTestCampaign(ownerId, { name: `Owned ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: ownerId, campaignId, role: 'DM', characterIds: [] },
      { userId: coHostId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  [owner, coHost] = await Promise.all([login(o.email), login(c.email)]);

  // The owner hands the seat over and stays at the table as a player. This is
  // the supported arrangement the guarantee is about.
  const handover = await owner.put(`/api/campaigns/${campaignId}/dm`).send({ userId: coHostId });
  expect(handover.status).toBe(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([ownerId, coHostId, playerId]);
  await prisma.$disconnect();
});

describe('a DM who does not own the campaign', () => {
  it('cannot remove the owner', async () => {
    const res = await coHost.delete(`/api/campaigns/${campaignId}/members/${ownerId}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Cannot remove the campaign owner from their own campaign' });

    const still = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: ownerId, campaignId } },
    });
    expect(still).not.toBeNull();
  });

  it('leaves the owner able to take the seat back', async () => {
    const back = await owner.put(`/api/campaigns/${campaignId}/dm`).send({ userId: ownerId });
    expect(back.status).toBe(200);

    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: ownerId, campaignId } },
    });
    expect(membership?.role).toBe('DM');

    // An owner in the DM seat is refused for the seat, which is checked first.
    const self = await owner.delete(`/api/campaigns/${campaignId}/members/${ownerId}`);
    expect(self.status).toBe(400);
    expect(self.body).toEqual({ error: 'Bad Request', message: 'Cannot remove the Dungeon Master from the campaign' });

    // Put the co-host back in the seat for the test that follows.
    await owner.put(`/api/campaigns/${campaignId}/dm`).send({ userId: coHostId });
  });

  it('cannot remove themselves, the DM', async () => {
    const res = await coHost.delete(`/api/campaigns/${campaignId}/members/${coHostId}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Cannot remove the Dungeon Master from the campaign' });
  });

  it('answers 404 for someone who is not a member', async () => {
    const res = await coHost.delete(`/api/campaigns/${campaignId}/members/${randomUUID()}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found', message: 'User is not a member of this campaign' });
  });

  it('can still remove an ordinary player', async () => {
    const res = await coHost.delete(`/api/campaigns/${campaignId}/members/${playerId}`);
    expect(res.status).toBe(200);

    const gone = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: playerId, campaignId } },
    });
    expect(gone).toBeNull();
  });
});

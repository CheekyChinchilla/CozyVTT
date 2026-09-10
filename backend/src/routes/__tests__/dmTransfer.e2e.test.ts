/**
 * Transferring the DM seat — End-to-End Tests
 *
 * A campaign has exactly one DM, and until now that seat could not move: the
 * role route refuses to touch a DM and refuses to mint a second one. That guard
 * is right for ordinary role edits but left no way to hand off a game, so people
 * were editing the database by hand.
 *
 * The invariant is unchanged — one DM, always — it just became movable, in a
 * single action rather than a demote-then-promote that could strand a campaign
 * with two DMs or none.
 *
 * The other fact pinned here: `Campaign.ownerId` does NOT move. Ownership and
 * the DM role are separate, which is what lets an owner hand the game to someone
 * else and stay at the table as a player.
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

describe('PUT /api/campaigns/:campaignId/dm', () => {
  let ownerId: string;
  let dmId: string;
  let playerId: string;
  let spectatorId: string;
  let adminId: string;
  let outsiderId: string;
  let campaignId: string;

  const emails: Record<string, string> = {};

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  beforeAll(async () => {
    const stamp = Date.now();
    for (const who of ['owner', 'dm', 'player', 'spectator', 'admin', 'outsider']) {
      emails[who] = `dmtransfer-${who}-${stamp}@test.cozyvtt.local`;
    }

    const [owner, dm, player, spectator, admin, outsider] = await Promise.all([
      createTestUser({ email: emails.owner, displayName: 'Owner' }),
      createTestUser({ email: emails.dm, displayName: 'Sitting DM' }),
      createTestUser({ email: emails.player, displayName: 'Player' }),
      createTestUser({ email: emails.spectator, displayName: 'Spectator' }),
      createTestUser({ email: emails.admin, displayName: 'Admin', role: 'ADMIN' }),
      createTestUser({ email: emails.outsider, displayName: 'Outsider' }),
    ]);

    ownerId = owner.id;
    dmId = dm.id;
    playerId = player.id;
    spectatorId = spectator.id;
    adminId = admin.id;
    outsiderId = outsider.id;

    // The owner is NOT the DM here. That is the arrangement this route exists to
    // make reachable, and it keeps the two facts visibly distinct in every case
    // below.
    const campaign = await createTestCampaign(ownerId, { name: `DM Transfer ${stamp}` });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([ownerId, dmId, playerId, spectatorId, adminId, outsiderId]);
    await prisma.$disconnect();
  });

  /** Put the campaign back to: owner plays, dm runs it, player and spectator watch. */
  beforeEach(async () => {
    await prisma.campaignMembership.deleteMany({ where: { campaignId } });
    await prisma.campaignMembership.createMany({
      data: [
        { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
        { userId: dmId, campaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
        { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
      ],
    });
  });

  async function rolesById(): Promise<Record<string, string>> {
    const rows = await prisma.campaignMembership.findMany({
      where: { campaignId },
      select: { userId: true, role: true },
    });
    return Object.fromEntries(rows.map((r) => [r.userId, r.role]));
  }

  describe('the transfer itself', () => {
    it('moves the seat and leaves exactly one DM', async () => {
      const agent = await login(emails.dm);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });

      expect(res.status).toBe(200);

      const roles = await rolesById();
      expect(roles[playerId]).toBe('DM');
      expect(roles[dmId]).toBe('PLAYER');
      expect(Object.values(roles).filter((r) => r === 'DM')).toHaveLength(1);
    });

    it('does not move campaign ownership', async () => {
      const agent = await login(emails.dm);
      await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { ownerId: true },
      });
      // The owner was never the DM and is not made one; the new DM does not
      // become the owner. This is the whole point of keeping them separate.
      expect(campaign?.ownerId).toBe(ownerId);
    });

    it('can hand the seat to a spectator', async () => {
      const agent = await login(emails.dm);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: spectatorId });

      expect(res.status).toBe(200);
      const roles = await rolesById();
      expect(roles[spectatorId]).toBe('DM');
      expect(roles[dmId]).toBe('PLAYER');
    });

    it('returns the full membership list so a client can re-derive roles', async () => {
      const agent = await login(emails.dm);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });

      expect(Array.isArray(res.body.memberships)).toBe(true);
      expect(res.body.memberships).toHaveLength(4);
      // SECURITY: the payload must not carry member email addresses.
      for (const m of res.body.memberships) {
        expect(m.user.email).toBeUndefined();
      }
    });
  });

  describe('who is allowed to do it', () => {
    it('allows the sitting DM', async () => {
      const agent = await login(emails.dm);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });
      expect(res.status).toBe(200);
    });

    it('allows the campaign owner even though they are only a player', async () => {
      const agent = await login(emails.owner);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });
      expect(res.status).toBe(200);
      expect((await rolesById())[playerId]).toBe('DM');
    });

    it('allows a platform admin who is not a member at all', async () => {
      const agent = await login(emails.admin);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });
      expect(res.status).toBe(200);
    });

    it('refuses an ordinary player', async () => {
      const agent = await login(emails.player);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });

      expect(res.status).toBe(403);
      // The refusal must be real: nothing moved.
      expect((await rolesById())[dmId]).toBe('DM');
      expect((await rolesById())[playerId]).toBe('PLAYER');
    });

    it('refuses a spectator', async () => {
      const agent = await login(emails.spectator);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: spectatorId });
      expect(res.status).toBe(403);
      expect((await rolesById())[dmId]).toBe('DM');
    });

    it('refuses someone with no membership in the campaign', async () => {
      const agent = await login(emails.outsider);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });
      expect(res.status).toBe(403);
      expect((await rolesById())[dmId]).toBe('DM');
    });

    it('refuses an unauthenticated caller', async () => {
      const res = await request(app)
        .put(`/api/campaigns/${campaignId}/dm`)
        .send({ userId: playerId });
      expect(res.status).toBe(401);
    });
  });

  describe('rejected targets', () => {
    it('rejects a user who is not a member', async () => {
      const agent = await login(emails.dm);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: outsiderId });

      expect(res.status).toBe(404);
      expect((await rolesById())[dmId]).toBe('DM');
    });

    it('rejects transferring to the current DM', async () => {
      const agent = await login(emails.dm);
      const res = await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: dmId });

      expect(res.status).toBe(400);
      expect((await rolesById())[dmId]).toBe('DM');
    });

    it('rejects a missing or malformed userId', async () => {
      const agent = await login(emails.dm);

      expect((await agent.put(`/api/campaigns/${campaignId}/dm`).send({})).status).toBe(400);
      expect(
        (await agent.put(`/api/campaigns/${campaignId}/dm`).send({ userId: 'not-a-uuid' })).status
      ).toBe(400);

      expect((await rolesById())[dmId]).toBe('DM');
    });

    it('404s on a campaign that does not exist', async () => {
      const agent = await login(emails.dm);
      const res = await agent
        .put('/api/campaigns/00000000-0000-4000-8000-000000000000/dm')
        .send({ userId: playerId });
      expect(res.status).toBe(404);
    });
  });

  describe('the one-DM rule still holds elsewhere', () => {
    it('the role endpoint still refuses to touch the DM', async () => {
      const agent = await login(emails.dm);
      const res = await agent
        .put(`/api/campaigns/${campaignId}/members/${dmId}/role`)
        .send({ role: 'PLAYER' });

      // Transferring is the supported way to move the seat; the generic role
      // route must not become a second, non-atomic path to the same thing.
      expect(res.status).toBe(400);
      expect((await rolesById())[dmId]).toBe('DM');
    });

    it('the role endpoint still refuses to mint a second DM', async () => {
      const agent = await login(emails.dm);
      const res = await agent
        .put(`/api/campaigns/${campaignId}/members/${playerId}/role`)
        .send({ role: 'DM' });

      expect(res.status).toBe(400);
      expect(Object.values(await rolesById()).filter((r) => r === 'DM')).toHaveLength(1);
    });
  });
});

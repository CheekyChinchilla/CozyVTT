/**
 * Campaign roll history — End-to-End Tests
 *
 * Covers `GET /api/campaigns/:campaignId/dice-rolls`, added so the dice panel
 * survives a page refresh. Rolls were always written to the database; nothing
 * read them back.
 *
 * The case that matters most here is **secret rolls**. The live socket path
 * sends a secret roll only to the person who made it and to DMs. Replaying
 * history without the same restriction would hand every player the DM's hidden
 * rolls the moment they pressed refresh — a worse bug than the one being fixed —
 * so the visibility rule is pinned from every angle below rather than only on
 * the happy path.
 *
 * Also covers the clear watermark: clearing has to survive a reload, which it
 * did not when `dice.clearHistory` merely broadcast to connected clients.
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

describe('GET /api/campaigns/:campaignId/dice-rolls', () => {
  let dmId: string;
  let playerId: string;
  let outsiderId: string;
  let campaignId: string;

  let dmAgent: ReturnType<typeof request.agent>;
  let playerAgent: ReturnType<typeof request.agent>;
  let outsiderAgent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  /** Insert a roll directly — the socket handler is not under test here. */
  async function addRoll(userId: string, expression: string, secret: boolean) {
    return prisma.diceRoll.create({
      data: { campaignId, userId, expression, result: 10, breakdown: {}, secret },
    });
  }

  const expressionsIn = (body: { rolls: Array<{ expression: string }> }) =>
    body.rolls.map((r) => r.expression).sort();

  beforeAll(async () => {
    const stamp = Date.now();
    const dm = await createTestUser({ email: `roll_dm_${stamp}@test.invalid`, isApproved: true });
    const player = await createTestUser({ email: `roll_pl_${stamp}@test.invalid`, isApproved: true });
    const outsider = await createTestUser({ email: `roll_out_${stamp}@test.invalid`, isApproved: true });

    dmId = dm.id;
    playerId = player.id;
    outsiderId = outsider.id;

    const campaign = await createTestCampaign(dmId, { name: `Roll History ${stamp}` });
    campaignId = campaign.id;

    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: 'DM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
      ],
    });

    dmAgent = await login(`roll_dm_${stamp}@test.invalid`);
    playerAgent = await login(`roll_pl_${stamp}@test.invalid`);
    outsiderAgent = await login(`roll_out_${stamp}@test.invalid`);
  });

  afterEach(async () => {
    await prisma.diceRoll.deleteMany({ where: { campaignId } });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { rollHistoryClearedAt: null },
    });
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId, outsiderId]);
    await prisma.$disconnect();
  });

  it('returns rolls newest first', async () => {
    await addRoll(dmId, '1d4', false);
    await addRoll(playerId, '1d6', false);
    await addRoll(playerId, '1d8', false);

    const res = await dmAgent.get(`/api/campaigns/${campaignId}/dice-rolls`);
    expect(res.status).toBe(200);
    expect(res.body.rolls.map((r: { expression: string }) => r.expression)).toEqual([
      '1d8',
      '1d6',
      '1d4',
    ]);
    expect(res.body.pagination.total).toBe(3);
  });

  describe('secret roll visibility', () => {
    it('gives the DM every roll, including secret ones', async () => {
      await addRoll(dmId, 'dm-secret', true);
      await addRoll(playerId, 'player-secret', true);
      await addRoll(playerId, 'public', false);

      const res = await dmAgent.get(`/api/campaigns/${campaignId}/dice-rolls`);
      expect(res.status).toBe(200);
      expect(expressionsIn(res.body)).toEqual(['dm-secret', 'player-secret', 'public']);
    });

    // The regression this endpoint could most easily introduce.
    it("never leaks another user's secret roll to a player", async () => {
      await addRoll(dmId, 'dm-secret', true);
      await addRoll(playerId, 'public', false);

      const res = await playerAgent.get(`/api/campaigns/${campaignId}/dice-rolls`);
      expect(res.status).toBe(200);
      expect(expressionsIn(res.body)).toEqual(['public']);
      expect(JSON.stringify(res.body)).not.toContain('dm-secret');
      expect(res.body.pagination.total).toBe(1);
    });

    it('gives a player their own secret rolls back', async () => {
      await addRoll(playerId, 'mine-secret', true);
      await addRoll(dmId, 'theirs-secret', true);
      await addRoll(dmId, 'public', false);

      const res = await playerAgent.get(`/api/campaigns/${campaignId}/dice-rolls`);
      expect(expressionsIn(res.body)).toEqual(['mine-secret', 'public']);
    });
  });

  describe('clearing', () => {
    it('hides rolls older than the clear, and keeps newer ones', async () => {
      const before = await addRoll(playerId, 'before-clear', false);
      // Derived from the row rather than `new Date()`. `rolledAt` is stamped by
      // Postgres and the watermark by Node, and under load those two clocks are
      // far enough apart to put the roll *after* its own clear — which is what
      // made this test fail once in a full run and pass on its own.
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { rollHistoryClearedAt: new Date(before.rolledAt.getTime() + 1) },
      });
      // Ensure the next roll is strictly after the watermark.
      await new Promise((resolve) => setTimeout(resolve, 10));
      await addRoll(playerId, 'after-clear', false);

      const res = await dmAgent.get(`/api/campaigns/${campaignId}/dice-rolls`);
      expect(expressionsIn(res.body)).toEqual(['after-clear']);
    });

    it('keeps the cleared rows in the table for audit', async () => {
      const cleared = await addRoll(dmId, 'secret-before-clear', true);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { rollHistoryClearedAt: new Date(cleared.rolledAt.getTime() + 1) },
      });

      const res = await dmAgent.get(`/api/campaigns/${campaignId}/dice-rolls`);
      expect(res.body.rolls).toHaveLength(0);

      // Hidden from the endpoint, still on disk — the point of a watermark.
      const stored = await prisma.diceRoll.count({ where: { campaignId } });
      expect(stored).toBe(1);
    });
  });

  describe('access', () => {
    it('refuses a user who is not a member of the campaign', async () => {
      await addRoll(dmId, 'public', false);
      const res = await outsiderAgent.get(`/api/campaigns/${campaignId}/dice-rolls`);
      expect([403, 404]).toContain(res.status);
    });

    it('refuses an unauthenticated request', async () => {
      const res = await request(app).get(`/api/campaigns/${campaignId}/dice-rolls`);
      expect(res.status).toBe(401);
    });

    it('rejects an out-of-range limit', async () => {
      const res = await dmAgent.get(`/api/campaigns/${campaignId}/dice-rolls?limit=500`);
      expect(res.status).toBe(400);
    });
  });
});

/**
 * Clearing legacy join/leave chat messages — End-to-End Tests
 *
 * Older versions wrote a SYSTEM message every time a socket authenticated or
 * dropped, so a refresh or a brief network blip added a permanent row. Those
 * are no longer written, and presence in the roster covers what they were for.
 *
 * Existing rows are deliberately NOT deleted on upgrade — a chat log is a record
 * of a session and a migration quietly editing it would be hard to undo — so
 * this route is how a GM clears the backlog on purpose.
 *
 * The important detail pinned below: matching is on `metadata.action`, not on
 * the message text. The wording is display copy that could change or be
 * translated; the action tag is what the writer meant.
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

describe('DELETE /api/campaigns/:campaignId/messages/join-leave', () => {
  let gmId: string;
  let playerId: string;
  let campaignId: string;
  let gmAgent: ReturnType<typeof request.agent>;
  let playerAgent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  beforeAll(async () => {
    const stamp = Date.now();
    const gm = await createTestUser({ email: `jl_dm_${stamp}@test.invalid`, isApproved: true });
    const player = await createTestUser({ email: `jl_pl_${stamp}@test.invalid`, isApproved: true });
    gmId = gm.id;
    playerId = player.id;

    const campaign = await createTestCampaign(gmId, { name: `Join Leave ${stamp}` });
    campaignId = campaign.id;
    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: gmId, role: 'GM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
      ],
    });

    gmAgent = await login(`jl_dm_${stamp}@test.invalid`);
    playerAgent = await login(`jl_pl_${stamp}@test.invalid`);
  });

  beforeEach(async () => {
    await prisma.message.deleteMany({ where: { campaignId } });
    await prisma.message.createMany({
      data: [
        {
          campaignId,
          type: 'SYSTEM',
          content: 'Test GM has joined the campaign.',
          metadata: { userId: gmId, action: 'user.joined' },
        },
        {
          campaignId,
          type: 'SYSTEM',
          content: 'Test GM has left the campaign.',
          metadata: { userId: gmId, action: 'user.left' },
        },
        {
          campaignId,
          type: 'SYSTEM',
          content: 'The session has started.',
          metadata: { action: 'session.started' },
        },
        { campaignId, userId: playerId, type: 'PLAYER', content: 'Hello everyone' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([gmId, playerId]);
    await prisma.$disconnect();
  });

  it('removes the join and leave notices', async () => {
    const res = await gmAgent.delete(`/api/campaigns/${campaignId}/messages/join-leave`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    const left = await prisma.message.findMany({ where: { campaignId } });
    const actions = left.map((m) => (m.metadata as { action?: string } | null)?.action);
    expect(actions).not.toContain('user.joined');
    expect(actions).not.toContain('user.left');
  });

  it('leaves other system messages and the conversation alone', async () => {
    await gmAgent.delete(`/api/campaigns/${campaignId}/messages/join-leave`);

    const left = await prisma.message.findMany({ where: { campaignId } });
    expect(left).toHaveLength(2);
    expect(left.map((m) => m.content).sort()).toEqual([
      'Hello everyone',
      'The session has started.',
    ]);
  });

  it('is a no-op when there is nothing to clear', async () => {
    await gmAgent.delete(`/api/campaigns/${campaignId}/messages/join-leave`);
    const res = await gmAgent.delete(`/api/campaigns/${campaignId}/messages/join-leave`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(0);
  });

  it('refuses a player', async () => {
    const res = await playerAgent.delete(`/api/campaigns/${campaignId}/messages/join-leave`);
    expect(res.status).toBe(403);

    // And changed nothing.
    expect(await prisma.message.count({ where: { campaignId } })).toBe(4);
  });

  it('refuses an unauthenticated request', async () => {
    const res = await request(app).delete(`/api/campaigns/${campaignId}/messages/join-leave`);
    expect(res.status).toBe(401);
  });
});

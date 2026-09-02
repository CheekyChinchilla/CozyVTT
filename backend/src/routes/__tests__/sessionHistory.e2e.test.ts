/**
 * Reading past sessions and their notes — End-to-End Tests
 *
 * The DM has always been able to write notes when ending a session, and the
 * end-session dialog said so — "notes are saved with this session's record" —
 * but nothing ever read them back. They were written, stored, and invisible.
 *
 * Notes were never framed as private: the field is labelled "Session Notes"
 * and prompts "What happened this session?", and the same dialog promised
 * history viewing in a later update. So every campaign member may read them,
 * which is what the table asked for — a player wanting to remember what
 * happened last time.
 *
 * `savedState` is deliberately not returned. It is a large blob of token
 * positions kept for resuming a session, and nothing displaying history needs
 * it; sending it would make this response many times larger for no purpose.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { Prisma } from '@prisma/client';
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

interface SessionRow {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  savedState?: unknown;
}

describe('session history', () => {
  let dmId: string;
  let playerId: string;
  let strangerId: string;
  let campaignId: string;

  let dm: ReturnType<typeof request.agent>;
  let player: ReturnType<typeof request.agent>;
  let stranger: ReturnType<typeof request.agent>;

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  };

  beforeAll(async () => {
    const stamp = Date.now();
    const dmEmail = `sh_dm_${stamp}@test.invalid`;
    const playerEmail = `sh_pl_${stamp}@test.invalid`;
    const strangerEmail = `sh_st_${stamp}@test.invalid`;

    dmId = (await createTestUser({ email: dmEmail, isApproved: true })).id;
    playerId = (await createTestUser({ email: playerEmail, isApproved: true })).id;
    strangerId = (await createTestUser({ email: strangerEmail, isApproved: true })).id;

    campaignId = (await createTestCampaign(dmId, { name: `Session History ${stamp}` })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: 'DM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
      ],
    });

    await prisma.session.createMany({
      data: [
        {
          campaignId,
          sessionNumber: 1,
          startedAt: new Date('2026-01-01T18:00:00Z'),
          endedAt: new Date('2026-01-01T22:00:00Z'),
          notes: 'The party opened the ravine and met the twisted tree.',
          savedState: { tokens: [{ id: 'a', position: { x: 1, y: 1 } }] },
        },
        {
          campaignId,
          sessionNumber: 2,
          startedAt: new Date('2026-01-08T18:00:00Z'),
          endedAt: new Date('2026-01-08T21:30:00Z'),
          notes: 'Kobolds. Everywhere. Bramble nearly died to a trapped chest.',
          savedState: { tokens: [] },
        },
        // Ended without notes — the field is optional.
        {
          campaignId,
          sessionNumber: 3,
          startedAt: new Date('2026-01-15T18:00:00Z'),
          endedAt: new Date('2026-01-15T20:00:00Z'),
          notes: null,
          savedState: Prisma.JsonNull,
        },
      ],
    });

    dm = await login(dmEmail);
    player = await login(playerEmail);
    stranger = await login(strangerEmail);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId, strangerId]);
    await prisma.$disconnect();
  });

  const list = async (agent: ReturnType<typeof request.agent>) =>
    agent.get(`/api/campaigns/${campaignId}/sessions`);

  it('gives the DM every session', async () => {
    const res = await list(dm);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(3);
  });

  // The whole point: a player wanting to remember what happened last time.
  it('gives a player the notes as well', async () => {
    const res = await list(player);
    expect(res.status).toBe(200);
    const numbers = (res.body.sessions as SessionRow[]).map((s) => s.sessionNumber);
    expect(numbers).toContain(2);
    const second = (res.body.sessions as SessionRow[]).find((s) => s.sessionNumber === 2);
    expect(second?.notes).toContain('Kobolds');
  });

  it('lists the most recent session first', async () => {
    const res = await list(dm);
    expect((res.body.sessions as SessionRow[]).map((s) => s.sessionNumber)).toEqual([3, 2, 1]);
  });

  it('returns a session that was ended without notes', async () => {
    const res = await list(dm);
    const third = (res.body.sessions as SessionRow[]).find((s) => s.sessionNumber === 3);
    expect(third).toBeDefined();
    expect(third?.notes).toBeNull();
  });

  // Large, internal, and needed only for resuming — not for reading history.
  it('does not ship the saved game state', async () => {
    const res = await list(dm);
    for (const session of res.body.sessions as SessionRow[]) {
      expect(session).not.toHaveProperty('savedState');
    }
  });

  it('refuses someone who is not in the campaign', async () => {
    expect((await list(stranger)).status).toBe(403);
  });

  it('refuses a signed-out request', async () => {
    expect((await request(app).get(`/api/campaigns/${campaignId}/sessions`)).status).toBe(401);
  });
});

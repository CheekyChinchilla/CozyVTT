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

  /**
   * Editing a past recap.
   *
   * Sessions were being ended with notes long before anything displayed them,
   * so switching the history panel on published every recap ever written at
   * once. A DM who had used that box as a private scratchpad needs a way to
   * take it back, which is what this is for — not a general editing feature.
   */
  describe('editing a past session', () => {
    let targetId: string;
    let otherCampaignId: string;
    let otherSessionId: string;

    const editNotes = (agent: ReturnType<typeof request.agent>, id: string, notes: string) =>
      agent.put(`/api/campaigns/${campaignId}/sessions/${id}/notes`).send({ notes });

    beforeAll(async () => {
      const session = await prisma.session.create({
        data: {
          campaignId,
          sessionNumber: 4,
          startedAt: new Date('2026-01-22T18:00:00Z'),
          endedAt: new Date('2026-01-22T21:00:00Z'),
          notes: 'Something the DM would rather nobody had read.',
        },
      });
      targetId = session.id;

      // A second campaign, run by the same DM, to prove the route is scoped by
      // campaign and not only by session id.
      otherCampaignId = (await createTestCampaign(dmId, { name: `Elsewhere ${Date.now()}` })).id;
      await prisma.campaignMembership.create({
        data: { campaignId: otherCampaignId, userId: dmId, role: 'DM', characterIds: [] },
      });
      otherSessionId = (
        await prisma.session.create({
          data: {
            campaignId: otherCampaignId,
            sessionNumber: 1,
            startedAt: new Date('2026-02-01T18:00:00Z'),
            endedAt: new Date('2026-02-01T20:00:00Z'),
            notes: 'Belongs to a different campaign.',
          },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.session.deleteMany({ where: { campaignId: otherCampaignId } });
      await cleanupCampaigns([otherCampaignId]);
    });

    it('lets the DM rewrite the notes', async () => {
      const res = await editNotes(dm, targetId, 'A tidier account of the evening.');
      expect(res.status).toBe(200);
      expect(res.body.session.notes).toBe('A tidier account of the evening.');

      const stored = await prisma.session.findUnique({ where: { id: targetId } });
      expect(stored?.notes).toBe('A tidier account of the evening.');
    });

    it('clears the notes when sent an empty string', async () => {
      expect((await editNotes(dm, targetId, '')).status).toBe(200);
      const stored = await prisma.session.findUnique({ where: { id: targetId } });
      expect(stored?.notes).toBeNull();
    });

    it('treats whitespace as clearing rather than storing blanks', async () => {
      await editNotes(dm, targetId, 'something');
      expect((await editNotes(dm, targetId, '   \n  ')).status).toBe(200);
      const stored = await prisma.session.findUnique({ where: { id: targetId } });
      expect(stored?.notes).toBeNull();
    });

    it('refuses a player', async () => {
      const res = await editNotes(player, targetId, 'Not mine to write.');
      expect(res.status).toBe(403);
    });

    it('refuses someone outside the campaign', async () => {
      expect((await editNotes(stranger, targetId, 'Nor mine.')).status).toBe(403);
    });

    it('refuses a signed-out request', async () => {
      const res = await request(app)
        .put(`/api/campaigns/${campaignId}/sessions/${targetId}/notes`)
        .send({ notes: 'anonymous' });
      expect(res.status).toBe(401);
    });

    it('refuses notes longer than the limit', async () => {
      const res = await editNotes(dm, targetId, 'x'.repeat(2001));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/2000/);
    });

    it('accepts notes exactly at the limit', async () => {
      expect((await editNotes(dm, targetId, 'x'.repeat(2000))).status).toBe(200);
    });

    it('refuses a body with no notes field at all', async () => {
      const res = await dm.put(`/api/campaigns/${campaignId}/sessions/${targetId}/notes`).send({});
      expect(res.status).toBe(400);
    });

    /**
     * The DM of this campaign is also the DM of the other one, so this is not
     * about authorisation — it is about the route refusing to act on a session
     * that is not this campaign's, which a bare `update` by id would have done.
     */
    it('will not edit a session belonging to another campaign', async () => {
      const res = await editNotes(dm, otherSessionId, 'Reached across campaigns.');
      expect(res.status).toBe(404);

      const stored = await prisma.session.findUnique({ where: { id: otherSessionId } });
      expect(stored?.notes).toBe('Belongs to a different campaign.');
    });

    it('answers 404 for a session that does not exist', async () => {
      const res = await editNotes(dm, '00000000-0000-0000-0000-000000000000', 'nothing');
      expect(res.status).toBe(404);
    });
  });
});

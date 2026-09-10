/**
 * GET /api/campaigns/:campaignId/messages — chat history.
 *
 * Two faults made a campaign's log unreachable as the table played. The route
 * took the newest N rows and *then* dropped dice rolls in JavaScript, so a
 * session with heavy dice traffic returned a handful of chat messages or none
 * at all. And the client's cursor was never read, so scrolling back returned
 * the newest page every time.
 *
 * These cover the paging contract rather than the formatting: that a page is
 * full of the thing it is a page of, that following the cursor reaches the
 * beginning exactly once, and that rows sharing a millisecond survive a page
 * boundary.
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

interface Page {
  messages: Array<{ id: string; content: string; type: string; createdAt: string }>;
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
}

describe('GET /api/campaigns/:campaignId/messages', () => {
  let dmId: string;
  let outsiderId: string;
  let campaignId: string;
  let dmAgent: ReturnType<typeof request.agent>;
  let outsiderAgent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  /**
   * Write messages directly — the socket handlers are not under test here.
   * `createdAt` is set explicitly so ordering is deterministic rather than
   * dependent on how fast the inserts run.
   */
  async function seed(rows: Array<{ type: 'PLAYER' | 'DICE_ROLL' | 'SYSTEM'; content: string; at: Date }>) {
    for (const row of rows) {
      await prisma.message.create({
        data: {
          campaignId,
          userId: row.type === 'SYSTEM' ? null : dmId,
          type: row.type,
          content: row.content,
          createdAt: row.at,
        },
      });
    }
  }

  const at = (offsetMs: number) => new Date(Date.UTC(2026, 0, 1) + offsetMs);

  beforeAll(async () => {
    const stamp = Date.now();
    const dm = await createTestUser({ email: `msg_dm_${stamp}@test.invalid`, isApproved: true });
    const outsider = await createTestUser({ email: `msg_out_${stamp}@test.invalid`, isApproved: true });
    dmId = dm.id;
    outsiderId = outsider.id;

    const campaign = await createTestCampaign(dmId, { name: `Chat History ${stamp}` });
    campaignId = campaign.id;
    await prisma.campaignMembership.create({
      data: { campaignId, userId: dmId, role: 'DM', characterIds: [] },
    });

    dmAgent = await login(`msg_dm_${stamp}@test.invalid`);
    outsiderAgent = await login(`msg_out_${stamp}@test.invalid`);
  });

  afterEach(async () => {
    await prisma.message.deleteMany({ where: { campaignId } });
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, outsiderId]);
  });

  it('fills a page with chat even when dice rolls outnumber it', async () => {
    // 60 rolls then 60 chat messages: the newest 50 rows are all chat, but the
    // older pages are where the starvation shows, so interleave them.
    const rows: Array<{ type: 'PLAYER' | 'DICE_ROLL'; content: string; at: Date }> = [];
    for (let i = 0; i < 60; i++) {
      rows.push({ type: 'DICE_ROLL', content: `roll ${i}`, at: at(i * 2) });
      rows.push({ type: 'PLAYER', content: `chat ${i}`, at: at(i * 2 + 1) });
    }
    await seed(rows);

    const res = await dmAgent.get(`/api/campaigns/${campaignId}/messages?limit=50`);
    expect(res.status).toBe(200);
    const body = res.body as Page;
    expect(body.messages).toHaveLength(50);
    expect(body.messages.every((m) => m.type !== 'DICE_ROLL')).toBe(true);
  });

  it('pages back to the very beginning, each message exactly once', async () => {
    const total = 120;
    await seed(
      Array.from({ length: total }, (_, i) => ({
        type: 'PLAYER' as const,
        content: `chat ${i}`,
        at: at(i),
      }))
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    // Capped so a cursor that never terminates fails loudly instead of hanging.
    for (let page = 0; page < 10; page++) {
      const url = `/api/campaigns/${campaignId}/messages?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await dmAgent.get(url);
      expect(res.status).toBe(200);
      const body = res.body as Page;
      seen.push(...body.messages.map((m) => m.content));
      if (!body.pagination.hasMore) { cursor = null; break; }
      cursor = body.pagination.nextCursor;
      expect(cursor).toBeTruthy();
    }

    expect(cursor).toBeNull();
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    // Newest first, all the way down to the first thing anyone said.
    expect(seen[0]).toBe('chat 119');
    expect(seen[total - 1]).toBe('chat 0');
  });

  it('neither drops nor repeats messages sharing a timestamp', async () => {
    // The tiebreaker is what this pins. A cursor on createdAt alone would
    // either skip these or serve them forever.
    const same = at(0);
    await seed([
      { type: 'PLAYER', content: 'tied a', at: same },
      { type: 'PLAYER', content: 'tied b', at: same },
      { type: 'PLAYER', content: 'tied c', at: same },
    ]);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const url = `/api/campaigns/${campaignId}/messages?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const body = (await dmAgent.get(url)).body as Page;
      seen.push(...body.messages.map((m) => m.content));
      if (!body.pagination.hasMore) break;
      cursor = body.pagination.nextCursor;
    }

    expect(seen.sort()).toEqual(['tied a', 'tied b', 'tied c']);
  });

  it('ends the walk when the last page is exactly full', async () => {
    await seed(
      Array.from({ length: 50 }, (_, i) => ({ type: 'PLAYER' as const, content: `chat ${i}`, at: at(i) }))
    );
    const body = (await dmAgent.get(`/api/campaigns/${campaignId}/messages?limit=50`)).body as Page;
    expect(body.messages).toHaveLength(50);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.nextCursor).toBeNull();
  });

  it('rejects a cursor it did not mint', async () => {
    for (const bad of ['garbage', Buffer.from('nonsense').toString('base64url')]) {
      const res = await dmAgent.get(`/api/campaigns/${campaignId}/messages?cursor=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
    }
  });

  it('never serves a dice roll, even as the newest row', async () => {
    // Standing guard. These rows carry the roll's `secret` flag inside metadata
    // and this endpoint does not filter on it, so relaxing this leaks hidden
    // rolls — and ChatMessage would print the metadata verbatim.
    await seed([
      { type: 'PLAYER', content: 'chat', at: at(0) },
      { type: 'DICE_ROLL', content: 'rolled 1d20', at: at(1) },
    ]);
    const body = (await dmAgent.get(`/api/campaigns/${campaignId}/messages`)).body as Page;
    expect(body.messages.map((m) => m.content)).toEqual(['chat']);
  });

  it('refuses someone who is not in the campaign', async () => {
    const res = await outsiderAgent.get(`/api/campaigns/${campaignId}/messages`);
    expect(res.status).toBe(403);
  });
});

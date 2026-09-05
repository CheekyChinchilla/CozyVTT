/**
 * Personal notes — End-to-End Tests
 *
 * Notes a player keeps for themselves, written in Markdown. Private is the
 * whole feature: unlike `Session.notes`, which the campaign reads together, and
 * unlike a secret dice roll, which the DM sees so disputes can be settled,
 * nothing about a personal note needs another pair of eyes.
 *
 * So the tests that matter most are the negative ones. Every route scopes its
 * query by the session's own user id — never by an id from the request — and a
 * note belonging to someone else answers **404 rather than 403**, deliberately:
 * a 403 would confirm that a note with that id exists, which is itself a
 * disclosure to someone who should not know.
 *
 * The list is checked for *not* containing note bodies. A campaign's notes can
 * run to tens of thousands of characters each, and a list that shipped them all
 * would move megabytes every time the panel opened.
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
import {
  MAX_NOTE_CONTENT_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_NOTES_PER_CAMPAIGN,
} from '../../validators/personalNotes';

const app = createTestApp();

interface NoteSummary {
  id: string;
  title: string;
  updatedAt: string;
  content?: string;
}

describe('personal notes', () => {
  let dmId: string;
  let playerId: string;
  let strangerId: string;
  let campaignId: string;
  let otherCampaignId: string;

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
    const dmEmail = `pn_dm_${stamp}@test.invalid`;
    const playerEmail = `pn_pl_${stamp}@test.invalid`;
    const strangerEmail = `pn_st_${stamp}@test.invalid`;

    dmId = (await createTestUser({ email: dmEmail, isApproved: true })).id;
    playerId = (await createTestUser({ email: playerEmail, isApproved: true })).id;
    strangerId = (await createTestUser({ email: strangerEmail, isApproved: true })).id;

    campaignId = (await createTestCampaign(dmId, { name: `Notes ${stamp}` })).id;
    otherCampaignId = (await createTestCampaign(dmId, { name: `Other ${stamp}` })).id;

    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: 'DM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
        { campaignId: otherCampaignId, userId: dmId, role: 'DM', characterIds: [] },
        { campaignId: otherCampaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
      ],
    });

    dm = await login(dmEmail);
    player = await login(playerEmail);
    stranger = await login(strangerEmail);
  });

  afterEach(async () => {
    await prisma.personalNote.deleteMany({
      where: { campaignId: { in: [campaignId, otherCampaignId] } },
    });
  });

  afterAll(async () => {
    await prisma.personalNote.deleteMany({ where: { userId: { in: [dmId, playerId, strangerId] } } });
    await cleanupCampaigns([campaignId, otherCampaignId]);
    await cleanupUsers([dmId, playerId, strangerId]);
    await prisma.$disconnect();
  });

  const notesUrl = (campaign = campaignId) => `/api/campaigns/${campaign}/notes`;

  const create = (
    agent: ReturnType<typeof request.agent>,
    body: Record<string, unknown>,
    campaign = campaignId
  ) => agent.post(notesUrl(campaign)).send(body);

  describe('writing and reading your own', () => {
    it('creates a note', async () => {
      const res = await create(player, { title: 'Ravine plan', content: '# Plan\n\n- rope' });
      expect(res.status).toBe(201);
      expect(res.body.note.title).toBe('Ravine plan');
      expect(res.body.note.content).toBe('# Plan\n\n- rope');
    });

    it('creates a note with no body yet', async () => {
      const res = await create(player, { title: 'Empty for now' });
      expect(res.status).toBe(201);
      expect(res.body.note.content).toBe('');
    });

    it('reads one back in full', async () => {
      const made = await create(player, { title: 'Lore', content: 'The **tree** speaks.' });
      const res = await player.get(`${notesUrl()}/${made.body.note.id}`);
      expect(res.status).toBe(200);
      expect(res.body.note.content).toBe('The **tree** speaks.');
    });

    it('lists them newest first', async () => {
      await create(player, { title: 'First' });
      await create(player, { title: 'Second' });
      const res = await player.get(notesUrl());
      expect(res.status).toBe(200);
      expect((res.body.notes as NoteSummary[]).map((n) => n.title)).toEqual(['Second', 'First']);
    });

    // Bodies are fetched one at a time; a list that shipped them all would move
    // megabytes each time the panel opened.
    it('leaves note bodies out of the list', async () => {
      await create(player, { title: 'Long one', content: 'x'.repeat(5000) });
      const res = await player.get(notesUrl());
      for (const note of res.body.notes as NoteSummary[]) {
        expect(note).not.toHaveProperty('content');
      }
      expect(JSON.stringify(res.body)).not.toContain('xxxxx');
    });

    it('updates the body', async () => {
      const made = await create(player, { title: 'Draft', content: 'one' });
      const res = await player.put(`${notesUrl()}/${made.body.note.id}`).send({ content: 'two' });
      expect(res.status).toBe(200);
      expect(res.body.note.content).toBe('two');
    });

    it('renames without touching the body', async () => {
      const made = await create(player, { title: 'Old', content: 'kept' });
      const res = await player.put(`${notesUrl()}/${made.body.note.id}`).send({ title: 'New' });
      expect(res.status).toBe(200);
      expect(res.body.note.title).toBe('New');
      expect(res.body.note.content).toBe('kept');
    });

    it('deletes one', async () => {
      const made = await create(player, { title: 'Doomed' });
      expect((await player.delete(`${notesUrl()}/${made.body.note.id}`)).status).toBe(200);
      expect((await player.get(`${notesUrl()}/${made.body.note.id}`)).status).toBe(404);
    });
  });

  describe('nobody else can reach them', () => {
    let noteId: string;

    beforeEach(async () => {
      const made = await create(player, { title: 'Private', content: 'my secret plan' });
      noteId = made.body.note.id;
    });

    // The DM runs the campaign; that does not extend to reading a player's own
    // notes. A secret roll is DM-visible because disputes need settling —
    // nothing here does.
    it('the DM of the campaign cannot read a player\'s note', async () => {
      const res = await dm.get(`${notesUrl()}/${noteId}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('secret plan');
    });

    it('the DM cannot update it', async () => {
      expect((await dm.put(`${notesUrl()}/${noteId}`).send({ content: 'tampered' })).status).toBe(404);
      const still = await prisma.personalNote.findUnique({ where: { id: noteId } });
      expect(still?.content).toBe('my secret plan');
    });

    it('the DM cannot delete it', async () => {
      expect((await dm.delete(`${notesUrl()}/${noteId}`)).status).toBe(404);
      expect(await prisma.personalNote.findUnique({ where: { id: noteId } })).not.toBeNull();
    });

    it("the DM's own list does not include it", async () => {
      const res = await dm.get(notesUrl());
      expect((res.body.notes as NoteSummary[]).some((n) => n.id === noteId)).toBe(false);
    });

    // 404 rather than 403 on purpose: a 403 would confirm the id exists.
    it('answers 404 rather than 403, so existence is not confirmed', async () => {
      expect((await dm.get(`${notesUrl()}/${noteId}`)).status).toBe(404);
    });

    it('someone outside the campaign is refused outright', async () => {
      expect((await stranger.get(notesUrl())).status).toBe(403);
      expect((await stranger.get(`${notesUrl()}/${noteId}`)).status).toBe(403);
    });

    it('a signed-out request is refused', async () => {
      expect((await request(app).get(notesUrl())).status).toBe(401);
    });
  });

  describe('notes belong to one campaign', () => {
    it('does not show a note from another campaign', async () => {
      const made = await create(player, { title: 'Elsewhere' }, otherCampaignId);
      const res = await player.get(notesUrl());
      expect((res.body.notes as NoteSummary[]).some((n) => n.id === made.body.note.id)).toBe(false);
    });

    // The id is real and the reader owns it — but not here.
    it('will not fetch it through the wrong campaign', async () => {
      const made = await create(player, { title: 'Elsewhere' }, otherCampaignId);
      expect((await player.get(`${notesUrl()}/${made.body.note.id}`)).status).toBe(404);
    });
  });

  describe('limits', () => {
    it('accepts a note at the maximum length', async () => {
      const res = await create(player, { title: 'Long', content: 'x'.repeat(MAX_NOTE_CONTENT_LENGTH) });
      expect(res.status).toBe(201);
    });

    /**
     * Characters are not bytes.
     *
     * The cap is expressed in characters, but the body parser counts bytes, and
     * its default 100kb is smaller than 100,000 characters of anything but
     * plain ASCII. A note of accented text was refused at about 70,000
     * characters — well inside its own limit — and the writer was told "An
     * unexpected error occurred" while autosave silently stopped.
     *
     * These pin the two limits together at their worst realistic ratio, so
     * lowering the parser's limit again fails here rather than in a game.
     */
    it('accepts a full-length note of accented text, not just ASCII', async () => {
      const line = 'Père Lachaise — the “tomb” was sealed. ';
      const content = line.repeat(Math.ceil(MAX_NOTE_CONTENT_LENGTH / line.length))
        .slice(0, MAX_NOTE_CONTENT_LENGTH);
      expect(content.length).toBe(MAX_NOTE_CONTENT_LENGTH);
      // Comfortably past the parser's old 100kb ceiling.
      expect(Buffer.byteLength(content, 'utf8')).toBeGreaterThan(100 * 1024);

      const res = await create(player, { title: 'Accented', content });
      expect(res.status).toBe(201);
      expect(res.body.note.content).toBe(content);
    });

    it('accepts a full-length note of markdown prose with many line breaks', async () => {
      const line = '- the party moved on\n';
      const content = line.repeat(Math.ceil(MAX_NOTE_CONTENT_LENGTH / line.length))
        .slice(0, MAX_NOTE_CONTENT_LENGTH);
      const res = await create(player, { title: 'Prose', content });
      expect(res.status).toBe(201);
    });

    // Over the parser's limit is a 413 the caller can act on, not a 500 that
    // blames the server for something they can fix.
    it('answers 413 rather than 500 when the body itself is too big', async () => {
      const res = await create(player, { title: 'Enormous', content: 'x'.repeat(2_000_000) });
      expect(res.status).toBe(413);
      expect(res.body.message).toMatch(/too large/i);
    });

    it('refuses one over it', async () => {
      const res = await create(player, { title: 'Too long', content: 'x'.repeat(MAX_NOTE_CONTENT_LENGTH + 1) });
      expect(res.status).toBe(400);
    });

    it('refuses a title over the limit', async () => {
      expect((await create(player, { title: 'x'.repeat(MAX_NOTE_TITLE_LENGTH + 1) })).status).toBe(400);
    });

    it.each([['missing', undefined], ['blank', '   ']])('refuses a %s title', async (_label, title) => {
      expect((await create(player, { title })).status).toBe(400);
    });

    it('refuses an update that changes nothing', async () => {
      const made = await create(player, { title: 'Something' });
      expect((await player.put(`${notesUrl()}/${made.body.note.id}`).send({})).status).toBe(400);
    });

    it('refuses more than the per-campaign cap', async () => {
      await prisma.personalNote.createMany({
        data: Array.from({ length: MAX_NOTES_PER_CAMPAIGN }, (_, i) => ({
          userId: playerId,
          campaignId,
          title: `Note ${i}`,
          content: '',
        })),
      });
      const res = await create(player, { title: 'One too many' });
      expect(res.status).toBe(400);
    });
  });

  // Markdown is stored exactly as typed and rendered on the client with raw
  // HTML disabled, so a note is never a script-injection route.
  it('stores markdown source verbatim, including things that look like HTML', async () => {
    const content = '# Heading\n\n<script>alert(1)</script>\n\n[link](https://example.invalid)';
    const made = await create(player, { title: 'Markdown', content });
    const res = await player.get(`${notesUrl()}/${made.body.note.id}`);
    expect(res.body.note.content).toBe(content);
  });
});

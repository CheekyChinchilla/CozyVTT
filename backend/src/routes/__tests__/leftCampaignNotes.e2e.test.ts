/**
 * A removed player keeps their own notes and dice macros readable.
 *
 * Removing a member deleted nothing of theirs, but every notes and macros
 * route asks for membership, so the person who wrote them could no longer
 * list, read or copy them. They stay tied to the campaign: rejoining shows
 * them in the campaign again, and deleting the campaign deletes them.
 *
 * Only the caller's own notes and macros are ever answered, and only for a
 * campaign the caller is no longer in. Reading one note, and the lists, never
 * carry a campaign's worth of text; one request for the whole campaign's
 * notes does, for the download, and is written out a few notes at a time.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma as appPrisma } from '../../config/database';
import logger from '../../utils/logger';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();
const userIds: string[] = [];
const campaignIds: string[] = [];

interface LeftCampaign {
  id: string;
  name: string;
  notes: { id: string; title: string; content?: string }[];
  macros: { id: string; name: string; expression: string }[];
}

async function signedIn(label: string) {
  const user = await createTestUser({ displayName: label });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

/** A campaign run by `dm`, with `players` in it. */
async function campaignWith(name: string, dmId: string, playerIds: string[]) {
  const campaign = await createTestCampaign(dmId, { name });
  campaignIds.push(campaign.id);
  await prisma.campaignMembership.createMany({
    data: [
      { campaignId: campaign.id, userId: dmId, role: 'DM', characterIds: [] },
      ...playerIds.map((userId) => ({ campaignId: campaign.id, userId, role: 'PLAYER' as const, characterIds: [] })),
    ],
  });
  return campaign.id;
}

afterAll(async () => {
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

describe('notes and macros from a campaign the person was removed from', () => {
  let dm: Awaited<ReturnType<typeof signedIn>>;
  let leaver: Awaited<ReturnType<typeof signedIn>>;
  let stayer: Awaited<ReturnType<typeof signedIn>>;
  let campaignId: string;
  let noteId: string;
  let stayerNoteId: string;

  beforeAll(async () => {
    dm = await signedIn('Left DM');
    leaver = await signedIn('Left Player');
    stayer = await signedIn('Staying Player');
    campaignId = await campaignWith('Curse of the Left', dm.user.id, [leaver.user.id, stayer.user.id]);

    const note = await leaver.agent.post(`/api/campaigns/${campaignId}/notes`).send({ title: 'Suspects', content: '# The baron\n\nLied about the mill.' });
    expect(note.status).toBe(201);
    noteId = note.body.note.id;
    expect((await leaver.agent.post(`/api/campaigns/${campaignId}/macros`).send({ name: 'Sneak attack', expression: '3d6' })).status).toBe(201);
    stayerNoteId = (await stayer.agent.post(`/api/campaigns/${campaignId}/notes`).send({ title: 'Not yours', content: 'secret' })).body.note.id;

    expect((await dm.agent.delete(`/api/campaigns/${campaignId}/members/${leaver.user.id}`)).status).toBe(200);
  });

  it('lists the campaign, with the titles of their notes and their macros', async () => {
    const res = await leaver.agent.get('/api/campaigns/left');
    expect(res.status).toBe(200);
    const left = (res.body.campaigns as LeftCampaign[]).find((c) => c.id === campaignId);
    expect(left).toBeDefined();
    expect(left!.name).toBe('Curse of the Left');
    expect(left!.notes.map((n) => n.title)).toEqual(['Suspects']);
    // Titles only in the list; the text is fetched for one campaign at a time.
    expect(left!.notes[0].content).toBeUndefined();
    expect(left!.macros.map((m) => [m.name, m.expression])).toEqual([['Sneak attack', '3d6']]);
  });

  it('answers the titles of their notes, and their macros, for that campaign', async () => {
    const res = await leaver.agent.get(`/api/campaigns/left/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.body.campaign).toEqual({ id: campaignId, name: 'Curse of the Left' });
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0]).toMatchObject({ id: noteId, title: 'Suspects' });
    expect(res.body.notes[0].content).toBeUndefined();
    expect(res.body.macros).toHaveLength(1);
    expect(res.body.macros[0]).toMatchObject({ name: 'Sneak attack', expression: '3d6' });
    // Nobody else's.
    expect((res.body.notes as { id: string }[]).map((n) => n.id)).not.toContain(stayerNoteId);
  });

  it('answers the text of one of their notes from that campaign', async () => {
    const res = await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes/${noteId}`);
    expect(res.status).toBe(200);
    expect(res.body.note).toMatchObject({ id: noteId, title: 'Suspects', content: '# The baron\n\nLied about the mill.' });
  });

  it('sends no note text with the campaign, however long the notes are', async () => {
    const long = await prisma.personalNote.create({
      data: { campaignId, userId: leaver.user.id, title: 'Session log', content: 'é'.repeat(100_000) },
    });
    try {
      const res = await leaver.agent.get(`/api/campaigns/left/${campaignId}`);
      expect(res.status).toBe(200);
      expect((res.body.notes as { id: string }[]).map((n) => n.id)).toContain(long.id);
      expect(res.text.length).toBeLessThan(2_000);

      const one = await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes/${long.id}`);
      expect(one.status).toBe(200);
      expect(one.body.note.content).toHaveLength(100_000);
    } finally {
      await prisma.personalNote.delete({ where: { id: long.id } });
    }
  });

  it('answers every note with its text in one request, most recently edited first, and only their own', async () => {
    const first = await prisma.personalNote.create({
      data: { campaignId, userId: leaver.user.id, title: 'Quote "marks"', content: 'line one\nline two \\ é 日本語 \u2028', updatedAt: new Date(Date.now() - 60_000) },
    });
    try {
      const res = await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      const notes = res.body.notes as { id: string; title: string; content: string; userId: string }[];
      expect(notes.map((n) => n.id)).toEqual([noteId, first.id]);
      expect(notes[0]).toMatchObject({ title: 'Suspects', content: '# The baron\n\nLied about the mill.', userId: leaver.user.id });
      expect(notes[1]).toMatchObject({ title: 'Quote "marks"', content: 'line one\nline two \\ é 日本語 \u2028' });
      // The same order as the titles in the campaign's own answer.
      const titles = await leaver.agent.get(`/api/campaigns/left/${campaignId}`);
      expect((titles.body.notes as { id: string }[]).map((n) => n.id)).toEqual(notes.map((n) => n.id));
      expect(notes.map((n) => n.id)).not.toContain(stayerNoteId);
    } finally {
      await prisma.personalNote.delete({ where: { id: first.id } });
    }
  });

  it('answers a campaign of full-length notes whole, in a few batches', async () => {
    const text = (i: number) => `${i}`.padStart(3, '0') + 'é'.repeat(99_997);
    const made = await prisma.$transaction(
      Array.from({ length: 25 }, (_, i) =>
        prisma.personalNote.create({
          data: { campaignId, userId: leaver.user.id, title: `Long ${i}`, content: text(i), updatedAt: new Date(Date.now() + 1000 * (i + 1)) },
        })
      )
    );
    try {
      const res = await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes`);
      expect(res.status).toBe(200);
      const notes = res.body.notes as { id: string; title: string; content: string }[];
      expect(notes).toHaveLength(26);
      // Most recently edited first: the last made, down to the first, then the original.
      expect(notes.slice(0, 25).map((n) => n.title)).toEqual(Array.from({ length: 25 }, (_, i) => `Long ${24 - i}`));
      expect(notes[0].content).toBe(text(24));
      expect(notes[24].content).toBe(text(0));
      expect(notes[25].id).toBe(noteId);
    } finally {
      await prisma.personalNote.deleteMany({ where: { id: { in: made.map((n) => n.id) } } });
    }
  });

  it('answers an ordinary 500 when the notes cannot be read, and cuts the connection off when a later batch fails', async () => {
    const made = await prisma.$transaction(
      Array.from({ length: 12 }, (_, i) =>
        prisma.personalNote.create({ data: { campaignId, userId: leaver.user.id, title: `Batch ${i}`, content: 'x' } })
      )
    );
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const real = appPrisma.personalNote.findMany.bind(appPrisma.personalNote);
    try {
      // The first batch cannot be read: nothing is out yet, so it is a 500.
      const fails = jest.spyOn(appPrisma.personalNote, 'findMany');
      fails.mockImplementationOnce(real as typeof appPrisma.personalNote.findMany);
      fails.mockRejectedValueOnce(new Error('database went away'));
      const early = await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes`);
      expect(early.status).toBe(500);
      expect(early.body).toEqual({ error: 'Internal Server Error', message: 'Failed to fetch your notes' });
      fails.mockRestore();

      // The second batch cannot be read: the first is out, so the answer is cut off.
      const later = jest.spyOn(appPrisma.personalNote, 'findMany');
      later.mockImplementationOnce(real as typeof appPrisma.personalNote.findMany);
      later.mockImplementationOnce(real as typeof appPrisma.personalNote.findMany);
      later.mockRejectedValueOnce(new Error('database went away'));
      await expect(leaver.agent.get(`/api/campaigns/left/${campaignId}/notes`).buffer(true)).rejects.toThrow();
      expect(logged).toHaveBeenCalledWith('Error fetching the notes from a campaign left', expect.anything());
    } finally {
      jest.restoreAllMocks();
      await prisma.personalNote.deleteMany({ where: { id: { in: made.map((n) => n.id) } } });
    }
  });

  it('answers 404 for the notes of a campaign the person is still in, or never in, and 401 signed out', async () => {
    const stillIn = await stayer.agent.get(`/api/campaigns/left/${campaignId}/notes`);
    expect(stillIn.status).toBe(404);
    expect(stillIn.body.message).toBe('You have not left that campaign, or have no notes or dice macros in it');
    const stranger = await signedIn('Notes Stranger');
    expect((await stranger.agent.get(`/api/campaigns/left/${campaignId}/notes`)).status).toBe(404);
    expect((await stranger.agent.get('/api/campaigns/left/not-a-campaign/notes')).status).toBe(404);
    expect((await request(app).get(`/api/campaigns/left/${campaignId}/notes`)).status).toBe(401);
  });

  it('answers nothing for a campaign the person is still in', async () => {
    // A member reads their notes through the campaign's own notes routes.
    const campaign = await stayer.agent.get(`/api/campaigns/left/${campaignId}`);
    expect(campaign.status).toBe(404);
    expect(campaign.body.message).toBe('You have not left that campaign, or have no notes or dice macros in it');
    const note = await stayer.agent.get(`/api/campaigns/left/${campaignId}/notes/${stayerNoteId}`);
    expect(note.status).toBe(404);
    expect(note.body.message).toBe('Note not found');
    expect((await stayer.agent.get(`/api/campaigns/${campaignId}/notes/${stayerNoteId}`)).status).toBe(200);
  });

  it('still refuses them the campaign itself and its notes routes', async () => {
    expect((await leaver.agent.get(`/api/campaigns/${campaignId}`)).status).toBe(403);
    expect((await leaver.agent.get(`/api/campaigns/${campaignId}/notes`)).status).toBe(403);
    expect((await leaver.agent.post(`/api/campaigns/${campaignId}/notes`).send({ title: 'New' })).status).toBe(403);
  });

  it('does not list a campaign the person is still in', async () => {
    const res = await stayer.agent.get('/api/campaigns/left');
    expect(res.status).toBe(200);
    expect((res.body.campaigns as LeftCampaign[]).map((c) => c.id)).not.toContain(campaignId);
  });

  it("answers nothing of someone else's, and nothing to someone signed out", async () => {
    const stranger = await signedIn('Left Stranger');
    expect((await stranger.agent.get('/api/campaigns/left')).body.campaigns).toEqual([]);
    const theirs = await stranger.agent.get(`/api/campaigns/left/${campaignId}`);
    expect(theirs.status).toBe(404);
    expect(theirs.body.message).toBe('You have not left that campaign, or have no notes or dice macros in it');
    const theirNote = await stranger.agent.get(`/api/campaigns/left/${campaignId}/notes/${noteId}`);
    expect(theirNote.status).toBe(404);
    expect(theirNote.body.message).toBe('Note not found');
    // Someone else's note in the campaign they did leave, and an id that is no note's.
    expect((await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes/${stayerNoteId}`)).status).toBe(404);
    expect((await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes/not-a-note`)).status).toBe(404);
    expect((await request(app).get('/api/campaigns/left')).status).toBe(401);
    expect((await request(app).get(`/api/campaigns/left/${campaignId}`)).status).toBe(401);
    expect((await request(app).get(`/api/campaigns/left/${campaignId}/notes/${noteId}`)).status).toBe(401);
  });

  it('shows them in the campaign again when the person rejoins', async () => {
    await prisma.campaignMembership.create({ data: { campaignId, userId: leaver.user.id, role: 'PLAYER', characterIds: [] } });
    const notes = await leaver.agent.get(`/api/campaigns/${campaignId}/notes`);
    expect((notes.body.notes as { id: string }[]).map((n) => n.id)).toEqual([noteId]);
    expect(((await leaver.agent.get('/api/campaigns/left')).body.campaigns as LeftCampaign[]).map((c) => c.id)).not.toContain(campaignId);
    expect((await leaver.agent.get(`/api/campaigns/left/${campaignId}`)).status).toBe(404);
    expect((await leaver.agent.get(`/api/campaigns/left/${campaignId}/notes/${noteId}`)).status).toBe(404);
    await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: leaver.user.id, campaignId } } });
  });
});

it('deletes them with the campaign', async () => {
  const dm = await signedIn('Deleting DM');
  const leaver = await signedIn('Removed Before Deletion');
  const campaignId = await campaignWith('Doomed Table', dm.user.id, [leaver.user.id]);
  expect((await leaver.agent.post(`/api/campaigns/${campaignId}/notes`).send({ title: 'Gone soon' })).status).toBe(201);
  expect((await dm.agent.delete(`/api/campaigns/${campaignId}/members/${leaver.user.id}`)).status).toBe(200);
  expect(((await leaver.agent.get('/api/campaigns/left')).body.campaigns as LeftCampaign[]).map((c) => c.id)).toContain(campaignId);

  expect((await dm.agent.delete(`/api/campaigns/${campaignId}`)).status).toBe(200);

  expect(((await leaver.agent.get('/api/campaigns/left')).body.campaigns as LeftCampaign[]).map((c) => c.id)).not.toContain(campaignId);
  expect(await prisma.personalNote.count({ where: { campaignId } })).toBe(0);
});

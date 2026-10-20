// ============================================
// Notes and dice macros from campaigns the caller has left
//
// Removing a member deletes nothing of theirs: their personal notes and dice
// macros stay with the campaign, and are in it again if they rejoin. The
// notes and macros routes ask for membership, so these let the person
// still read and copy their own once they are out. Deleting the campaign
// deletes them, as it always has.
//
// The handlers for GET /api/campaigns/left, /left/:campaignId,
// /left/:campaignId/notes and /left/:campaignId/notes/:noteId. They are
// registered in routes/campaigns.ts
// ahead of its /:campaignId routes, which would otherwise read "left" as a
// campaign id, behind `authenticated`. Every query is scoped to the session's
// own user id, and answers only for a campaign the caller is not a member of;
// a member has the campaign's own notes routes.
//
// Note text goes out one note at a time when a note is read, as it does for a
// member, and never with the lists. The download wants every note, so
// /left/:campaignId/notes answers them all in one request; a campaign can hold
// 200 notes of 100,000 characters each, so that answer is written out a few
// notes at a time instead of built whole, and has a limit of its own
// (middleware/leftNotesDownloadLimiter).
// ============================================

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import logger from '../utils/logger';

/** A campaign the user has no membership in. */
const notAMemberOf = (userId: string) => ({ memberships: { none: { userId } } });

interface LeftCampaign {
  id: string;
  name: string;
  notes: { id: string; title: string; createdAt: Date; updatedAt: Date }[];
  macros: Awaited<ReturnType<typeof prisma.diceMacro.findMany>>;
}

/**
 * GET /api/campaigns/left
 * The campaigns the caller is no longer a member of and still has notes or
 * dice macros in, by name, each with the titles of their notes (most recently
 * edited first) and their macros (oldest first). Note text is not included;
 * GET /api/campaigns/left/:campaignId/notes/:noteId has it, one note at a time,
 * and GET /api/campaigns/left/:campaignId/notes has all of a campaign's.
 */
export async function listLeftCampaigns(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const userId = req.session.userId!;
    const notAMember = notAMemberOf(userId);
    const campaignName = { campaign: { select: { name: true } } };
    const [notes, macros] = await Promise.all([
      prisma.personalNote.findMany({
        where: { userId, campaign: notAMember },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, createdAt: true, updatedAt: true, campaignId: true, ...campaignName },
      }),
      prisma.diceMacro.findMany({
        where: { userId, campaign: notAMember },
        orderBy: { createdAt: 'asc' },
        include: campaignName,
      }),
    ]);

    const byCampaign = new Map<string, LeftCampaign>();
    const entry = (id: string, name: string): LeftCampaign => {
      let found = byCampaign.get(id);
      if (!found) {
        found = { id, name, notes: [], macros: [] };
        byCampaign.set(id, found);
      }
      return found;
    };
    for (const { campaignId, campaign, ...note } of notes) entry(campaignId, campaign.name).notes.push(note);
    for (const { campaign, ...macro } of macros) entry(macro.campaignId, campaign.name).macros.push(macro);

    const campaigns = [...byCampaign.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return res.status(200).json({ campaigns });
  } catch (error) {
    logger.error('Error listing notes from campaigns left', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch your notes' });
  }
}

/**
 * GET /api/campaigns/left/:campaignId
 * One campaign the caller has left: its id and name, the titles of their notes
 * in it (most recently edited first) and their dice macros (oldest first).
 * 404 for a campaign they are a member of, or have nothing in, with the same
 * message either way, so it says nothing about a campaign they were never in.
 */
export async function getLeftCampaign(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const userId = req.session.userId!;
    const { campaignId } = req.params;
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, ...notAMemberOf(userId) },
      select: { id: true, name: true },
    });
    const [notes, macros] = campaign
      ? await Promise.all([
          prisma.personalNote.findMany({
            where: { userId, campaignId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, title: true, createdAt: true, updatedAt: true },
          }),
          prisma.diceMacro.findMany({ where: { userId, campaignId }, orderBy: { createdAt: 'asc' } }),
        ])
      : [[], []];
    if (!campaign || (notes.length === 0 && macros.length === 0)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'You have not left that campaign, or have no notes or dice macros in it',
      });
    }
    return res.status(200).json({ campaign, notes, macros });
  } catch (error) {
    logger.error('Error fetching notes from a campaign left', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch your notes' });
  }
}

/**
 * GET /api/campaigns/left/:campaignId/notes/:noteId
 * One of the caller's notes, with its text, from a campaign they have left.
 * 404 for a note that is not theirs, or is in a campaign they are a member of.
 */
export async function getLeftCampaignNote(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const userId = req.session.userId!;
    const note = await prisma.personalNote.findFirst({
      where: { id: req.params.noteId, campaignId: req.params.campaignId, userId, campaign: notAMemberOf(userId) },
    });
    if (!note) {
      return res.status(404).json({ error: 'Not Found', message: 'Note not found' });
    }
    return res.status(200).json({ note });
  } catch (error) {
    logger.error('Error fetching a note from a campaign left', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch note' });
  }
}

/**
 * How many notes are read and written at a time. Ten full-length notes are a
 * million characters, a few megabytes, whatever the campaign holds.
 */
const NOTES_PER_BATCH = 10;

/** Write a piece of the answer, waiting for the connection to drain when it is full. */
function writeChunk(res: Response, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (res.destroyed) {
      reject(new Error('The client went away'));
      return;
    }
    if (res.write(chunk)) {
      resolve();
      return;
    }
    const finish = (error?: Error) => {
      res.off('drain', onDrain);
      res.off('close', onClose);
      if (error) reject(error);
      else resolve();
    };
    const onDrain = () => finish();
    const onClose = () => finish(new Error('The client went away'));
    res.once('drain', onDrain);
    res.once('close', onClose);
  });
}

/**
 * GET /api/campaigns/left/:campaignId/notes
 * Every one of the caller's notes in a campaign they have left, with its text,
 * most recently edited first (the order of the titles in
 * GET /api/campaigns/left/:campaignId): `{ notes: [...] }`, each as
 * GET .../notes/:noteId gives it. The download uses this instead of one
 * request a note. 404, with the message of the campaign's own answer, for a
 * campaign they are a member of or have nothing in.
 *
 * Written a batch of notes at a time, so a campaign of 200 full-length notes
 * is never held in memory whole. A failure after the first batch is out cuts
 * the connection off, which the client reports as a failed request.
 */
export async function getLeftCampaignNotes(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const userId = req.session.userId!;
    const { campaignId } = req.params;
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, ...notAMemberOf(userId) },
      select: { id: true },
    });
    const [titles, macros] = campaign
      ? await Promise.all([
          prisma.personalNote.findMany({
            where: { userId, campaignId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true },
          }),
          prisma.diceMacro.count({ where: { userId, campaignId } }),
        ])
      : [[], 0];
    if (!campaign || (titles.length === 0 && macros === 0)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'You have not left that campaign, or have no notes or dice macros in it',
      });
    }

    // The status line goes out with the first batch, so a failure reading it
    // is still an ordinary 500.
    let started = false;
    const start = async () => {
      if (started) return;
      started = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store');
      await writeChunk(res, '{"notes":[');
    };

    const ids = titles.map((n) => n.id);
    let wrote = false;
    for (let from = 0; from < ids.length; from += NOTES_PER_BATCH) {
      const batch = ids.slice(from, from + NOTES_PER_BATCH);
      const rows = await prisma.personalNote.findMany({ where: { id: { in: batch }, userId, campaignId } });
      await start();
      const position = new Map(batch.map((id, i) => [id, i]));
      rows.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
      if (rows.length > 0) {
        await writeChunk(res, (wrote ? ',' : '') + rows.map((row) => JSON.stringify(row)).join(','));
        wrote = true;
      }
    }
    await start();
    res.end(']}');
    return res;
  } catch (error) {
    // A client that closed the tab or lost its connection part-way is
    // nobody's fault, so it is information. Anything else is an error.
    if (res.headersSent && (res.destroyed || req.destroyed)) {
      logger.info('A notes download from a campaign left ended part-way: the client went away', { campaignId: req.params.campaignId });
    } else {
      logger.error('Error fetching the notes from a campaign left', { err: error });
    }
    // Part of the answer is already out: all that is left is to cut it off.
    if (res.headersSent) {
      res.destroy();
      return res;
    }
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch your notes' });
  }
}

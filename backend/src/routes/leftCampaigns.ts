// ============================================
// Notes and dice macros from campaigns the caller has left
//
// Removing a member deletes nothing of theirs: their personal notes and dice
// macros stay with the campaign, and are in it again if they rejoin. The
// notes and macros routes ask for membership, so these let the person
// still read and copy their own once they are out. Deleting the campaign
// deletes them, as it always has.
//
// The handlers for GET /api/campaigns/left, /left/:campaignId and
// /left/:campaignId/notes/:noteId. They are registered in routes/campaigns.ts
// ahead of its /:campaignId routes, which would otherwise read "left" as a
// campaign id, behind `authenticated`. Every query is scoped to the session's
// own user id, and answers only for a campaign the caller is not a member of;
// a member has the campaign's own notes routes.
//
// Note text goes out one note at a time, as it does for a member. A campaign
// can hold 200 notes of 100,000 characters each, so one answer with every body
// would run to tens of megabytes.
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
 * GET /api/campaigns/left/:campaignId/notes/:noteId has it, one note at a time.
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

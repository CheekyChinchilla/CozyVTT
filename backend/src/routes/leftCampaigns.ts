// ============================================
// Notes and dice macros from campaigns the caller has left
//
// Removing a member deletes nothing of theirs: their personal notes and dice
// macros stay with the campaign, and are in it again if they rejoin. The
// notes and macros routes ask for membership, so these two let the person
// still read and copy their own once they are out. Deleting the campaign
// deletes them, as it always has.
//
// The handlers for GET /api/campaigns/left and /left/:campaignId. They are
// registered in routes/campaigns.ts ahead of its /:campaignId routes, which
// would otherwise read "left" as a campaign id, behind `authenticated`.
// Every query is scoped to the session's own user id.
// ============================================

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import logger from '../utils/logger';

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
 * GET /api/campaigns/left/:campaignId has it, for one campaign at a time.
 */
export async function listLeftCampaigns(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const userId = req.session.userId!;
    const notAMember = { memberships: { none: { userId } } };
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
 * The caller's own notes, with their text, and dice macros in one campaign.
 * Answers for any campaign they have notes or macros in, member or not, and
 * 404 where they have none, so it says nothing about a campaign they were
 * never in.
 */
export async function getLeftCampaign(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const userId = req.session.userId!;
    const { campaignId } = req.params;
    const [notes, macros] = await Promise.all([
      prisma.personalNote.findMany({
        where: { userId, campaignId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
      }),
      prisma.diceMacro.findMany({ where: { userId, campaignId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const campaign =
      notes.length > 0 || macros.length > 0
        ? await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true } })
        : null;
    if (!campaign) {
      return res.status(404).json({ error: 'Not Found', message: 'You have no notes or dice macros in that campaign' });
    }
    return res.status(200).json({ campaign, notes, macros });
  } catch (error) {
    logger.error('Error fetching notes from a campaign left', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch your notes' });
  }
}

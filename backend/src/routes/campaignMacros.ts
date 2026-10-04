// ============================================
// Campaign dice macros: a player's saved rolls in one campaign.
//
// Moved out of routes/campaigns.ts, which had grown to 38 endpoints. Mounted
// under /api/campaigns beside it; the paths are exactly what they were.
// ============================================

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { campaignMember } from '../middleware/compose';
import { prisma } from '../config/database';
import { CreateDiceMacroSchema, UpdateDiceMacroSchema, MAX_MACROS_PER_CAMPAIGN } from '../validators/diceMacros';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/campaigns/:campaignId/macros
 * The caller's own macros for this campaign, oldest first.
 * Requires: Campaign membership (any role)
 *
 * Oldest first so a macro keeps its place in the row of buttons. These are
 * things people build muscle memory for; ordering by `updatedAt` the way notes
 * do would move one to the front every time it was edited.
 */
router.get('/:campaignId/macros', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const macros = await prisma.diceMacro.findMany({
      where: { campaignId: req.params.campaignId, userId: req.session.userId! },
      orderBy: { createdAt: 'asc' },
    });
    return res.status(200).json({ macros });
  } catch (error) {
    logger.error('Error fetching dice macros', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch macros' });
  }
});

/**
 * POST /api/campaigns/:campaignId/macros
 * Save a new macro. Requires: Campaign membership (any role)
 */
router.post('/:campaignId/macros', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = CreateDiceMacroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid macro',
      });
    }

    const { campaignId } = req.params;
    const userId = req.session.userId!;

    const existing = await prisma.diceMacro.count({ where: { campaignId, userId } });
    if (existing >= MAX_MACROS_PER_CAMPAIGN) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `You already have ${MAX_MACROS_PER_CAMPAIGN} macros in this campaign. Delete one to make room.`,
      });
    }

    const macro = await prisma.diceMacro.create({
      data: {
        campaignId,
        userId,
        name: parsed.data.name,
        expression: parsed.data.expression,
      },
    });

    return res.status(201).json({ macro });
  } catch (error) {
    logger.error('Error creating dice macro', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create macro' });
  }
});

/**
 * GET /api/campaigns/:campaignId/macros/:macroId
 * One of the caller's own macros. Requires: Campaign membership, and authorship.
 */
router.get('/:campaignId/macros/:macroId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const macro = await prisma.diceMacro.findFirst({
      where: {
        id: req.params.macroId,
        campaignId: req.params.campaignId,
        userId: req.session.userId!,
      },
    });

    if (!macro) {
      return res.status(404).json({ error: 'Not Found', message: 'Macro not found' });
    }

    return res.status(200).json({ macro });
  } catch (error) {
    logger.error('Error fetching dice macro', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch macro' });
  }
});

/**
 * PUT /api/campaigns/:campaignId/macros/:macroId
 * Rename a macro or correct its expression.
 * Requires: Campaign membership, and authorship.
 */
router.put('/:campaignId/macros/:macroId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = UpdateDiceMacroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid macro',
      });
    }

    // Scoped lookup first: the id used in the update below is one this caller
    // has already been proven to own, rather than one taken from the request.
    const owned = await prisma.diceMacro.findFirst({
      where: {
        id: req.params.macroId,
        campaignId: req.params.campaignId,
        userId: req.session.userId!,
      },
      select: { id: true },
    });

    if (!owned) {
      return res.status(404).json({ error: 'Not Found', message: 'Macro not found' });
    }

    const macro = await prisma.diceMacro.update({
      where: { id: owned.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.expression !== undefined ? { expression: parsed.data.expression } : {}),
      },
    });

    return res.status(200).json({ macro });
  } catch (error) {
    logger.error('Error updating dice macro', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update macro' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/macros/:macroId
 * Requires: Campaign membership, and authorship.
 */
router.delete('/:campaignId/macros/:macroId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // deleteMany rather than delete: the whole ownership scope goes into the
    // one statement, so there is no window between checking and deleting.
    const { count } = await prisma.diceMacro.deleteMany({
      where: {
        id: req.params.macroId,
        campaignId: req.params.campaignId,
        userId: req.session.userId!,
      },
    });

    if (count === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Macro not found' });
    }

    return res.status(200).json({ message: 'Macro deleted' });
  } catch (error) {
    logger.error('Error deleting dice macro', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete macro' });
  }
});

export default router;

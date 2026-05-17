/**
 * Creature Library API Routes
 * CRUD endpoints for creature templates — both SRD (global) and campaign-specific homebrew.
 * Mounted under /api/campaigns/:campaignId/creatures
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../middleware/rbac';
import { campaignMember, campaignDM } from '../middleware/compose';
import { prisma } from '../config/database';
import { seedSrdCreatures, getSrdSeedStatus } from '../services/creatureSeed';
import logger from '../utils/logger';

const router = Router({ mergeParams: true });

/** Track whether a seed is currently in progress to prevent duplicate runs. */
let seedInProgress = false;

// ============================================
// SEED STATUS — GET /seed/status
// Returns whether SRD creatures have been seeded.
// Any campaign member can check.
// ============================================

router.get('/seed/status', campaignMember, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await getSrdSeedStatus(prisma);
    return res.json({
      ...status,
      seedInProgress,
    });
  } catch (error) {
    logger.error('Error checking seed status:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to check seed status' });
  }
});

// ============================================
// SEED SRD — POST /seed
// Fetches SRD creatures from Open5e and populates the library.
// DM only. Safe to call multiple times.
// ============================================

router.post('/seed', campaignDM, async (_req: AuthenticatedRequest, res: Response) => {
  if (seedInProgress) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'SRD seeding is already in progress. Please wait.',
    });
  }

  seedInProgress = true;
  try {
    const result = await seedSrdCreatures(prisma);
    return res.json({
      message: 'SRD creature seeding complete',
      ...result,
    });
  } catch (error) {
    logger.error('Error seeding SRD creatures:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to seed SRD creatures. Check that the server can reach api.open5e.com.',
    });
  } finally {
    seedInProgress = false;
  }
});

// ============================================
// LIST — GET /
// Returns SRD + campaign-specific templates, with search/filter support.
// Any campaign member can list.
// ============================================

router.get('/', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { search, source, cr, gameSystem, limit = '50', offset = '0' } = req.query;

    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = Math.max(0, parseInt(offset as string, 10) || 0);

    // Build where clause: include SRD (campaignId null) + this campaign's customs
    const where: Record<string, unknown> = {
      OR: [
        { campaignId: null },
        { campaignId },
      ],
    };

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }
    if (source) {
      where.source = source as string;
    }
    if (cr) {
      where.challengeRating = cr as string;
    }
    if (gameSystem) {
      where.gameSystem = gameSystem as string;
    }

    const [templates, total] = await Promise.all([
      prisma.creatureTemplate.findMany({
        where: where as any,
        orderBy: { name: 'asc' },
        take,
        skip,
      }),
      prisma.creatureTemplate.count({ where: where as any }),
    ]);

    return res.json({
      creatures: templates,
      total,
      limit: take,
      offset: skip,
    });
  } catch (error) {
    logger.error('Error listing creature templates:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list creature templates' });
  }
});

// ============================================
// GET ONE — GET /:creatureId
// ============================================

router.get('/:creatureId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { creatureId } = req.params;

    const template = await prisma.creatureTemplate.findUnique({
      where: { id: creatureId },
    });

    if (!template) {
      return res.status(404).json({ error: 'Not Found', message: 'Creature template not found' });
    }

    return res.json(template);
  } catch (error) {
    logger.error('Error getting creature template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get creature template' });
  }
});

// ============================================
// CREATE — POST /
// DM only. Creates a campaign-specific custom creature.
// ============================================

router.post('/', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.session.userId!;
    const data = req.body;

    // Validate required fields
    if (!data.name || typeof data.name !== 'string') {
      return res.status(400).json({ error: 'Validation Error', message: 'Creature name is required' });
    }
    if (!data.statBlock || typeof data.statBlock !== 'object') {
      return res.status(400).json({ error: 'Validation Error', message: 'Stat block is required' });
    }

    const template = await prisma.creatureTemplate.create({
      data: {
        id: randomUUID(),
        name: data.name.trim(),
        gameSystem: data.gameSystem || null,
        source: 'custom',
        challengeRating: data.challengeRating || null,
        creatureType: data.creatureType || null,
        alignment: data.alignment || null,
        imageUrl: data.imageUrl || null,
        statBlock: data.statBlock,
        size: data.size || { width: 1, height: 1 },
        disposition: data.disposition || 'hostile',
        displayMode: data.displayMode || 'pog',
        createdById: userId,
        campaignId,
      },
    });

    return res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating creature template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create creature template' });
  }
});

// ============================================
// UPDATE — PUT /:creatureId
// DM only. Can only update campaign-specific creatures (not SRD).
// ============================================

router.put('/:creatureId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, creatureId } = req.params;
    const data = req.body;

    const existing = await prisma.creatureTemplate.findUnique({
      where: { id: creatureId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Creature template not found' });
    }

    // Prevent editing SRD creatures
    if (existing.source === 'srd') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot edit SRD creatures. Duplicate it first to create a custom version.',
      });
    }

    // Prevent editing another campaign's creatures
    if (existing.campaignId !== campaignId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Cannot edit creatures from another campaign' });
    }

    const updated = await prisma.creatureTemplate.update({
      where: { id: creatureId },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.gameSystem !== undefined && { gameSystem: data.gameSystem }),
        ...(data.challengeRating !== undefined && { challengeRating: data.challengeRating }),
        ...(data.creatureType !== undefined && { creatureType: data.creatureType }),
        ...(data.alignment !== undefined && { alignment: data.alignment }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.statBlock !== undefined && { statBlock: data.statBlock }),
        ...(data.size !== undefined && { size: data.size }),
        ...(data.disposition !== undefined && { disposition: data.disposition }),
        ...(data.displayMode !== undefined && { displayMode: data.displayMode }),
      },
    });

    return res.json(updated);
  } catch (error) {
    logger.error('Error updating creature template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update creature template' });
  }
});

// ============================================
// DELETE — DELETE /:creatureId
// DM only. Cannot delete SRD creatures.
// ============================================

router.delete('/:creatureId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, creatureId } = req.params;

    const existing = await prisma.creatureTemplate.findUnique({
      where: { id: creatureId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Creature template not found' });
    }

    if (existing.source === 'srd') {
      return res.status(403).json({ error: 'Forbidden', message: 'Cannot delete SRD creatures' });
    }

    if (existing.campaignId !== campaignId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Cannot delete creatures from another campaign' });
    }

    await prisma.creatureTemplate.delete({ where: { id: creatureId } });

    return res.json({ message: 'Creature template deleted' });
  } catch (error) {
    logger.error('Error deleting creature template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete creature template' });
  }
});

// ============================================
// DUPLICATE — POST /:creatureId/duplicate
// DM only. Copies any creature (including SRD) into a campaign-specific custom creature.
// ============================================

router.post('/:creatureId/duplicate', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, creatureId } = req.params;
    const userId = req.session.userId!;

    const source = await prisma.creatureTemplate.findUnique({
      where: { id: creatureId },
    });

    if (!source) {
      return res.status(404).json({ error: 'Not Found', message: 'Creature template not found' });
    }

    const duplicate = await prisma.creatureTemplate.create({
      data: {
        id: randomUUID(),
        name: `${source.name} (Custom)`,
        gameSystem: source.gameSystem,
        source: 'custom',
        challengeRating: source.challengeRating,
        creatureType: source.creatureType,
        alignment: source.alignment,
        imageUrl: source.imageUrl,
        statBlock: source.statBlock as object,
        size: source.size as object,
        disposition: source.disposition,
        displayMode: source.displayMode,
        createdById: userId,
        campaignId,
      },
    });

    return res.status(201).json(duplicate);
  } catch (error) {
    logger.error('Error duplicating creature template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to duplicate creature template' });
  }
});

// ============================================
// FAVORITES — GET /favorites
// Returns creature IDs that the current user has favorited in this campaign.
// ============================================

router.get('/favorites/list', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.session.userId!;

    const favorites = await prisma.creatureFavorite.findMany({
      where: { campaignId, userId },
      include: { creature: true },
      orderBy: { creature: { name: 'asc' } },
    });

    return res.json({
      favoriteIds: favorites.map((f) => f.creatureId),
      creatures: favorites.map((f) => f.creature),
    });
  } catch (error) {
    logger.error('Error listing creature favorites:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list favorites' });
  }
});

// ============================================
// FAVORITE — POST /:creatureId/favorite
// Toggle favorite for the current user in this campaign.
// ============================================

router.post('/:creatureId/favorite', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, creatureId } = req.params;
    const userId = req.session.userId!;

    // Check if already favorited
    const existing = await prisma.creatureFavorite.findUnique({
      where: {
        campaignId_userId_creatureId: { campaignId, userId, creatureId },
      },
    });

    if (existing) {
      // Unfavorite
      await prisma.creatureFavorite.delete({ where: { id: existing.id } });
      return res.json({ favorited: false });
    } else {
      // Favorite
      await prisma.creatureFavorite.create({
        data: {
          id: randomUUID(),
          campaignId,
          userId,
          creatureId,
        },
      });
      return res.json({ favorited: true });
    }
  } catch (error) {
    logger.error('Error toggling creature favorite:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to toggle favorite' });
  }
});

export default router;

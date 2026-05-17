/**
 * Token Template API Routes
 * CRUD endpoints for reusable token templates (objects, pre-configured NPCs, etc.).
 * Mounted under /api/campaigns/:campaignId/token-templates
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/rbac';
import { campaignMember, campaignDM } from '../middleware/compose';
import { prisma } from '../config/database';
import {
  CreateTokenTemplateSchema,
  UpdateTokenTemplateSchema,
  SaveTokenAsTemplateSchema,
} from '../validators/tokenTemplates';
import logger from '../utils/logger';

/** Convert a nullable value to a Prisma-compatible JSON input. */
function jsonOrNull(val: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return val == null ? Prisma.JsonNull : (val as Prisma.InputJsonValue);
}

const router = Router({ mergeParams: true });

// ============================================
// LIST — GET /
// Returns token templates for this campaign with search/pagination.
// Any campaign member can list.
// ============================================

router.get('/', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { search, type, limit = '50', offset = '0' } = req.query;

    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = Math.max(0, parseInt(offset as string, 10) || 0);

    const where: Record<string, unknown> = { campaignId };

    if (search && typeof search === 'string') {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (type && typeof type === 'string' && ['player', 'npc', 'object'].includes(type)) {
      where.type = type;
    }

    const [templates, total] = await Promise.all([
      prisma.tokenTemplate.findMany({
        where: where as any,
        orderBy: { name: 'asc' },
        take,
        skip,
      }),
      prisma.tokenTemplate.count({ where: where as any }),
    ]);

    return res.json({ templates, total, limit: take, offset: skip });
  } catch (error) {
    logger.error('Error listing token templates:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list token templates' });
  }
});

// ============================================
// GET ONE — GET /:id
// ============================================

router.get('/:id', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    const template = await prisma.tokenTemplate.findUnique({ where: { id } });

    if (!template) {
      return res.status(404).json({ error: 'Not Found', message: 'Token template not found' });
    }
    if (template.campaignId !== campaignId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Token template belongs to another campaign' });
    }

    return res.json(template);
  } catch (error) {
    logger.error('Error getting token template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get token template' });
  }
});

// ============================================
// CREATE — POST /
// DM only.
// ============================================

router.post('/', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.session.userId!;

    const parsed = CreateTokenTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const data = parsed.data;
    const template = await prisma.tokenTemplate.create({
      data: {
        id: randomUUID(),
        name: data.name,
        imageUrl: data.imageUrl ?? null,
        type: data.type,
        disposition: data.disposition ?? null,
        displayMode: data.displayMode,
        size: data.size,
        notes: data.notes ?? null,
        hp: jsonOrNull(data.hp),
        showHpBar: data.showHpBar,
        statBlock: jsonOrNull(data.statBlock),
        sightRadius: data.sightRadius ?? null,
        createdById: userId,
        campaignId,
      },
    });

    return res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating token template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create token template' });
  }
});

// ============================================
// UPDATE — PUT /:id
// DM only.
// ============================================

router.put('/:id', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    const existing = await prisma.tokenTemplate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Token template not found' });
    }
    if (existing.campaignId !== campaignId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Token template belongs to another campaign' });
    }

    const parsed = UpdateTokenTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const data = parsed.data;
    const updated = await prisma.tokenTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.disposition !== undefined && { disposition: data.disposition }),
        ...(data.displayMode !== undefined && { displayMode: data.displayMode }),
        ...(data.size !== undefined && { size: data.size }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.hp !== undefined && { hp: jsonOrNull(data.hp) }),
        ...(data.showHpBar !== undefined && { showHpBar: data.showHpBar }),
        ...(data.statBlock !== undefined && { statBlock: jsonOrNull(data.statBlock) }),
        ...(data.sightRadius !== undefined && { sightRadius: data.sightRadius }),
      },
    });

    return res.json(updated);
  } catch (error) {
    logger.error('Error updating token template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update token template' });
  }
});

// ============================================
// DELETE — DELETE /:id
// DM only.
// ============================================

router.delete('/:id', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    const existing = await prisma.tokenTemplate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Token template not found' });
    }
    if (existing.campaignId !== campaignId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Token template belongs to another campaign' });
    }

    await prisma.tokenTemplate.delete({ where: { id } });
    return res.json({ message: 'Token template deleted' });
  } catch (error) {
    logger.error('Error deleting token template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete token template' });
  }
});

// ============================================
// SAVE TOKEN AS TEMPLATE — POST /from-token
// DM only. Saves an existing map token's configuration as a reusable template.
// ============================================

router.post('/from-token', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.session.userId!;

    const parsed = SaveTokenAsTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const data = parsed.data;
    const template = await prisma.tokenTemplate.create({
      data: {
        id: randomUUID(),
        name: data.name,
        imageUrl: data.imageUrl ?? null,
        type: data.type,
        disposition: data.disposition ?? null,
        displayMode: data.displayMode,
        size: data.size,
        notes: data.notes ?? null,
        hp: jsonOrNull(data.hp),
        showHpBar: data.showHpBar,
        statBlock: jsonOrNull(data.statBlock),
        sightRadius: data.sightRadius ?? null,
        createdById: userId,
        campaignId,
      },
    });

    return res.status(201).json(template);
  } catch (error) {
    logger.error('Error saving token as template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save token as template' });
  }
});

// ============================================
// COPY TO CAMPAIGN — POST /:id/copy-to/:targetCampaignId
// DM only (must be DM in BOTH source and target campaigns).
// Duplicates template into another campaign as an independent copy.
// ============================================

router.post('/:id/copy-to/:targetCampaignId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id, targetCampaignId } = req.params;
    const userId = req.session.userId!;

    // Prevent self-copy
    if (campaignId === targetCampaignId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Cannot copy a template to the same campaign. Use duplicate instead.',
      });
    }

    // Verify user is DM of target campaign
    const targetMembership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: targetCampaignId } },
    });
    if (!targetMembership || targetMembership.role !== 'DM') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be a DM in the target campaign to copy templates there',
      });
    }

    // Verify target campaign exists
    const targetCampaign = await prisma.campaign.findUnique({ where: { id: targetCampaignId } });
    if (!targetCampaign) {
      return res.status(404).json({ error: 'Not Found', message: 'Target campaign not found' });
    }

    // Fetch source template
    const source = await prisma.tokenTemplate.findUnique({ where: { id } });
    if (!source) {
      return res.status(404).json({ error: 'Not Found', message: 'Token template not found' });
    }
    if (source.campaignId !== campaignId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Token template belongs to another campaign' });
    }

    // Create the copy in the target campaign
    const copy = await prisma.tokenTemplate.create({
      data: {
        id: randomUUID(),
        name: source.name,
        imageUrl: source.imageUrl,
        type: source.type,
        disposition: source.disposition,
        displayMode: source.displayMode,
        size: source.size as Prisma.InputJsonValue,
        notes: source.notes,
        hp: jsonOrNull(source.hp),
        showHpBar: source.showHpBar,
        statBlock: jsonOrNull(source.statBlock),
        sightRadius: source.sightRadius,
        createdById: userId,
        campaignId: targetCampaignId,
      },
    });

    return res.status(201).json(copy);
  } catch (error) {
    logger.error('Error copying token template:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to copy token template' });
  }
});

export default router;

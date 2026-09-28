/**
 * Character Template API Routes
 *
 * Shareable starter sheets. Any authenticated user can publish one and any
 * authenticated user can browse and copy from it — there is no scope column
 * because every template is visible to everyone by design.
 *
 * Mounted under /api/character-templates. Note this is deliberately distinct
 * from GET /api/characters/templates/:system/:name, which serves the hardcoded
 * starter presets compiled into the source.
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { GameSystem } from '../game-systems';
import { validateCharacterData } from '../validators/game-systems';
import {
  CreateCharacterTemplateSchema,
  UpdateCharacterTemplateSchema,
} from '../validators/characterTemplates';
import { extractAssetId, isExactAssetAddress, normalizeAssetUrl } from '../utils/asset-urls';
import { toJson } from '../utils/prisma-json';
import logger from '../utils/logger';

const router = Router();

/** Author fields returned alongside a template, minus anything private. */
const AUTHOR_SELECT = { id: true, displayName: true } as const;

/**
 * May this user modify this template?
 *
 * The author always may. Otherwise an admin or a template editor may, which is
 * what makes curation possible.
 *
 * The DB read is deliberately gated on "could it still change the answer",
 * because templateEditor is not carried in the session. This is the shape used
 * by the asset scope-change handler — NOT the one used by asset delete, which
 * gates its read on `!isOwner` and then only uses the result when `isOwner`,
 * so the flag there can never actually take effect.
 */
async function canModifyTemplate(
  req: AuthenticatedRequest,
  createdById: string | null
): Promise<boolean> {
  const userId = req.session.userId!;
  if (createdById === userId) return true;

  if (req.session.platformRole === 'ADMIN') return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { templateEditor: true },
  });
  return user?.templateEditor === true;
}

/**
 * Resolve a template's token image, rejecting anything not globally readable.
 *
 * A template is visible to every user, so its image has to be too. A USER- or
 * CAMPAIGN-scoped asset would 403 for everyone but its owner or that campaign's
 * members, leaving a broken image on a template other people are copying.
 *
 * Returns the normalised URL, or an error message to send back as a 400.
 */
async function resolveTemplateImage(
  tokenImageUrl: string | null | undefined
): Promise<{ url: string | null } | { error: string }> {
  if (!tokenImageUrl) return { url: null };

  // Every viewer's browser requests the stored address with their own
  // session, so it is an asset's own address and nothing more, or the bare id
  // it is built from: dot segments or a query could send it to another page.
  const assetId = extractAssetId(tokenImageUrl);
  if (!assetId || (assetId !== tokenImageUrl && !isExactAssetAddress(tokenImageUrl))) {
    return { error: "Token image must be an uploaded asset's own address, such as /api/assets/tokens/<id>" };
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { scope: true },
  });

  if (!asset) {
    return { error: 'Token image references an asset that does not exist' };
  }

  if (asset.scope !== 'GLOBAL') {
    return {
      error:
        'A template image must be a global asset, because everyone who can see the template needs to be able to load it. Choose a global asset or leave the image empty.',
    };
  }

  return { url: normalizeAssetUrl(tokenImageUrl, 'tokens') };
}

/**
 * Validate sheet data against its game system, mirroring how characters are
 * checked. Flexible templates (gameSystem null) hold free-form JSON, which is
 * the same latitude Character already allows.
 */
function validateSheet(
  gameSystem: GameSystem | null | undefined,
  data: unknown
): { ok: true } | { ok: false; message: string; issues?: unknown[] } {
  if (gameSystem === null || gameSystem === undefined) return { ok: true };

  const result = validateCharacterData(gameSystem, (data as object) || {});
  if (result.success) return { ok: true };

  return {
    ok: false,
    message: 'Template data does not match game system schema',
    issues: result.errors.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

// ============================================
// LIST — GET /
// Any authenticated user. Every template is visible to everyone.
// ============================================

router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { search, gameSystem, mine, limit = '50', offset = '0' } = req.query;

    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = Math.max(0, parseInt(offset as string, 10) || 0);

    const where: Record<string, unknown> = {};

    if (search && typeof search === 'string') {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (gameSystem && typeof gameSystem === 'string') {
      // 'flexible' selects the system-agnostic templates, which store null.
      where.gameSystem = gameSystem === 'flexible' ? null : gameSystem;
    }
    if (mine === 'true') {
      where.createdById = userId;
    }

    const [templates, total] = await Promise.all([
      prisma.characterTemplate.findMany({
        where: where as never,
        orderBy: { name: 'asc' },
        take,
        skip,
        include: { createdBy: { select: AUTHOR_SELECT } },
      }),
      prisma.characterTemplate.count({ where: where as never }),
    ]);

    return res.json({ templates, total, limit: take, offset: skip });
  } catch (error) {
    logger.error('Error listing character templates', { err: error });
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to list character templates' });
  }
});

// ============================================
// GET ONE — GET /:id
// ============================================

router.get('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await prisma.characterTemplate.findUnique({
      where: { id: req.params.id },
      include: { createdBy: { select: AUTHOR_SELECT } },
    });

    if (!template) {
      return res.status(404).json({ error: 'Not Found', message: 'Character template not found' });
    }

    return res.json(template);
  } catch (error) {
    logger.error('Error getting character template', { err: error });
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to get character template' });
  }
});

// ============================================
// CREATE — POST /
// Any authenticated user may publish a template.
// ============================================

router.post('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const parsed = CreateCharacterTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid template data',
      });
    }
    const { name, description, data, tokenImageUrl, gameSystem } = parsed.data;

    const sheet = validateSheet(gameSystem, data);
    if (!sheet.ok) {
      return res
        .status(400)
        .json({ error: 'Validation Error', message: sheet.message, validationErrors: sheet.issues });
    }

    const image = await resolveTemplateImage(tokenImageUrl);
    if ('error' in image) {
      return res.status(400).json({ error: 'Validation Error', message: image.error });
    }

    const template = await prisma.characterTemplate.create({
      data: {
        id: randomUUID(),
        name,
        description: description ?? null,
        gameSystem: gameSystem ?? null,
        tokenImageUrl: image.url,
        data: toJson(data || {}),
        createdById: userId,
      },
      include: { createdBy: { select: AUTHOR_SELECT } },
    });

    return res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating character template', { err: error });
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to create character template' });
  }
});

// ============================================
// UPDATE — PUT /:id
// Author, admin, or template editor.
// ============================================

router.put('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = UpdateCharacterTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid template data',
      });
    }
    const data = parsed.data;

    const existing = await prisma.characterTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Character template not found' });
    }

    if (!(await canModifyTemplate(req, existing.createdById))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to edit this template',
      });
    }

    // The game system is fixed at creation, exactly as it is for a character —
    // the sheet data is only meaningful against the system it was built for.
    if (data.data !== undefined) {
      const sheet = validateSheet(existing.gameSystem as GameSystem | null, data.data);
      if (!sheet.ok) {
        return res.status(400).json({
          error: 'Validation Error',
          message: sheet.message,
          validationErrors: sheet.issues,
        });
      }
    }

    let imageUrl: string | null | undefined;
    if (data.tokenImageUrl !== undefined) {
      const image = await resolveTemplateImage(data.tokenImageUrl);
      if ('error' in image) {
        return res.status(400).json({ error: 'Validation Error', message: image.error });
      }
      imageUrl = image.url;
    }

    const updated = await prisma.characterTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description ?? null }),
        ...(data.data !== undefined && { data: toJson(data.data) }),
        ...(imageUrl !== undefined && { tokenImageUrl: imageUrl }),
      },
      include: { createdBy: { select: AUTHOR_SELECT } },
    });

    return res.json(updated);
  } catch (error) {
    logger.error('Error updating character template', { err: error });
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to update character template' });
  }
});

// ============================================
// DELETE — DELETE /:id
// Author, admin, or template editor.
// ============================================

router.delete('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await prisma.characterTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Character template not found' });
    }

    if (!(await canModifyTemplate(req, existing.createdById))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this template',
      });
    }

    await prisma.characterTemplate.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Character template deleted' });
  } catch (error) {
    logger.error('Error deleting character template', { err: error });
    return res
      .status(500)
      .json({ error: 'Internal Server Error', message: 'Failed to delete character template' });
  }
});

export default router;

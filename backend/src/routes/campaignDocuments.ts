// ============================================
// Campaign documents: rulebooks and handouts a DM shares with one table.
//
// Moved out of routes/campaigns.ts, which had grown to 38 endpoints. Mounted
// under /api/campaigns beside it; the paths are exactly what they were.
// ============================================

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { campaignMember, campaignDM } from '../middleware/compose';
import { prisma } from '../config/database';
import { canReadAsset } from '../services/permissions';
import { LinkDocumentSchema } from '../validators/campaignDocuments';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/campaigns/:campaignId/documents
 * The documents shared with this campaign.
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId/documents', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const assetFields = {
      id: true,
      name: true,
      description: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
      uploadedBy: { select: { id: true, displayName: true } },
    } as const;

    // Two ways a document can belong here, and the list has to show both or
    // it does not match what canReadAsset lets a member read: a document
    // shared into the campaign by link, and one created or uploaded at
    // CAMPAIGN scope for this campaign in the first place.
    const [links, own] = await Promise.all([
      prisma.campaignDocument.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'asc' },
        include: {
          asset: { select: assetFields },
          linkedBy: { select: { id: true, displayName: true } },
        },
      }),
      prisma.asset.findMany({
        where: { type: 'DOCUMENT', scope: 'CAMPAIGN', campaignId },
        orderBy: { createdAt: 'asc' },
        select: assetFields,
      }),
    ]);

    const linkedIds = new Set(links.map((l) => l.assetId));
    const documents = [
      ...links.map((link) => ({
        ...link.asset,
        linkedAt: link.createdAt,
        linkedBy: link.linkedBy,
        // Shared in from elsewhere: the DM can stop sharing it.
        shared: true,
      })),
      ...own
        .filter((a) => !linkedIds.has(a.id))
        .map((a) => ({
          ...a,
          linkedAt: a.createdAt,
          linkedBy: a.uploadedBy,
          // The campaign's own document: there is no link to remove.
          shared: false,
        })),
    ];

    return res.status(200).json({ documents });
  } catch (error) {
    logger.error('Error listing campaign documents', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list documents' });
  }
});

/**
 * POST /api/campaigns/:campaignId/documents
 * Share a document with this campaign. Requires: Campaign DM role
 *
 * Two checks. The DM must be able to read the asset, or linking would be a way
 * to grant a whole table access to a stranger's private file from nothing but
 * its id. And reading is not enough: the document must be the DM's own, or
 * global. A document shared into a campaign is readable by its members, and a
 * member who runs another campaign could otherwise pass it on to a table the
 * uploader never chose.
 */
router.post('/:campaignId/documents', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = LinkDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid request',
      });
    }

    const { campaignId } = req.params;
    const userId = req.session.userId!;
    const { assetId } = parsed.data;

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, type: true, scope: true, uploadedById: true, campaignId: true },
    });

    // 404 for both a missing asset and one the caller may not read: the reply
    // must not confirm that a private id exists.
    if (!asset || asset.type !== 'DOCUMENT') {
      return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
    }
    const isAdmin = req.session.platformRole === 'ADMIN';
    if (!(await canReadAsset(asset, userId, isAdmin))) {
      return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
    }
    // 403 here, not 404: the caller can already read this one, so the id is no
    // secret from them, and the refusal should say what would be allowed.
    if (asset.scope !== 'GLOBAL' && asset.uploadedById !== userId && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the person who uploaded a document, or an admin, can share it with a campaign',
      });
    }

    const link = await prisma.campaignDocument.upsert({
      where: { campaignId_assetId: { campaignId, assetId } },
      create: { campaignId, assetId, linkedById: userId },
      // Already shared: nothing to change, and not an error worth surfacing.
      update: {},
    });

    return res.status(201).json({ link });
  } catch (error) {
    logger.error('Error linking document to campaign', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to share document' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/documents/:assetId
 * Stop sharing a document with this campaign. Requires: Campaign DM role
 *
 * The document itself is untouched; only the link goes.
 */
router.delete('/:campaignId/documents/:assetId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { count } = await prisma.campaignDocument.deleteMany({
      where: { campaignId: req.params.campaignId, assetId: req.params.assetId },
    });

    if (count === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'That document is not shared with this campaign' });
    }

    return res.status(200).json({ message: 'Document unshared' });
  } catch (error) {
    logger.error('Error unlinking document from campaign', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to unshare document' });
  }
});

export default router;

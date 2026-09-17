import { Router, Response } from 'express';
import type { NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { UploadRequest, uploadGeneric, handleUploadError } from '../middleware/upload';
import { validateFileType, validateFileSize } from '../middleware/fileValidation';
import {
  AssetType,
  AssetScope,
  deleteFile,
  relocateUpload,
  getFilePath,
  ensureDirectory,
  generateUniqueFilename,
} from '../utils/fileUtils';
import {
  CreateDocumentSchema,
  UpdateDocumentContentSchema,
  TYPED_DOCUMENT_MIME,
} from '../validators/documents';
import { canReadAsset, type AssetAccessFacts, canPlaceAssetAtScope } from '../services/permissions';
import path from 'path';
import fs from 'fs';
import { generateThumbnail } from '../utils/thumbnails';
import logger from '../utils/logger';

const router = Router();

/**
 * Per-user rate limiter for asset uploads. Sized to allow legitimate bulk
 * upload during campaign setup (a DM placing tokens for a new dungeon may
 * upload 20+ images in a couple of minutes) while blocking obvious abuse
 * (e.g. a script trying to exhaust storage). Keyed by user id so one user's
 * activity does not penalize others on the same NAT.
 */
// Exported: the UVTT import writes a file to disk the same way, so it shares
// this ceiling instead of keeping a second one that could drift.
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.ASSET_UPLOAD_RATE_LIMIT || '30'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const session = (req as AuthenticatedRequest).session;
    return session?.userId ?? req.ip ?? 'anonymous';
  },
  message: {
    error: 'Too Many Requests',
    message: 'Upload rate limit reached. Please slow down and try again in a minute.',
  },
});

/**
 * Normalize a stored file path for cross-platform compatibility.
 * Converts Windows backslashes to forward slashes so paths recorded during
 * local Windows development (npm run dev) resolve correctly in Linux Docker.
 */
function normalizePath(filePath: string): string {
  return path.resolve(filePath.replace(/\\/g, '/'));
}

/**
 * Whether this request may read an asset's bytes.
 *
 * The map and token routes asked this in identical, separately-written blocks,
 * and neither allowed for an asset being *used* by a campaign rather than
 * uploaded into one — which is how a DM's own map, picked from their personal
 * library, 403'd for every player at the table. One place now, so the two
 * cannot answer differently again.
 *
 * Read only. Editing and deleting are decided by their own routes and are
 * untouched by this.
 */
async function canReadAssetFile(
  asset: AssetAccessFacts,
  req: AuthenticatedRequest
): Promise<boolean> {
  return canReadAsset(asset, req.session.userId!, req.session.platformRole === 'ADMIN');
}

/**
 * Set cache headers for a served asset and answer conditional requests.
 * Asset files are stored under UUID filenames and never mutated in place
 * (re-upload creates a new asset row), so asset-id URLs can be cached as
 * immutable. Avatar URLs are keyed by USER id and resolve to the newest
 * AVATAR asset, so they get a short max-age instead — the ETag still
 * changes when a new avatar is uploaded, keeping 304 revalidation correct.
 *
 * Must be called AFTER permission checks (a 304 must not leak asset
 * existence to non-members). Returns true if a 304 was sent and the
 * caller should stop.
 */
function handleAssetCaching(
  req: AuthenticatedRequest,
  res: Response,
  assetId: string,
  { immutable = true }: { immutable?: boolean } = {}
): boolean {
  const etag = `"${assetId}"`;
  res.set(
    'Cache-Control',
    immutable ? 'private, max-age=31536000, immutable' : 'private, max-age=300'
  );
  res.set('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

/**
 * Asset Management Routes
 * Asset Endpoints
 */

/**
 * GET /api/assets
 * List assets with optional filtering
 * Requires: Authentication
 * Query params:
 *   - type: Filter by AssetType (MAP, TOKEN, AUDIO, AVATAR)
 *   - scope: Filter by AssetScope (GLOBAL, CAMPAIGN)
 *   - campaignId: Filter by campaign (requires CAMPAIGN scope or returns campaign-specific assets)
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { type, scope, campaignId, page, limit, search, uploadedBy } = req.query;

    // Pagination parameters
    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Build filter conditions
    const where: Prisma.AssetWhereInput = {};

    // Type filter
    if (type) {
      where.type = type as AssetType;
    } else {
      // Documents have their own section. A rulebook among the map thumbnails
      // is what that separation exists to avoid, so a list with no type leaves
      // them out. Asking for type=DOCUMENT is how the Documents page fetches.
      where.type = { not: 'DOCUMENT' };
    }

    // Scope filter
    if (scope) {
      where.scope = scope as AssetScope;
    }

    // Name search
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    // Campaign filter
    const isAdmin = req.session.platformRole === 'ADMIN';

    // Admin-only: filter by uploader
    if (uploadedBy && isAdmin) {
      where.uploadedById = uploadedBy as string;
    }

    if (campaignId) {
      // Admin bypasses membership check
      if (!isAdmin) {
        const membership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: {
              userId,
              campaignId: campaignId as string,
            },
          },
        });

        if (!membership) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have access to this campaign',
          });
        }
      }

      where.campaignId = campaignId as string;
    } else if (!isAdmin) {
      // Non-admin: enforce three-scope visibility rules
      const userMemberships = await prisma.campaignMembership.findMany({
        where: { userId },
        select: { campaignId: true },
      });

      const campaignIds = userMemberships.map((m: { campaignId: string }) => m.campaignId);

      where.OR = [
        { scope: 'GLOBAL' },                          // Platform-wide assets
        { scope: 'USER', uploadedById: userId },       // User's own personal assets
        ...campaignIds.map((cId: string) => ({ scope: 'CAMPAIGN' as const, campaignId: cId })), // Campaign assets
      ];
    }
    // Admin with no campaignId: no OR filter — sees all assets across all scopes/users

    // Get total count for pagination
    const total = await prisma.asset.count({ where });

    // Get paginated assets
    const assets = await prisma.asset.findMany({
      where,
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limitNum,
    });

    return res.json({
      assets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Error listing assets', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list assets',
    });
  }
});

/**
 * POST /api/assets/upload
 * Upload a new asset
 * Requires: Authentication
 * Body (multipart/form-data):
 *   - file: The file to upload
 *   - type: AssetType (MAP, TOKEN, AUDIO, AVATAR)
 *   - scope: AssetScope (GLOBAL, CAMPAIGN)
 *   - campaignId: Required if scope is CAMPAIGN
 *   - name: Asset name (optional, defaults to original filename)
 *   - description: Asset description (optional)
 *   - tags: Comma-separated tags (optional)
 */
router.post(
  '/upload',
  authenticated,
  uploadLimiter,
  // First, use a generic upload to parse the multipart data
  (req: UploadRequest, res: Response, next: NextFunction) => {
    // Use generic uploader - no asset-type-specific filtering yet
    uploadGeneric.single('file')(req, res, (err: unknown): Response | void => {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      next();
    });
  },
  // Now validate and set asset metadata (req.body is populated)
  async (req: UploadRequest, res: Response, next: NextFunction) => {
    try {
      const { type, scope, campaignId } = req.body;

      // Validate required fields
      if (!type) {
        // Clean up uploaded file
        if (req.file?.path) {
          await deleteFile(req.file.path);
        }
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Asset type is required',
        });
      }

      if (!['MAP', 'TOKEN', 'AUDIO', 'AVATAR', 'DOCUMENT'].includes(type)) {
        // Clean up uploaded file
        if (req.file?.path) {
          await deleteFile(req.file.path);
        }
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid asset type. Must be MAP, TOKEN, AUDIO, AVATAR, or DOCUMENT',
        });
      }

      // AVATAR type: always personal scope regardless of what client sends
      let assetScope = (type === 'AVATAR' ? 'USER' : (scope || 'USER')) as AssetScope;

      if (!['GLOBAL', 'USER', 'CAMPAIGN'].includes(assetScope)) {
        // Clean up uploaded file
        if (req.file?.path) {
          await deleteFile(req.file.path);
        }
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid scope. Must be GLOBAL, USER, or CAMPAIGN',
        });
      }

      // One rule for every way an asset row gets created, shared with the
      // route that creates a document from typed text. Refusals answer with
      // the same status and wording as before.
      const decision = await canPlaceAssetAtScope(
        req.session.userId!,
        type as AssetType,
        assetScope,
        campaignId
      );
      if (!decision.allowed) {
        // Clean up uploaded file
        if (req.file?.path) {
          await deleteFile(req.file.path);
        }
        return res.status(decision.status).json({
          error: decision.status === 400 ? 'Validation Error' : 'Forbidden',
          message: decision.message,
        });
      }

      // Set asset metadata on request for file validation. The campaign comes
      // from the decision, not the request: a personal upload naming a campaign
      // would otherwise be filed in that campaign's library.
      req.assetType = type as AssetType;
      req.assetScope = assetScope;
      req.campaignId = decision.campaignId ?? undefined;

      return next();
    } catch (error) {
      logger.error('Error in upload validation', { err: error });
      // Clean up uploaded file
      if (req.file?.path) {
        try {
          await deleteFile(req.file.path);
        } catch (deleteError) {
          logger.error('Error deleting file after validation error', { err: deleteError });
        }
      }
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process upload request',
      });
    }
  },
  validateFileType,
  validateFileSize,
  async (req: UploadRequest, res: Response) => {
    try {
      const userId = req.session.userId!;

      // Multer wrote the file before the asset type was known — it arrives in
      // the same multipart body — so everything landed under maps/global.
      // Now that the type and scope are settled, put it where it belongs. See
      // utils/fileUtils.relocateUpload; a failed move keeps the original path
      // rather than losing the upload.
      if (req.file) {
        req.file.path = await relocateUpload(
          req.file.path,
          req.assetType!,
          req.assetScope!,
          req.campaignId
        );
      }
      const { name, description, tags } = req.body;
      const file = req.file!;

      // Parse tags if provided
      const tagArray = tags
        ? tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
        : [];

      // Generate thumbnail for images (MAP and TOKEN types)
      const thumbnailPath =
        (req.assetType === 'MAP' || req.assetType === 'TOKEN') && file.mimetype.startsWith('image/')
          ? await generateThumbnail(file.path)
          : null;

      // Create asset record in database
      // Normalize paths: convert Windows backslashes to forward slashes so
      // paths stored during local dev also work in Linux Docker containers.
      const asset = await prisma.asset.create({
        data: {
          type: req.assetType!,
          scope: req.assetScope!,
          uploadedById: userId,
          campaignId: req.campaignId || null,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath: file.path.replace(/\\/g, '/'),
          thumbnailPath,
          name: name || file.originalname,
          description: description || null,
          tags: tagArray,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
          campaign: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return res.status(201).json({
        message: 'Asset uploaded successfully',
        asset,
      });
    } catch (error) {
      logger.error('Error creating asset record', { err: error });

      // Clean up uploaded file if database insert fails
      if (req.file?.path) {
        try {
          await deleteFile(req.file.path);
        } catch (deleteError) {
          logger.error('Error deleting file after database failure', { err: deleteError });
        }
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to save asset',
      });
    }
  }
);

/**
 * GET /api/assets/:id
 * Get asset metadata by ID
 * Requires: Authentication
 * Returns: Asset metadata (without file data)
 */
router.get('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId!;

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset not found',
      });
    }

    const isAdmin = req.session.platformRole === 'ADMIN';

    // USER-scoped assets: only owner or admin can access
    if (asset.scope === 'USER' && asset.uploadedById !== userId && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this asset',
      });
    }

    // CAMPAIGN-scoped assets: only campaign members can access
    if (asset.scope === 'CAMPAIGN' && asset.campaignId && !isAdmin) {
      const membership = await prisma.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId,
            campaignId: asset.campaignId,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this asset',
        });
      }
    }

    return res.json({ asset });
  } catch (error) {
    logger.error('Error fetching asset', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch asset',
    });
  }
});

/**
 * DELETE /api/assets/:id
 * Delete an asset
 * Requires: Authentication + ownership or campaign DM
 */
router.delete('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId!;

    const asset = await prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset not found',
      });
    }

    // Gather facts needed for permission check
    const isOwner = asset.uploadedById === userId;
    const isAdmin = req.session.platformRole === 'ADMIN';

    // globalAssetManager requires a DB read (not stored in session). Read it
    // whenever it could still change the answer: a GLOBAL asset where the
    // requester is not already an admin.
    //
    // This guard used to skip the read for the owner (`!isAdmin && !isOwner`),
    // but the only rule that consults the flag also requires ownership — so for
    // an owner it stayed false and a global asset manager could never delete
    // their own global asset. Same lazy-read shape as the scope-change handler
    // below, which has always been correct.
    let isGlobalAssetManager = false;
    if (!isAdmin && asset.scope === 'GLOBAL') {
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { globalAssetManager: true },
      });
      isGlobalAssetManager = userRecord?.globalAssetManager === true;
    }

    let isCampaignDM = false;
    if (asset.scope === 'CAMPAIGN' && asset.campaignId) {
      const membership = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: asset.campaignId } },
      });
      isCampaignDM = membership?.role === 'DM';
    }

    // Scope-based permission matrix
    if (asset.scope === 'GLOBAL') {
      // Admin can always delete; globalAssetManager can delete their own global assets
      if (!isAdmin && !(isOwner && isGlobalAssetManager)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins or the uploading global asset manager can delete global assets',
        });
      }
    } else if (asset.scope === 'USER') {
      // Only the owner or admin can delete personal assets
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only the owner can delete personal assets',
        });
      }
    } else if (asset.scope === 'CAMPAIGN') {
      // Owner, campaign DM, or admin can delete campaign assets
      if (!isOwner && !isCampaignDM && !isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only the uploader, campaign DM, or an admin can delete campaign assets',
        });
      }
    }

    // Delete file from filesystem
    try {
      await deleteFile(asset.filePath);
    } catch (fileError) {
      logger.error('Error deleting file', { err: fileError });
      // Continue with database deletion even if file deletion fails
    }

    // Delete thumbnail if exists
    if (asset.thumbnailPath) {
      try {
        await deleteFile(asset.thumbnailPath);
      } catch (thumbError) {
        logger.error('Error deleting thumbnail', { err: thumbError });
      }
    }

    // Delete database record
    await prisma.asset.delete({
      where: { id },
    });

    return res.json({
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting asset', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete asset',
    });
  }
});

/**
 * GET /api/assets/:id/download
 * Download an asset file
 * Requires: Authentication + access to asset
 */
router.get('/:id/download', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset not found',
      });
    }

    // The same rule the serving routes use. This route had its own older
    // copy, which did not know an asset can be readable because a campaign
    // uses it or because a document was shared, so a member who could read a
    // file inline was refused when downloading the same bytes.
    if (!(await canReadAssetFile(asset, req))) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this asset' });
    }

    // Check if file exists (normalize path for cross-platform compatibility)
    const downloadPath = normalizePath(asset.filePath);
    if (!fs.existsSync(downloadPath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset file not found on server',
      });
    }

    // Send file with original name
    return res.download(downloadPath, asset.originalName);
  } catch (error) {
    logger.error('Error downloading asset', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to download asset',
    });
  }
});

/**
 * POST /api/assets/documents
 * Create a plain text or Markdown document from typed content.
 * Requires: authentication, and the same scope rules as uploading
 *
 * The content is written to disk exactly as sent, under a generated filename,
 * and never interpreted. The one difference from an upload is where the bytes
 * came from; every rule about who may place an asset where, what the file is
 * named, and how it is served is shared with the upload path. That includes
 * the upload rate limit: this creates a file on disk exactly as an upload does,
 * and a script exhausting storage should hit the same ceiling either way.
 */
router.post('/documents', authenticated, uploadLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = CreateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid document',
      });
    }
    const { name, description, format, content, scope, campaignId } = parsed.data;
    const userId = req.session.userId!;

    const decision = await canPlaceAssetAtScope(userId, 'DOCUMENT', scope, campaignId);
    if (!decision.allowed) {
      return res.status(decision.status).json({
        error: decision.status === 400 ? 'Validation Error' : 'Forbidden',
        message: decision.message,
      });
    }

    const bytes = Buffer.from(content, 'utf8');
    const filename = generateUniqueFilename(`document.${format}`);
    const dir = getFilePath(
      'DOCUMENT',
      scope === 'CAMPAIGN' ? 'CAMPAIGN' : 'GLOBAL',
      decision.campaignId ?? undefined
    );
    await ensureDirectory(dir);
    const filePath = path.join(dir, filename).replace(/\\/g, '/');
    await fs.promises.writeFile(filePath, bytes);

    const asset = await prisma.asset.create({
      data: {
        type: 'DOCUMENT',
        scope,
        uploadedById: userId,
        campaignId: decision.campaignId,
        filename,
        originalName: `${name}.${format}`,
        mimeType: TYPED_DOCUMENT_MIME[format],
        fileSize: bytes.length,
        filePath,
        name,
        description: description || null,
        tags: [],
      },
    });

    return res.status(201).json({ asset });
  } catch (error) {
    logger.error('Error creating document', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create document' });
  }
});

/**
 * PUT /api/assets/documents/:id/content
 * Replace the text of a plain text or Markdown document.
 * Requires: the uploader, or an admin
 *
 * A PDF cannot be edited here; it is a file, not text. The size recorded on
 * the row is updated so the library keeps telling the truth about it.
 */
router.put('/documents/:id/content', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = UpdateDocumentContentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid content',
      });
    }

    const asset = await prisma.asset.findUnique({ where: { id: req.params.id, type: 'DOCUMENT' } });
    if (!asset) {
      return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
    }

    const isAdmin = req.session.platformRole === 'ADMIN';
    if (asset.uploadedById !== req.session.userId && !isAdmin) {
      // 404 rather than 403: a document you may not edit is one whose existence
      // this route should not confirm.
      return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
    }

    const ext = path.extname(asset.filePath).toLowerCase();
    if (ext !== '.txt' && ext !== '.md') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Only plain text and Markdown documents can be edited. Upload a new file to replace a PDF.',
      });
    }

    const documentPath = normalizePath(asset.filePath);
    const bytes = Buffer.from(parsed.data.content, 'utf8');
    await fs.promises.writeFile(documentPath, bytes);

    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: { fileSize: bytes.length },
    });

    return res.status(200).json({ asset: updated });
  } catch (error) {
    logger.error('Error updating document content', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save document' });
  }
});

/**
 * The content type an audio file is served with, decided from its validated
 * extension, never from the stored `mimeType`. That field is whatever the
 * uploading browser declared, and validation checks the bytes rather than it,
 * so it can say `text/html`; echoing it would let an uploaded file be rendered
 * as a page on this instance's own origin. The three keys are the audio
 * extensions the upload allowlist accepts.
 */
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

/**
 * The content type a document is served with, decided from its extension.
 *
 * Never from `Asset.mimeType`: that value arrived with the upload, and handing
 * an uploader control of the served content type is how a file that is also
 * valid HTML gets rendered as a page. Markdown is served as plain text on
 * purpose. The reader fetches it and renders it itself with raw HTML disabled;
 * the browser is never asked to treat the file as a document in its own right.
 */
const DOCUMENT_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/**
 * The Content-Type a map or token image is served with, keyed on its stored
 * extension. Maps also allow a PDF, which every image type here does not; both
 * are safe to send with an explicit type. Anything not in this table is served
 * as bytes to download, so a file that reached disk under a name it should not
 * have is never handed to the browser as a page or a script.
 */
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

/**
 * Send an image asset with an explicit, safe Content-Type. Express would
 * otherwise pick the type from the file extension, and the extension is not
 * trusted: the upload path stores whatever name the client sent. A known image
 * extension is served as that image; anything else goes out as
 * `application/octet-stream`, which the browser downloads rather than renders.
 * `nosniff` stops the browser second-guessing either way.
 */
function sendImageAsset(res: Response, filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = IMAGE_CONTENT_TYPES[ext] ?? 'application/octet-stream';
  res.sendFile(filePath, {
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * GET /api/assets/documents/:id
 * Serve a document (PDF, text or Markdown) for reading inline.
 * Requires: authentication, and read access to the asset
 *
 * A document is private to its uploader unless a DM has shared it with a
 * campaign the caller belongs to. `canReadAsset` is where that is decided; this
 * route only asks.
 *
 * Headers are the other half of the safety story. `nosniff` stops the browser
 * second-guessing the content type. The Content-Security-Policy applies when
 * the browser renders this response as a document, which is the case for a text
 * file opened directly; it does not sandbox a PDF, because CSP governs documents
 * the browser parses and a PDF is not one. That was checked, not assumed. What
 * isolates the PDF viewer is the sandbox attribute on the reader's iframe.
 */
router.get('/documents/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id, type: 'DOCUMENT' },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Document not found',
      });
    }

    if (!(await canReadAssetFile(asset, req))) {
      // 404 rather than 403, matching the read routes for private things: the
      // answer must not confirm the id exists.
      return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
    }

    const documentPath = normalizePath(asset.filePath);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(documentPath);
    } catch {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset file not found on server',
      });
    }

    const ext = path.extname(documentPath).toLowerCase();
    const contentType = DOCUMENT_CONTENT_TYPES[ext];
    if (!contentType) {
      // Only the three validated extensions are ever stored as DOCUMENT. Anything
      // else here means the row and the file disagree, and it is not served.
      logger.error('Document asset has an unexpected extension', { assetId: id, filePath: asset.filePath });
      return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
    }

    if (ext === '.pdf') {
      // A PDF cannot change under its id; the edit route refuses it and a
      // replacement is a new asset. The year-long immutable cache is right.
      if (handleAssetCaching(req, res, asset.id)) return;
    } else {
      // Text and Markdown can be rewritten in place, so the same caching would
      // hand a reader the old text for a year. Revalidate on every request,
      // with an ETag from the file itself so an unchanged document still
      // answers 304.
      const etag = `"${asset.id}-${stat.size}-${Math.floor(stat.mtimeMs)}"`;
      res.set('Cache-Control', 'private, no-cache');
      res.set('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
    }

    return res.sendFile(documentPath, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('Error serving document', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to serve document',
    });
  }
});

/**
 * GET /api/assets/maps/:id
 * Serve a map image
 * Requires: Authentication + access to asset
 */
router.get('/maps/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id, type: 'MAP' },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map asset not found',
      });
    }

    // Check access permissions
    if (!(await canReadAssetFile(asset, req))) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this asset' });
    }

    // Check if file exists (normalize path for cross-platform compatibility)
    const mapPath = normalizePath(asset.filePath);
    if (!fs.existsSync(mapPath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset file not found on server',
      });
    }

    // Send file with appropriate content type
    if (handleAssetCaching(req, res, asset.id)) return;
    return sendImageAsset(res, mapPath);
  } catch (error) {
    logger.error('Error serving map', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to serve map',
    });
  }
});

/**
 * GET /api/assets/tokens/:id
 * Serve a token image
 * Requires: Authentication + access to asset
 */
router.get('/tokens/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id, type: 'TOKEN' },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Token asset not found',
      });
    }

    // Check access permissions
    if (!(await canReadAssetFile(asset, req))) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this asset' });
    }

    // Check if file exists (normalize path for cross-platform compatibility)
    const tokenPath = normalizePath(asset.filePath);
    if (!fs.existsSync(tokenPath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset file not found on server',
      });
    }

    // Send file with appropriate content type
    if (handleAssetCaching(req, res, asset.id)) return;
    return sendImageAsset(res, tokenPath);
  } catch (error) {
    logger.error('Error serving token', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to serve token',
    });
  }
});

/**
 * GET /api/assets/audio/:id
 * Stream an audio file
 * Requires: Authentication + access to asset
 */
router.get('/audio/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id, type: 'AUDIO' },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Audio asset not found',
      });
    }

    // The one read rule, as maps and tokens use it. Beyond scope it knows a
    // track the campaign is playing, which is how a personal track reaches the
    // players. 404 rather than 403, so the reply does not confirm the id.
    if (!(await canReadAssetFile(asset, req))) {
      return res.status(404).json({ error: 'Not Found', message: 'Audio asset not found' });
    }

    // Check if file exists (normalize path for cross-platform compatibility)
    const audioPath = normalizePath(asset.filePath);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset file not found on server',
      });
    }

    const audioContentType = AUDIO_CONTENT_TYPES[path.extname(audioPath).toLowerCase()];
    if (!audioContentType) {
      // Only the three validated extensions are ever stored as AUDIO. Anything
      // else means the row and the file disagree, and it is not served.
      logger.error('Audio asset has an unexpected extension', { assetId: id, filePath: asset.filePath });
      return res.status(404).json({ error: 'Not Found', message: 'Audio asset not found' });
    }

    // Stream audio file
    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for streaming
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(audioPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': audioContentType,
        'X-Content-Type-Options': 'nosniff',
      };
      res.writeHead(206, head);
      return file.pipe(res);
    } else {
      // No range, send entire file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': audioContentType,
        'X-Content-Type-Options': 'nosniff',
      };
      res.writeHead(200, head);
      return fs.createReadStream(audioPath).pipe(res);
    }
  } catch (error) {
    logger.error('Error streaming audio', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to stream audio',
    });
  }
});

/**
 * GET /api/assets/avatars/:userId
 * Serve a user's avatar
 * Requires: Authentication
 * Note: Any authenticated user can view avatars (for chat, campaign members list, etc.)
 */
router.get('/avatars/:userId', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Find the user's avatar asset
    const asset = await prisma.asset.findFirst({
      where: {
        type: 'AVATAR',
        uploadedById: userId,
      },
      orderBy: {
        createdAt: 'desc', // Get most recent avatar
      },
    });

    if (!asset) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User avatar not found',
      });
    }

    // Check if file exists (normalize path for cross-platform compatibility)
    const avatarPath = normalizePath(asset.filePath);
    if (!fs.existsSync(avatarPath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Avatar file not found on server',
      });
    }

    // Send file with appropriate content type. Avatar URLs are per-USER and
    // resolve to the newest upload, so they are not immutable — short max-age
    // plus ETag revalidation keeps them fresh without a full re-download.
    if (handleAssetCaching(req, res, asset.id, { immutable: false })) return;
    return sendImageAsset(res, avatarPath);
  } catch (error) {
    logger.error('Error serving avatar', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to serve avatar',
    });
  }
});

/**
 * PATCH /api/assets/:id/scope
 * Change the scope of an asset.
 * Body: { scope: 'GLOBAL' | 'USER' | 'CAMPAIGN', campaignId?: string }
 *
 * Permission matrix:
 *   Admin / globalAssetManager → any move including to/from GLOBAL
 *   Owner → USER → CAMPAIGN (own campaign), CAMPAIGN → USER, CAMPAIGN → CAMPAIGN
 *   Campaign DM (not owner) → CAMPAIGN → USER, CAMPAIGN → CAMPAIGN (source campaign only)
 */
router.patch('/:id/scope', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { scope, campaignId } = req.body;
    const userId = req.session.userId!;

    if (!scope || !['GLOBAL', 'USER', 'CAMPAIGN'].includes(scope)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'scope must be GLOBAL, USER, or CAMPAIGN',
      });
    }

    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      return res.status(404).json({ error: 'Not Found', message: 'Asset not found' });
    }

    const isAdmin = req.session.platformRole === 'ADMIN';
    const isOwner = asset.uploadedById === userId;

    // Check globalAssetManager only when GLOBAL scope is involved
    let isGlobalAssetManager = false;
    if (!isAdmin && (scope === 'GLOBAL' || asset.scope === 'GLOBAL')) {
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { globalAssetManager: true },
      });
      isGlobalAssetManager = userRecord?.globalAssetManager === true;
    }

    // GLOBAL involvement requires admin or globalAssetManager
    if ((scope === 'GLOBAL' || asset.scope === 'GLOBAL') && !isAdmin && !isGlobalAssetManager) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators or global asset managers can change scope to or from Global',
      });
    }

    // Validate CAMPAIGN target — resolve campaignId and verify campaign exists
    let resolvedCampaignId: string | null = null;
    if (scope === 'CAMPAIGN') {
      if (!campaignId) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'campaignId is required when scope is CAMPAIGN',
        });
      }
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) {
        return res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      }
      resolvedCampaignId = campaignId;
    }

    // Non-admin permission checks (GLOBAL already handled above)
    if (!isAdmin) {
      // Moving FROM USER: only the owner can initiate this
      if (asset.scope === 'USER' && !isOwner) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only the asset owner can move personal assets',
        });
      }

      // Moving FROM CAMPAIGN: must be owner OR DM of the source campaign
      if (asset.scope === 'CAMPAIGN' && asset.campaignId && !isOwner) {
        const sourceMembership = await prisma.campaignMembership.findUnique({
          where: { userId_campaignId: { userId, campaignId: asset.campaignId } },
        });
        if (sourceMembership?.role !== 'DM') {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Only the asset owner or campaign DM can move this asset',
          });
        }
      }

      // Moving TO CAMPAIGN: caller must be a member of the target campaign
      if (scope === 'CAMPAIGN' && resolvedCampaignId) {
        const targetMembership = await prisma.campaignMembership.findUnique({
          where: { userId_campaignId: { userId, campaignId: resolvedCampaignId } },
        });
        if (!targetMembership) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You must be a member of the target campaign to move assets there',
          });
        }
      }
    }

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        scope: scope as AssetScope,
        campaignId: resolvedCampaignId,
      },
      include: {
        uploadedBy: { select: { id: true, displayName: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    return res.json({ message: 'Asset scope updated successfully', asset: updated });
  } catch (error) {
    logger.error('Error updating asset scope', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update asset scope',
    });
  }
});

export default router;

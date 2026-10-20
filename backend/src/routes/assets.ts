import { Router, Response } from 'express';
import type { NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { positiveIntegerFromEnv } from '../config/env';
import { createTurnQueue } from '../utils/turnQueue';
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
  writeFileAtomically,
  SERVER_BUILT_PATH,
} from '../utils/fileUtils';
import {
  CreateDocumentSchema,
  UpdateDocumentContentSchema,
  TYPED_DOCUMENT_MIME,
} from '../validators/documents';
import {
  canReadAsset, type AssetAccessFacts, canPlaceAssetAtScope, mayChangeAsset, spiritLayerAssetIdsHiddenFrom,
  assetChangeFactsFor,
} from '../services/permissions';
import { assetUsageFor } from '../services/assetUsage';
import { UpdateAssetScopeSchema } from '../validators/assetScope';
import { removeAvatars, clearAvatarIfNoneLeft } from '../services/avatars';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream';
import { generateThumbnail } from '../utils/thumbnails';
import logger from '../utils/logger';
import { errorCode } from '../utils/errors';
import { readEnumQuery, readStringQueries } from '../utils/queryEnum';
import { parseByteRange } from '../utils/byteRange';
import { AssetType as AssetTypes, AssetScope as AssetScopes } from '@prisma/client';
import {
  parseUploadMetadata,
  shortenFileName,
  downloadNameOf,
  MAX_ASSET_NAME_LENGTH,
  MAX_ORIGINAL_NAME_LENGTH,
} from '../validators/assets';
import { escapeLikePattern } from '../utils/likePattern';
import { writeAdminLog } from '../services/systemLog';

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
  // A value that is not a whole number above zero is ignored with a warning,
  // so a mistyped setting cannot turn the limit off.
  max: positiveIntegerFromEnv('ASSET_UPLOAD_RATE_LIMIT', 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const session = (req as AuthenticatedRequest).session;
    return session?.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'anonymous');
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
 * What a client is told about an asset. Selected, not included: where a file
 * sits on the server is the server's business, so filePath and thumbnailPath
 * stay out of every response, the one that creates or changes the row
 * included.
 */
const ASSET_PUBLIC_SELECT = {
  id: true,
  type: true,
  scope: true,
  uploadedById: true,
  campaignId: true,
  filename: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  name: true,
  description: true,
  tags: true,
  createdAt: true,
  uploadedBy: { select: { id: true, displayName: true } },
  campaign: { select: { id: true, name: true } },
} satisfies Prisma.AssetSelect;

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
 *   - type: Filter by AssetType; an unknown value answers 400
 *   - scope: Filter by AssetScope (GLOBAL, USER, CAMPAIGN); an unknown value answers 400
 *   - campaignId: Filter by campaign (requires CAMPAIGN scope or returns campaign-specific assets)
 *   - uploadedBy: admin only; a user id, or `none` for assets with no uploader
 *   - usable: 'true' applies the member scope rules to an admin too (the pickers)
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const text = readStringQueries(req.query, ['campaignId', 'page', 'limit', 'search', 'uploadedBy', 'usable'] as const);
    if (!text.ok) {
      return res.status(400).json({ error: 'Validation Error', message: text.message });
    }
    const { campaignId, page, limit, search, uploadedBy, usable } = text.values;

    const typeFilter = readEnumQuery(req.query.type, 'type', Object.values(AssetTypes));
    if (!typeFilter.ok) {
      return res.status(400).json({ error: 'Validation Error', message: typeFilter.message });
    }
    const scopeFilter = readEnumQuery(req.query.scope, 'scope', Object.values(AssetScopes));
    if (!scopeFilter.ok) {
      return res.status(400).json({ error: 'Validation Error', message: scopeFilter.message });
    }
    const sortFilter = readEnumQuery(req.query.sort, 'sort', ['date', 'name', 'size'] as const);
    if (!sortFilter.ok) {
      return res.status(400).json({ error: 'Validation Error', message: sortFilter.message });
    }
    const type = typeFilter.value;
    const scope = scopeFilter.value;
    // Newest first unless asked, as the library always listed; ties by id so
    // the pages do not overlap.
    const orderBy: Prisma.AssetOrderByWithRelationInput[] =
      sortFilter.value === 'name' ? [{ name: 'asc' }, { id: 'asc' }]
      : sortFilter.value === 'size' ? [{ fileSize: 'desc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'asc' }];

    // Pagination parameters, clamped to page 1 or later and 1 to 100 per page
    const pageNum = Math.max(1, parseInt(page ?? '') || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '') || 50));
    const skip = (pageNum - 1) * limitNum;

    // Build filter conditions
    const where: Prisma.AssetWhereInput = {};

    // Type filter
    if (type) {
      where.type = type;
    } else {
      // Documents have their own section. A rulebook among the map thumbnails
      // is what that separation exists to avoid, so a list with no type leaves
      // them out. Asking for type=DOCUMENT is how the Documents page fetches.
      where.type = { not: 'DOCUMENT' };
    }

    // Scope filter
    if (scope) {
      where.scope = scope;
    }

    // Search: a name in part, matched as typed (a % or _ in it is not a
    // wildcard), or a tag whole, whatever its case. Tags are kept as typed and
    // Prisma matches an array's items by exact case, so the spellings of the
    // tag in use are looked up first (Dragon, dragon), a handful at most, and
    // matched as they are; the visibility rules below then apply as to any
    // filter. In AND, as those rules use OR and id.
    if (search) {
      const spellings = await prisma.$queryRaw<Array<{ tag: string }>>`
        SELECT DISTINCT tag FROM "Asset", unnest(tags) AS tag WHERE lower(tag) = lower(${search})`;
      where.AND = [{
        OR: [
          { name: { contains: escapeLikePattern(search), mode: 'insensitive' } },
          ...(spellings.length > 0 ? [{ tags: { hasSome: spellings.map((row) => row.tag) } }] : []),
        ],
      }];
    }

    // Campaign filter
    const isAdmin = req.session.platformRole === 'ADMIN';

    // Admin-only: filter by uploader. `none` lists the assets whose uploader's
    // account was deleted, which with no campaign are readable by admins alone.
    if (uploadedBy && isAdmin) {
      where.uploadedById = uploadedBy === 'none' ? null : uploadedBy;
    }

    if (campaignId) {
      // Admin bypasses membership check
      if (!isAdmin) {
        const membership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: {
              userId,
              campaignId,
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

      where.campaignId = campaignId;
      if (!isAdmin) {
        const hidden = await spiritLayerAssetIdsHiddenFrom(userId, [campaignId]);
        if (hidden.length > 0) where.id = { notIn: hidden };
      }
    } else if (!isAdmin || usable === 'true') {
      // Non-admin: enforce three-scope visibility rules. So for an admin who
      // asks for what they may use (`usable=true`, the map and token picture
      // pickers): the reference check holds an admin to the same rule, so
      // anything else on the instance would be offered and then refused.
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
      const hidden = await spiritLayerAssetIdsHiddenFrom(userId, campaignIds);
      if (hidden.length > 0) where.id = { notIn: hidden };
    }
    // Admin with no campaignId: no OR filter — sees all assets across all scopes/users

    // Get total count for pagination
    const total = await prisma.asset.count({ where });

    // Get paginated assets.
    const rows = await prisma.asset.findMany({
      where,
      select: ASSET_PUBLIC_SELECT,
      orderBy,
      skip,
      take: limitNum,
    });

    // Each says whether the caller may delete it, move it out of its scope,
    // or rewrite it if it is a document, by the rule those routes apply, so a
    // page offers those controls exactly when they would be taken.
    const facts = isAdmin ? undefined : await assetChangeFactsFor(userId);
    const assets = await Promise.all(
      rows.map(async (asset) => ({ ...asset, canChange: await mayChangeAsset(asset, userId, isAdmin, facts) }))
    );

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
      const assetScope = (type === 'AVATAR' ? 'USER' : (scope || 'USER')) as AssetScope;

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

      // Its name, description and tags, checked before anything is stored.
      const metadata = parseUploadMetadata(req.body);
      if (!metadata.ok) {
        if (req.file?.path) {
          await deleteFile(req.file.path);
        }
        return res.status(400).json({ error: 'Validation Error', message: metadata.message });
      }
      req.uploadMetadata = metadata.value;

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
  // The size first: an upload of any type may be as large as the largest
  // type's limit, and the type check reads a picture's header.
  validateFileSize,
  validateFileType,
  async (req: UploadRequest, res: Response) => {
    // Outside the try, so a failed insert can remove the thumbnail as well.
    let thumbnailPath: string | null = null;
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
      const { name, description, tags } = req.uploadMetadata ?? { name: '', description: null, tags: [] };
      const file = req.file!;
      // What the bytes are (validateFileType), never what the browser said:
      // the export writes this into its archive, and it decides the thumbnail.
      const mimeType = req.detectedMimeType ?? 'application/octet-stream';
      const originalName = shortenFileName(file.originalname, MAX_ORIGINAL_NAME_LENGTH);

      // Generate thumbnail for images (MAP and TOKEN types)
      thumbnailPath =
        (req.assetType === 'MAP' || req.assetType === 'TOKEN') && mimeType.startsWith('image/')
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
          originalName,
          mimeType,
          fileSize: file.size,
          filePath: file.path.replace(/\\/g, '/'),
          thumbnailPath,
          name: name || shortenFileName(originalName, MAX_ASSET_NAME_LENGTH),
          description,
          tags,
        },
        select: ASSET_PUBLIC_SELECT,
      });

      // A new avatar replaces the ones before it: the avatar route serves the
      // newest, and an older one left behind would come back if this one were
      // deleted. The upload has succeeded by now; a picture that cannot be
      // removed is logged.
      if (req.assetType === 'AVATAR') {
        await removeAvatars(userId, asset.id).catch((err) =>
          logger.error('New avatar saved, but the earlier ones were not all removed', { err, userId })
        );
      }

      return res.status(201).json({
        message: 'Asset uploaded successfully',
        asset,
      });
    } catch (error) {
      logger.error('Error creating asset record', { err: error });

      // Clean up the uploaded file, and its thumbnail, if the insert fails
      for (const leftover of [req.file?.path, thumbnailPath]) {
        if (!leftover) continue;
        try {
          await deleteFile(leftover);
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
      select: ASSET_PUBLIC_SELECT,
    });

    // The rule the file routes use, so whoever may load the picture may read
    // its details. One the caller may not read is answered as if it were not
    // there.
    if (!asset || !(await canReadAssetFile(asset, req))) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Asset not found',
      });
    }

    // Which campaign an asset is in is for its members. A reader whose
    // campaign uses the asset, or who was shared a document, is told neither
    // its name nor its id.
    if (asset.campaign && req.session.platformRole !== 'ADMIN') {
      const member = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: asset.campaign.id } },
        select: { userId: true },
      });
      if (!member) return res.json({ asset: { ...asset, campaign: null, campaignId: null } });
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

/** Why a delete was refused, by the asset's scope. */
const DELETE_REFUSALS: Record<AssetScopes, string> = {
  GLOBAL: 'Only admins or the uploading global asset manager can delete global assets',
  USER: 'Only the owner can delete personal assets',
  CAMPAIGN: 'Only the uploader while a member of the campaign, its DM, or an admin can delete campaign assets',
};

/** Why a move out of the asset's scope was refused, by that scope. */
const MOVE_REFUSALS: Record<AssetScopes, string> = {
  GLOBAL: 'Only admins or the uploading global asset manager can move a global asset out of the library',
  USER: 'Only the asset owner can move personal assets',
  CAMPAIGN: 'Only the asset owner or campaign DM can move this asset',
};

/**
 * DELETE /api/assets/:id
 * Delete an asset
 * Requires: Authentication + ownership or campaign DM
 *
 * Answers 409 with code ASSET_IN_USE and the list of uses while a map, token,
 * character, template, creature or campaign setting still names the asset,
 * unless the request carries `?force=true`.
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

    const isAdmin = req.session.platformRole === 'ADMIN';

    // Scope-based permission matrix, shared with the scope move and the
    // document editor (mayChangeAsset).
    if (!(await mayChangeAsset(asset, userId, isAdmin))) {
      // One the caller may not even read is answered as if it were not there.
      if (!(await canReadAssetFile(asset, req))) {
        return res.status(404).json({ error: 'Not Found', message: 'Asset not found' });
      }
      return res.status(403).json({ error: 'Forbidden', message: DELETE_REFUSALS[asset.scope] });
    }

    // Whatever shows this asset is not told when it goes, and a deleted file
    // cannot come back. Say where it is used and delete only when asked to
    // anyway. Permissions were decided above, so the list goes only to someone
    // who may delete the asset, and names only what they may see.
    if (req.query.force !== 'true') {
      const { usage, omitted } = await assetUsageFor(asset.id, { userId, isAdmin });
      if (usage.length > 0) {
        return res.status(409).json({
          error: 'Conflict',
          // Clients branch on the code, never the wording.
          code: 'ASSET_IN_USE',
          message: 'This asset is still in use. Deleting it leaves those places without it. Send force=true to delete it anyway.',
          usage,
          omitted,
        });
      }
    }

    // The record first: a delete that fails leaves the file for the record
    // that still names it.
    await prisma.asset.delete({
      where: { id },
    });

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

    // The last avatar picture gone leaves the profile with no avatar, so
    // nothing shows a broken picture for it.
    if (asset.type === 'AVATAR' && asset.uploadedById) {
      await clearAvatarIfNoneLeft(asset.uploadedById).catch((err) =>
        logger.error('Avatar picture deleted, but the profile still names it', { err, assetId: asset.id })
      );
    }

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
      return res.status(404).json({ error: 'Not Found', message: 'Asset not found' });
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
    return res.download(downloadPath, downloadNameOf(asset.originalName), SERVER_BUILT_PATH);
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

    const asset = await prisma.asset
      .create({
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
        select: ASSET_PUBLIC_SELECT,
      })
      .catch(async (error: unknown) => {
        // No row names the file just written, so it goes too.
        await deleteFile(filePath).catch((deleteError) =>
          logger.error('Error deleting document after database failure', { err: deleteError })
        );
        throw error;
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
 * Requires: whoever may delete it (mayChangeAsset): for a campaign's document
 * its uploader while still a member, the campaign's DM, or an admin; for a
 * global one an admin, or its uploader while they manage global assets; for a
 * personal one its uploader, or an admin
 *
 * A PDF cannot be edited here; it is a file, not text. The size recorded on
 * the row is updated so the library keeps telling the truth about it.
 */
/** Each document's saves, in turn: see the route below. */
const documentSaveTurns = createTurnQueue();

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
    if (!(await mayChangeAsset(asset, req.session.userId!, isAdmin))) {
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

    // One save of a document at a time, its file and its recorded size
    // together. Two at once each replaced the whole file, but their size
    // updates could land the other way round and record the size of the text
    // that lost.
    const done = await documentSaveTurns.turnFor(asset.id);
    let updated: Prisma.AssetGetPayload<{ select: typeof ASSET_PUBLIC_SELECT }>;
    try {
      await writeFileAtomically(documentPath, bytes);
      updated = await prisma.asset.update({
        where: { id: asset.id },
        data: { fileSize: bytes.length },
        select: ASSET_PUBLIC_SELECT,
      });
    } catch (error) {
      // Deleted while this save was writing: the delete has already removed
      // the file, so the one written here is named by no row and is removed too.
      if (errorCode(error) === 'P2025') {
        await deleteFile(documentPath).catch((unlinkError) =>
          logger.error('Error removing a document saved after it was deleted', { err: unlinkError })
        );
        return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      }
      throw error;
    } finally {
      done();
    }

    return res.status(200).json({ asset: updated });
  } catch (error) {
    logger.error('Error updating document content', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save document' });
  }
});

/**
 * The content type an audio file is served with, decided from its validated
 * extension, never from the stored `mimeType`. An upload now records the
 * format its bytes show, but an asset stored before that holds whatever the
 * uploading browser declared, which can say `text/html`; echoing it would let
 * an uploaded file be rendered as a page on this instance's own origin. The
 * three keys are the audio extensions the upload allowlist accepts.
 */
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

/**
 * The content type a document is served with, decided from its extension.
 *
 * Never from `Asset.mimeType`: on an asset stored before uploads recorded the
 * format their bytes show, that value is the browser's, and handing
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
 * extension. A PDF is listed so a map stored as one before PDF maps were
 * refused is still served; both are safe to send with an explicit type. Anything not in this table is served
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
    ...SERVER_BUILT_PATH,
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

    // On every answer, a 304 included: a browser replaces the headers it
    // stored with the document with a 304's, so a 304 carrying the app's own
    // policy would unsandbox a document opened directly.
    res.set({
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    });

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
      ...SERVER_BUILT_PATH,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
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

    // One the caller may not read is answered as if it were not there.
    if (!(await canReadAssetFile(asset, req))) {
      return res.status(404).json({ error: 'Not Found', message: 'Map asset not found' });
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

    // One the caller may not read is answered as if it were not there.
    if (!(await canReadAssetFile(asset, req))) {
      return res.status(404).json({ error: 'Not Found', message: 'Token asset not found' });
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
 * GET /api/assets/maps/:id/thumbnail and /api/assets/tokens/:id/thumbnail
 * Serve the picture's thumbnail (at most 512 pixels), made at upload, for the
 * Asset Library's cards and the pickers, which drew them from the full
 * picture. Read as the full picture is read. An asset with no thumbnail (one
 * imported, or uploaded before they were made) is sent its full picture.
 * Requires: Authentication + access to asset
 */
function serveThumbnail(type: 'MAP' | 'TOKEN', notFound: string, label: string) {
  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      const asset = await prisma.asset.findUnique({ where: { id: req.params.id, type } });
      // One the caller may not read is answered as if it were not there.
      if (!asset || !(await canReadAssetFile(asset, req))) {
        return res.status(404).json({ error: 'Not Found', message: notFound });
      }
      const thumbnail = asset.thumbnailPath ? normalizePath(asset.thumbnailPath) : null;
      if (thumbnail && fs.existsSync(thumbnail)) {
        if (handleAssetCaching(req, res, `${asset.id}-thumbnail`)) return;
        return sendImageAsset(res, thumbnail);
      }
      const full = normalizePath(asset.filePath);
      if (!fs.existsSync(full)) {
        return res.status(404).json({ error: 'Not Found', message: 'Asset file not found on server' });
      }
      if (handleAssetCaching(req, res, asset.id)) return;
      return sendImageAsset(res, full);
    } catch (error) {
      logger.error(`Error serving ${label} thumbnail`, { err: error });
      return res.status(500).json({ error: 'Internal Server Error', message: `Failed to serve ${label} thumbnail` });
    }
  };
}

router.get('/maps/:id/thumbnail', authenticated, serveThumbnail('MAP', 'Map asset not found', 'map'));
router.get('/tokens/:id/thumbnail', authenticated, serveThumbnail('TOKEN', 'Token asset not found', 'token'));

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

    // Check the file exists (normalize path for cross-platform compatibility)
    const audioPath = normalizePath(asset.filePath);
    const stat = await fs.promises.stat(audioPath).catch(() => null);
    if (!stat?.isFile()) {
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

    // A browser plays a track by asking for byte ranges as it goes, and asks
    // again from wherever someone seeks to.
    const fileSize = stat.size;
    const range = parseByteRange(req.headers.range, fileSize);
    if (range.kind === 'unsatisfiable') {
      res.set('Content-Range', `bytes */${fileSize}`);
      return res.status(416).json({
        error: 'Range Not Satisfiable',
        message: 'The requested range is outside the file.',
      });
    }

    const partial = range.kind === 'partial';
    const start = partial ? range.start : 0;
    const end = partial ? range.end : fileSize - 1;
    const head: Record<string, string | number> = {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': audioContentType,
      'X-Content-Type-Options': 'nosniff',
    };
    if (partial) head['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    res.writeHead(partial ? 206 : 200, head);
    if (req.method === 'HEAD' || fileSize === 0) {
      res.end();
      return;
    }

    // pipeline closes the file when the listener goes away, as a browser does
    // on every seek or change of track, and hands a read error to the
    // callback. With .pipe() the file stayed open and the error was thrown.
    pipeline(fs.createReadStream(audioPath, { start, end }), res, (error) => {
      if (!error) return;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ECONNRESET' || code === 'EPIPE') return;
      logger.error('Error streaming audio', { err: error, assetId: id });
    });
    return;
  } catch (error) {
    logger.error('Error streaming audio', { err: error });
    if (res.headersSent) {
      res.destroy();
      return;
    }
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

    // A profile with no avatar has none to serve, whatever pictures are
    // stored: clearing the avatar is what the person asked for.
    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    if (!owner?.avatarUrl) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User avatar not found',
      });
    }

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
 *   Admin → any move
 *   Moving out of a scope → whoever may delete the asset there (mayChangeAsset):
 *     GLOBAL: its uploader while a global asset manager; USER: its owner;
 *     CAMPAIGN: its uploader while still a member, or the campaign's DM
 *   Moving to or from GLOBAL → also a global asset manager
 *   Moving to CAMPAIGN → also whoever may upload that type there
 *
 * An admin moving someone else's personal file out of their library puts it in
 * front of a table or everyone, so that move is written to the Activity log.
 */
router.patch('/:id/scope', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = UpdateAssetScopeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'scope must be GLOBAL, USER, or CAMPAIGN',
      });
    }
    const { scope, campaignId } = parsed.data;
    const userId = req.session.userId!;

    // One the caller may not read is answered as if it were not there.
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset || !(await canReadAssetFile(asset, req))) {
      return res.status(404).json({ error: 'Not Found', message: 'Asset not found' });
    }

    const isAdmin = req.session.platformRole === 'ADMIN';

    // Personal is the uploader's own library. An asset whose uploader's
    // account was deleted has none: moved there it would be nobody's, readable
    // by admins alone, and every map using it would break for its table.
    if (scope === 'USER' && !asset.uploadedById) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'This asset has no uploader, so it has no personal library to go to',
      });
    }

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
    let campaignName: string | null = null;
    if (scope === 'CAMPAIGN') {
      if (!campaignId) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'campaignId is required when scope is CAMPAIGN',
        });
      }
      // A campaign the caller is not in answers as one that is not there.
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, memberships: { where: { userId }, select: { userId: true } } },
      });
      if (!campaign || (!isAdmin && campaign.memberships.length === 0)) {
        return res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      }
      resolvedCampaignId = campaignId;
      campaignName = campaign.name;
    }

    // Non-admin permission checks (GLOBAL already handled above)
    if (!isAdmin) {
      // Moving out of where it is: whoever may delete it there. A global asset
      // manager moving another manager's global asset out of the library
      // would take it from every DM, which deleting it forbids.
      if (!(await mayChangeAsset(asset, userId, false))) {
        return res.status(403).json({ error: 'Forbidden', message: MOVE_REFUSALS[asset.scope] });
      }

      // A personal asset is its uploader's, so only they move one there. A
      // campaign's DM moving a player's upload to Personal would put it in
      // the player's library, out of the campaign and out of the DM's reach.
      if (scope === 'USER' && asset.uploadedById !== userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only the asset\'s uploader can move it to their personal library',
        });
      }

      // Moving TO CAMPAIGN: the same question the upload route asks, so a
      // member who could not upload here cannot publish here either. That is
      // the DM, or a player moving token art.
      if (scope === 'CAMPAIGN' && resolvedCampaignId) {
        const placement = await canPlaceAssetAtScope(userId, asset.type, 'CAMPAIGN', resolvedCampaignId);
        if (!placement.allowed) {
          return res.status(placement.status).json({ error: 'Forbidden', message: placement.message });
        }
      }
    }

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        scope,
        campaignId: resolvedCampaignId,
      },
      select: ASSET_PUBLIC_SELECT,
    });

    // Only an admin can move another user's personal file: anyone else is
    // refused above by mayChangeAsset.
    if (asset.scope === 'USER' && scope !== 'USER' && asset.uploadedById && asset.uploadedById !== userId) {
      const owner = await prisma.user.findUnique({ where: { id: asset.uploadedById }, select: { email: true } });
      const where = scope === 'CAMPAIGN' ? `into the campaign "${campaignName}"` : 'to Global';
      await writeAdminLog(
        userId,
        `Moved the personal file "${asset.name}" of ${owner?.email ?? 'a deleted account'} ${where}`,
        'INFO',
        { targetUserId: asset.uploadedById, assetId: asset.id, scope, campaignId: resolvedCampaignId }
      );
    }

    // As the list says of each asset, so the Asset Library can keep offering
    // Delete and Move by the server's rule once the asset is somewhere new.
    const canChange = await mayChangeAsset(updated, userId, isAdmin);
    return res.json({ message: 'Asset scope updated successfully', asset: { ...updated, canChange } });
  } catch (error) {
    logger.error('Error updating asset scope', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update asset scope',
    });
  }
});

export default router;

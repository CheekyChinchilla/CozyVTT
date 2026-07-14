import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { AuthenticatedRequest } from '../middleware/rbac';
import { campaignMember, campaignDM } from '../middleware/compose';
import { prisma } from '../config/database';
import { filterMapData, getSpiritVisibility } from '../utils/spirit-layer';
import { broadcastToCampaign } from '../websocket/utils';
import { normalizeAssetUrl } from '../utils/asset-urls';
import { WallSegmentSchema, WallSegmentsArraySchema, FogOperationSchema, LightSourceSchema, LightSourcesArraySchema, LightSourceUpdateSchema } from '../validators/walls';
import type { WallSegment, FogState, LightSource } from '../types/walls';
import { parseUVTT } from '../services/uvttParser';
import { buildUVTT } from '../services/uvttExporter';
import { getFilePath, ensureDirectory } from '../utils/fileUtils';
import sharp from 'sharp';
import logger from '../utils/logger';

/** Multer configured for UVTT file uploads (memory storage — files are small JSON). */
const uvttUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB — UVTT files can be large (embedded image)
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.uvtt', '.dd2vtt', '.df2vtt'].includes(ext) || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only .uvtt, .dd2vtt, and .df2vtt files are supported'));
    }
  },
});

const router = Router({ mergeParams: true }); // Important: Merge params from parent router

// Token type definition
interface Token {
  id: string;
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layer: 'token' | 'spirit';
  visible: boolean;
  controlledBy?: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, any>;
  type?: 'player' | 'npc' | 'object';
  disposition?: 'friendly' | 'neutral' | 'hostile' | null;
  hp?: { current: number; max: number; temp: number } | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  sightRadius?: number;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, any> | null;
  creatureTemplateId?: string | null;
}

const VALID_TOKEN_TYPES = ['player', 'npc', 'object'];
const VALID_TOKEN_DISPOSITIONS = ['friendly', 'neutral', 'hostile'];
const VALID_DISPLAY_MODES = ['pog', 'top-down', 'full-art'];

/**
 * Map CRUD Routes
 * Map Endpoints
 *
 * All routes are prefixed with /api/campaigns/:campaignId/maps
 */

/**
 * POST /api/campaigns/:campaignId/maps
 * Create a new map for the campaign
 * Requires: DM role
 */
router.post('/', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { name, imageUrl, width, height, gridSize, spiritLayerUrl, feetPerSquare, diagonalRule } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Map name is required',
      });
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Map imageUrl (asset ID) is required',
      });
    }

    if (!width || typeof width !== 'number' || width <= 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Map width must be a positive number',
      });
    }

    if (!height || typeof height !== 'number' || height <= 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Map height must be a positive number',
      });
    }

    // gridSize is optional, defaults to 50 in schema
    const mapGridSize = gridSize && typeof gridSize === 'number' && gridSize > 0 ? gridSize : 50;

    // feetPerSquare: positive integer, defaults to 5
    const mapFeetPerSquare = feetPerSquare && Number.isInteger(feetPerSquare) && feetPerSquare > 0 && feetPerSquare <= 100
      ? feetPerSquare : 5;

    // diagonalRule: must be "flat" or "alternating", defaults to "flat"
    const mapDiagonalRule = diagonalRule === 'flat' || diagonalRule === 'alternating' ? diagonalRule : 'flat';

    // Normalize asset URLs to full paths
    const normalizedImageUrl = normalizeAssetUrl(imageUrl, 'maps');
    const normalizedSpiritLayerUrl = spiritLayerUrl ? normalizeAssetUrl(spiritLayerUrl, 'maps') : null;

    // imageUrl is required, should never be null at this point
    if (!normalizedImageUrl) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid map imageUrl',
      });
    }

    // Create the map
    const map = await prisma.map.create({
      data: {
        campaignId,
        name: name.trim(),
        imageUrl: normalizedImageUrl, // Full path: /api/assets/maps/{uuid}
        baseLayerUrl: normalizedImageUrl, // Store same value in baseLayerUrl for now
        width,
        height,
        gridSize: mapGridSize,
        feetPerSquare: mapFeetPerSquare,
        diagonalRule: mapDiagonalRule,
        spiritLayerUrl: normalizedSpiritLayerUrl,
        tokens: [], // Initialize empty tokens array
        annotations: [], // Initialize empty annotations array
      },
    });

    return res.status(201).json({ map });
  } catch (error) {
    logger.error('Error creating map', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create map',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/maps
 * List all maps for the campaign
 * Requires: Campaign membership
 */
router.get('/', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    const maps = await prisma.map.findMany({
      where: { campaignId },
      select: {
        id: true,
        name: true,
        imageUrl: true, // Thumbnail reference
        width: true,
        height: true,
        gridSize: true,
        feetPerSquare: true,
        diagonalRule: true,
        lightingEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ maps });
  } catch (error) {
    logger.error('Error fetching maps', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch maps',
    });
  }
});

/**
 * POST /api/campaigns/:campaignId/maps/import-uvtt
 * Import a Universal VTT (.uvtt / .dd2vtt) file.
 *
 * Creates a new map from the embedded image and wall data.
 * The UVTT format is exported by Dungeondraft, DunGen, Dungeon Alchemist, etc.
 * Requires: DM role
 */
router.post(
  '/import-uvtt',
  campaignDM,
  uvttUpload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Validation Error', message: 'No UVTT file uploaded' });
      }

      const mapName = (req.body.name as string)?.trim() || path.basename(req.file.originalname, path.extname(req.file.originalname));
      const gridSizePx = Number(req.body.gridSize) || 70;

      // ── Parse the UVTT file ──────────────────────────────────────────────
      let parsed;
      try {
        parsed = parseUVTT(req.file.buffer, gridSizePx);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : 'Failed to parse UVTT file';
        return res.status(400).json({ error: 'Parse Error', message: msg });
      }

      // ── Save the embedded image as an asset ──────────────────────────────
      const ext = parsed.imageMimeType === 'image/webp' ? '.webp'
                : parsed.imageMimeType === 'image/jpeg' ? '.jpg'
                : '.png';
      const filename = `${randomUUID()}${ext}`;
      const uploadPath = getFilePath('MAP', 'CAMPAIGN', campaignId);
      await ensureDirectory(uploadPath);
      const filePath = path.join(uploadPath, filename).replace(/\\/g, '/');
      await fs.writeFile(filePath, parsed.imageBuffer);

      // Create asset record
      const asset = await prisma.asset.create({
        data: {
          type: 'MAP',
          scope: 'CAMPAIGN',
          uploadedById: userId,
          campaignId,
          filename,
          originalName: `${mapName}${ext}`,
          mimeType: parsed.imageMimeType,
          fileSize: parsed.imageBuffer.length,
          filePath,
          name: mapName,
          tags: ['uvtt-import'],
        },
      });

      const imageUrl = normalizeAssetUrl(asset.id, 'maps');

      // ── Create the map with walls and lights ─────────────────────────────
      const map = await prisma.map.create({
        data: {
          campaignId,
          name: mapName,
          imageUrl: imageUrl!,
          baseLayerUrl: imageUrl!,
          width: parsed.mapWidth,
          height: parsed.mapHeight,
          gridSize: gridSizePx,
          tokens: [],
          annotations: [],
          wallSegments: parsed.wallSegments as any,
          lights: parsed.lightSources as any,
          lightingEnabled: parsed.wallSegments.length > 0, // auto-enable if walls present
        },
      });

      logger.info(
        `[uvtt-import] Created map "${mapName}" (${parsed.mapWidth}×${parsed.mapHeight}) ` +
        `with ${parsed.wallCount} walls + ${parsed.portalCount} doors + ${parsed.lightCount} lights`
      );

      return res.status(201).json({
        map,
        wallCount: parsed.wallCount,
        portalCount: parsed.portalCount,
        lightCount: parsed.lightCount,
        totalSegments: parsed.wallSegments.length,
      });
    } catch (error) {
      logger.error('Error importing UVTT file:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to import UVTT file' });
    }
  }
);

/**
 * GET /api/campaigns/:campaignId/maps/:id/export-uvtt
 * Export a map as a Universal VTT (.uvtt) file download.
 * Includes the map image, wall segments, portals, and light sources.
 * Requires: DM role
 */
router.get(
  '/:id/export-uvtt',
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;

      const map = await prisma.map.findFirst({
        where: { id, campaignId },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          width: true,
          height: true,
          gridSize: true,
          wallSegments: true,
          lights: true,
        },
      });
      if (!map) {
        return res.status(404).json({ error: 'Not Found', message: 'Map not found' });
      }
      if (!map.imageUrl) {
        return res.status(422).json({ error: 'Unprocessable Entity', message: 'Map has no image' });
      }

      // Resolve asset file path
      const assetId = path.basename(map.imageUrl);
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        select: { filePath: true },
      });
      if (!asset) {
        return res.status(422).json({ error: 'Unprocessable Entity', message: 'Map image asset not found' });
      }

      const imagePath = path.resolve(asset.filePath.replace(/\\/g, '/'));
      let imageBuffer: Buffer;
      try {
        imageBuffer = await fs.readFile(imagePath);
      } catch {
        return res.status(422).json({ error: 'Unprocessable Entity', message: 'Map image file not found on disk' });
      }

      // Get image dimensions for pixels_per_grid calculation
      const meta = await sharp(imageBuffer).metadata();
      const imageWidthPx = meta.width;

      const wallSegments = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
      const lights = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];

      const uvttBuffer = buildUVTT({
        mapWidth: map.width,
        mapHeight: map.height,
        gridSizePx: map.gridSize,
        wallSegments,
        lights,
        imageBuffer,
        imageWidthPx,
      });

      // Sanitize filename for Content-Disposition
      const safeName = map.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'map';
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.uvtt"`);
      res.setHeader('Content-Length', uvttBuffer.length);
      return res.send(uvttBuffer);
    } catch (error) {
      logger.error('Error exporting UVTT file:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to export UVTT file' });
    }
  }
);

/**
 * GET /api/campaigns/:campaignId/maps/:id
 * Get a specific map with full data including tokens
 * Requires: Campaign membership
 *
 * Spirit Layer tokens filtered server-side
 * - DM always sees all tokens on both layers
 * - Players see spirit tokens only when spiritLayerEnabled is true
 * - Hidden tokens (visible: false) only visible to DM
 * - Spirit layer URL hidden from non-privileged users
 */
router.get('/:id', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const userId = req.session.userId!;

    // Fetch the map
    const map = await prisma.map.findUnique({
      where: { id },
    });

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found',
      });
    }

    // Verify map belongs to this campaign
    if (map.campaignId !== campaignId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found in this campaign',
      });
    }

    // Check user's role in campaign
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this campaign',
      });
    }

    // Get spirit layer visibility for this user
    const spiritVisible = await getSpiritVisibility(campaignId, userId);

    // Filter map data based on role and spirit visibility
    const responseMap = filterMapData(map, membership.role, spiritVisible);

    return res.status(200).json({ map: responseMap, spiritVisible });
  } catch (error) {
    logger.error('Error fetching map', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch map',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/maps/:id
 * Update a map
 * Requires: DM role
 */
router.put('/:id', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const { name, width, height, gridSize, imageUrl, spiritLayerUrl, feetPerSquare, diagonalRule, lightingEnabled } = req.body;

    // Fetch the map to verify it exists and belongs to campaign
    const existingMap = await prisma.map.findUnique({
      where: { id },
    });

    if (!existingMap) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found',
      });
    }

    if (existingMap.campaignId !== campaignId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found in this campaign',
      });
    }

    // Build update data object
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Map name must be a non-empty string',
        });
      }
      updateData.name = name.trim();
    }

    if (width !== undefined) {
      if (typeof width !== 'number' || width <= 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Map width must be a positive number',
        });
      }
      updateData.width = width;
    }

    if (height !== undefined) {
      if (typeof height !== 'number' || height <= 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Map height must be a positive number',
        });
      }
      updateData.height = height;
    }

    if (gridSize !== undefined) {
      if (typeof gridSize !== 'number' || gridSize <= 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Grid size must be a positive number',
        });
      }
      updateData.gridSize = gridSize;
    }

    if (feetPerSquare !== undefined) {
      if (!Number.isInteger(feetPerSquare) || feetPerSquare < 1 || feetPerSquare > 100) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'feetPerSquare must be a positive integer between 1 and 100',
        });
      }
      updateData.feetPerSquare = feetPerSquare;
    }

    if (diagonalRule !== undefined) {
      if (diagonalRule !== 'flat' && diagonalRule !== 'alternating') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'diagonalRule must be "flat" or "alternating"',
        });
      }
      updateData.diagonalRule = diagonalRule;
    }

    if (imageUrl !== undefined) {
      if (typeof imageUrl !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Image URL must be a string',
        });
      }
      // Normalize to full path
      const normalizedImageUrl = normalizeAssetUrl(imageUrl, 'maps');
      if (!normalizedImageUrl) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid map imageUrl',
        });
      }
      updateData.imageUrl = normalizedImageUrl;
      updateData.baseLayerUrl = normalizedImageUrl; // Keep both in sync
    }

    if (spiritLayerUrl !== undefined) {
      // Allow null to clear spirit layer
      if (spiritLayerUrl !== null && typeof spiritLayerUrl !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Spirit layer URL must be a string or null',
        });
      }
      // Normalize to full path (or null)
      updateData.spiritLayerUrl = spiritLayerUrl ? normalizeAssetUrl(spiritLayerUrl, 'maps') : null;
    }

    if (lightingEnabled !== undefined) {
      if (typeof lightingEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Validation Error', message: 'lightingEnabled must be a boolean' });
      }
      updateData.lightingEnabled = lightingEnabled;
    }

    // Update the map
    const updatedMap = await prisma.map.update({
      where: { id },
      data: updateData,
    });

    // Broadcast lighting change so all connected clients update immediately
    if (updateData.lightingEnabled !== undefined) {
      try {
        broadcastToCampaign(campaignId, 'map:lighting:updated', {
          mapId: id,
          lightingEnabled: updatedMap.lightingEnabled,
        });
      } catch { /* non-fatal */ }
    }

    return res.status(200).json({ map: updatedMap });
  } catch (error) {
    logger.error('Error updating map', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update map',
    });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/maps/:id
 * Delete a map
 * Requires: DM role
 * Cannot delete if it's the current map
 */
router.delete('/:id', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    // Fetch the map to verify it exists and belongs to campaign
    const map = await prisma.map.findUnique({
      where: { id },
    });

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found',
      });
    }

    if (map.campaignId !== campaignId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found in this campaign',
      });
    }

    // Check if this is the current map
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentMapId: true },
    });

    if (campaign?.currentMapId === id) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Cannot delete the current map. Set a different map as current first.',
      });
    }

    // Delete the map
    await prisma.map.delete({
      where: { id },
    });

    return res.status(200).json({
      message: 'Map deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting map', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete map',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/maps/:id/set-current
 * Set a map as the current map for the campaign
 * Requires: DM role
 */
router.put('/:id/set-current', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    // Verify the map exists and belongs to this campaign
    const map = await prisma.map.findUnique({
      where: { id },
    });

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found',
      });
    }

    if (map.campaignId !== campaignId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found in this campaign',
      });
    }

    // Update the campaign's currentMapId
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { currentMapId: id },
      include: {
        currentMap: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
      },
    });

    return res.status(200).json({
      message: 'Current map updated successfully',
      campaign: updatedCampaign,
    });
  } catch (error) {
    logger.error('Error setting current map', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to set current map',
    });
  }
});

// ============================================
// TOKEN MANIPULATION ENDPOINTS
// ============================================

/**
 * POST /api/campaigns/:campaignId/maps/:id/tokens
 * Add a new token to the map
 * Requires: DM role
 *
 * Token Schema:
 * {
 *   id: string (UUID),
 *   characterId?: string,
 *   name: string,
 *   imageUrl: string,
 *   position: { x: number, y: number },
 *   size: { width: number, height: number },
 *   layer: "token" | "spirit",
 *   visible: boolean,
 *   controlledBy?: string,
 *   rotation: number,
 *   conditions: string[],
 *   metadata: object
 * }
 */
router.post('/:id/tokens', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id: mapId } = req.params;
    const tokenData = req.body;

    // Fetch the map
    const map = await prisma.map.findUnique({
      where: { id: mapId },
    });

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found',
      });
    }

    if (map.campaignId !== campaignId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found in this campaign',
      });
    }

    // Validate required token fields
    if (!tokenData.name || typeof tokenData.name !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token name is required',
      });
    }

    // imageUrl is optional — tokens without an image get colored-letter placeholders
    if (tokenData.imageUrl && typeof tokenData.imageUrl !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token imageUrl must be a string if provided',
      });
    }

    if (!tokenData.position || typeof tokenData.position.x !== 'number' || typeof tokenData.position.y !== 'number') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token position {x, y} is required',
      });
    }

    // Validate position is within map bounds
    if (tokenData.position.x < 0 || tokenData.position.x >= map.width ||
        tokenData.position.y < 0 || tokenData.position.y >= map.height) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Token position must be within map bounds (0-${map.width-1}, 0-${map.height-1})`,
      });
    }

    // Validate layer
    const layer = tokenData.layer || 'token';
    if (layer !== 'token' && layer !== 'spirit') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token layer must be "token" or "spirit"',
      });
    }

    // Validate type and disposition
    const tokenType = tokenData.type || 'npc';
    if (!VALID_TOKEN_TYPES.includes(tokenType)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid token type' });
    }
    const disposition = tokenData.disposition !== undefined ? tokenData.disposition : null;
    if (disposition !== null && !VALID_TOKEN_DISPOSITIONS.includes(disposition)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid token disposition' });
    }

    // Validate display mode
    const displayMode = tokenData.displayMode || 'pog';
    if (!VALID_DISPLAY_MODES.includes(displayMode)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid display mode' });
    }

    // Normalize token imageUrl to full path (optional for placeholder tokens)
    const normalizedTokenImageUrl = tokenData.imageUrl
      ? normalizeAssetUrl(tokenData.imageUrl, 'tokens')
      : null;

    // Build the new token with defaults
    const newToken = {
      id: randomUUID(),
      characterId: tokenData.characterId || null,
      name: tokenData.name,
      imageUrl: normalizedTokenImageUrl || '',
      position: {
        x: tokenData.position.x,
        y: tokenData.position.y,
      },
      size: tokenData.size || { width: 1, height: 1 },
      layer,
      visible: tokenData.visible !== undefined ? tokenData.visible : true,
      controlledBy: tokenData.controlledBy || null,
      rotation: tokenData.rotation || 0,
      conditions: tokenData.conditions || [],
      metadata: tokenData.metadata || {},
      type: tokenType,
      disposition: disposition,
      hp: tokenData.hp || null,
      showHpBar: tokenData.showHpBar !== undefined ? tokenData.showHpBar : false,
      notes: typeof tokenData.notes === 'string' ? tokenData.notes : '',
      initiative: tokenData.initiative !== undefined ? tokenData.initiative : null,
      displayMode: displayMode,
      statBlock: tokenData.statBlock || null,
      creatureTemplateId: tokenData.creatureTemplateId || null,
    };

    // Get existing tokens array
    const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];

    // Add new token to array
    const updatedTokens = [...tokensArray, newToken];

    // Update the map with new tokens array
    const updatedMap = await prisma.map.update({
      where: { id: mapId },
      data: { tokens: updatedTokens as any },
    });

    return res.status(201).json({
      message: 'Token added successfully',
      token: newToken,
      map: updatedMap,
    });
  } catch (error) {
    logger.error('Error adding token', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add token',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId
 * Update an existing token on the map
 * Requires: DM role OR player controlling the token
 *
 * DM can update any token
 * Players can only update tokens where controlledBy matches their userId
 */
router.put('/:id/tokens/:tokenId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id: mapId, tokenId } = req.params;
    const userId = req.session.userId!;
    const updates = req.body;

    // Fetch the map
    const map = await prisma.map.findUnique({
      where: { id: mapId },
    });

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found',
      });
    }

    if (map.campaignId !== campaignId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found in this campaign',
      });
    }

    // Check user's role in campaign
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
        message: 'You are not a member of this campaign',
      });
    }

    // Get existing tokens array
    const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];

    // Find the token
    const tokenIndex = tokensArray.findIndex((t) => t.id === tokenId);

    if (tokenIndex === -1) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Token not found on this map',
      });
    }

    const existingToken = tokensArray[tokenIndex];

    // Permission check: DM can update any token, players can only update their own tokens
    const isDM = membership.role === 'DM';
    const controlsToken = existingToken.controlledBy === userId;

    if (!isDM && !controlsToken) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update tokens you control',
      });
    }

    // Validate position if being updated
    if (updates.position) {
      if (typeof updates.position.x !== 'number' || typeof updates.position.y !== 'number') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Position must have numeric x and y values',
        });
      }

      if (updates.position.x < 0 || updates.position.x >= map.width ||
          updates.position.y < 0 || updates.position.y >= map.height) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Position must be within map bounds (0-${map.width-1}, 0-${map.height-1})`,
        });
      }
    }

    // Validate layer if being updated (DM only)
    if (updates.layer !== undefined) {
      if (!isDM) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only DM can change token layer',
        });
      }

      if (updates.layer !== 'token' && updates.layer !== 'spirit') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Layer must be "token" or "spirit"',
        });
      }
    }

    // Validate type/disposition/displayMode updates
    if (updates.type !== undefined && !VALID_TOKEN_TYPES.includes(updates.type)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid token type' });
    }
    if (updates.disposition !== undefined && updates.disposition !== null && !VALID_TOKEN_DISPOSITIONS.includes(updates.disposition)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid token disposition' });
    }
    if (updates.displayMode !== undefined && !VALID_DISPLAY_MODES.includes(updates.displayMode)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid display mode' });
    }

    // Players may only update position, rotation, and conditions on tokens they control
    // All stat fields (hp, notes, showHpBar, type, disposition, initiative) require DM role
    if (!isDM) {
      const restrictedFields = ['hp', 'notes', 'showHpBar', 'type', 'disposition', 'initiative', 'visible', 'name', 'imageUrl', 'layer', 'controlledBy', 'displayMode', 'statBlock', 'creatureTemplateId'];
      for (const field of restrictedFields) {
        if (updates[field] !== undefined) {
          return res.status(403).json({ error: 'Forbidden', message: `Only DM can update token field: ${field}` });
        }
      }
    }

    // Build updated token (merge updates with existing)
    const updatedToken: Token = {
      ...existingToken,
      ...(updates.name && { name: updates.name }),
      ...(updates.imageUrl !== undefined && { imageUrl: updates.imageUrl ? (normalizeAssetUrl(updates.imageUrl, 'tokens') || existingToken.imageUrl) : '' }),
      ...(updates.position && { position: updates.position }),
      ...(updates.size && { size: updates.size }),
      ...(updates.layer && { layer: updates.layer }),
      ...(updates.visible !== undefined && { visible: updates.visible }),
      ...(updates.controlledBy !== undefined && { controlledBy: updates.controlledBy }),
      ...(updates.rotation !== undefined && { rotation: updates.rotation }),
      ...(updates.conditions && { conditions: updates.conditions }),
      ...(updates.metadata && { metadata: { ...existingToken.metadata, ...updates.metadata } }),
      ...(updates.type !== undefined && { type: updates.type }),
      ...(updates.disposition !== undefined && { disposition: updates.disposition }),
      ...(updates.hp !== undefined && { hp: updates.hp }),
      ...(updates.showHpBar !== undefined && { showHpBar: updates.showHpBar }),
      ...(updates.notes !== undefined && { notes: updates.notes }),
      ...(updates.initiative !== undefined && { initiative: updates.initiative }),
      ...(updates.displayMode !== undefined && { displayMode: updates.displayMode }),
      ...(updates.statBlock !== undefined && { statBlock: updates.statBlock }),
      ...(updates.creatureTemplateId !== undefined && { creatureTemplateId: updates.creatureTemplateId }),
    };

    // Update the tokens array
    const updatedTokens = [...tokensArray];
    updatedTokens[tokenIndex] = updatedToken;

    // Update the map
    const updatedMap = await prisma.map.update({
      where: { id: mapId },
      data: { tokens: updatedTokens as any },
    });

    return res.status(200).json({
      message: 'Token updated successfully',
      token: updatedToken,
      map: updatedMap,
    });
  } catch (error) {
    logger.error('Error updating token', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update token',
    });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/maps/:id/tokens/:tokenId
 * Remove a token from the map
 * Requires: DM role
 */
router.delete('/:id/tokens/:tokenId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id: mapId, tokenId } = req.params;

    // Fetch the map
    const map = await prisma.map.findUnique({
      where: { id: mapId },
    });

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found',
      });
    }

    if (map.campaignId !== campaignId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map not found in this campaign',
      });
    }

    // Get existing tokens array
    const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];

    // Find the token
    const tokenIndex = tokensArray.findIndex((t) => t.id === tokenId);

    if (tokenIndex === -1) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Token not found on this map',
      });
    }

    // Remove the token
    const updatedTokens = tokensArray.filter((t) => t.id !== tokenId);

    // Update the map
    await prisma.map.update({
      where: { id: mapId },
      data: { tokens: updatedTokens as any },
    });

    return res.status(200).json({
      message: 'Token removed successfully',
    });
  } catch (error) {
    logger.error('Error removing token', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to remove token',
    });
  }
});

// ============================================================
// WALL SEGMENT ENDPOINTS// All write endpoints require DM role.
// ============================================================

/**
 * Helper: verify map belongs to campaign and return it, or send error response.
 * Returns null if a response was already sent.
 */
async function findMapInCampaign(
  campaignId: string,
  mapId: string,
  res: Response
) {
  const map = await prisma.map.findUnique({ where: { id: mapId } });
  if (!map) {
    res.status(404).json({ error: 'Not Found', message: 'Map not found' });
    return null;
  }
  if (map.campaignId !== campaignId) {
    res.status(404).json({ error: 'Not Found', message: 'Map not found in this campaign' });
    return null;
  }
  return map;
}

/**
 * Helper: build a default all-hidden FogState from map dimensions.
 * One cell per grid square so fog aligns with the visible grid.
 */
function buildDefaultFogState(map: { width: number; height: number; gridSize: number }): FogState {
  const cellPx = map.gridSize; // one fog cell = one grid square
  const fogCols = map.width;   // grid columns
  const fogRows = map.height;  // grid rows
  return {
    fogCols,
    fogRows,
    cellPx,
    revealed: new Array(fogCols * fogRows).fill(false),
  };
}

/**
 * Load fog from DB, rebuilding if the stored cell size doesn't match the current grid.
 */
function loadFogState(map: { width: number; height: number; gridSize: number }, stored: FogState | null): FogState {
  const expected = buildDefaultFogState(map);
  if (!stored || stored.cellPx !== expected.cellPx || stored.fogCols !== expected.fogCols || stored.fogRows !== expected.fogRows) {
    return expected;
  }
  return stored;
}

/**
 * Helper: apply a FogOperation to an existing FogState, mutating revealed in-place.
 * Out-of-bounds indices are silently ignored.
 */
function applyFogOperation(fog: FogState, operation: { op: string; cells?: number[] }): void {
  const total = fog.fogCols * fog.fogRows;
  switch (operation.op) {
    case 'reveal_all':
      fog.revealed.fill(true);
      break;
    case 'hide_all':
      fog.revealed.fill(false);
      break;
    case 'reveal':
      for (const idx of (operation.cells ?? [])) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = true;
      }
      break;
    case 'hide':
      for (const idx of (operation.cells ?? [])) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = false;
      }
      break;
  }
}

/**
 * GET /api/campaigns/:campaignId/maps/:id/walls
 * Return the map's wall segments array (all roles).
 */
router.get('/:id/walls', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;
    const segments = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
    return res.status(200).json({ segments });
  } catch (error) {
    logger.error('Error fetching wall segments', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch wall segments' });
  }
});

/**
 * PUT /api/campaigns/:campaignId/maps/:id/walls
 * Replace the entire wall segments array (DM only).
 * Body: { segments: WallSegment[] }
 */
router.put('/:id/walls', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const parsed = WallSegmentsArraySchema.safeParse(req.body.segments);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid segments' });
    }

    const updated = await prisma.map.update({
      where: { id },
      data: { wallSegments: parsed.data as any },
    });

    return res.status(200).json({ segments: updated.wallSegments });
  } catch (error) {
    logger.error('Error replacing wall segments', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update wall segments' });
  }
});

/**
 * POST /api/campaigns/:campaignId/maps/:id/walls
 * Add a single wall segment (DM only).
 * Body: WallSegment (id generated server-side if missing)
 */
router.post('/:id/walls', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const segmentData = { ...req.body, id: req.body.id || randomUUID() };
    const parsed = WallSegmentSchema.safeParse(segmentData);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid segment' });
    }

    const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
    if (existing.length >= 5000) {
      return res.status(400).json({ error: 'Limit Exceeded', message: 'Maximum 5000 wall segments per map' });
    }

    const updated = await prisma.map.update({
      where: { id },
      data: { wallSegments: [...existing, parsed.data] as any },
    });

    return res.status(201).json({ segment: parsed.data, total: (updated.wallSegments as unknown as WallSegment[]).length });
  } catch (error) {
    logger.error('Error adding wall segment', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to add wall segment' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/maps/:id/walls/:sid
 * Remove a wall segment by id (DM only).
 */
router.delete('/:id/walls/:sid', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id, sid } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
    const filtered = existing.filter((s) => s.id !== sid);

    if (filtered.length === existing.length) {
      return res.status(404).json({ error: 'Not Found', message: 'Wall segment not found' });
    }

    await prisma.map.update({ where: { id }, data: { wallSegments: filtered as any } });
    return res.status(200).json({ message: 'Wall segment deleted' });
  } catch (error) {
    logger.error('Error deleting wall segment', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete wall segment' });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/maps/:id/walls/:sid
 * Update a single wall segment's type (DM only) — e.g., toggle door open/closed.
 * Body: { type: WallType }
 */
router.patch('/:id/walls/:sid', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id, sid } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const validTypes = ['wall', 'door-closed', 'door-open', 'window'];
    if (!req.body.type || !validTypes.includes(req.body.type)) {
      return res.status(400).json({ error: 'Validation Error', message: `type must be one of: ${validTypes.join(', ')}` });
    }

    const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
    const segIndex = existing.findIndex((s) => s.id === sid);

    if (segIndex === -1) {
      return res.status(404).json({ error: 'Not Found', message: 'Wall segment not found' });
    }

    existing[segIndex] = { ...existing[segIndex], type: req.body.type };
    await prisma.map.update({ where: { id }, data: { wallSegments: existing as any } });

    return res.status(200).json({ segment: existing[segIndex] });
  } catch (error) {
    logger.error('Error updating wall segment', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update wall segment' });
  }
});

// ============================================================
// LIGHT SOURCE ENDPOINTS
// ============================================================

/**
 * GET /api/campaigns/:campaignId/maps/:id/lights
 * Return the map's light sources array (all campaign members).
 */
router.get('/:id/lights', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;
    const lights = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
    return res.status(200).json({ lights });
  } catch (error) {
    logger.error('Error fetching light sources:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch light sources' });
  }
});

/**
 * PUT /api/campaigns/:campaignId/maps/:id/lights
 * Replace the entire light sources array (DM only).
 * Body: { lights: LightSource[] }
 */
router.put('/:id/lights', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const parsed = LightSourcesArraySchema.safeParse(req.body.lights);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid lights array' });
    }

    const updated = await prisma.map.update({
      where: { id },
      data: { lights: parsed.data as any },
    });

    broadcastToCampaign(campaignId, 'lights:replaced', { mapId: id, lights: updated.lights });
    return res.status(200).json({ lights: updated.lights });
  } catch (error) {
    logger.error('Error replacing light sources:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update light sources' });
  }
});

/**
 * POST /api/campaigns/:campaignId/maps/:id/lights
 * Add a single light source (DM only).
 * Body: LightSource (id generated server-side if missing)
 */
router.post('/:id/lights', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const lightData = { ...req.body, id: req.body.id || randomUUID() };
    const parsed = LightSourceSchema.safeParse(lightData);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid light source' });
    }

    const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
    if (existing.length >= 200) {
      return res.status(400).json({ error: 'Limit Exceeded', message: 'Maximum 200 light sources per map' });
    }

    const updated = await prisma.map.update({
      where: { id },
      data: { lights: [...existing, parsed.data] as any },
    });

    broadcastToCampaign(campaignId, 'light:added', { mapId: id, light: parsed.data });
    return res.status(201).json({ light: parsed.data, total: (updated.lights as unknown as LightSource[]).length });
  } catch (error) {
    logger.error('Error adding light source:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to add light source' });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/maps/:id/lights/:lightId
 * Update a single light source (DM only).
 * Body: Partial<LightSource> (at least one field required)
 */
router.patch('/:id/lights/:lightId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id, lightId } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const parsed = LightSourceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid update data' });
    }

    const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
    const idx = existing.findIndex((l) => l.id === lightId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Not Found', message: 'Light source not found' });
    }

    existing[idx] = { ...existing[idx], ...parsed.data };
    await prisma.map.update({ where: { id }, data: { lights: existing as any } });

    broadcastToCampaign(campaignId, 'light:updated', { mapId: id, light: existing[idx] });
    return res.status(200).json({ light: existing[idx] });
  } catch (error) {
    logger.error('Error updating light source:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update light source' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/maps/:id/lights/:lightId
 * Remove a light source by id (DM only).
 */
router.delete('/:id/lights/:lightId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id, lightId } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
    const filtered = existing.filter((l) => l.id !== lightId);

    if (filtered.length === existing.length) {
      return res.status(404).json({ error: 'Not Found', message: 'Light source not found' });
    }

    await prisma.map.update({ where: { id }, data: { lights: filtered as any } });

    broadcastToCampaign(campaignId, 'light:removed', { mapId: id, lightId });
    return res.status(200).json({ message: 'Light source deleted' });
  } catch (error) {
    logger.error('Error deleting light source:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete light source' });
  }
});

// ============================================================
// FOG OF WAR ENDPOINTS// ============================================================

/**
 * GET /api/campaigns/:campaignId/maps/:id/fog
 * Return full FogState for this map (DM only).
 */
router.get('/:id/fog', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const fog = loadFogState(map, map.fogData as FogState | null);
    return res.status(200).json({ fogState: fog });
  } catch (error) {
    logger.error('Error fetching fog state', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch fog state' });
  }
});

/**
 * POST /api/campaigns/:campaignId/maps/:id/fog/operation
 * Apply a FogOperation to the fog state (DM only).
 * Body: FogOperation
 * Returns the updated FogState.
 */
router.post('/:id/fog/operation', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    const parsed = FogOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid fog operation' });
    }

    const fog: FogState = loadFogState(map, map.fogData as FogState | null);

    applyFogOperation(fog, parsed.data);

    const updated = await prisma.map.update({
      where: { id },
      data: { fogData: fog as any },
    });

    return res.status(200).json({ fogState: updated.fogData });
  } catch (error) {
    logger.error('Error applying fog operation', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to apply fog operation' });
  }
});

/**
 * PUT /api/campaigns/:campaignId/maps/:id/lighting
 * Toggle dynamic lighting enabled/disabled (DM only).
 * Body: { enabled: boolean }
 */
router.put('/:id/lighting', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res);
    if (!map) return;

    if (typeof req.body.enabled !== 'boolean') {
      return res.status(400).json({ error: 'Validation Error', message: 'enabled must be a boolean' });
    }

    const updated = await prisma.map.update({
      where: { id },
      data: { lightingEnabled: req.body.enabled },
    });

    // Broadcast to all clients in this campaign so they don't need to reload
    try {
      broadcastToCampaign(campaignId, 'map:lighting:updated', {
        mapId: id,
        lightingEnabled: updated.lightingEnabled,
      });
    } catch {
      // Socket may not be initialized in tests — log and continue
    }

    return res.status(200).json({ lightingEnabled: updated.lightingEnabled });
  } catch (error) {
    logger.error('Error updating lighting setting', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update lighting setting' });
  }
});

export default router;


import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { AuthenticatedRequest } from '../middleware/rbac';
import { campaignMember, campaignDM } from '../middleware/compose';
import { downloadOnly } from '../middleware/downloadOnly';
import { oneCampaignArchiveAtATime, whileHoldingArchiveSlot } from '../middleware/campaignArchiveLimits';
import { prisma } from '../config/database';
import {
  canActOnTokenPlane, filterMapData, filterTokensByRole, getSpiritVisibility, lightChangeReachesPlayers, lightChangeSentTo,
  lightListChangeReachesPlayers, lightReachesPlayers, lightRemovalSentTo, lightsReplacedSentTo, lightsSentTo, MAP_SELECT_SENT_TO_EVERYONE,
  wallChangeReachesPlayers, wallChangeSentTo, wallListChangeReachesPlayers, wallSentTo, wallsReplacedSentTo, wallsSentTo,
} from '../utils/spirit-layer';
import { emitToMapReaders, emitToMapReadersAs, getSocketInstance } from '../websocket/utils';
import { normalizeAssetUrl, extractAssetId } from '../utils/asset-urls';
import { canReadAssetById, canReferenceAsset, isMapPicture, canControlToken, canHoldTokens, canMoveTokensNow, canReadMap, PAUSED_MOVE_REFUSAL } from '../services/permissions';
import { WallSegmentSchema, WallSegmentsArraySchema, FogOperationSchema, LightSourceSchema, LightSourcesArraySchema, LightSourceUpdateSchema, DUPLICATE_WALL_ID_MESSAGE, DUPLICATE_LIGHT_ID_MESSAGE, MAX_WALL_SEGMENTS, MAX_LIGHT_SOURCES, TOO_MANY_WALLS_MESSAGE, TOO_MANY_LIGHTS_MESSAGE } from '../validators/walls';
import { validateTokenShapes, TokenMetadataSchema, MoveTokensSchema, TOKEN_TYPES, TOKEN_DISPOSITIONS, TOKEN_DISPLAY_MODES } from '../validators/tokens';
import { withMapsLocked, clampTokenPosition } from '../utils/mapTokens';
import type { WallSegment, FogState, LightSource } from '../types/walls';
import { parseUVTT } from '../services/uvttParser';
import { buildUVTT } from '../services/uvttExporter';
import { fileTypeFromBuffer } from 'file-type';
import {
  getFilePath,
  ensureDirectory,
  getFileSizeLimit,
  getTempDirectory,
  deleteFile,
} from '../utils/fileUtils';
import { generateThumbnail } from '../utils/thumbnails';
import { MULTIPART_FIELD_LIMITS, MULTIPART_NAME_CHARSET } from '../utils/multipartLimits';
import { oneAtATime } from '../utils/oneAtATime';
import { QueueCallerLeft, QueueTimeLimitReached, QueueWaitExpired } from '../utils/serialQueue';
import { uvttImportQueue, UVTT_IMPORT_TIME_LIMIT_MS } from '../services/uvttImportQueue';
import { uploadLimiter } from './assets';
import { openPicture, NotAPictureError } from '../utils/sharpInput';
import { pictureLimitProblem } from '../utils/pictureLimits';
import logger from '../utils/logger';
import { errorMessage } from '../utils/errors';
import { getState as getCombatState, setState as setCombatState, removeCombatants } from '../websocket/initiativeState';
import { sendInitiativeState, resendInitiative } from '../websocket/handlers/initiative';
import { readTokens, toJson } from '../utils/prisma-json';
import type { Map as MapRow, Prisma } from '@prisma/client';
import { loadFogState, applyWsFogOperation, broadcastFogState, type Token, broadcastMapData, resendSightAfterChange, fogFits, FogTooLargeError } from '../websocket/shared';
import { MapSideSchema, GridSizeSchema, FeetPerSquareSchema, MAP_LIMITS, MAP_NAME_TOO_LONG_MESSAGE, MAP_IMAGE_NOT_A_MAP_PICTURE_MESSAGE, SPIRIT_LAYER_NOT_A_MAP_PICTURE_MESSAGE, dimensionProblem, wallOutsideMap, lightOutsideMap, WALL_OUTSIDE_MAP_MESSAGE, LIGHT_OUTSIDE_MAP_MESSAGE, GEOMETRY_MARGIN_SQUARES, tooManyTokensMessage } from '../validators/maps';

/**
 * The largest UVTT file accepted. The picture travels as base64 text, about
 * four thirds of its size, so this follows the map size limit instead of
 * being a number of its own, with room for the walls and lights around it.
 */
const UVTT_GEOMETRY_ALLOWANCE_BYTES = 8 * 1024 * 1024;
const UVTT_MAX_FILE_BYTES = Math.ceil((getFileSizeLimit('MAP') * 4) / 3) + UVTT_GEOMETRY_ALLOWANCE_BYTES;

/** What the UVTT export answers for a map whose picture is not one the image library may read. */
const UVTT_EXPORT_NOT_A_PICTURE_MESSAGE =
  "This map's picture is not a PNG, JPEG, WebP or GIF image, so it cannot be exported as a Universal VTT file. " +
  'Choose a map picture for it in Edit Map, then export it again.';

/** What a map picture inside a UVTT may be. A PDF cannot be drawn as a map. */
const UVTT_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
const UVTT_IMAGE_EXTENSIONS = '.png, .jpg, .jpeg, .webp';

/**
 * Where an uploaded UVTT file waits to be read: a folder of its own in the
 * uploads folder's temporary area, made the first time it is needed. The
 * file is removed when its request ends, whether the import worked or not.
 */
const UVTT_TEMP_DIR = path.join(getTempDirectory(), 'uvtt');
/** A waiting file older than this was left by a backend that stopped mid-import. */
const STALE_UVTT_MS = 24 * 60 * 60 * 1000;
let staleUvttSwept = false;

/** Remove waiting files a stopped backend left behind. Best effort, once per process. */
async function sweepStaleUvttUploads(): Promise<void> {
  try {
    const now = Date.now();
    for (const name of await fs.readdir(UVTT_TEMP_DIR)) {
      const file = path.join(UVTT_TEMP_DIR, name);
      const stats = await fs.stat(file).catch(() => null);
      if (stats && now - stats.mtimeMs > STALE_UVTT_MS) await fs.rm(file, { force: true });
    }
  } catch (err) {
    logger.warn('[uvtt-import] Could not tidy the temporary folder', { err });
  }
}

/**
 * Multer configured for UVTT file uploads, written to disk. A file can be
 * over 50 MB, almost all of it the picture, and held in memory it waited
 * there for its turn; on disk it costs nothing until it is read.
 */
const uvttUpload = multer({
  ...MULTIPART_NAME_CHARSET,
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDirectory(UVTT_TEMP_DIR)
        .then(() => {
          if (!staleUvttSwept) {
            staleUvttSwept = true;
            void sweepStaleUvttUploads();
          }
          cb(null, UVTT_TEMP_DIR);
        })
        .catch((err: Error) => cb(err, UVTT_TEMP_DIR));
    },
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.uvtt`),
  }),
  limits: { fileSize: UVTT_MAX_FILE_BYTES, files: 1, ...MULTIPART_FIELD_LIMITS },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.uvtt', '.dd2vtt', '.df2vtt'].includes(ext) || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only .uvtt, .dd2vtt, and .df2vtt files are supported'));
    }
  },
});

/** Reads the upload, and answers a body it refuses with the reason instead of a 500. */
function receiveUvtt(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  uvttUpload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      const limitMB = Math.round(UVTT_MAX_FILE_BYTES / (1024 * 1024));
      res.status(413).json({
        error: 'File Too Large',
        message:
          `This file is larger than the ${limitMB}MB a Universal VTT import accepts. ` +
          `The picture inside it can be at most ${Math.round(getFileSizeLimit('MAP') / (1024 * 1024))}MB.`,
      });
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Send one file, in a form field called "file".',
      });
      return;
    }
    res.status(400).json({
      error: 'Upload Error',
      message: errorMessage(err) || 'The upload could not be read.',
    });
  });
}

/** One import per user at a time, so one person cannot queue up many files. */
const oneUvttImportAtATime = oneAtATime(
  (req) => (req as AuthenticatedRequest).session?.userId,
  'Another import is still running. Wait for it to finish, then import this file.'
);

/** An import that could not start soon enough, because others were ahead of it. */
const UVTT_IMPORT_BUSY_MESSAGE =
  'Another map import is running on the server. Try again in a minute.';
/** An import stopped at its time limit, having saved nothing. */
const UVTT_IMPORT_TOO_SLOW_MESSAGE =
  `This map import took longer than ${UVTT_IMPORT_TIME_LIMIT_MS / 1000} seconds and was stopped, ` +
  'so nothing was saved. Try again in a minute.';

const router = Router({ mergeParams: true }); // Important: Merge params from parent router

/** A grid size or feet-per-square value usable as sent, or undefined for the default. */
function usable(schema: typeof GridSizeSchema | typeof FeetPerSquareSchema, value: unknown): number | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Tell those who may read a map of a change to it (emitToMapReaders): the
 * whole campaign for the map on screen, the DM for a prepared one. The write
 * has already happened, so a failure to tell anyone is logged and the
 * request still succeeds.
 */
async function tellMapReaders(campaignId: string, mapId: string, event: string, data: unknown): Promise<void> {
  try {
    await emitToMapReaders(getSocketInstance(), campaignId, mapId, event, data);
  } catch (err) {
    logger.warn('Map change not broadcast', { err, event, mapId });
  }
}

/**
 * tellMapReaders, with what each reader is told decided from their role
 * (emitToMapReadersAs): a locked door and a light that is off are the DM's.
 */
async function tellMapReadersAs(
  campaignId: string,
  mapId: string,
  what: string,
  sendFor: (role: string | undefined) => { event: string; data: unknown } | null
): Promise<void> {
  try {
    await emitToMapReadersAs(getSocketInstance(), campaignId, mapId, what, sendFor);
  } catch (err) {
    logger.warn('Map change not broadcast', { err, event: what, mapId });
  }
}

/**
 * Send the map to the table again when it is the one on screen, after a
 * change to what players are sent. The change is saved by then, so a failure
 * here is logged, never answered as the change having failed.
 */
/** A map's walls with every end moved by `kx` across and `ky` down, to whole pixels. */
function scaledWalls(stored: unknown, kx: number, ky: number): WallSegment[] {
  const walls = (Array.isArray(stored) ? stored : []) as WallSegment[];
  return walls.map((w) => ({
    ...w,
    x1: Math.round(w.x1 * kx), y1: Math.round(w.y1 * ky),
    x2: Math.round(w.x2 * kx), y2: Math.round(w.y2 * ky),
  }));
}

/** A map's lights moved the same way; their radii are in squares and stay. */
function scaledLights(stored: unknown, kx: number, ky: number): LightSource[] {
  const lights = (Array.isArray(stored) ? stored : []) as LightSource[];
  return lights.map((l) => ({ ...l, x: Math.round(l.x * kx), y: Math.round(l.y * ky) }));
}

async function resendIfCurrent(campaignId: string, map: Parameters<typeof broadcastMapData>[2]): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
    if (campaign?.currentMapId === map.id) await broadcastMapData(getSocketInstance(), campaignId, map);
  } catch (err) {
    logger.warn('Map not re-sent to the table; the change stands', { err, mapId: map.id });
  }
}

/**
 * resendIfCurrent for the token routes, which a player may call for a token
 * they control as often as the request limit allows. Each re-send builds the
 * map for every member, with sight on a lit map, so these routes ask for one
 * and it goes at most once per TOKEN_RESEND_MS for each map, read as it
 * stands when it goes: a burst of changes reaches the table as one map
 * carrying them all. The window is fixed from the first request, so a steady
 * stream cannot put the re-send off, or multiply it.
 */
const TOKEN_RESEND_MS = 100;
const pendingTokenResends = new Set<string>();

function resendSoonIfCurrent(campaignId: string, mapId: string): void {
  const key = `${campaignId}:${mapId}`;
  if (pendingTokenResends.has(key)) return;
  pendingTokenResends.add(key);
  const timer = setTimeout(() => {
    pendingTokenResends.delete(key);
    void (async () => {
      try {
        const map = await prisma.map.findUnique({ where: { id: mapId } });
        if (map && map.campaignId === campaignId) await resendIfCurrent(campaignId, map);
      } catch (err) {
        logger.warn('Map not re-sent to the table after a token change; the change stands', { err, mapId });
      }
    })();
  }, TOKEN_RESEND_MS);
  timer.unref?.();
}

// The token shape lives in websocket/shared.ts — see the note there on why this
// file no longer keeps its own copy.

const VALID_TOKEN_TYPES: readonly string[] = TOKEN_TYPES;
const VALID_TOKEN_DISPOSITIONS: readonly string[] = TOKEN_DISPOSITIONS;
const VALID_DISPLAY_MODES: readonly string[] = TOKEN_DISPLAY_MODES;

/**
 * Map CRUD Routes
 * Map Endpoints
 *
 * All routes are prefixed with /api/campaigns/:campaignId/maps
 */

/**
 * A token in the initiative order was changed or removed: send the order
 * again, as each member may see it, so the tracker follows the token. A
 * failure here must not fail the request that changed the token.
 */
async function resendInitiativeFor(campaignId: string, tokenId: string): Promise<void> {
  if (!getCombatState(campaignId).combatants.some((c) => c.tokenId === tokenId)) return;
  try {
    await sendInitiativeState(getSocketInstance(), campaignId);
  } catch (error) {
    logger.warn('Initiative order not re-sent after a token change', { err: error });
  }
}

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
    // The limit every path that names a map applies (validators/mapLimits.ts).
    if (name.trim().length > MAP_LIMITS.maxNameLength) {
      return res.status(400).json({ error: 'Validation Error', message: MAP_NAME_TOO_LONG_MESSAGE });
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Map imageUrl (asset ID) is required',
      });
    }

    // Width and height within the map limits (validators/maps.ts)
    const sizeProblem = dimensionProblem(MapSideSchema('Map width'), width) ?? dimensionProblem(MapSideSchema('Map height'), height);
    if (sizeProblem) {
      return res.status(400).json({ error: 'Validation Error', message: sizeProblem });
    }

    // gridSize is optional; anything unusable gets the default of 50
    const mapGridSize = usable(GridSizeSchema, gridSize) ?? 50;

    // feetPerSquare: whole number from 1 to 100, defaults to 5
    const mapFeetPerSquare = usable(FeetPerSquareSchema, feetPerSquare) ?? 5;

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

    // SECURITY: you may only point a map at a picture you can already see.
    //
    // Normalising a URL formats it; it does not check anything. Storing an
    // unchecked reference is what let someone read a stranger's private asset —
    // they created a campaign of their own, made a map naming the asset id, and
    // the read rule then saw a legitimate-looking reference and allowed it.
    // Refusing the reference is the half of that fix that stops it being
    // created in the first place.
    for (const url of [normalizedImageUrl, normalizedSpiritLayerUrl]) {
      if (!(await canReferenceAsset(url, req.session.userId!, undefined, campaignId))) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to that image',
        });
      }
    }
    // And only a map picture: the asset's type is read, since an address
    // under the maps folder can name any asset (isMapPicture).
    if (!(await isMapPicture(normalizedImageUrl))) {
      return res.status(400).json({ error: 'Validation Error', message: MAP_IMAGE_NOT_A_MAP_PICTURE_MESSAGE });
    }
    if (!(await isMapPicture(normalizedSpiritLayerUrl))) {
      return res.status(400).json({ error: 'Validation Error', message: SPIRIT_LAYER_NOT_A_MAP_PICTURE_MESSAGE });
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
        // New maps start with manual fog off and lights that matter; the DM
        // turns either on when a map needs it. The columns default to on so
        // maps from before the flags existed keep the behaviour they had.
        fogEnabled: false,
        globalIllumination: false,
        explorationEnabled: false,
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

    // A player is sent the map the campaign is showing and nothing else; the
    // rest are the DM's until they switch to them (canReadMap).
    const role = req.campaignMembership!.role;
    const currentMapId = role === 'DM'
      ? null
      : (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } }))?.currentMapId ?? '';

    const maps = await prisma.map.findMany({
      where: role === 'DM' ? { campaignId } : { campaignId, id: currentMapId ?? '' },
      select: {
        ...MAP_SELECT_SENT_TO_EVERYONE,
        // The DM's alone, for Edit Map; a player is sent it with the map,
        // when the spirit layer is theirs to see (filterMapData).
        spiritLayerUrl: role === 'DM',
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
  // Writes a file to disk exactly as an upload does, so it shares the ceiling.
  uploadLimiter,
  oneUvttImportAtATime,
  receiveUvtt,
  async (req: AuthenticatedRequest, res: Response) => {
    const uploaded = req.file?.path;
    // A client that gave up while its import waited is dropped from the
    // queue, and its upload removed, without being read.
    const left = new AbortController();
    res.once('close', () => left.abort());
    try {
      await uvttImportQueue((signal) => importUvttFile(req, res, signal), { signal: left.signal });
    } catch (err) {
      if (err instanceof QueueWaitExpired && !res.headersSent) {
        res.setHeader('Retry-After', '60');
        res.status(503).json({ error: 'Service Unavailable', message: UVTT_IMPORT_BUSY_MESSAGE });
      } else if (err instanceof QueueTimeLimitReached && !res.headersSent) {
        logger.warn('[uvtt-import] Stopped an import that ran past its time limit', { campaignId: req.params.campaignId });
        res.setHeader('Retry-After', '60');
        res.status(503).json({ error: 'Service Unavailable', message: UVTT_IMPORT_TOO_SLOW_MESSAGE });
      } else if (!(err instanceof QueueCallerLeft)) {
        logger.error('Error importing UVTT file:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error', message: 'Failed to import UVTT file' });
      }
    } finally {
      if (uploaded) {
        await fs.rm(uploaded, { force: true }).catch((err) =>
          logger.warn('[uvtt-import] Could not remove an uploaded file', { err })
        );
      }
    }
  }
);

/**
 * The import itself, run in its turn: read, check, store, answer.
 *
 * `signal` aborts when the import runs past its time limit, by which time
 * the route has answered for it. It is checked before each step that saves
 * something, and a step that finds it aborted removes what the steps before
 * it saved, so a stopped import leaves nothing behind.
 */
async function importUvttFile(req: AuthenticatedRequest, res: Response, signal: AbortSignal): Promise<unknown> {
    /** Answer, unless the route already has. */
    const answer = (status: number, body: unknown) =>
      signal.aborted || res.headersSent ? undefined : res.status(status).json(body);
    try {
      const { campaignId } = req.params;
      const userId = req.session?.userId;
      if (!userId) return answer(401, { error: 'Unauthorized' });

      if (!req.file?.path) {
        return answer(400, { error: 'Validation Error', message: 'No UVTT file uploaded' });
      }
      // Read in its turn, and removed from disk at once: from here on only
      // this copy is used, and it is let go of once parsed.
      let fileBuffer: Buffer | null = await fs.readFile(req.file.path);
      await fs.rm(req.file.path, { force: true });
      signal.throwIfAborted();

      // A field sent twice arrives as a list, which is not a name.
      const rawName: unknown = req.body.name;
      if (rawName !== undefined && typeof rawName !== 'string') {
        return answer(400, { error: 'Validation Error', message: 'Send the map name once, as text.' });
      }
      const mapName =
        rawName?.trim() ||
        path.basename(req.file.originalname, path.extname(req.file.originalname)).slice(0, MAP_LIMITS.maxNameLength);
      if (mapName.length > MAP_LIMITS.maxNameLength) {
        return answer(400, { error: 'Validation Error', message: MAP_NAME_TOO_LONG_MESSAGE });
      }
      // Optional; anything that is not a usable grid size gets the default
      const gridSizePx = usable(GridSizeSchema, Number(req.body.gridSize)) ?? 70;

      // ── Parse the UVTT file ──────────────────────────────────────────────
      const confirmed = req.body.confirm === 'true' || req.body.confirm === true;
      const includeObjectWalls =
        req.body.includeObjectWalls === 'true' || req.body.includeObjectWalls === true;

      // Only the picture and the geometry are kept once the file is parsed.
      let parsed;
      try {
        parsed = parseUVTT(fileBuffer, gridSizePx, { includeObjectWalls, maxImageBytes: getFileSizeLimit('MAP') });
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : 'Failed to parse UVTT file';
        return answer(400, { error: 'Parse Error', message: msg });
      } finally {
        fileBuffer = null;
      }

      // ── A map the app can hold ───────────────────────────────────────────
      // The same limits as Create Map, checked before anything is asked or
      // saved, so a file that cannot become a map leaves nothing behind.
      if (dimensionProblem(MapSideSchema('Map width'), parsed.mapWidth) || dimensionProblem(MapSideSchema('Map height'), parsed.mapHeight)) {
        const limit = `A map can be from ${MAP_LIMITS.minSide} to ${MAP_LIMITS.maxSide} squares on each side.`;
        return answer(400, {
          error: 'Validation Error',
          message: Number.isFinite(parsed.mapWidth) && Number.isFinite(parsed.mapHeight)
            ? `This file's map is ${parsed.mapWidth} by ${parsed.mapHeight} squares. ${limit}`
            : `This file does not say how many squares its map is (resolution.map_size). ${limit}`,
        });
      }
      // Geometry outside the picture is kept, once the DM agrees below, but
      // not so far out that the map editor would refuse it. Refused before
      // asking, since no answer would make it importable.
      const extent = { width: parsed.mapWidth, height: parsed.mapHeight, gridSize: gridSizePx };
      if (wallOutsideMap(parsed.wallSegments, extent) || lightOutsideMap(parsed.lightSources, extent)) {
        return answer(400, {
          error: 'Validation Error',
          message:
            `This file has walls or lights more than ${GEOMETRY_MARGIN_SQUARES} squares outside its map, ` +
            'which a map cannot hold. Export it again from the tool that made it, covering the whole map.',
        });
      }

      // ── Anything for the DM to decide before this becomes a map ──────────
      // Two things can need an answer. Some exporters crop the picture to part
      // of the map and write out the geometry for all of it, which imports as
      // bare areas with walls that cannot even block sight, since sight stops
      // at the map's edges. And a file may carry walls for its furniture, which
      // block sight like any other but are the DM's call.
      //
      // Asked before anything is written, so declining leaves nothing behind.
      const { walls, doors, lights } = parsed.outOfBounds;
      const hasOutOfBounds = walls > 0 || doors > 0 || lights > 0;
      const offersObjectWalls = !includeObjectWalls && parsed.objectWallCount > 0;
      if (!confirmed && (hasOutOfBounds || offersObjectWalls)) {
        return answer(409, {
          error: 'Confirmation Required',
          // Clients branch on the code, never the wording.
          code: 'UVTT_IMPORT_NEEDS_CONFIRMATION',
          message: 'This file needs a decision before it can be imported.',
          outOfBounds: { walls, doors, lights },
          objectWalls: parsed.objectWallCount,
        });
      }

      // ── Refuse what the map editor could never save ──────────────────────
      // Import wrote these straight to the row while every later edit checks
      // them, so an oversized file used to import and then refuse the first
      // wall edit. Say it here, where it can still be acted on.
      const wallCheck = WallSegmentsArraySchema.safeParse(parsed.wallSegments);
      if (!wallCheck.success) {
        return answer(400, {
          error: 'Validation Error',
          message:
            `This file has ${parsed.wallSegments.length} wall segments, more than a map can hold. ` +
            (includeObjectWalls && parsed.objectWallCount > 0
              ? 'Importing without its furniture walls may bring it under the limit.'
              : 'Split it into smaller maps in the tool that made it.'),
        });
      }
      const lightCheck = LightSourcesArraySchema.safeParse(parsed.lightSources);
      if (!lightCheck.success) {
        return answer(400, {
          error: 'Validation Error',
          message: `This file's lights cannot be imported: ${lightCheck.error.issues[0]?.message ?? 'they are outside the limits a map allows'}.`,
        });
      }

      // ── Check the picture before it reaches disk ─────────────────────────
      // This route writes the image itself instead of going through the upload
      // middleware, so the checks every other upload gets have to be made here
      // or not at all. Read the bytes rather than trusting the file: a UVTT is
      // JSON, and the base64 inside it can be anything.
      const imageType = await fileTypeFromBuffer(parsed.imageBuffer);
      if (!imageType || !UVTT_IMAGE_TYPES.includes(imageType.mime)) {
        return answer(400, {
          error: 'Validation Error',
          message:
            'The picture inside this file is not an image CozyVTT can use. ' +
            `Maps must be one of: ${UVTT_IMAGE_EXTENSIONS}.`,
        });
      }

      const mapSizeLimit = getFileSizeLimit('MAP');
      if (parsed.imageBuffer.length > mapSizeLimit) {
        const limitMB = Math.round(mapSizeLimit / (1024 * 1024));
        return answer(400, {
          error: 'Validation Error',
          message: `The picture inside this file is too large. Maps must be smaller than ${limitMB}MB.`,
        });
      }
      // The limits on its pixels and frames that an uploaded map has.
      const pictureProblem = await pictureLimitProblem(parsed.imageBuffer, 'MAP');
      if (pictureProblem) {
        return answer(400, {
          error: 'Validation Error',
          message: `The picture inside this file cannot be used as a map. ${pictureProblem}`,
        });
      }

      // ── Save the embedded image as an asset ──────────────────────────────
      signal.throwIfAborted();
      const ext = `.${imageType.ext}`;
      const filename = `${randomUUID()}${ext}`;
      const uploadPath = getFilePath('MAP', 'CAMPAIGN', campaignId);
      await ensureDirectory(uploadPath);
      const filePath = path.join(uploadPath, filename).replace(/\\/g, '/');
      // Files first, then the asset row, then the map. When a step fails, what
      // the steps before it made is removed: the files when the asset row
      // cannot be written, the row and the files when the map cannot be.
      let thumbnailPath: string | null = null;
      const removeFiles = async () => {
        for (const file of [filePath, thumbnailPath]) {
          if (!file) continue;
          await deleteFile(file).catch((err) => logger.error('[uvtt-import] Could not remove a file after a failed import', { err }));
        }
      };

      let asset;
      try {
        await fs.writeFile(filePath, parsed.imageBuffer);
        thumbnailPath = await generateThumbnail(filePath);
        signal.throwIfAborted();

        // Create asset record
        asset = await prisma.asset.create({
          data: {
            type: 'MAP',
            scope: 'CAMPAIGN',
            uploadedById: userId,
            campaignId,
            filename,
            originalName: `${mapName}${ext}`,
            mimeType: imageType.mime,
            fileSize: parsed.imageBuffer.length,
            filePath,
            thumbnailPath,
            name: mapName,
            tags: ['uvtt-import'],
          },
        });
      } catch (error) {
        await removeFiles();
        throw error;
      }

      const imageUrl = normalizeAssetUrl(asset.id, 'maps');

      // ── Create the map with walls and lights ─────────────────────────────
      let map;
      try {
        signal.throwIfAborted();
        map = await prisma.map.create({
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
            wallSegments: toJson(parsed.wallSegments),
            lights: toJson(parsed.lightSources),
            // Only when the file brings lights of its own. Walls alone used to
            // turn this on, which handed the DM a map that was black for every
            // player until they found the setting: walls block sight, and with
            // nothing lighting the room there is nothing to see.
            lightingEnabled: parsed.lightSources.length > 0,
            fogEnabled: false,
            globalIllumination: false,
            explorationEnabled: false,
          },
        });
        signal.throwIfAborted();
      } catch (error) {
        // The rows first: a row that cannot be removed keeps its files, which
        // it still names.
        try {
          if (map) await prisma.map.delete({ where: { id: map.id } });
          await prisma.asset.delete({ where: { id: asset.id } });
          await removeFiles();
        } catch (err) {
          logger.error('[uvtt-import] Could not remove the asset of a failed import', { err, assetId: asset.id });
        }
        throw error;
      }

      logger.info(
        `[uvtt-import] Created map "${mapName}" (${parsed.mapWidth}×${parsed.mapHeight}) ` +
        `with ${parsed.wallCount} walls + ${parsed.portalCount} doors + ${parsed.lightCount} lights`
      );

      return answer(201, {
        map,
        wallCount: parsed.wallCount,
        portalCount: parsed.portalCount,
        lightCount: parsed.lightCount,
        totalSegments: parsed.wallSegments.length,
      });
    } catch (error) {
      if (signal.aborted) {
        logger.warn('[uvtt-import] An import that ran past its time limit has stopped');
        return undefined;
      }
      logger.error('Error importing UVTT file:', error);
      return answer(500, { error: 'Internal Server Error', message: 'Failed to import UVTT file' });
    }
}

/**
 * GET /api/campaigns/:campaignId/maps/:id/export-uvtt
 * Export a map as a Universal VTT (.uvtt) file download.
 * Includes the map image, wall segments, portals, and light sources.
 * Requires: DM role
 */
router.get(
  '/:id/export-uvtt',
  campaignDM,
  downloadOnly,
  // The picture is read whole and encoded in memory, so one at a time for
  // each user, as campaign archives are.
  oneCampaignArchiveAtATime,
  async (req: AuthenticatedRequest, res: Response) => {
    // Under the slot until the work is done, even if the caller hangs up,
    // as the campaign export is: the slot is let go on close otherwise.
    await whileHoldingArchiveSlot(res, async () => {
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

        // Resolve asset file path. The file goes into the download, so the
        // caller must be able to read it, and the address is read the way the
        // reference check reads it: a map could otherwise name another user's
        // private file and hand it over here.
        const assetId = extractAssetId(map.imageUrl);
        const asset = assetId
          ? await prisma.asset.findUnique({ where: { id: assetId }, select: { filePath: true } })
          : null;
        if (!asset || !assetId || !(await canReadAssetById(assetId, req.session.userId!, req.session.platformRole === 'ADMIN'))) {
          return res.status(422).json({ error: 'Unprocessable Entity', message: 'Map image asset not found' });
        }

        const imagePath = path.resolve(asset.filePath.replace(/\\/g, '/'));
        let imageBuffer: Buffer;
        try {
          imageBuffer = await fs.readFile(imagePath);
        } catch {
          return res.status(422).json({ error: 'Unprocessable Entity', message: 'Map image file not found on disk' });
        }

        // Get image dimensions for pixels_per_grid calculation. A map stored
        // before its picture had to be a map picture can name any file, so the
        // bytes are identified first, and only a picture is read. Only the
        // header is read, so the image library's pixel limit (16,383 squared)
        // is off: a map picture may be 16,384 pixels on each side.
        let imageWidthPx: number | undefined;
        try {
          imageWidthPx = (await (await openPicture(imageBuffer, { limitInputPixels: false })).metadata()).width;
        } catch (error) {
          if (!(error instanceof NotAPictureError)) throw error;
          return res.status(422).json({ error: 'Unprocessable Entity', message: UVTT_EXPORT_NOT_A_PICTURE_MESSAGE });
        }

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
    });
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
        message: 'Map not found',
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

    // A player may fetch only the map the campaign is showing; a prepared map
    // is the DM's until they switch to it, and answers as if it were not here.
    if (membership.role !== 'DM') {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
      if (!canReadMap(membership.role, map.id, campaign?.currentMapId)) {
        return res.status(404).json({ error: 'Not Found', message: 'Map not found' });
      }
    }

    // Get spirit layer visibility for this user
    const spiritVisible = await getSpiritVisibility(campaignId, userId);

    // Filter map data based on role, spirit visibility and dynamic lighting.
    //
    // `userId` is what enables the lighting filter, and this call used to omit
    // it — so on a lit map the two WebSocket paths filtered tokens by what the
    // player could see while this one, the fetch the client makes on opening a
    // map, handed over every token on it.
    const responseMap = filterMapData(map, membership.role, spiritVisible, userId);

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
 * The columns whose change by PUT /maps/:id sends every member the map on
 * screen again: what the canvas draws from the row itself (the picture, the
 * size, the grid and its scale, the name and the spirit layer), and Lighting
 * and Global Illumination, which decide which tokens each player is sent. The
 * flags alone would leave a player holding a token the server would no longer
 * send, or missing one it now would.
 */
export const MAP_FIELDS_THAT_RESEND_THE_MAP = [
  'name', 'imageUrl', 'baseLayerUrl', 'width', 'height', 'gridSize', 'feetPerSquare', 'diagonalRule', 'spiritLayerUrl',
  'lightingEnabled', 'globalIllumination',
] as const satisfies readonly (keyof MapRow)[];

/** The columns everyone is sent whose change does not send the map again, each with the reason. */
export const MAP_FIELDS_THAT_DO_NOT_RESEND_THE_MAP = {
  id: 'never changes',
  campaignId: 'never changes',
  createdAt: 'never changes',
  updatedAt: 'changes with every edit, and tells a member nothing the edit does not',
  fogEnabled: 'reaches every reader in map:settings:updated, and decides no token',
  explorationEnabled: 'reaches every reader in map:settings:updated, and decides no token',
} as const satisfies Partial<Record<keyof MapRow, string>>;

/**
 * What PUT /maps/:id reads of the map under its lock: the size walls and
 * lights scale from, those two lists, whether fog was on, and each column
 * whose change sends the map again. Only these, so a rename does not hold
 * the lock while it reads the fog grid and every token.
 */
const MAP_EDIT_LOCKED_READ = {
  ...(Object.fromEntries(MAP_FIELDS_THAT_RESEND_THE_MAP.map((key) => [key, true])) as Record<(typeof MAP_FIELDS_THAT_RESEND_THE_MAP)[number], true>),
  width: true, height: true, gridSize: true, wallSegments: true, lights: true, fogEnabled: true,
} as const satisfies Prisma.MapSelect;

/**
 * PUT /api/campaigns/:campaignId/maps/:id
 * Update a map
 * Requires: DM role
 */
router.put('/:id', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const { name, width, height, gridSize, imageUrl, spiritLayerUrl, feetPerSquare, diagonalRule, lightingEnabled, fogEnabled, globalIllumination, explorationEnabled } = req.body;

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
        message: 'Map not found',
      });
    }

    // Build update data object.
    //
    // Typed rather than `any` because it is assembled field by field from
    // request body values: with `any`, a typo in one of these names compiled
    // and silently dropped that field from the update instead of saving it.
    const updateData: Prisma.MapUpdateInput = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Map name must be a non-empty string',
        });
      }
      // A name stored longer before the limit existed is taken back as it
      // is, as the size fields below are: Edit Map sends every field.
      if (name.trim().length > MAP_LIMITS.maxNameLength && name.trim() !== existingMap.name) {
        return res.status(400).json({ error: 'Validation Error', message: MAP_NAME_TOO_LONG_MESSAGE });
      }
      updateData.name = name.trim();
    }

    // Width, height, grid size and feet per square within the map limits
    // (validators/maps.ts). A value equal to the stored one is taken as it
    // is: Edit Map sends every field, and a map stored larger than the
    // limits, before they existed, must still save an edit that leaves its
    // size alone.
    const sizeFields = [
      ['width', width, MapSideSchema('Map width'), existingMap.width],
      ['height', height, MapSideSchema('Map height'), existingMap.height],
      ['gridSize', gridSize, GridSizeSchema, existingMap.gridSize],
      ['feetPerSquare', feetPerSquare, FeetPerSquareSchema, existingMap.feetPerSquare],
    ] as const;
    for (const [field, value, schema, stored] of sizeFields) {
      if (value === undefined) continue;
      const problem = value === stored ? null : dimensionProblem(schema, value);
      if (problem) {
        return res.status(400).json({ error: 'Validation Error', message: problem });
      }
      updateData[field] = value as number;
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
      // A picture the DM may read, as on create (canReferenceAsset)
      if (!(await canReferenceAsset(normalizedImageUrl, req.session.userId!, existingMap.imageUrl, campaignId))) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to that image' });
      }
      if (!(await isMapPicture(normalizedImageUrl, existingMap.imageUrl))) {
        return res.status(400).json({ error: 'Validation Error', message: MAP_IMAGE_NOT_A_MAP_PICTURE_MESSAGE });
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
      const normalizedSpiritLayerUrl = spiritLayerUrl ? normalizeAssetUrl(spiritLayerUrl, 'maps') : null;
      if (!(await canReferenceAsset(normalizedSpiritLayerUrl, req.session.userId!, existingMap.spiritLayerUrl, campaignId))) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to that image' });
      }
      if (!(await isMapPicture(normalizedSpiritLayerUrl, existingMap.spiritLayerUrl))) {
        return res.status(400).json({ error: 'Validation Error', message: SPIRIT_LAYER_NOT_A_MAP_PICTURE_MESSAGE });
      }
      updateData.spiritLayerUrl = normalizedSpiritLayerUrl;
    }

    if (lightingEnabled !== undefined) {
      if (typeof lightingEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Validation Error', message: 'lightingEnabled must be a boolean' });
      }
      updateData.lightingEnabled = lightingEnabled;
    }

    if (fogEnabled !== undefined) {
      if (typeof fogEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Validation Error', message: 'fogEnabled must be a boolean' });
      }
      updateData.fogEnabled = fogEnabled;
    }

    if (globalIllumination !== undefined) {
      if (typeof globalIllumination !== 'boolean') {
        return res.status(400).json({ error: 'Validation Error', message: 'globalIllumination must be a boolean' });
      }
      updateData.globalIllumination = globalIllumination;
    }

    if (explorationEnabled !== undefined) {
      if (typeof explorationEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Validation Error', message: 'explorationEnabled must be a boolean' });
      }
      updateData.explorationEnabled = explorationEnabled;
    }

    // Fog and explored areas are one stored cell per grid square, so a map
    // too large for them (only one stored before the size limits can be)
    // may not turn either on. One already on stays on, and its fog requests
    // answer with the same reason.
    const turningOn = (updateData.fogEnabled === true && !existingMap.fogEnabled)
      || (updateData.explorationEnabled === true && !existingMap.explorationEnabled);
    const resulting = {
      width: typeof updateData.width === 'number' ? updateData.width : existingMap.width,
      height: typeof updateData.height === 'number' ? updateData.height : existingMap.height,
    };
    if (turningOn && !fogFits(resulting)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: new FogTooLargeError(resulting.width, resulting.height).message,
      });
    }

    // Walls, doors and lights are stored in map pixels, and the picture is
    // drawn across width × gridSize by height × gridSize, so when either side
    // of that changes they scale with it, each axis by its own change, and
    // stay on the art. The scale is taken from the map as it is under the
    // lock, the walls and lights with it. Two edits at once used to scale
    // from the size each read before the lock, so both doubled the walls,
    // and a form sending back the old grid size left them doubled. `before`
    // is that row, for what this edit changed; existingMap stays the check
    // of what was sent.
    const { updatedMap, before, moved } = await withMapsLocked([id], async (tx) => {
      const current = await tx.map.findUniqueOrThrow({ where: { id }, select: MAP_EDIT_LOCKED_READ });
      const size = (field: 'width' | 'height' | 'gridSize') =>
        typeof updateData[field] === 'number' ? (updateData[field] as number) : current[field];
      const kx = (size('width') * size('gridSize')) / (current.width * current.gridSize);
      const ky = (size('height') * size('gridSize')) / (current.height * current.gridSize);
      if (kx === 1 && ky === 1) {
        return { updatedMap: await tx.map.update({ where: { id }, data: updateData }), before: current, moved: null };
      }
      const walls = scaledWalls(current.wallSegments, kx, ky);
      const lights = scaledLights(current.lights, kx, ky);
      return {
        updatedMap: await tx.map.update({ where: { id }, data: { ...updateData, wallSegments: toJson(walls), lights: toJson(lights) } }),
        before: current,
        moved: { wallsBefore: current.wallSegments, walls, lightsBefore: current.lights, lights },
      };
    });

    // Open pages hold the walls and lights they loaded, and would go on
    // drawing them where they were, and send them back with their next bulk
    // edit. They are told as a bulk replace is, with no operation id, so the
    // DM's own page takes them too.
    if (moved) {
      await tellMapReadersAs(campaignId, id, 'walls:replaced', (role) => wallsReplacedSentTo(role, id, moved.wallsBefore, moved.walls));
      await tellMapReadersAs(campaignId, id, 'lights:replaced', (role) => lightsReplacedSentTo(role, id, moved.lightsBefore, moved.lights));
    }

    // Any per-map flag change reaches every connected client at once, as one
    // event carrying all of them, so a client never holds a stale flag.
    if (updateData.lightingEnabled !== undefined || updateData.fogEnabled !== undefined || updateData.globalIllumination !== undefined || updateData.explorationEnabled !== undefined) {
      try {
        await tellMapReaders(campaignId, id, 'map:settings:updated', {
          mapId: id,
          lightingEnabled: updatedMap.lightingEnabled,
          fogEnabled: updatedMap.fogEnabled,
          globalIllumination: updatedMap.globalIllumination,
          explorationEnabled: updatedMap.explorationEnabled,
        });
      } catch { /* non-fatal */ }
    }

    // Fog switched on: push the fog state at once. A client asks for it when
    // its flag flips, but the flip it sees first is its own optimistic one,
    // sent before this row was written, and the server had nothing to answer.
    if (updatedMap.fogEnabled && !before.fogEnabled) {
      try {
        await broadcastFogState(getSocketInstance(), campaignId, id, loadFogState(updatedMap, updatedMap.fogData as FogState | null));
      } catch { /* non-fatal */ }
    }

    // Every client gets the map again as they can now see it when the edit
    // changes what it draws or which tokens a player is sent.
    if (MAP_FIELDS_THAT_RESEND_THE_MAP.some((key) => updatedMap[key] !== before[key])) {
      // Only for the map the table is on. A map being edited in the library is
      // nobody's canvas, and map.changed would put every client onto it.
      await resendIfCurrent(campaignId, updatedMap);
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
        message: 'Map not found',
      });
    }

    // The current map is never deleted. Checked and deleted under the
    // campaign's row lock, which making a map current also takes: a switch to
    // this map landing between the check and the delete was undone by it,
    // leaving the campaign with no current map.
    const deleted = await prisma.$transaction(async (tx) => {
      const [campaign] = await tx.$queryRaw<Array<{ currentMapId: string | null }>>`
        SELECT "currentMapId" FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
      if (campaign?.currentMapId === id) return false;
      await tx.map.delete({ where: { id } });
      return true;
    });
    if (!deleted) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Cannot delete the current map. Set a different map as current first.',
      });
    }

    // Combatants that stood on it leave the order with it.
    if (removeCombatants(campaignId, (c) => c.mapId === id)) {
      await resendInitiative(campaignId, { evenWhenEmpty: true });
    }

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
        message: 'Map not found',
      });
    }

    // Under the campaign's row lock, which a delete also takes, and only
    // while the map is still there: one deleted meanwhile answers 404, as an
    // unknown map does, where the foreign key's refusal was a 500.
    const updatedCampaign = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
      if (!(await tx.map.findUnique({ where: { id }, select: { id: true } }))) return null;
      return tx.campaign.update({
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
    });
    if (!updatedCampaign) {
      return res.status(404).json({ error: 'Not Found', message: 'Map not found' });
    }

    // Every page goes onto the new map, each member's as they may see it,
    // whoever asked: the DM's page, another tab or a script.
    try {
      await broadcastMapData(getSocketInstance(), campaignId, map);
    } catch (err) {
      logger.warn('Map not sent to the table; it is current all the same', { err, mapId: id });
    }
    // Which plane each player is on is decided by the current map, and with
    // it which combatants they are sent.
    await resendInitiative(campaignId);

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

// Every route here that changes a map's tokens sends the map again to the
// table, as each member may see it, when it is the map the campaign is
// showing (resendSoonIfCurrent, a moment later), and the initiative order as
// before: the same `map.changed` the DM's `map.change` sends. The web app used to follow each
// call with that emit itself, so a change from a script, a second tab or a
// player's edit to their own token reached nobody.

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
        message: 'Map not found',
      });
    }

    // Validate required token fields
    if (!tokenData.name || typeof tokenData.name !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token name is required',
      });
    }

    // Every other field is checked against the token schemas, shared with the
    // update route and the token templates, and stored as parsed, never as it
    // arrived. imageUrl is optional: a token without one gets a placeholder.
    const shapes = validateTokenShapes(tokenData);
    if (!shapes.ok) {
      return res.status(400).json({ error: 'Validation Error', message: shapes.message });
    }

    const requested = shapes.value.position;
    if (!requested) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token position {x, y} is required',
      });
    }

    // Validate position is within map bounds
    if (requested.x < 0 || requested.x >= map.width ||
        requested.y < 0 || requested.y >= map.height) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Token position must be within map bounds (0-${map.width-1}, 0-${map.height-1})`,
      });
    }
    // And its whole footprint on the map, as the client keeps it on a move.
    // Placing from a library puts a token at the map's centre, so a large
    // creature on a small map would otherwise hang off the far edge.
    const size = shapes.value.size ?? { width: 1, height: 1 };
    const position = clampTokenPosition(requested, size, map);

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
    const normalizedTokenImageUrl = shapes.value.imageUrl
      ? normalizeAssetUrl(shapes.value.imageUrl, 'tokens')
      : null;
    // Art the DM may read: a token's art counts as the campaign using it.
    if (!(await canReferenceAsset(normalizedTokenImageUrl, req.session.userId!, undefined, campaignId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to that image' });
    }

    // Control can only be given to a player of this campaign: the DM needs no
    // naming, and a spectator controls nothing. A token bound to a character
    // is controlled by that character's owner, while they are a player,
    // unless the request names someone else. The controller is who the map is
    // drawn for and who may move the token, on the server and in the client
    // alike, so a client that omits it no longer creates a token its own
    // player cannot use. The character has to be this campaign's: the
    // initiative roll reads the bound sheet, and character ids are visible to
    // every member of any shared campaign.
    const characterId = shapes.value.characterId ?? null;
    // Absent means "the character's owner, while a player"; an explicit null
    // means nobody. The two used to read the same, so a character's token the
    // DM had taken control of came back to its owner whenever it was copied.
    const controllerGiven = shapes.value.controlledBy !== undefined;
    let controlledBy: string | null = shapes.value.controlledBy ?? null;
    if (controlledBy && !(await canHoldTokens(campaignId, controlledBy))) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token controlledBy must name a player of this campaign',
      });
    }
    if (characterId) {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { userId: true, campaignId: true },
      });
      if (!character || character.campaignId !== campaignId) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Token characterId must name a character of this campaign',
        });
      }
      if (!controllerGiven && (await canHoldTokens(campaignId, character.userId))) {
        controlledBy = character.userId;
      }
    }

    // Build the new token with defaults
    const newToken = {
      id: randomUUID(),
      characterId,
      name: tokenData.name,
      imageUrl: normalizedTokenImageUrl || '',
      position,
      size,
      layer,
      visible: shapes.value.visible ?? true,
      controlledBy,
      rotation: shapes.value.rotation ?? 0,
      conditions: shapes.value.conditions ?? [],
      metadata: shapes.value.metadata ?? {},
      type: tokenType,
      disposition: disposition,
      hp: shapes.value.hp ?? null,
      showHpBar: shapes.value.showHpBar ?? false,
      notes: shapes.value.notes ?? '',
      initiative: shapes.value.initiative ?? null,
      // Darkvision in squares; 0 = none. Decides what the server sends this
      // token's owner, so it is set here and by the DM, never by a player.
      sightRadius: shapes.value.sightRadius ?? 0,
      displayMode: displayMode,
      statBlock: shapes.value.statBlock ?? null,
      creatureTemplateId: shapes.value.creatureTemplateId ?? null,
      obscured: shapes.value.obscured ?? false,
    };

    // Appended under the map's lock, to the list as it is then: another
    // write landing between this route's read and its write used to be lost.
    // The token limit is counted there too, so two adds at once cannot both
    // take the last place.
    const appended = await withMapsLocked([mapId], async (tx) => {
      const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      const tokens = readTokens(fresh.tokens);
      if (tokens.length >= MAP_LIMITS.maxTokens) return { full: tokens.length + 1 };
      return { map: await tx.map.update({ where: { id: mapId }, data: { tokens: toJson([...tokens, newToken]) } }) };
    });
    if (appended.full !== undefined) {
      return res.status(400).json({ error: 'Limit Exceeded', message: tooManyTokensMessage(appended.full) });
    }
    const updatedMap = appended.map;
    resendSoonIfCurrent(campaignId, mapId);

    // A player's spirit-layer token placed on the map the table is on moves
    // them to the spirit plane, which changes what they are sent of the
    // order. Skipped while nothing is in it.
    await resendInitiative(campaignId);

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

    // Fetch the map, with the campaign's status for the pause rule below
    // and its current map for the read rule
    const map = await prisma.map.findUnique({
      where: { id: mapId },
      include: { campaign: { select: { status: true, currentMapId: true } } },
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
        message: 'Map not found',
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

    // A player may change tokens only on the map the campaign is showing, as
    // they may only fetch that one: a prepared map answers as if it were not
    // here, even where it holds a token they control.
    if (!canReadMap(membership.role, mapId, map.campaign.currentMapId)) {
      return res.status(404).json({ error: 'Not Found', message: 'Map not found' });
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

    // The same rule the socket move handlers apply: the DM, or a player (never
    // a spectator) whom the token names as its controller.
    const isDM = membership.role === 'DM';
    if (!canControlToken(membership.role, existingToken.controlledBy, userId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update tokens you control',
      });
    }
    // And the same plane rule: a player touches a spirit-plane token only
    // while they can see that plane, as over the socket.
    if (!(await canActOnTokenPlane(membership.role, existingToken, campaignId, userId))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You cannot interact with spirit layer tokens',
      });
    }
    // And the same session rule the socket move events apply: a player's
    // move waits while the session is paused or ended. The DM sets the scene
    // whenever they like.
    if (updates.position !== undefined && !canMoveTokensNow(membership.role, map.campaign.status)) {
      return res.status(403).json({ error: 'Forbidden', message: PAUSED_MOVE_REFUSAL });
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
      // `metadata` is here because nothing reads it structurally and nothing
      // player-facing writes it: leaving it open gave every campaign member a
      // write-only channel into the map's JSON that served no purpose. The
      // create route, which is the only place the app sends metadata at all, is
      // DM-only already.
      // `size` and `sightRadius` are here because both decide what the server
      // sends this player: a token always sees half its own footprint, so a
      // player who could enlarge their token would enlarge their sight.
      const restrictedFields = ['hp', 'notes', 'showHpBar', 'type', 'disposition', 'initiative', 'visible', 'name', 'imageUrl', 'layer', 'controlledBy', 'displayMode', 'statBlock', 'creatureTemplateId', 'metadata', 'sightRadius', 'size', 'obscured'];
      for (const field of restrictedFields) {
        if (updates[field] !== undefined) {
          return res.status(403).json({ error: 'Forbidden', message: `Only DM can update token field: ${field}` });
        }
      }
    }

    // Every field the request carries, checked against the same schemas the
    // create route and the token templates use, and stored as parsed: a
    // position keeps only its square, a rotation is a number of degrees.
    const shapes = validateTokenShapes(updates);
    if (!shapes.ok) {
      return res.status(400).json({ error: 'Validation Error', message: shapes.message });
    }

    // Control can only be handed to a player of this campaign: the DM needs
    // no naming, and a spectator controls nothing.
    if (shapes.value.controlledBy && !(await canHoldTokens(campaignId, shapes.value.controlledBy))) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token controlledBy must name a player of this campaign',
      });
    }

    // New art the DM may read; the art already on the token may stay.
    const nextImageUrl = updates.imageUrl === undefined
      ? undefined
      : shapes.value.imageUrl ? (normalizeAssetUrl(shapes.value.imageUrl, 'tokens') || existingToken.imageUrl) : '';
    if (nextImageUrl !== undefined && !(await canReferenceAsset(nextImageUrl, userId, existingToken.imageUrl, campaignId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to that image' });
    }

    // Build updated token (merge updates with existing). The position and the
    // metadata are worked out under the lock, below.
    const changes: Partial<Token> = {
      ...(shapes.value.name && { name: shapes.value.name }),
      ...(nextImageUrl !== undefined && { imageUrl: nextImageUrl }),
      ...(shapes.value.size && { size: shapes.value.size }),
      ...(updates.layer && { layer: updates.layer }),
      ...(shapes.value.visible !== undefined && { visible: shapes.value.visible }),
      ...(updates.controlledBy !== undefined && { controlledBy: shapes.value.controlledBy ?? null }),
      ...(shapes.value.rotation !== undefined && { rotation: shapes.value.rotation }),
      ...(shapes.value.conditions && { conditions: shapes.value.conditions }),
      ...(updates.type !== undefined && { type: updates.type }),
      ...(updates.disposition !== undefined && { disposition: updates.disposition }),
      ...(updates.hp !== undefined && { hp: shapes.value.hp ?? null }),
      ...(shapes.value.showHpBar !== undefined && { showHpBar: shapes.value.showHpBar }),
      ...(updates.notes !== undefined && { notes: shapes.value.notes ?? '' }),
      ...(updates.initiative !== undefined && { initiative: shapes.value.initiative ?? null }),
      ...(updates.sightRadius !== undefined && { sightRadius: shapes.value.sightRadius ?? 0 }),
      ...(updates.displayMode !== undefined && { displayMode: updates.displayMode }),
      // The parsed value, not the raw one: Zod drops keys the schema does not
      // declare, and storing what arrived instead of what was checked is how
      // undeclared fields survived into sheets and then drifted. The create
      // route above has always stored the parsed value.
      ...(updates.statBlock !== undefined && { statBlock: shapes.value.statBlock ?? null }),
      ...(updates.creatureTemplateId !== undefined && { creatureTemplateId: shapes.value.creatureTemplateId ?? null }),
      ...(shapes.value.obscured !== undefined && { obscured: shapes.value.obscured }),
    };

    // Merged into the token as it is under the map's lock, so a move that
    // landed since this route read it is kept, and written back to the list
    // as it is then. The move is checked and clamped there too, against the
    // map's size and the token's as they are then, and the metadata merged
    // into what the token holds then: a resize or a metadata change landing
    // between this route's read and the lock used to be judged by the old
    // token, leaving it off the map's edge or its metadata written over.
    const requested = shapes.value.position;
    const written = await withMapsLocked([mapId], async (tx): Promise<LockedEdit<{ token: Token; map: MapRow }>> => {
      const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true, width: true, height: true } });
      const tokens = readTokens(fresh.tokens);
      const index = tokens.findIndex((t) => t.id === tokenId);
      if (index === -1) return { status: 404, error: 'Not Found', message: 'Token not found on this map' };
      const current = tokens[index];

      if (requested && (requested.x < 0 || requested.x >= fresh.width || requested.y < 0 || requested.y >= fresh.height)) {
        return {
          status: 400,
          error: 'Validation Error',
          message: `Position must be within map bounds (0-${fresh.width-1}, 0-${fresh.height-1})`,
        };
      }
      // The whole footprint on the map, at the size the token will have.
      const position = requested
        ? clampTokenPosition(requested, shapes.value.size ?? current.size ?? { width: 1, height: 1 }, fresh)
        : undefined;

      // Metadata is merged into what the token already holds, so the size
      // limit has to be checked against the result. Checking only the
      // incoming patch bounded each request and not the column: a sequence
      // of small updates carrying different keys grew the stored object
      // without limit.
      const metadata = shapes.value.metadata ? { ...current.metadata, ...shapes.value.metadata } : undefined;
      if (metadata) {
        const merged = TokenMetadataSchema.safeParse(metadata);
        if (!merged.success) {
          return { status: 400, error: 'Validation Error', message: `Invalid token metadata: ${merged.error.issues[0]?.message ?? 'invalid'}` };
        }
      }

      const token: Token = { ...current, ...changes, ...(position && { position }), ...(metadata && { metadata }) };
      tokens[index] = token;
      const map = await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
      return { done: { token, map } };
    });
    if (!('done' in written)) return sendRefusal(res, written);
    const { token: updatedToken, map: updatedMap } = written.done;
    resendSoonIfCurrent(campaignId, mapId);

    // A combatant's own change follows the token. A layer, visibility or
    // controller change on any token may move a player between planes,
    // which changes what they are sent of the whole order.
    if (updates.layer !== undefined || shapes.value.visible !== undefined || updates.controlledBy !== undefined) {
      await resendInitiative(campaignId);
    } else {
      await resendInitiativeFor(campaignId, tokenId);
    }

    // Answered as the map fetch answers, never with the stored row: that row
    // carries every token, hidden ones included, with notes, stat blocks and
    // hit points, plus the fog grid and the spirit layer, and a player moving
    // their own token could read all of it here.
    // The token too: a player is sent it only if the map would send it to
    // them (visible, on their plane), with the fields they may see, and
    // otherwise null, so the reply never holds what the map beside it leaves out.
    const spiritVisible = await getSpiritVisibility(campaignId, userId);
    return res.status(200).json({
      message: 'Token updated successfully',
      token: isDM ? updatedToken : (filterTokensByRole([updatedToken], membership.role, spiritVisible, userId)[0] ?? null),
      map: filterMapData(updatedMap, membership.role, spiritVisible, userId),
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
 * POST /api/campaigns/:campaignId/maps/:id/tokens/move
 * Move tokens to another map of the campaign, in one step
 * Requires: DM role
 *
 * Each token travels as it is stored, under its own id, clamped onto the
 * target map. A copy and a delete per token used to race (tokens lost or
 * doubled), gave the token a new id (a combatant dropped out of the order)
 * and rebuilt it through the create route's defaults.
 */
router.post('/:id/tokens/move', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id: sourceId } = req.params;
    const parsed = MoveTokensSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid request' });
    }
    const { tokenIds, targetMapId } = parsed.data;
    if (targetMapId === sourceId) {
      return res.status(400).json({ error: 'Validation Error', message: 'The target must be another map' });
    }
    const wanted = new Set(tokenIds);

    const outcome = await withMapsLocked([sourceId, targetMapId], async (tx) => {
      const source = await tx.map.findUnique({ where: { id: sourceId } });
      if (!source || source.campaignId !== campaignId) {
        return { refused: 'Map not found in this campaign' };
      }
      const target = await tx.map.findUnique({ where: { id: targetMapId } });
      if (!target || target.campaignId !== campaignId) {
        return { refused: 'Target map not found in this campaign' };
      }
      const sourceTokens = readTokens(source.tokens);
      const missing = tokenIds.filter((id) => !sourceTokens.some((t) => t.id === id));
      if (missing.length > 0) {
        return { refused: `Token not found on this map: ${missing.join(', ')}` };
      }
      const moved = sourceTokens
        .filter((t) => wanted.has(t.id))
        .map((t) => ({ ...t, position: clampTokenPosition(t.position, t.size, target) }));
      const targetTokens = [...readTokens(target.tokens).filter((t) => !wanted.has(t.id)), ...moved];
      if (targetTokens.length > MAP_LIMITS.maxTokens) {
        return { full: targetTokens.length };
      }
      const updatedSource = await tx.map.update({
        where: { id: sourceId },
        data: { tokens: toJson(sourceTokens.filter((t) => !wanted.has(t.id))) },
      });
      const updatedTarget = await tx.map.update({
        where: { id: targetMapId },
        data: { tokens: toJson(targetTokens) },
      });
      return { moved, updatedSource, updatedTarget };
    });
    if ('refused' in outcome) {
      return res.status(404).json({ error: 'Not Found', message: outcome.refused });
    }
    if (outcome.full !== undefined) {
      return res.status(400).json({ error: 'Limit Exceeded', message: tooManyTokensMessage(outcome.full) });
    }
    const { moved, updatedSource, updatedTarget } = outcome;

    // A combatant follows its token: the order names the map each entry's
    // token is on, and the tracker looks for it there.
    const state = getCombatState(campaignId);
    const inOrder = state.combatants.some((c) => wanted.has(c.tokenId));
    if (inOrder) {
      setCombatState(campaignId, {
        ...state,
        combatants: state.combatants.map((c) => (wanted.has(c.tokenId) ? { ...c, mapId: targetMapId } : c)),
      });
    }

    // Whichever of the two maps the table is on is sent again, as each
    // member may see it; the other is the DM's alone until they switch.
    try {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
      const io = getSocketInstance();
      for (const map of [updatedSource, updatedTarget]) {
        if (campaign?.currentMapId === map.id) await broadcastMapData(io, campaignId, map);
      }
      // Any token, not only a combatant's: moving a player's spirit-layer
      // token onto or off the map the table is on moves them between
      // planes, which changes what they are sent of the whole order.
      if (getCombatState(campaignId).combatants.length > 0) await sendInitiativeState(io, campaignId);
    } catch (error) {
      logger.warn('Table not told of a token move', { err: error });
    }

    return res.status(200).json({ message: `${moved.length} token(s) moved`, moved });
  } catch (error) {
    logger.error('Error moving tokens', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to move tokens' });
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
        message: 'Map not found',
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

    // Removed from the list as it is under the map's lock; several deletes
    // at once used to leave only whichever wrote last.
    await withMapsLocked([mapId], async (tx) => {
      const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      return tx.map.update({ where: { id: mapId }, data: { tokens: toJson(readTokens(fresh.tokens).filter((t) => t.id !== tokenId)) } });
    });
    resendSoonIfCurrent(campaignId, mapId);

    // The entry goes with the token, and the order is sent again without it.
    // Any other token's deletion can move its controller between planes (a
    // player's spirit-layer token), so the order is sent again then too.
    if (removeCombatants(campaignId, (c) => c.tokenId === tokenId)) {
      await resendInitiative(campaignId, { evenWhenEmpty: true });
    } else {
      await resendInitiative(campaignId);
    }

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
 * Returns null if a response was already sent. Another campaign's map, and a
 * prepared map to anyone but the DM, are answered exactly as an id that names
 * nothing, so the answer cannot confirm that a map exists.
 */
async function findMapInCampaign(
  campaignId: string,
  mapId: string,
  res: Response,
  role: string
) {
  const map = await prisma.map.findUnique({ where: { id: mapId } });
  if (!map) {
    res.status(404).json({ error: 'Not Found', message: 'Map not found' });
    return null;
  }
  if (map.campaignId !== campaignId) {
    res.status(404).json({ error: 'Not Found', message: 'Map not found' });
    return null;
  }
  // A prepared map is the DM's alone; to anyone else it is not here.
  if (role !== 'DM') {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
    if (!canReadMap(role, map.id, campaign?.currentMapId)) {
      res.status(404).json({ error: 'Not Found', message: 'Map not found' });
      return null;
    }
  }
  return map;
}

/**
 * The wall, light and fog routes below each read the map's whole list (or fog
 * grid), change it and write it back. They do so under the map's lock, the one
 * the socket edits and the token writes take, and read the list again after
 * taking it, so requests that overlap apply one after another instead of the
 * later one writing the earlier one's change away. A refusal found under the
 * lock comes back as its answer.
 */
type LockedEdit<T> = { status: number; error: string; message: string } | { done: T };

const MAP_GONE = { status: 404, error: 'Not Found', message: 'Map not found' } as const;
const GEOMETRY = { width: true, height: true, gridSize: true } as const;

function sendRefusal(res: Response, refusal: { status: number; error: string; message: string }) {
  return res.status(refusal.status).json({ error: refusal.error, message: refusal.message });
}

/**
 * GET /api/campaigns/:campaignId/maps/:id/walls
 * Return the map's wall segments array (all roles).
 */
router.get('/:id/walls', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, id } = req.params;
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;
    // A locked door goes to anyone but the DM as a closed one.
    return res.status(200).json({ segments: wallsSentTo(req.campaignMembership!.role, map.wallSegments) });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const parsed = WallSegmentsArraySchema.safeParse(req.body.segments);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid segments' });
    }
    const next = parsed.data;
    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<unknown>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { ...GEOMETRY, wallSegments: true } });
      if (!fresh) return MAP_GONE;
      if (wallOutsideMap(next, fresh, fresh.wallSegments)) {
        return { status: 400, error: 'Validation Error', message: WALL_OUTSIDE_MAP_MESSAGE };
      }
      await tx.map.update({ where: { id }, data: { wallSegments: toJson(next) } });
      return { done: fresh.wallSegments };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    // The same events the socket wall edits send, to those who may read the
    // map; a player whose walls are as they were is told nothing.
    const before = outcome.done;
    await tellMapReadersAs(campaignId, id, 'walls:replaced', (role) => wallsReplacedSentTo(role, id, before, next));
    if (wallListChangeReachesPlayers(before, next)) resendSightAfterChange(getSocketInstance(), campaignId, id);
    return res.status(200).json({ segments: next });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const segmentData = { ...req.body, id: req.body.id || randomUUID() };
    const parsed = WallSegmentSchema.safeParse(segmentData);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid segment' });
    }
    if (wallOutsideMap([parsed.data], map)) {
      return res.status(400).json({ error: 'Validation Error', message: WALL_OUTSIDE_MAP_MESSAGE });
    }

    const segment = parsed.data;
    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<number>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { wallSegments: true } });
      if (!fresh) return MAP_GONE;
      const existing = (Array.isArray(fresh.wallSegments) ? fresh.wallSegments : []) as unknown as WallSegment[];
      if (existing.length >= MAX_WALL_SEGMENTS) {
        return { status: 400, error: 'Limit Exceeded', message: TOO_MANY_WALLS_MESSAGE };
      }
      if (existing.some((w) => w.id === segment.id)) {
        return { status: 400, error: 'Validation Error', message: DUPLICATE_WALL_ID_MESSAGE };
      }
      await tx.map.update({ where: { id }, data: { wallSegments: toJson([...existing, segment]) } });
      return { done: existing.length + 1 };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    await tellMapReadersAs(campaignId, id, 'wall:added', (role) => ({
      event: 'wall:added', data: { mapId: id, segment: wallSentTo(role, segment) },
    }));
    resendSightAfterChange(getSocketInstance(), campaignId, id);
    return res.status(201).json({ segment, total: outcome.done });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<null>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { wallSegments: true } });
      if (!fresh) return MAP_GONE;
      const existing = (Array.isArray(fresh.wallSegments) ? fresh.wallSegments : []) as unknown as WallSegment[];
      const filtered = existing.filter((s) => s.id !== sid);
      if (filtered.length === existing.length) {
        return { status: 404, error: 'Not Found', message: 'Wall segment not found' };
      }
      await tx.map.update({ where: { id }, data: { wallSegments: toJson(filtered) } });
      return { done: null };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    await tellMapReaders(campaignId, id, 'wall:removed', { mapId: id, segmentId: sid });
    resendSightAfterChange(getSocketInstance(), campaignId, id);
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    // The types every other wall path accepts, locked doors included.
    const validTypes = WallSegmentSchema.shape.type.options;
    const type = WallSegmentSchema.shape.type.safeParse(req.body.type);
    if (!type.success) {
      return res.status(400).json({ error: 'Validation Error', message: `type must be one of: ${validTypes.join(', ')}` });
    }

    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<{ before: WallSegment; after: WallSegment }>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { wallSegments: true } });
      if (!fresh) return MAP_GONE;
      const existing = (Array.isArray(fresh.wallSegments) ? fresh.wallSegments : []) as unknown as WallSegment[];
      const segIndex = existing.findIndex((s) => s.id === sid);
      if (segIndex === -1) {
        return { status: 404, error: 'Not Found', message: 'Wall segment not found' };
      }
      const before = existing[segIndex];
      existing[segIndex] = { ...before, type: type.data };
      await tx.map.update({ where: { id }, data: { wallSegments: toJson(existing) } });
      return { done: { before, after: existing[segIndex] } };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    // A player whose copy is unchanged, as a closed door locked or unlocked
    // is, is told nothing, and is not sent the map again.
    const { before, after } = outcome.done;
    await tellMapReadersAs(campaignId, id, 'wall:updated', (role) => wallChangeSentTo(role, id, before, after));
    if (wallChangeReachesPlayers(before, after)) resendSightAfterChange(getSocketInstance(), campaignId, id);
    return res.status(200).json({ segment: after });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;
    // A light that is off goes to the DM alone.
    return res.status(200).json({ lights: lightsSentTo(req.campaignMembership!.role, map.lights) });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const parsed = LightSourcesArraySchema.safeParse(req.body.lights);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid lights array' });
    }
    const next = parsed.data;
    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<unknown>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { ...GEOMETRY, lights: true } });
      if (!fresh) return MAP_GONE;
      if (lightOutsideMap(next, fresh, fresh.lights)) {
        return { status: 400, error: 'Validation Error', message: LIGHT_OUTSIDE_MAP_MESSAGE };
      }
      await tx.map.update({ where: { id }, data: { lights: toJson(next) } });
      return { done: fresh.lights };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    // A player whose lights that are on are as they were is told nothing.
    const before = outcome.done;
    await tellMapReadersAs(campaignId, id, 'lights:replaced', (role) => lightsReplacedSentTo(role, id, before, next));
    if (lightListChangeReachesPlayers(before, next)) resendSightAfterChange(getSocketInstance(), campaignId, id);
    return res.status(200).json({ lights: next });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const lightData = { ...req.body, id: req.body.id || randomUUID() };
    const parsed = LightSourceSchema.safeParse(lightData);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid light source' });
    }
    if (lightOutsideMap([parsed.data], map)) {
      return res.status(400).json({ error: 'Validation Error', message: LIGHT_OUTSIDE_MAP_MESSAGE });
    }

    const added = parsed.data;
    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<number>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { lights: true } });
      if (!fresh) return MAP_GONE;
      const existing = (Array.isArray(fresh.lights) ? fresh.lights : []) as unknown as LightSource[];
      if (existing.length >= MAX_LIGHT_SOURCES) {
        return { status: 400, error: 'Limit Exceeded', message: TOO_MANY_LIGHTS_MESSAGE };
      }
      if (existing.some((l) => l.id === added.id)) {
        return { status: 400, error: 'Validation Error', message: DUPLICATE_LIGHT_ID_MESSAGE };
      }
      await tx.map.update({ where: { id }, data: { lights: toJson([...existing, added]) } });
      return { done: existing.length + 1 };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    // A light that is off goes to the DM alone, and players are not sent the
    // map again for it.
    await tellMapReadersAs(campaignId, id, 'light:added', (role) =>
      role === 'DM' || lightReachesPlayers(added) ? { event: 'light:added', data: { mapId: id, light: added } } : null
    );
    if (lightReachesPlayers(added)) resendSightAfterChange(getSocketInstance(), campaignId, id);
    return res.status(201).json({ light: added, total: outcome.done });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const parsed = LightSourceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid update data' });
    }

    const patch = parsed.data;
    let before: LightSource | undefined;
    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<LightSource>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { ...GEOMETRY, lights: true } });
      if (!fresh) return MAP_GONE;
      const existing = (Array.isArray(fresh.lights) ? fresh.lights : []) as unknown as LightSource[];
      const idx = existing.findIndex((l) => l.id === lightId);
      before = existing[idx];
      if (idx === -1) {
        return { status: 404, error: 'Not Found', message: 'Light source not found' };
      }

      const merged = { ...existing[idx], ...patch };
      // The radii are checked against each other as they will be stored, not
      // as the patch sends them: a dim radius alone, under the stored bright
      // one, used to be saved and then made every save of the whole list fail.
      // Only when the patch changes a radius, so a light stored before this
      // check can still be switched on and off.
      const radiusChanged = patch.brightRadius !== undefined || patch.dimRadius !== undefined;
      if (radiusChanged && !(merged.dimRadius >= merged.brightRadius)) {
        return { status: 400, error: 'Validation Error', message: 'dimRadius must be >= brightRadius' };
      }
      if (lightOutsideMap([merged], fresh, [existing[idx]])) {
        return { status: 400, error: 'Validation Error', message: LIGHT_OUTSIDE_MAP_MESSAGE };
      }
      existing[idx] = merged;
      await tx.map.update({ where: { id }, data: { lights: toJson(existing) } });
      return { done: merged };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    // Anyone but the DM has only the lights that are on, so a light that
    // stays off is neither sent to them nor followed by the map.
    const after = outcome.done;
    const was = before ?? after;
    await tellMapReadersAs(campaignId, id, 'light:updated', (role) => lightChangeSentTo(role, id, was, after));
    if (lightChangeReachesPlayers(was, after)) resendSightAfterChange(getSocketInstance(), campaignId, id);
    return res.status(200).json({ light: outcome.done });
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<LightSource>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { lights: true } });
      if (!fresh) return MAP_GONE;
      const existing = (Array.isArray(fresh.lights) ? fresh.lights : []) as unknown as LightSource[];
      const removed = existing.find((l) => l.id === lightId);
      if (!removed) {
        return { status: 404, error: 'Not Found', message: 'Light source not found' };
      }
      await tx.map.update({ where: { id }, data: { lights: toJson(existing.filter((l) => l.id !== lightId)) } });
      return { done: removed };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);

    // A light that was off was the DM's alone, so its going is too.
    const removed = outcome.done;
    await tellMapReadersAs(campaignId, id, 'light:removed', (role) => lightRemovalSentTo(role, id, lightId, removed));
    if (lightReachesPlayers(removed)) resendSightAfterChange(getSocketInstance(), campaignId, id);
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const fog = loadFogState(map, map.fogData as FogState | null);
    return res.status(200).json({ fogState: fog });
  } catch (error) {
    if (error instanceof FogTooLargeError) {
      return res.status(409).json({ error: 'Conflict', message: error.message });
    }
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
    if (!map) return;

    const parsed = FogOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid fog operation' });
    }

    const op = parsed.data;
    const outcome = await withMapsLocked([id], async (tx): Promise<LockedEdit<FogState>> => {
      const fresh = await tx.map.findUnique({ where: { id }, select: { ...GEOMETRY, fogEnabled: true, fogData: true } });
      if (!fresh) return MAP_GONE;
      // The map's flag is the single source of truth, here as on the socket.
      if (!fresh.fogEnabled) {
        return { status: 409, error: 'Conflict', message: 'Fog of war is off for this map' };
      }
      const fog: FogState = loadFogState(fresh, fresh.fogData as FogState | null);
      applyWsFogOperation(fog, op);
      await tx.map.update({ where: { id }, data: { fogData: toJson(fog) } });
      return { done: fog };
    });
    if (!('done' in outcome)) return sendRefusal(res, outcome);
    const fog = outcome.done;

    // Same broadcast as the socket path, so a reveal made here reaches the
    // table at once. No socket server (some tests) means nobody to tell.
    try {
      await broadcastFogState(getSocketInstance(), campaignId, id, fog);
    } catch { /* non-fatal */ }

    return res.status(200).json({ fogState: fog });
  } catch (error) {
    if (error instanceof FogTooLargeError) {
      return res.status(409).json({ error: 'Conflict', message: error.message });
    }
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
    const map = await findMapInCampaign(campaignId, id, res, req.campaignMembership!.role);
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
      await tellMapReaders(campaignId, id, 'map:settings:updated', {
        mapId: id,
        lightingEnabled: updated.lightingEnabled,
        fogEnabled: updated.fogEnabled,
        globalIllumination: updated.globalIllumination,
        explorationEnabled: updated.explorationEnabled,
      });
    } catch {
      // Socket may not be initialized in tests — log and continue
    }

    // See PUT /:id: a lighting change alters which tokens players are sent,
    // and only the map the table is on is anyone's canvas.
    if (updated.lightingEnabled !== map.lightingEnabled) {
      await resendIfCurrent(campaignId, updated);
    }

    return res.status(200).json({ lightingEnabled: updated.lightingEnabled });
  } catch (error) {
    logger.error('Error updating lighting setting', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update lighting setting' });
  }
});

export default router;


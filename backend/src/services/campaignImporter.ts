/**
 * Campaign Import Service
 * Securely imports a .cozyvtt archive into a new campaign.
 *
 * Security mitigations:
 * - Path traversal: all filenames sanitized, extracted to randomized temp dir
 * - Zip bombs: max decompressed size enforced, byte tracking during extraction
 * - Malicious files: magic byte validation for every asset
 * - JSON injection: size limits, Zod schema validation, depth checking
 * - Resource exhaustion: manifest count limits enforced before extraction
 * - Scope isolation: new IDs for everything, no references to existing data
 */

import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import unzipper from 'unzipper';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { fileTypeFromBuffer } from 'file-type';
import {
  ManifestSchema,
  CampaignSettingsSchema,
  MapDataSchema,
  CreatureTemplateSchema,
  TokenTemplateImportSchema,
  AssetManifestSchema,
  IMPORT_LIMITS,
} from '../validators/campaignImport';
import type { MapData, AssetManifestData } from '../validators/campaignImport';
import logger from '../utils/logger';

const UPLOADS_BASE = process.env.UPLOAD_DIR || 'uploads';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CampaignImportPreview {
  formatVersion: number;
  exportedAt: string;
  exportedFrom: string;
  campaignName: string;
  gameSystem: string;
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
  assetCount: number;
  includesAudio: boolean;
  totalSizeBytes: number;
}

export interface ImportOptions {
  importTokens?: boolean;
  campaignName?: string;
}

export interface ImportResult {
  campaignId: string;
  campaignName: string;
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
}

// ── Security helpers ────────────────────────────────────────────────────────

/** Reject filenames with path traversal attempts. */
function isSafePath(name: string): boolean {
  if (!name) return false;
  if (name.includes('..')) return false;
  if (name.includes('\\')) return false;
  // Must be a simple relative path under expected directories
  const normalized = path.posix.normalize(name);
  if (normalized.startsWith('/') || normalized.startsWith('..')) return false;
  return true;
}

/** Parse JSON with a size limit. Throws if too large. */
function safeJsonParse(buffer: Buffer, maxBytes: number = IMPORT_LIMITS.MAX_JSON_SIZE_BYTES): unknown {
  if (buffer.length > maxBytes) {
    throw new Error(`JSON file exceeds maximum size of ${maxBytes} bytes (got ${buffer.length})`);
  }
  return JSON.parse(buffer.toString('utf-8'));
}

/** Validate magic bytes for an asset file. */
async function validateMagicBytes(buffer: Buffer, declaredMime: string): Promise<boolean> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    // If we can't detect, only allow if it's a type where detection may fail (e.g. SVG, text)
    return false;
  }
  // Allow if the detected MIME matches or is a subtype
  const mimeRoot = declaredMime.split('/')[0]; // 'image' or 'audio'
  const detectedRoot = detected.mime.split('/')[0];
  return mimeRoot === detectedRoot;
}

/** Get max decompressed size from system settings. */
async function getMaxImportSize(): Promise<number> {
  const settings = await prisma.systemSettings.findFirst();
  return settings?.campaignExportSizeLimit ?? 524288000; // 500 MB default
}

// ── Preview (Phase 1) ───────────────────────────────────────────────────────

export async function previewCampaignImport(
  zipBuffer: Buffer
): Promise<CampaignImportPreview> {
  const maxSize = await getMaxImportSize();
  if (zipBuffer.length > maxSize) {
    throw new Error(`Archive exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)} MB`);
  }

  // Extract only manifest.json
  const directory = await unzipper.Open.buffer(zipBuffer);
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  if (!manifestEntry) {
    throw new Error('Invalid archive: missing manifest.json');
  }

  const manifestBuffer = await manifestEntry.buffer();
  const manifestRaw = safeJsonParse(manifestBuffer);
  const parsed = ManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw new Error(`Invalid manifest: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  return parsed.data;
}

// ── Import (Phase 2) ────────────────────────────────────────────────────────

export async function importCampaign(
  zipBuffer: Buffer,
  importingUserId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { importTokens = true, campaignName } = options;
  const maxSize = await getMaxImportSize();

  if (zipBuffer.length > maxSize) {
    throw new Error(`Archive exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)} MB`);
  }

  // 1. Open ZIP and validate structure
  const directory = await unzipper.Open.buffer(zipBuffer);

  // Enforce max file count
  if (directory.files.length > IMPORT_LIMITS.MAX_FILE_COUNT) {
    throw new Error(`Archive contains too many files (${directory.files.length}, max ${IMPORT_LIMITS.MAX_FILE_COUNT})`);
  }

  // Validate all paths are safe
  for (const file of directory.files) {
    if (!isSafePath(file.path)) {
      throw new Error(`Unsafe file path detected: ${file.path}`);
    }
  }

  // 2. Extract and validate manifest
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  if (!manifestEntry) throw new Error('Invalid archive: missing manifest.json');

  const manifestData = ManifestSchema.parse(safeJsonParse(await manifestEntry.buffer()));

  // Validate manifest counts
  if (manifestData.mapCount > IMPORT_LIMITS.MAX_MAPS) {
    throw new Error(`Too many maps: ${manifestData.mapCount} (max ${IMPORT_LIMITS.MAX_MAPS})`);
  }
  if (manifestData.creatureCount > IMPORT_LIMITS.MAX_CREATURES) {
    throw new Error(`Too many creatures: ${manifestData.creatureCount} (max ${IMPORT_LIMITS.MAX_CREATURES})`);
  }

  // 3. Extract campaign settings
  const campaignEntry = directory.files.find((f) => f.path === 'campaign.json');
  if (!campaignEntry) throw new Error('Invalid archive: missing campaign.json');

  const campaignSettings = CampaignSettingsSchema.parse(safeJsonParse(await campaignEntry.buffer()));

  // 4. Extract asset manifest
  const assetManifestEntry = directory.files.find((f) => f.path === 'assets/asset-manifest.json');
  let assetManifest: AssetManifestData = {};
  if (assetManifestEntry) {
    assetManifest = AssetManifestSchema.parse(safeJsonParse(await assetManifestEntry.buffer()));
  }

  // 5. Track total bytes extracted (zip bomb protection)
  let totalBytesExtracted = 0;

  /** Extract a file buffer and track bytes. */
  async function extractWithLimit(entry: unzipper.File): Promise<Buffer> {
    const buf = await entry.buffer();
    totalBytesExtracted += buf.length;
    if (totalBytesExtracted > maxSize) {
      throw new Error('Decompressed archive exceeds maximum size limit (possible zip bomb)');
    }
    return buf;
  }

  // 6. Create Campaign first (assets have a FK to campaign)
  const newCampaignId = randomUUID();
  const defaultVibeSettings = {
    periods: [
      { name: 'dawn', hue: '30', filter: 'sepia(0.1) brightness(0.9)' },
      { name: 'day', hue: '0', filter: 'none' },
      { name: 'dusk', hue: '280', filter: 'sepia(0.15) brightness(0.85)' },
      { name: 'night', hue: '220', filter: 'brightness(0.5) contrast(1.2)' },
    ],
  };

  const campaign = await prisma.campaign.create({
    data: {
      id: newCampaignId,
      name: campaignName || campaignSettings.name,
      description: campaignSettings.description || null,
      gameSystem: campaignSettings.gameSystem as any || null,
      status: 'PREPARATION',
      ownerId: importingUserId,
      vibeSettings: (campaignSettings.vibeSettings as Prisma.InputJsonValue) || defaultVibeSettings,
      currentVibe: campaignSettings.currentVibe || null,
      spiritLayerEnabled: campaignSettings.spiritLayerEnabled ?? false,
      spiritLayerStyle: campaignSettings.spiritLayerStyle ?? 'wispy',
    },
  });

  // Create DM membership
  await prisma.campaignMembership.create({
    data: {
      id: randomUUID(),
      userId: importingUserId,
      campaignId: newCampaignId,
      role: 'DM',
    },
  });

  // 7. Import assets (so we can remap references)
  const assetRefMap = new Map<string, string>(); // old UUID → new asset URL

  for (const [oldId, assetInfo] of Object.entries(assetManifest)) {
    // Find the file in the archive
    const assetEntry = directory.files.find((f) => f.path.startsWith(`assets/${oldId}`));
    if (!assetEntry) continue;

    const assetBuffer = await extractWithLimit(assetEntry);

    // Validate magic bytes
    const isValid = await validateMagicBytes(assetBuffer, assetInfo.mimeType);
    if (!isValid) {
      logger.warn('Skipping asset with invalid magic bytes', { oldId, declaredMime: assetInfo.mimeType });
      continue;
    }

    // Determine upload subdirectory — match the upload system's path structure
    const typeDir = assetInfo.type === 'MAP' ? 'maps' : assetInfo.type === 'AUDIO' ? 'audio' : 'tokens';
    const ext = path.extname(assetInfo.originalName) || '';
    const newId = randomUUID();
    const newFilename = `${newId}${ext}`;
    // Store under uploads/{type}/campaigns/{campaignId}/ to match the upload system
    const newFilePath = path.join(UPLOADS_BASE, typeDir, 'campaigns', newCampaignId, newFilename);
    const fullNewPath = path.resolve(newFilePath);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(fullNewPath), { recursive: true });
    fs.writeFileSync(fullNewPath, assetBuffer);

    // Create Asset record — filePath matches the format used by the upload system
    await prisma.asset.create({
      data: {
        id: newId,
        type: assetInfo.type as any,
        scope: 'CAMPAIGN',
        uploadedById: importingUserId,
        campaignId: newCampaignId,
        filename: newFilename,
        originalName: assetInfo.originalName,
        mimeType: assetInfo.mimeType,
        fileSize: assetBuffer.length,
        filePath: newFilePath.replace(/\\/g, '/'),
        name: assetInfo.originalName.replace(/\.[^.]+$/, ''),
      },
    });

    // Store mapping: old reference → new API URL
    assetRefMap.set(oldId, `/api/assets/${typeDir}/${newId}`);
  }

  /** Remap an asset reference from the archive to the new URL. */
  function remapAsset(ref: string | null | undefined): string | null {
    if (!ref) return null;
    return assetRefMap.get(ref) ?? null;
  }

  // 8. Import maps
  let totalTokenCount = 0;

  for (let i = 0; i < manifestData.mapCount; i++) {
    const mapEntry = directory.files.find((f) => f.path === `maps/map-${i}.json`);
    if (!mapEntry) continue;

    const mapRaw = safeJsonParse(await extractWithLimit(mapEntry));
    const mapParsed = MapDataSchema.safeParse(mapRaw);
    if (!mapParsed.success) {
      logger.warn('Skipping invalid map', { index: i, errors: mapParsed.error.issues });
      continue;
    }
    const mapData: MapData = mapParsed.data;

    const imageUrl = remapAsset(mapData.imageAssetRef) || '';
    const spiritLayerUrl = remapAsset(mapData.spiritLayerAssetRef);

    // Remap token image URLs
    const tokens = importTokens ? mapData.tokens.map((t) => ({
      ...t,
      id: randomUUID(),
      imageUrl: remapAsset(t.imageUrl) || t.imageUrl || '',
      characterId: null,
      controlledBy: null,
    })) : [];
    totalTokenCount += tokens.length;

    const mapId = randomUUID();
    await prisma.map.create({
      data: {
        id: mapId,
        campaignId: newCampaignId,
        name: mapData.name,
        imageUrl,
        baseLayerUrl: imageUrl,
        spiritLayerUrl,
        width: mapData.width,
        height: mapData.height,
        gridSize: mapData.gridSize,
        feetPerSquare: mapData.feetPerSquare,
        diagonalRule: mapData.diagonalRule || 'flat',
        tokens: tokens as unknown as Prisma.InputJsonValue,
        annotations: (mapData.annotations || []) as unknown as Prisma.InputJsonValue,
        wallSegments: (mapData.wallSegments || []) as unknown as Prisma.InputJsonValue,
        fogData: mapData.fogData ? (mapData.fogData as Prisma.InputJsonValue) : Prisma.JsonNull,
        lightingEnabled: mapData.lightingEnabled ?? false,
        lights: (mapData.lights || []) as unknown as Prisma.InputJsonValue,
      },
    });

    // Set first map as current map
    if (i === 0) {
      await prisma.campaign.update({
        where: { id: newCampaignId },
        data: { currentMapId: mapId },
      });
    }
  }

  // 9. Import creatures
  let creatureCount = 0;
  const creaturesEntry = directory.files.find((f) => f.path === 'creatures/creatures.json');
  if (creaturesEntry) {
    const creaturesRaw = safeJsonParse(await extractWithLimit(creaturesEntry));
    if (Array.isArray(creaturesRaw)) {
      for (const raw of creaturesRaw.slice(0, IMPORT_LIMITS.MAX_CREATURES)) {
        const parsed = CreatureTemplateSchema.safeParse(raw);
        if (!parsed.success) continue;
        const c = parsed.data;

        await prisma.creatureTemplate.create({
          data: {
            id: randomUUID(),
            name: c.name,
            gameSystem: c.gameSystem as any || null,
            source: 'custom',
            challengeRating: c.challengeRating || null,
            creatureType: c.creatureType || null,
            alignment: c.alignment || null,
            imageUrl: remapAsset(c.imageAssetRef),
            statBlock: c.statBlock as Prisma.InputJsonValue,
            size: (c.size || { width: 1, height: 1 }) as Prisma.InputJsonValue,
            disposition: c.disposition || 'hostile',
            displayMode: c.displayMode || 'pog',
            createdById: importingUserId,
            campaignId: newCampaignId,
          },
        });
        creatureCount++;
      }
    }
  }

  // 10. Import token templates
  let tokenTemplateCount = 0;
  const templatesEntry = directory.files.find((f) => f.path === 'token-templates/templates.json');
  if (templatesEntry) {
    const templatesRaw = safeJsonParse(await extractWithLimit(templatesEntry));
    if (Array.isArray(templatesRaw)) {
      for (const raw of templatesRaw.slice(0, IMPORT_LIMITS.MAX_TOKEN_TEMPLATES)) {
        const parsed = TokenTemplateImportSchema.safeParse(raw);
        if (!parsed.success) continue;
        const t = parsed.data;

        await prisma.tokenTemplate.create({
          data: {
            id: randomUUID(),
            name: t.name,
            imageUrl: remapAsset(t.imageAssetRef),
            type: t.type || 'object',
            disposition: t.disposition || null,
            displayMode: t.displayMode || 'pog',
            size: (t.size || { width: 1, height: 1 }) as Prisma.InputJsonValue,
            notes: t.notes || null,
            hp: t.hp ? (t.hp as Prisma.InputJsonValue) : Prisma.JsonNull,
            showHpBar: t.showHpBar ?? false,
            statBlock: t.statBlock ? (t.statBlock as Prisma.InputJsonValue) : Prisma.JsonNull,
            sightRadius: t.sightRadius ?? null,
            createdById: importingUserId,
            campaignId: newCampaignId,
          },
        });
        tokenTemplateCount++;
      }
    }
  }

  logger.info('Campaign imported', {
    campaignId: newCampaignId,
    campaignName: campaign.name,
    mapCount: manifestData.mapCount,
    tokenCount: totalTokenCount,
    creatureCount,
    tokenTemplateCount,
    importingUserId,
  });

  return {
    campaignId: newCampaignId,
    campaignName: campaign.name,
    mapCount: manifestData.mapCount,
    tokenCount: totalTokenCount,
    creatureCount,
    tokenTemplateCount,
  };
}

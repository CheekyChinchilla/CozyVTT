/**
 * Campaign Import Service
 * Securely imports a .cozyvtt archive into a new campaign.
 *
 * Security mitigations:
 * - Path traversal: every entry path is checked, and files are written under
 *   new names of the importer's choosing
 * - Zip bombs: the archive is read from disk, and each entry is unpacked
 *   through a counter that stops it at its own limit (10 MB for a data file,
 *   the upload limit of its type for a picture or track) and stops the import
 *   once everything unpacked passes the archive limit
 * - Resource exhaustion: the entry count is read from the archive's end and
 *   refused before its directory is read; manifest counts are capped
 * - Malicious files: every asset must be a MAP, TOKEN or AUDIO file whose
 *   bytes are a format the upload route allows for that type, and is stored
 *   under the format and extension its bytes show
 * - JSON injection: size limits, Zod schema validation, depth checking
 * - Scope isolation: new IDs for everything, no references to existing data
 */

import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import type { File as ArchiveEntry } from 'unzipper';
import { Prisma, type GameSystem } from '@prisma/client';
import { prisma } from '../config/database';
import { fileTypeFromFile } from 'file-type';
import {
  ManifestSchema,
  CampaignSettingsSchema,
  MapDataSchema,
  CreatureTemplateSchema,
  TokenTemplateImportSchema,
  AssetManifestSchema,
  IMPORT_LIMITS,
  IMPORTABLE_ASSET_TYPES,
} from '../validators/campaignImport';
import type { MapData, AssetManifestData } from '../validators/campaignImport';

type ImportableAssetType = (typeof IMPORTABLE_ASSET_TYPES)[number];
import { preserveAtmosphereAudio, DEFAULT_VIBE_SETTINGS } from '../utils/vibe-presets';
import { vibePeriodAudioAssetId } from '../utils/vibeAudio';
import {
  isSafeArchivePath,
  openArchiveFile,
  readArchiveEntry,
  writeArchiveEntry,
  ArchiveLimitError,
  UnpackedTotal,
} from '../utils/archive';
import { getFileSizeLimit, isAllowedMimeType, isAllowedExtension } from '../utils/fileUtils';
import { startsWithPdfHeader, startsWithMp3Header } from '../middleware/fileValidation';
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

const MB = 1024 * 1024;
const megabytes = (bytes: number) => `${Math.round(bytes / MB)} MB`;

/**
 * Unpack one of the archive's data files and parse it, within the data-file
 * limit and the archive's running total.
 */
async function readJsonEntry(archivePath: string, entry: ArchiveEntry, total: UnpackedTotal): Promise<unknown> {
  let bytes: Buffer;
  try {
    bytes = await readArchiveEntry(archivePath, entry, { maxEntryBytes: IMPORT_LIMITS.MAX_JSON_SIZE_BYTES, total });
  } catch (error) {
    throw describeLimit(error, entry, total);
  }
  return JSON.parse(bytes.toString('utf-8'));
}

/** Say in words which limit an archive passed, or pass any other error on. */
function describeLimit(error: unknown, entry: ArchiveEntry, total: UnpackedTotal): unknown {
  if (!(error instanceof ArchiveLimitError)) return error;
  if (error.limit === 'total') {
    return new Error(
      `The archive unpacks to more than ${megabytes(total.maxBytes)}, the most this server accepts for one campaign. ` +
        'It may be damaged, or not a CozyVTT export.'
    );
  }
  return new Error(
    `${entry.path} in the archive unpacks to more than ${megabytes(IMPORT_LIMITS.MAX_JSON_SIZE_BYTES)}, ` +
      'more than a campaign archive ever holds there. It may be damaged, or not a CozyVTT export.'
  );
}

/** The archive's size on disk, refused when it is over the limit. */
async function checkArchiveSize(archivePath: string, maxSize: number): Promise<void> {
  const { size } = await fs.promises.stat(archivePath);
  if (size > maxSize) {
    throw new Error(`The archive is ${megabytes(size)}, more than the ${megabytes(maxSize)} this server accepts.`);
  }
}

/**
 * What an imported asset file is, by its bytes, when that is a format the
 * upload route accepts for its type; null otherwise. The same rule as an
 * upload (middleware/fileValidation.ts): the detected type must be on the
 * type's allowlist, and a PDF map or an MP3 the detector does not know is
 * accepted on its header when its name says it is one.
 */
async function identifyAsset(
  filePath: string,
  type: ImportableAssetType,
  originalName: string
): Promise<{ mime: string; ext: string } | null> {
  const detected = await fileTypeFromFile(filePath);
  if (detected) return isAllowedMimeType(type, detected.mime) ? { mime: detected.mime, ext: detected.ext } : null;
  const named = path.extname(originalName).toLowerCase();
  if (type === 'MAP' && named === '.pdf' && (await startsWithPdfHeader(filePath))) return { mime: 'application/pdf', ext: 'pdf' };
  if (type === 'AUDIO' && named === '.mp3' && (await startsWithMp3Header(filePath))) return { mime: 'audio/mpeg', ext: 'mp3' };
  return null;
}

/**
 * The name an imported asset is shown and downloaded under: the archive's,
 * unless its extension is not one its type allows, when the extension its
 * bytes call for replaces it. A picture named `rules.exe` downloads as
 * `rules.png`.
 */
function displayName(originalName: string, type: ImportableAssetType, ext: string): string {
  if (isAllowedExtension(type, path.extname(originalName))) return originalName;
  const base = originalName.replace(/\.[^.]*$/, '') || 'asset';
  return `${base}.${ext}`;
}

/** Get max decompressed size from system settings. */
async function getMaxImportSize(): Promise<number> {
  const settings = await prisma.systemSettings.findFirst();
  return settings?.campaignExportSizeLimit ?? 524288000; // 500 MB default
}

// ── Preview ───────────────────────────────────────────────────────

/**
 * Point each vibe period's audio at the imported copy of its asset.
 *
 * Returns the settings to store, or null when the archive's settings name no
 * audio at all (nothing to change). A value that is not an asset id, or an
 * id the archive's asset manifest does not carry, becomes no audio.
 */
export function remapVibePeriodAudio(
  vibeSettings: unknown,
  assetIdMap: Map<string, string>,
): Record<string, unknown> | null {
  if (!vibeSettings || typeof vibeSettings !== 'object' || Array.isArray(vibeSettings)) return null;
  const settings = vibeSettings as Record<string, unknown>;
  if (!Array.isArray(settings.periods)) return null;

  let touched = false;
  const periods = settings.periods.map((period) => {
    if (!period || typeof period !== 'object' || Array.isArray(period)) return period;
    const p = period as Record<string, unknown>;
    if (p.audio == null) return period;
    touched = true;
    const oldId = vibePeriodAudioAssetId(p.audio);
    return { ...p, audio: (oldId && assetIdMap.get(oldId)) ?? null };
  });

  return touched ? { ...settings, periods } : null;
}

export async function previewCampaignImport(
  archivePath: string
): Promise<CampaignImportPreview> {
  const maxSize = await getMaxImportSize();
  await checkArchiveSize(archivePath, maxSize);

  // Extract only manifest.json
  const directory = await openArchiveFile(archivePath, IMPORT_LIMITS.MAX_FILE_COUNT);
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  if (!manifestEntry) {
    throw new Error('Invalid archive: missing manifest.json');
  }

  const manifestRaw = await readJsonEntry(archivePath, manifestEntry, new UnpackedTotal(maxSize));
  const parsed = ManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw new Error(`Invalid manifest: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  return parsed.data;
}

// ── Import ────────────────────────────────────────────────────────

export async function importCampaign(
  archivePath: string,
  importingUserId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { importTokens = true, campaignName } = options;
  const maxSize = await getMaxImportSize();
  await checkArchiveSize(archivePath, maxSize);

  // 1. Open ZIP and validate structure
  const directory = await openArchiveFile(archivePath, IMPORT_LIMITS.MAX_FILE_COUNT);

  // Enforce max file count
  if (directory.files.length > IMPORT_LIMITS.MAX_FILE_COUNT) {
    throw new Error(`Archive contains too many files (${directory.files.length}, max ${IMPORT_LIMITS.MAX_FILE_COUNT})`);
  }

  // Validate all paths are safe
  for (const file of directory.files) {
    if (!isSafeArchivePath(file.path)) {
      throw new Error(`Unsafe file path detected: ${file.path}`);
    }
  }

  // 2. Extract and validate manifest
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  if (!manifestEntry) throw new Error('Invalid archive: missing manifest.json');

  // Everything unpacked from the archive, against its limit (zip bomb protection).
  const total = new UnpackedTotal(maxSize);

  const manifestData = ManifestSchema.parse(await readJsonEntry(archivePath, manifestEntry, total));

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

  const campaignSettings = CampaignSettingsSchema.parse(await readJsonEntry(archivePath, campaignEntry, total));

  // 4. Extract asset manifest
  const assetManifestEntry = directory.files.find((f) => f.path === 'assets/asset-manifest.json');
  let assetManifest: AssetManifestData = {};
  if (assetManifestEntry) {
    assetManifest = AssetManifestSchema.parse(await readJsonEntry(archivePath, assetManifestEntry, total));
  }

  // 6. Create Campaign first (assets have a FK to campaign)
  const newCampaignId = randomUUID();
  // The same presets a new campaign gets, so an archive with no atmosphere
  // settings imports with the atmosphere the allowlists accept.
  const defaultVibeSettings = JSON.parse(JSON.stringify(DEFAULT_VIBE_SETTINGS)) as Prisma.InputJsonValue;

  const campaign = await prisma.campaign.create({
    data: {
      id: newCampaignId,
      name: campaignName || campaignSettings.name,
      description: campaignSettings.description || null,
      gameSystem: (campaignSettings.gameSystem as GameSystem) || null,
      status: 'PREPARATION',
      ownerId: importingUserId,
      // The archive is a file the importer chose, so its atmosphere track is a
      // client-supplied asset id like any other. A new campaign has none.
      vibeSettings:
        (preserveAtmosphereAudio(campaignSettings.vibeSettings) as Prisma.InputJsonValue) ||
        defaultVibeSettings,
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
  const assetIdMap = new Map<string, string>(); // old UUID → new asset id

  for (const [oldId, assetInfo] of Object.entries(assetManifest)) {
    if (!assetInfo) {
      logger.warn('Skipping asset of a type a campaign archive does not carry', { oldId });
      continue;
    }
    // Find the file in the archive
    const assetEntry = directory.files.find((f) => f.path.startsWith(`assets/${oldId}`));
    if (!assetEntry) continue;

    // Determine upload subdirectory — match the upload system's path structure
    const typeDir = assetInfo.type === 'MAP' ? 'maps' : assetInfo.type === 'AUDIO' ? 'audio' : 'tokens';
    const newId = randomUUID();
    // Store under uploads/{type}/campaigns/{campaignId}/ to match the upload system
    const dir = path.join(UPLOADS_BASE, typeDir, 'campaigns', newCampaignId);
    fs.mkdirSync(path.resolve(dir), { recursive: true });
    // Unpacked under a name with no extension a serving route knows, and
    // named after its content once that is known.
    const unpackedPath = path.resolve(dir, `${newId}.importing`);

    // A picture or track may be as large as an upload of its type, and no larger.
    let assetBytes: number;
    try {
      assetBytes = await writeArchiveEntry(archivePath, assetEntry, unpackedPath, {
        maxEntryBytes: getFileSizeLimit(assetInfo.type),
        total,
      });
    } catch (error) {
      if (error instanceof ArchiveLimitError && error.limit === 'entry') {
        logger.warn('Skipping asset larger than the upload limit for its type', { oldId, type: assetInfo.type });
        continue;
      }
      throw describeLimit(error, assetEntry, total);
    }

    const content = await identifyAsset(unpackedPath, assetInfo.type, assetInfo.originalName);
    if (!content) {
      logger.warn('Skipping asset whose content is not a format its type allows', { oldId, type: assetInfo.type, declaredMime: assetInfo.mimeType });
      fs.rmSync(unpackedPath, { force: true });
      continue;
    }
    const newFilename = `${newId}.${content.ext}`;
    const newFilePath = path.join(dir, newFilename);
    fs.renameSync(unpackedPath, path.resolve(newFilePath));
    const originalName = displayName(assetInfo.originalName, assetInfo.type, content.ext);

    // Create Asset record — filePath matches the format used by the upload system
    await prisma.asset.create({
      data: {
        id: newId,
        type: assetInfo.type,
        scope: 'CAMPAIGN',
        uploadedById: importingUserId,
        campaignId: newCampaignId,
        filename: newFilename,
        originalName,
        mimeType: content.mime,
        fileSize: assetBytes,
        filePath: newFilePath.replace(/\\/g, '/'),
        name: originalName.replace(/\.[^.]+$/, ''),
      },
    });

    // Store mapping: old reference → new API URL
    assetRefMap.set(oldId, `/api/assets/${typeDir}/${newId}`);
    assetIdMap.set(oldId, newId);
  }

  // Vibe periods name audio assets by id; point them at the imported copies.
  // A track the archive does not carry becomes no audio, so an old note or a
  // reference to an asset left out of the export never dangles.
  const remappedVibe = remapVibePeriodAudio(campaignSettings.vibeSettings, assetIdMap);
  if (remappedVibe) {
    await prisma.campaign.update({
      where: { id: newCampaignId },
      data: { vibeSettings: preserveAtmosphereAudio(remappedVibe) as Prisma.InputJsonValue },
    });
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

    const mapRaw = await readJsonEntry(archivePath, mapEntry, total);
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
      imageUrl: remapAsset(t.imageUrl) || '',
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
        // Absent in archives from before 1.5.0: leave the column default, which
        // keeps fog on, as those maps always had it.
        ...(mapData.fogEnabled !== undefined ? { fogEnabled: mapData.fogEnabled } : {}),
        ...(mapData.globalIllumination !== undefined ? { globalIllumination: mapData.globalIllumination } : {}),
        ...(mapData.explorationEnabled !== undefined ? { explorationEnabled: mapData.explorationEnabled } : {}),
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
    const creaturesRaw = await readJsonEntry(archivePath, creaturesEntry, total);
    if (Array.isArray(creaturesRaw)) {
      for (const raw of creaturesRaw.slice(0, IMPORT_LIMITS.MAX_CREATURES)) {
        const parsed = CreatureTemplateSchema.safeParse(raw);
        if (!parsed.success) continue;
        const c = parsed.data;

        await prisma.creatureTemplate.create({
          data: {
            id: randomUUID(),
            name: c.name,
            gameSystem: (c.gameSystem as GameSystem) || null,
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
    const templatesRaw = await readJsonEntry(archivePath, templatesEntry, total);
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

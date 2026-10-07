/**
 * Campaign Export Service
 * Builds a .cozyvtt ZIP archive containing all campaign data:
 * maps, tokens, creatures (custom only), token templates, and asset files.
 *
 * The archive is written to the response as it is made, never held whole:
 * a campaign's pictures can be hundreds of megabytes, in a backend that has
 * a few hundred for every table. Before anything is sent, the files it
 * would hold are added up and an archive over the import limit is refused,
 * since no server on the defaults could take it back.
 *
 * Security: strips all user IDs, server-specific paths, and internal references.
 */

import archiver from 'archiver';
import type { Writable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import fs from 'fs';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { getCampaignArchiveSizeLimit, megabytes } from '../utils/campaignArchiveSize';
import { readTokens } from '../utils/prisma-json';
import { extractAssetId } from '../utils/asset-urls';
import { canReadAsset } from './permissions';

// ── Exported types ──────────────────────────────────────────────────────────

export interface ExportOptions {
  includeAudio?: boolean;
  includeTokens?: boolean;
}

/** Who is exporting: only assets they may read go into the archive. */
export interface ExportViewer {
  userId: string;
  isAdmin: boolean;
}

/** An export checked and ready to write. */
export interface PreparedExport {
  filename: string;
  /** Write the archive to `out`, resolving once all of it has been written. */
  writeTo(out: Writable): Promise<void>;
}

/** The export would make an archive larger than this server takes. */
export class ExportTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportTooLargeError';
  }
}

/**
 * Bytes a ZIP spends on each entry besides its content: two headers and a
 * data descriptor, with the name in both headers. Generous for any name this
 * exporter writes.
 */
const ZIP_BYTES_PER_ENTRY = 256;

// ── Asset reference extractor ───────────────────────────────────────────────

/**
 * Resolve an asset ID to its file path on disk, if the exporting user may read
 * the asset. Returns null if not. An archive is a way of reading every file
 * in it, so what goes in follows the same read rule as the asset routes: a
 * campaign could otherwise name another user's private file and export it.
 */
async function resolveAssetFile(assetId: string, viewer: ExportViewer): Promise<{ filePath: string; mimeType: string; originalName: string; type: string; fileSize: number } | null> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return null;
  if (!(await canReadAsset(asset, viewer.userId, viewer.isAdmin))) return null;

  // asset.filePath is stored as a relative path from the project root (e.g. "uploads/maps/...")
  const fullPath = path.resolve(asset.filePath.replace(/\\/g, '/'));
  if (!fs.existsSync(fullPath)) {
    logger.warn('Asset file not found on disk', { assetId, filePath: asset.filePath, resolvedPath: fullPath });
    return null;
  }

  return {
    filePath: fullPath,
    mimeType: asset.mimeType,
    originalName: asset.originalName,
    type: asset.type,
    fileSize: asset.fileSize,
  };
}

// ── Export service ───────────────────────────────────────────────────────────

export async function prepareCampaignExport(
  campaignId: string,
  viewer: ExportViewer,
  options: ExportOptions = {}
): Promise<PreparedExport> {
  const { includeAudio = false, includeTokens = true } = options;

  // 1. Fetch campaign with all related data
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      maps: true,
      creatureTemplates: { where: { source: 'custom' } },
      tokenTemplates: true,
    },
  });

  if (!campaign) throw new Error('Campaign not found');

  // 2. Collect all asset IDs we need to include
  const assetIds = new Set<string>();
  const assetMap: Map<string, { filePath: string; mimeType: string; originalName: string; type: string; fileSize: number }> = new Map();

  /** Register an asset for inclusion. Returns the UUID reference key. */
  async function registerAsset(url: string | null | undefined): Promise<string | null> {
    const id = extractAssetId(url);
    if (!id) return null;
    if (!assetMap.has(id)) {
      const resolved = await resolveAssetFile(id, viewer);
      if (resolved) {
        // Skip audio files unless explicitly included
        if (resolved.type === 'AUDIO' && !includeAudio) return null;
        assetIds.add(id);
        assetMap.set(id, resolved);
      }
    }
    return assetIds.has(id) ? id : null;
  }

  // 3. Build map data and register map assets
  const mapDataArray: Array<Record<string, unknown>> = [];
  let totalTokenCount = 0;

  for (const map of campaign.maps) {
    const imageRef = await registerAsset(map.imageUrl);
    const baseLayerRef = await registerAsset(map.baseLayerUrl);
    const spiritLayerRef = map.spiritLayerUrl ? await registerAsset(map.spiritLayerUrl) : null;

    // Register token image assets
    const tokens = includeTokens ? readTokens(map.tokens) : [];
    for (const token of tokens) {
      if (token.imageUrl) {
        const tokenAssetRef = await registerAsset(token.imageUrl);
        if (tokenAssetRef) token.imageUrl = tokenAssetRef;
      }
      // Strip server-specific fields
      delete token.characterId;
      delete token.controlledBy;
    }
    totalTokenCount += tokens.length;

    mapDataArray.push({
      name: map.name,
      imageAssetRef: imageRef || baseLayerRef,
      spiritLayerAssetRef: spiritLayerRef,
      width: map.width,
      height: map.height,
      gridSize: map.gridSize,
      feetPerSquare: map.feetPerSquare,
      diagonalRule: map.diagonalRule,
      tokens,
      annotations: map.annotations || [],
      wallSegments: map.wallSegments || [],
      fogData: map.fogData || null,
      lightingEnabled: map.lightingEnabled,
      fogEnabled: map.fogEnabled,
      globalIllumination: map.globalIllumination,
      explorationEnabled: map.explorationEnabled,
      lights: map.lights || [],
    });
  }

  // 4. Build creatures data (custom only, SRD excluded)
  const creaturesData: Array<Record<string, unknown>> = [];
  for (const creature of campaign.creatureTemplates) {
    const imageRef = creature.imageUrl ? await registerAsset(creature.imageUrl) : null;
    creaturesData.push({
      name: creature.name,
      gameSystem: creature.gameSystem,
      challengeRating: creature.challengeRating,
      creatureType: creature.creatureType,
      alignment: creature.alignment,
      imageAssetRef: imageRef,
      statBlock: creature.statBlock,
      size: creature.size,
      disposition: creature.disposition,
      displayMode: creature.displayMode,
    });
  }

  // 5. Build token templates data
  const tokenTemplatesData: Array<Record<string, unknown>> = [];
  for (const template of campaign.tokenTemplates) {
    const imageRef = template.imageUrl ? await registerAsset(template.imageUrl) : null;
    tokenTemplatesData.push({
      name: template.name,
      imageAssetRef: imageRef,
      type: template.type,
      disposition: template.disposition,
      displayMode: template.displayMode,
      size: template.size,
      notes: template.notes,
      hp: template.hp,
      showHpBar: template.showHpBar,
      statBlock: template.statBlock,
      sightRadius: template.sightRadius,
    });
  }

  // 6. Build asset manifest
  const assetManifest: Record<string, { originalName: string; mimeType: string; type: string; fileSize: number }> = {};
  for (const [id, info] of assetMap.entries()) {
    assetManifest[id] = {
      originalName: info.originalName,
      mimeType: info.mimeType,
      type: info.type,
      fileSize: info.fileSize,
    };
  }

  // 7. Calculate total size
  let totalSizeBytes = 0;
  for (const info of assetMap.values()) {
    totalSizeBytes += info.fileSize;
  }

  // 8. Build manifest
  const manifest = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedFrom: `CozyVTT v${process.env.npm_package_version || '1.5.0'}`,
    campaignName: campaign.name,
    gameSystem: campaign.gameSystem || 'NONE',
    mapCount: mapDataArray.length,
    tokenCount: totalTokenCount,
    creatureCount: creaturesData.length,
    tokenTemplateCount: tokenTemplatesData.length,
    assetCount: assetMap.size,
    includesAudio: includeAudio,
    totalSizeBytes,
  };

  // 9. Build campaign settings (strip IDs and user references)
  const campaignSettings = {
    name: campaign.name,
    description: campaign.description,
    gameSystem: campaign.gameSystem,
    vibeSettings: campaign.vibeSettings,
    currentVibe: campaign.currentVibe,
    spiritLayerEnabled: campaign.spiritLayerEnabled,
    spiritLayerStyle: campaign.spiritLayerStyle,
  };

  // 10. The archive's data files, written before the pictures.
  const dataFiles: Array<{ name: string; content: string }> = [
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'campaign.json', content: JSON.stringify(campaignSettings, null, 2) },
    ...mapDataArray.map((map, i) => ({ name: `maps/map-${i}.json`, content: JSON.stringify(map, null, 2) })),
  ];
  if (creaturesData.length > 0) {
    dataFiles.push({ name: 'creatures/creatures.json', content: JSON.stringify(creaturesData, null, 2) });
  }
  if (tokenTemplatesData.length > 0) {
    dataFiles.push({ name: 'token-templates/templates.json', content: JSON.stringify(tokenTemplatesData, null, 2) });
  }
  const assetManifestFile = { name: 'assets/asset-manifest.json', content: JSON.stringify(assetManifest, null, 2) };

  // 11. Refuse an archive larger than an import accepts, before sending any of it.
  const dataBytes = [...dataFiles, assetManifestFile].reduce((sum, f) => sum + Buffer.byteLength(f.content), 0);
  const entryCount = dataFiles.length + 1 + assetMap.size;
  const archiveBytes = totalSizeBytes + dataBytes + entryCount * ZIP_BYTES_PER_ENTRY;
  const limit = await getCampaignArchiveSizeLimit();
  if (archiveBytes > limit) {
    const audioBytes = [...assetMap.values()].filter((a) => a.type === 'AUDIO').reduce((sum, a) => sum + a.fileSize, 0);
    const withoutAudio = archiveBytes - audioBytes;
    const advice =
      audioBytes > 0 && withoutAudio <= limit
        ? `Without audio it is ${megabytes(withoutAudio)}: turn off Include audio assets and export again.`
        : 'Remove maps or pictures the campaign no longer uses, then export again.';
    throw new ExportTooLargeError(
      `This campaign's files add up to ${megabytes(archiveBytes)}, more than the ${megabytes(limit)} a campaign archive can hold on this server. ${advice}`
    );
  }

  const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const filename = `${safeName}-export.cozyvtt`;

  return {
    filename,
    async writeTo(out: Writable): Promise<void> {
      const archive = archiver('zip', { zlib: { level: 6 } });
      const written = pipeline(archive, out);

      for (const file of dataFiles) archive.append(file.content, { name: file.name });
      // Pictures and sound are compressed already; packing them again costs
      // the server time and saves nothing, and stored they take exactly the
      // space the size check above counted.
      for (const [id, info] of assetMap.entries()) {
        const ext = path.extname(info.originalName) || mimeToExt(info.mimeType);
        const entry: archiver.ZipEntryData = { name: `assets/${id}${ext}`, store: true };
        archive.file(info.filePath, entry);
      }
      archive.append(assetManifestFile.content, { name: assetManifestFile.name });
      // An error here reaches `written` too, which is where it is handled.
      archive.finalize().catch(() => undefined);

      try {
        await written;
      } catch (error) {
        // The caller hung up, or a file could not be read: stop reading the rest.
        archive.abort();
        throw error;
      }

      logger.info('Campaign exported', {
        campaignId,
        mapCount: mapDataArray.length,
        creatureCount: creaturesData.length,
        tokenTemplateCount: tokenTemplatesData.length,
        assetCount: assetMap.size,
        archiveSize: archive.pointer(),
      });
    },
  };
}

/** Map MIME type to file extension. */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'application/pdf': '.pdf',
  };
  return map[mime] || '';
}

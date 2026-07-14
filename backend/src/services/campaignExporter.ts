/**
 * Campaign Export Service
 * Builds a .cozyvtt ZIP archive containing all campaign data:
 * maps, tokens, creatures (custom only), token templates, and asset files.
 *
 * Security: strips all user IDs, server-specific paths, and internal references.
 */

import archiver from 'archiver';
import { PassThrough } from 'stream';
import path from 'path';
import fs from 'fs';
import { prisma } from '../config/database';
import logger from '../utils/logger';

// ── Exported types ──────────────────────────────────────────────────────────

export interface ExportOptions {
  includeAudio?: boolean;
  includeTokens?: boolean;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
}

// ── Asset reference extractor ───────────────────────────────────────────────

/** Extract a UUID from an asset URL like "/api/assets/maps/uuid" or just "uuid". */
function extractAssetId(url: string | null | undefined): string | null {
  if (!url) return null;
  // Strip /api/assets/{type}/ prefix if present
  const match = url.match(/\/api\/assets\/\w+\/([0-9a-f-]+)$/i);
  if (match) return match[1];
  // Check if it's already a UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url)) return url;
  return null;
}

/** Resolve an asset ID to its file path on disk. Returns null if not found. */
async function resolveAssetFile(assetId: string): Promise<{ filePath: string; mimeType: string; originalName: string; type: string; fileSize: number } | null> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return null;

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

export async function exportCampaign(
  campaignId: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
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
      const resolved = await resolveAssetFile(id);
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
    const tokens = (includeTokens ? (map.tokens as any[]) || [] : []);
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
    exportedFrom: `CozyVTT v${process.env.npm_package_version || '1.1.0'}`,
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

  // 10. Create ZIP archive
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const buffers: Buffer[] = [];
    const passthrough = new PassThrough();

    passthrough.on('data', (chunk: Buffer) => buffers.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(buffers)));
    passthrough.on('error', reject);
    archive.on('error', reject);

    archive.pipe(passthrough);

    // Add JSON files
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.append(JSON.stringify(campaignSettings, null, 2), { name: 'campaign.json' });

    // Add map files
    for (let i = 0; i < mapDataArray.length; i++) {
      archive.append(JSON.stringify(mapDataArray[i], null, 2), { name: `maps/map-${i}.json` });
    }

    // Add creatures
    if (creaturesData.length > 0) {
      archive.append(JSON.stringify(creaturesData, null, 2), { name: 'creatures/creatures.json' });
    }

    // Add token templates
    if (tokenTemplatesData.length > 0) {
      archive.append(JSON.stringify(tokenTemplatesData, null, 2), { name: 'token-templates/templates.json' });
    }

    // Add asset files
    for (const [id, info] of assetMap.entries()) {
      const ext = path.extname(info.originalName) || mimeToExt(info.mimeType);
      archive.file(info.filePath, { name: `assets/${id}${ext}` });
    }

    // Add asset manifest
    archive.append(JSON.stringify(assetManifest, null, 2), { name: 'assets/asset-manifest.json' });

    archive.finalize();
  });

  const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const filename = `${safeName}-export.cozyvtt`;

  logger.info('Campaign exported', {
    campaignId,
    mapCount: mapDataArray.length,
    creatureCount: creaturesData.length,
    tokenTemplateCount: tokenTemplatesData.length,
    assetCount: assetMap.size,
    archiveSize: buffer.length,
  });

  return { buffer, filename };
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

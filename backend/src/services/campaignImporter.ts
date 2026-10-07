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
 * - JSON injection: size limits, Zod schema validation, and a limit on how
 *   deeply a data file nests (IMPORT_LIMITS.MAX_JSON_DEPTH), checked on its
 *   text before it is parsed
 * - Scope isolation: new IDs for everything, no references to existing data
 *
 * All or nothing: the pictures and tracks are unpacked into a staging folder,
 * every row is written in one transaction, and the files are moved to where
 * the upload system keeps them only once that has committed. An import that
 * fails at any point leaves no campaign and no files.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import type { File as ArchiveEntry } from 'unzipper';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { fileTypeFromFile } from 'file-type';
import {
  ManifestSchema,
  CampaignSettingsSchema,
  AssetManifestSchema,
  AssetEntrySchema,
  IMPORT_LIMITS,
  IMPORTABLE_ASSET_TYPES,
} from '../validators/campaignImport';
import type { AssetManifestData, AssetEntryData } from '../validators/campaignImport';
import {
  ImportReport,
  prepareMap,
  prepareCreature,
  prepareTokenTemplate,
  importedGameSystem,
  label,
  type SkippedItem,
  type SkippedKind,
} from './campaignImportContent';
import { preserveAtmosphereAudio, DEFAULT_VIBE_SETTINGS } from '../utils/vibe-presets';
import { vibePeriodAudioAssetId } from '../utils/vibeAudio';
import {
  isSafeArchivePath,
  openArchiveFile,
  readArchiveEntry,
  writeArchiveEntry,
  ArchiveLimitError,
  ArchiveRefusedError,
  UnpackedTotal,
} from '../utils/archive';
import { getFileSizeLimit, getTempDirectory, isAllowedMimeType, isAllowedExtension, ALLOWED_EXTENSIONS } from '../utils/fileUtils';
import { errorMessage } from '../utils/errors';
import { startsWithMp3Header } from '../middleware/fileValidation';
import { getCampaignArchiveSizeLimit, megabytes } from '../utils/campaignArchiveSize';
import logger from '../utils/logger';

const UPLOADS_BASE = process.env.UPLOAD_DIR || 'uploads';

type ImportableAssetType = (typeof IMPORTABLE_ASSET_TYPES)[number];

/**
 * Where an import keeps what it is still working on: the uploaded archive,
 * and a staging folder for the files it unpacks. Inside the uploads volume,
 * so moving a file into place is a rename, never a copy.
 */
export function importTempDirectory(): string {
  return path.join(getTempDirectory(), 'campaign-imports');
}

/**
 * How long the transaction that writes an import may stay open. It reads
 * each map from the archive as it writes it, so a large archive's maps are
 * never held in memory together; fifty 10 MB maps take well under a minute.
 */
const IMPORT_TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000;

/** What an import that failed for a reason of the server's own answers. */
export const IMPORT_FAILED_MESSAGE =
  'The campaign could not be saved, so nothing was imported. The server log has the details.';

/**
 * The import failed for a reason the archive did not cause, such as a
 * database or disk error, and nothing of it was kept.
 */
export class CampaignImportFailedError extends Error {
  constructor() {
    super(IMPORT_FAILED_MESSAGE);
    this.name = 'CampaignImportFailedError';
  }
}

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
  /** What was created, which may be fewer than the archive held. */
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
  /** What was imported in a changed form, in words. */
  warnings: string[];
  /** What was left out, and why. */
  skipped: SkippedItem[];
}

// ── Security helpers ────────────────────────────────────────────────────────

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
  const text = bytes.toString('utf-8');
  // Checked on the text, before parsing: nothing that walks the parsed data
  // later, the validation or the database's own encoder, then meets more
  // levels than an export ever writes.
  if (jsonNestsDeeperThan(text, IMPORT_LIMITS.MAX_JSON_DEPTH)) throw new NestedTooDeepError(entry.path);
  try {
    return JSON.parse(text);
  } catch {
    throw new ArchiveRefusedError(`${entry.path} in the archive is damaged: it is not readable data.`);
  }
}

/** Why an item whose data nests too deeply is left out. */
const NESTED_TOO_DEEP_REASON = `Its data nests deeper than the ${IMPORT_LIMITS.MAX_JSON_DEPTH} levels CozyVTT ever writes.`;

/**
 * A data file nests deeper than an export ever writes. Refuses the archive,
 * unless the file holds one map, or the creatures or templates, which are
 * then left out.
 */
class NestedTooDeepError extends ArchiveRefusedError {
  constructor(file: string) {
    super(
      `${file} in the archive nests deeper than the ${IMPORT_LIMITS.MAX_JSON_DEPTH} levels CozyVTT ever writes. ` +
        'It may be damaged, or not a CozyVTT export.'
    );
    this.name = 'NestedTooDeepError';
  }
}

/**
 * Whether JSON text nests objects and lists more than `max` deep, read
 * without parsing it: a bracket inside a string does not count.
 */
export function jsonNestsDeeperThan(text: string, max: number): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++; // a backslash escapes the next character
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) {
      inString = true;
    } else if (c === 0x7b || c === 0x5b) {
      if (++depth > max) return true;
    } else if (c === 0x7d || c === 0x5d) {
      depth--;
    }
  }
  return false;
}

/**
 * Read the archive's creatures or templates, or nothing, listed as left
 * out, when the file nests deeper than an export ever writes.
 */
async function readListEntry(
  archivePath: string,
  entry: ArchiveEntry,
  total: UnpackedTotal,
  kind: SkippedKind,
  what: string,
  report: ImportReport
): Promise<unknown> {
  try {
    return await readJsonEntry(archivePath, entry, total);
  } catch (error) {
    if (!(error instanceof NestedTooDeepError)) throw error;
    report.skip(kind, `${what} in the archive`, NESTED_TOO_DEEP_REASON);
    return [];
  }
}

/** Say in words which limit an archive passed, or pass any other error on. */
function describeLimit(error: unknown, entry: ArchiveEntry, total: UnpackedTotal): unknown {
  if (!(error instanceof ArchiveLimitError)) return error;
  if (error.limit === 'total') {
    return new ArchiveRefusedError(
      `The archive unpacks to more than ${megabytes(total.maxBytes)}, the most this server accepts for one campaign. ` +
        'It may be damaged, or not a CozyVTT export.'
    );
  }
  return new ArchiveRefusedError(
    `${entry.path} in the archive unpacks to more than ${megabytes(IMPORT_LIMITS.MAX_JSON_SIZE_BYTES)}, ` +
      'more than a campaign archive ever holds there. It may be damaged, or not a CozyVTT export.'
  );
}

/** Parse one of the archive's own files with `schema`, refusing the archive in words when it does not fit. */
function parseArchiveFile<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  throw new ArchiveRefusedError(`${file} in the archive is not one CozyVTT can read${where}: ${issue?.message ?? 'invalid'}`);
}

/** The archive's size on disk, refused when it is over the limit. */
async function checkArchiveSize(archivePath: string, maxSize: number): Promise<void> {
  const { size } = await fs.promises.stat(archivePath);
  if (size > maxSize) {
    throw new ArchiveRefusedError(`The archive is ${megabytes(size)}, more than the ${megabytes(maxSize)} this server accepts.`);
  }
}

/**
 * What an imported asset file is, by its bytes, when that is a format the
 * upload route accepts for its type; null otherwise. The same rule as an
 * upload (middleware/fileValidation.ts): the detected type must be on the
 * type's allowlist, and an MP3 the detector does not know is accepted on its
 * header when its name says it is one.
 */
async function identifyAsset(
  filePath: string,
  type: ImportableAssetType,
  originalName: string
): Promise<{ mime: string; ext: string } | null> {
  const detected = await fileTypeFromFile(filePath);
  if (detected) return isAllowedMimeType(type, detected.mime) ? { mime: detected.mime, ext: detected.ext } : null;
  const named = path.extname(originalName).toLowerCase();
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

/**
 * The campaign's ambient track, pointed at the imported copy of its file,
 * with its volume and looping as the Atmosphere panel stores them; or
 * undefined when the archive names no track this import brought in.
 */
export function remapAtmosphereAudio(
  vibeSettings: unknown,
  audioIdMap: Map<string, string>,
): { assetId: string; volume: number; loop: boolean } | undefined {
  if (!vibeSettings || typeof vibeSettings !== 'object' || Array.isArray(vibeSettings)) return undefined;
  const ambient = (vibeSettings as Record<string, unknown>).atmosphereAudio;
  if (!ambient || typeof ambient !== 'object' || Array.isArray(ambient)) return undefined;
  const { assetId, volume, loop } = ambient as Record<string, unknown>;
  const oldId = vibePeriodAudioAssetId(assetId);
  const newId = oldId ? audioIdMap.get(oldId) : undefined;
  if (!newId) return undefined;
  return {
    assetId: newId,
    volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5,
    loop: loop !== false,
  };
}

/**
 * Say which atmosphere tracks the archive names but does not hold: an
 * export made without "Include audio assets", or by a version whose export
 * never included sound.
 */
function sayMissingTracks(vibeSettings: unknown, audioIdMap: Map<string, string>, ambientKept: boolean, report: ImportReport): void {
  if (!vibeSettings || typeof vibeSettings !== 'object' || Array.isArray(vibeSettings)) return;
  const settings = vibeSettings as Record<string, unknown>;
  const periods = Array.isArray(settings.periods) ? settings.periods : [];
  const missing = periods
    .filter((p): p is Record<string, unknown> => p !== null && typeof p === 'object' && !Array.isArray(p))
    .filter((p) => {
      const id = vibePeriodAudioAssetId(p.audio);
      return id !== null && !audioIdMap.has(id);
    })
    .map((p) => label(p.name, 'unnamed'));
  if (missing.length > 0) {
    const names = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
    report.warn(
      `The archive holds no track for the atmosphere's ${names} ${missing.length === 1 ? 'period' : 'periods'}, so ${missing.length === 1 ? 'it has' : 'they have'} none. ` +
        'Export with Include audio assets ticked to bring tracks across.'
    );
  }
  const ambient = settings.atmosphereAudio;
  const ambientId = ambient && typeof ambient === 'object' ? vibePeriodAudioAssetId((ambient as Record<string, unknown>).assetId) : null;
  if (ambientId && !ambientKept) {
    report.warn('The archive holds no file for the ambient track, so none is playing. Export with Include audio assets ticked to bring it across.');
  }
}

export async function previewCampaignImport(
  archivePath: string
): Promise<CampaignImportPreview> {
  const maxSize = await getCampaignArchiveSizeLimit();
  await checkArchiveSize(archivePath, maxSize);

  // Extract only manifest.json
  const directory = await openArchiveFile(archivePath, IMPORT_LIMITS.MAX_FILE_COUNT);
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  if (!manifestEntry) {
    throw new ArchiveRefusedError('Invalid archive: missing manifest.json');
  }

  const manifestRaw = await readJsonEntry(archivePath, manifestEntry, new UnpackedTotal(maxSize));
  const parsed = ManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw new ArchiveRefusedError(`Invalid manifest: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  return parsed.data;
}

// ── Import ────────────────────────────────────────────────────────

/** A picture or track unpacked into the staging folder, waiting for the campaign to be saved. */
interface StagedAsset {
  oldId: string;
  newId: string;
  type: ImportableAssetType;
  /** The folder its kind lives in under the uploads folder, and in its address. */
  typeDir: 'maps' | 'tokens' | 'audio';
  stagedPath: string;
  /** Where it is moved once the campaign is saved, as the asset row records it. */
  finalPath: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
}

/** Each kind of asset an archive carries, in words. */
const ASSET_KIND_WORDS: Record<ImportableAssetType, string> = {
  MAP: 'a map picture',
  TOKEN: 'a token picture',
  AUDIO: 'a sound file',
};

/** The folder each kind of imported asset is kept in, as uploads keep them. */
function folderFor(type: ImportableAssetType): StagedAsset['typeDir'] {
  return type === 'MAP' ? 'maps' : type === 'AUDIO' ? 'audio' : 'tokens';
}

/**
 * Unpack every asset the manifest lists into `staging`, identify each by its
 * bytes, and name it after what it is. An asset that is missing, over its
 * type's upload limit, or not a format its type allows is left out.
 */
async function stageAssets(
  archivePath: string,
  files: ArchiveEntry[],
  assetManifest: AssetManifestData,
  total: UnpackedTotal,
  staging: string,
  campaignId: string,
  report: ImportReport
): Promise<StagedAsset[]> {
  const staged: StagedAsset[] = [];
  for (const [oldId, rawInfo] of Object.entries(assetManifest)) {
    const fields = rawInfo !== null && typeof rawInfo === 'object' ? (rawInfo as Record<string, unknown>) : {};
    const parsedInfo = AssetEntrySchema.safeParse(rawInfo);
    if (!parsedInfo.success) {
      const notCarried = typeof fields.type === 'string' && !(IMPORTABLE_ASSET_TYPES as readonly string[]).includes(fields.type);
      report.skip(
        'asset',
        label(fields.originalName, oldId),
        notCarried
          ? 'A campaign archive carries map pictures, token pictures and audio, and this is none of them.'
          : 'Its entry in the archive cannot be read.'
      );
      continue;
    }
    const assetInfo: AssetEntryData = parsedInfo.data;
    const assetEntry = files.find((f) => f.path.startsWith(`assets/${oldId}`));
    if (!assetEntry) {
      report.skip('asset', label(assetInfo.originalName, oldId), 'Its file is missing from the archive.');
      continue;
    }

    const newId = randomUUID();
    // Unpacked under a name with no extension a serving route knows, and
    // named after its content once that is known.
    const unpackedPath = path.join(staging, `${newId}.importing`);

    // A picture or track may be as large as an upload of its type, and no larger.
    let fileSize: number;
    try {
      fileSize = await writeArchiveEntry(archivePath, assetEntry, unpackedPath, {
        maxEntryBytes: getFileSizeLimit(assetInfo.type),
        total,
      });
    } catch (error) {
      if (error instanceof ArchiveLimitError && error.limit === 'entry') {
        report.skip(
          'asset',
          label(assetInfo.originalName, oldId),
          `It is larger than the ${megabytes(getFileSizeLimit(assetInfo.type))} an upload of its kind may be.`
        );
        continue;
      }
      throw describeLimit(error, assetEntry, total);
    }

    const content = await identifyAsset(unpackedPath, assetInfo.type, assetInfo.originalName);
    if (!content) {
      logger.warn('Skipping asset whose content is not a format its type allows', { oldId, type: assetInfo.type, declaredMime: assetInfo.mimeType });
      report.skip(
        'asset',
        label(assetInfo.originalName, oldId),
        `Its content is not a format ${ASSET_KIND_WORDS[assetInfo.type]} can be (${ALLOWED_EXTENSIONS[assetInfo.type].join(', ')}).`
      );
      await fs.promises.rm(unpackedPath, { force: true });
      continue;
    }
    const filename = `${newId}.${content.ext}`;
    const stagedPath = path.join(staging, filename);
    await fs.promises.rename(unpackedPath, stagedPath);
    const typeDir = folderFor(assetInfo.type);
    staged.push({
      oldId,
      newId,
      type: assetInfo.type,
      typeDir,
      stagedPath,
      // Stored under uploads/{type}/campaigns/{campaignId}/, as the upload system stores them.
      finalPath: path.join(UPLOADS_BASE, typeDir, 'campaigns', campaignId, filename),
      filename,
      originalName: displayName(assetInfo.originalName, assetInfo.type, content.ext),
      mimeType: content.mime,
      fileSize,
    });
  }
  return staged;
}

/** Move a file, copying it when it has to cross from one disk to another. */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.promises.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await fs.promises.copyFile(from, to);
    await fs.promises.rm(from, { force: true });
  }
}

/** Move every staged file to where its asset row says it is. */
async function moveIntoPlace(assets: StagedAsset[]): Promise<void> {
  for (const asset of assets) {
    await fs.promises.mkdir(path.resolve(path.dirname(asset.finalPath)), { recursive: true });
    await moveFile(asset.stagedPath, path.resolve(asset.finalPath));
  }
}

/**
 * Take back a campaign whose rows were saved but whose files could not be
 * put in place: its asset rows (which outlive a deleted campaign), the
 * campaign with everything that cascades from it, and its folders.
 */
async function undoImport(campaignId: string): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.asset.deleteMany({ where: { campaignId } }),
      prisma.campaign.deleteMany({ where: { id: campaignId } }),
    ]);
  } catch (error) {
    logger.error('Could not remove a campaign whose import failed after it was saved', { campaignId, error: errorMessage(error) });
  }
  for (const typeDir of ['maps', 'tokens', 'audio'] as const) {
    await fs.promises
      .rm(path.resolve(UPLOADS_BASE, typeDir, 'campaigns', campaignId), { recursive: true, force: true })
      .catch(() => undefined);
  }
}

export async function importCampaign(
  archivePath: string,
  importingUserId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { importTokens = true, campaignName } = options;
  const maxSize = await getCampaignArchiveSizeLimit();
  await checkArchiveSize(archivePath, maxSize);

  // 1. Open ZIP and validate structure
  const directory = await openArchiveFile(archivePath, IMPORT_LIMITS.MAX_FILE_COUNT);

  // Enforce max file count
  if (directory.files.length > IMPORT_LIMITS.MAX_FILE_COUNT) {
    throw new ArchiveRefusedError(`Archive contains too many files (${directory.files.length}, max ${IMPORT_LIMITS.MAX_FILE_COUNT})`);
  }

  // Validate all paths are safe
  for (const file of directory.files) {
    if (!isSafeArchivePath(file.path)) {
      throw new ArchiveRefusedError(`Unsafe file path detected: ${file.path}`);
    }
  }

  // 2. Extract and validate manifest
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  if (!manifestEntry) throw new ArchiveRefusedError('Invalid archive: missing manifest.json');

  // Everything unpacked from the archive, against its limit (zip bomb protection).
  const total = new UnpackedTotal(maxSize);

  const manifestData = parseArchiveFile(ManifestSchema, await readJsonEntry(archivePath, manifestEntry, total), 'manifest.json');

  // 3. Extract campaign settings
  const campaignEntry = directory.files.find((f) => f.path === 'campaign.json');
  if (!campaignEntry) throw new ArchiveRefusedError('Invalid archive: missing campaign.json');

  const campaignSettings = parseArchiveFile(CampaignSettingsSchema, await readJsonEntry(archivePath, campaignEntry, total), 'campaign.json');

  // 4. Extract asset manifest
  const assetManifestEntry = directory.files.find((f) => f.path === 'assets/asset-manifest.json');
  let assetManifest: AssetManifestData = {};
  if (assetManifestEntry) {
    assetManifest = parseArchiveFile(
      AssetManifestSchema,
      await readJsonEntry(archivePath, assetManifestEntry, total),
      'assets/asset-manifest.json'
    );
  }

  const newCampaignId = randomUUID();
  const report = new ImportReport();
  const staging = path.join(importTempDirectory(), `${newCampaignId}.staging`);
  await fs.promises.mkdir(path.resolve(staging), { recursive: true });

  try {
    // 5. Unpack the pictures and tracks, so their new ids are known.
    const assets = await stageAssets(archivePath, directory.files, assetManifest, total, path.resolve(staging), newCampaignId, report);
    const assetRefMap = new Map(assets.map((a) => [a.oldId, `/api/assets/${a.typeDir}/${a.newId}`])); // old id → new address
    // Old id → new id, for the sound files this import brought in: the only
    // assets the atmosphere may name.
    const audioIdMap = new Map(assets.filter((a) => a.type === 'AUDIO').map((a) => [a.oldId, a.newId]));

    /** Remap an asset reference from the archive to the new URL. */
    const remapAsset = (ref: string | null | undefined): string | null => (ref ? (assetRefMap.get(ref) ?? null) : null);

    // The same presets a new campaign gets, so an archive with no atmosphere
    // settings imports with the atmosphere the allowlists accept.
    const defaultVibeSettings = JSON.parse(JSON.stringify(DEFAULT_VIBE_SETTINGS)) as Prisma.InputJsonValue;
    // Vibe periods name audio assets by id; point them at the imported copies.
    // A track the archive does not carry becomes no audio, so an old note or a
    // reference to an asset left out of the export never dangles.
    const periodsRemapped =
      remapVibePeriodAudio(campaignSettings.vibeSettings, audioIdMap) ?? campaignSettings.vibeSettings;
    // The archive is a file the importer chose, so its ambient track is a
    // client-supplied asset id like any other and is never kept as it is.
    // It is pointed at this import's own copy of the file instead, an asset
    // of the new campaign, or dropped.
    const ambient = remapAtmosphereAudio(campaignSettings.vibeSettings, audioIdMap);
    sayMissingTracks(campaignSettings.vibeSettings, audioIdMap, ambient !== undefined, report);
    const keptVibe = preserveAtmosphereAudio(periodsRemapped);
    const vibeSettings =
      keptVibe && typeof keptVibe === 'object' && ambient ? { ...(keptVibe as Record<string, unknown>), atmosphereAudio: ambient } : keptVibe;
    const name = campaignName || campaignSettings.name;
    const gameSystem = importedGameSystem(campaignSettings.gameSystem, "The campaign's", report);

    // 6. Every row in one transaction: a failure anywhere leaves none of them.
    let counts: Pick<ImportResult, 'mapCount' | 'tokenCount' | 'creatureCount' | 'tokenTemplateCount'>;
    try {
      counts = await prisma.$transaction(
        async (tx) => {
          await tx.campaign.create({
            data: {
              id: newCampaignId,
              name,
              description: campaignSettings.description || null,
              gameSystem,
              status: 'PREPARATION',
              ownerId: importingUserId,
              vibeSettings: (vibeSettings as Prisma.InputJsonValue) || defaultVibeSettings,
              currentVibe: campaignSettings.currentVibe || null,
              spiritLayerEnabled: campaignSettings.spiritLayerEnabled ?? false,
              spiritLayerStyle: campaignSettings.spiritLayerStyle ?? 'wispy',
            },
          });
          await tx.campaignMembership.create({
            data: { id: randomUUID(), userId: importingUserId, campaignId: newCampaignId, role: 'DM' },
          });
          if (assets.length > 0) {
            await tx.asset.createMany({
              data: assets.map((a) => ({
                id: a.newId,
                type: a.type,
                scope: 'CAMPAIGN' as const,
                uploadedById: importingUserId,
                campaignId: newCampaignId,
                filename: a.filename,
                originalName: a.originalName,
                mimeType: a.mimeType,
                fileSize: a.fileSize,
                filePath: a.finalPath.replace(/\\/g, '/'),
                name: a.originalName.replace(/\.[^.]+$/, ''),
              })),
            });
          }

          // Maps are read from the archive one at a time as they are written,
          // so no more than one is in memory.
          let mapCount = 0;
          let tokenCount = 0;
          let firstMapId: string | null = null;
          for (let i = 0; i < manifestData.mapCount; i++) {
            const mapEntry = directory.files.find((f) => f.path === `maps/map-${i}.json`);
            if (!mapEntry) {
              report.skip('map', `Map ${i + 1}`, 'Its file is missing from the archive.');
              continue;
            }
            let mapRaw: unknown;
            try {
              mapRaw = await readJsonEntry(archivePath, mapEntry, total);
            } catch (error) {
              if (!(error instanceof NestedTooDeepError)) throw error;
              report.skip('map', `Map ${i + 1}`, NESTED_TOO_DEEP_REASON);
              continue;
            }
            const prepared = prepareMap(mapRaw, { index: i, importTokens, remapAsset, report });
            if (!prepared) continue;

            const mapId = randomUUID();
            await tx.map.create({ data: { ...prepared.data, id: mapId, campaignId: newCampaignId } });
            firstMapId ??= mapId;
            mapCount++;
            tokenCount += prepared.tokenCount;
          }
          // The first map imported is the one the campaign opens on.
          if (firstMapId) {
            await tx.campaign.update({ where: { id: newCampaignId }, data: { currentMapId: firstMapId } });
          }

          // Creatures
          let creatureCount = 0;
          const creaturesEntry = directory.files.find((f) => f.path === 'creatures/creatures.json');
          if (creaturesEntry) {
            const creaturesRaw = await readListEntry(archivePath, creaturesEntry, total, 'creature', 'Creatures', report);
            if (Array.isArray(creaturesRaw)) {
              const creatures: Prisma.CreatureTemplateCreateManyInput[] = [];
              if (creaturesRaw.length > IMPORT_LIMITS.MAX_CREATURES) {
                report.skip(
                  'creature',
                  `${(creaturesRaw.length - IMPORT_LIMITS.MAX_CREATURES).toLocaleString('en-US')} creatures`,
                  `An archive can carry ${IMPORT_LIMITS.MAX_CREATURES} creatures. These were the last in its list.`
                );
              }
              for (const raw of creaturesRaw.slice(0, IMPORT_LIMITS.MAX_CREATURES)) {
                const row = prepareCreature(raw, { remapAsset, report });
                if (row) creatures.push({ ...row, id: randomUUID(), createdById: importingUserId, campaignId: newCampaignId });
              }
              if (creatures.length > 0) await tx.creatureTemplate.createMany({ data: creatures });
              creatureCount = creatures.length;
            }
          }

          // Token templates
          let tokenTemplateCount = 0;
          const templatesEntry = directory.files.find((f) => f.path === 'token-templates/templates.json');
          if (templatesEntry) {
            const templatesRaw = await readListEntry(archivePath, templatesEntry, total, 'tokenTemplate', 'Token templates', report);
            if (Array.isArray(templatesRaw)) {
              const templates: Prisma.TokenTemplateCreateManyInput[] = [];
              if (templatesRaw.length > IMPORT_LIMITS.MAX_TOKEN_TEMPLATES) {
                report.skip(
                  'tokenTemplate',
                  `${(templatesRaw.length - IMPORT_LIMITS.MAX_TOKEN_TEMPLATES).toLocaleString('en-US')} token templates`,
                  `An archive can carry ${IMPORT_LIMITS.MAX_TOKEN_TEMPLATES} token templates. These were the last in its list.`
                );
              }
              for (const raw of templatesRaw.slice(0, IMPORT_LIMITS.MAX_TOKEN_TEMPLATES)) {
                const row = prepareTokenTemplate(raw, { remapAsset, report });
                if (row) templates.push({ ...row, id: randomUUID(), createdById: importingUserId, campaignId: newCampaignId });
              }
              if (templates.length > 0) await tx.tokenTemplate.createMany({ data: templates });
              tokenTemplateCount = templates.length;
            }
          }

          return { mapCount, tokenCount, creatureCount, tokenTemplateCount };
        },
        { maxWait: 10_000, timeout: IMPORT_TRANSACTION_TIMEOUT_MS }
      );
    } catch (error) {
      // Nothing was written. A problem with the archive is said in words;
      // anything else is the server's, and its detail is for the log.
      if (error instanceof ArchiveRefusedError) throw error;
      logger.error('Campaign import could not be saved', { error: errorMessage(error), importingUserId });
      throw new CampaignImportFailedError();
    }

    // 7. The rows are saved: put the files where they say they are.
    try {
      await moveIntoPlace(assets);
    } catch (error) {
      logger.error('Campaign import could not move its files into place', { campaignId: newCampaignId, error: errorMessage(error) });
      await undoImport(newCampaignId);
      throw new CampaignImportFailedError();
    }

    const { warnings, skipped } = report.result();
    logger.info('Campaign imported', {
      campaignId: newCampaignId, campaignName: name, ...counts, importingUserId, warnings: warnings.length, skipped: skipped.length,
    });
    // What was changed or left out, for whoever runs the server as well.
    for (const warning of warnings) logger.warn('Campaign import changed', { campaignId: newCampaignId, warning });
    for (const item of skipped) logger.warn('Campaign import left out', { campaignId: newCampaignId, ...item });

    return { campaignId: newCampaignId, campaignName: name, ...counts, warnings, skipped };
  } finally {
    await fs.promises.rm(path.resolve(staging), { recursive: true, force: true }).catch(() => undefined);
  }
}

import { randomUUID } from 'crypto';
import type { AssetType as PrismaAssetType } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import logger from './logger';
import { errorCode } from './errors';
import { UPLOAD_CONTENT_TYPES, UPLOAD_EXTENSIONS } from '../validators/uploadTypes';

/**
 * Asset types, as the database declares them.
 *
 * This used to be a second, four-value declaration of the same enum. It had
 * drifted: the schema also had DOCUMENT and OTHER, and nothing here knew. Taking
 * the type from Prisma means every table below must name every value, so a new
 * enum member fails to compile until it has a size, an extension list and a MIME
 * list, instead of being silently unsupported.
 */
export type AssetType = PrismaAssetType;

/**
 * The types a self-hoster can size with a MAX_<TYPE>_SIZE_MB variable.
 *
 * OTHER is in the enum but has no upload path, so it has no variable and no
 * limit. Listing it here would invite a setting that does nothing.
 */
export const CONFIGURABLE_ASSET_TYPES = ['MAP', 'TOKEN', 'AUDIO', 'AVATAR', 'DOCUMENT'] as const satisfies readonly AssetType[];

export type ConfigurableAssetType = (typeof CONFIGURABLE_ASSET_TYPES)[number];

/** The environment variable that sets one asset type's upload limit. */
export function fileSizeLimitVar(assetType: ConfigurableAssetType): string {
  return `MAX_${assetType}_SIZE_MB`;
}

export function isConfigurableAssetType(value: string): value is ConfigurableAssetType {
  return (CONFIGURABLE_ASSET_TYPES as readonly string[]).includes(value);
}

/**
 * Asset scope - global (platform-wide), user (personal), or campaign-specific
 */
export type AssetScope = 'GLOBAL' | 'USER' | 'CAMPAIGN';

/**
 * Default upload limits in MB, used when the matching env var is unset or invalid.
 * These match .env.example, docker-compose.yml, README.md and docs/DEPLOYMENT.md.
 */
export const DEFAULT_FILE_SIZE_LIMITS_MB: Record<AssetType, number> = {
  MAP: 50,
  TOKEN: 5,
  AUDIO: 20,
  AVATAR: 2,
  DOCUMENT: 50,
  // Not uploadable. Zero so nothing can slip through a limit check by accident.
  OTHER: 0,
};

/**
 * Resolve per-type upload limits (in bytes) from MAX_<TYPE>_SIZE_MB environment
 * variables, falling back to DEFAULT_FILE_SIZE_LIMITS_MB.
 *
 * Invalid values (non-numeric, zero, negative) are ignored with a warning rather
 * than crashing the server — a typo in .env must never prevent startup.
 *
 * Exported (with an injectable env) so it can be unit tested without mutating
 * the real process environment.
 */
export function resolveFileSizeLimits(
  env: NodeJS.ProcessEnv = process.env
): Record<AssetType, number> {
  const limits = { OTHER: 0 } as Record<AssetType, number>;

  for (const assetType of CONFIGURABLE_ASSET_TYPES) {
    const varName = fileSizeLimitVar(assetType);
    const raw = env[varName];
    const fallbackMB = DEFAULT_FILE_SIZE_LIMITS_MB[assetType];
    let sizeMB = fallbackMB;

    if (raw !== undefined && raw.trim() !== '') {
      const parsed = Number(raw.trim());

      if (Number.isFinite(parsed) && parsed > 0) {
        sizeMB = parsed;
      } else {
        logger.warn(
          `Invalid ${varName}="${raw}" — expected a positive number of megabytes. Using default ${fallbackMB} MB.`
        );
      }
    }

    limits[assetType] = Math.round(sizeMB * 1024 * 1024);
  }

  return limits;
}

/**
 * File size limits in bytes, resolved once at startup from the environment.
 *
 * NOTE: this reads process.env at module load, which is safe because
 * src/server.ts imports config/loadEnvFile.ts on its first line, before any
 * import that reaches this module. Keep that ordering intact.
 */
export const FILE_SIZE_LIMITS: Record<AssetType, number> = resolveFileSizeLimits();

/**
 * The limits a self-hoster can set, for everything that reports them: the
 * startup log, GET /api/config and the admin panel. Derived from
 * FILE_SIZE_LIMITS so a type cannot be enforced without being shown. The admin
 * route once listed four types by hand, and the fifth was invisible.
 */
export const UPLOAD_LIMITS: Readonly<Record<ConfigurableAssetType, number>> = Object.freeze(
  Object.fromEntries(
    CONFIGURABLE_ASSET_TYPES.map((type) => [type, FILE_SIZE_LIMITS[type]])
  ) as Record<ConfigurableAssetType, number>
);

/**
 * The largest configured limit — the cap for the generic multer instance that
 * parses uploads before the asset type is known (see middleware/upload.ts).
 */
export const MAX_UPLOAD_BYTES: number = Math.max(...Object.values(UPLOAD_LIMITS));

/**
 * The content types each asset type is stored as, from the list the upload
 * dialog shares (validators/uploadTypes.ts).
 */
export const ALLOWED_MIME_TYPES = UPLOAD_CONTENT_TYPES satisfies Record<AssetType, readonly string[]>;

/**
 * The type a file is stored and served as, from what file-type found in its
 * bytes. file-type names an Ogg file by the codec inside it: Vorbis as
 * `audio/ogg` with the extension ogg, but Opus as `audio/ogg; codecs=opus`
 * with opus, FLAC as oga and Speex as spx. Each is an Ogg track, which the
 * audio route serves from an .ogg file, so each is stored as one.
 */
export function storedFileType(detected: { mime: string; ext: string }): { mime: string; ext: string } {
  if (detected.mime === 'audio/ogg' || detected.mime.startsWith('audio/ogg;')) return { mime: 'audio/ogg', ext: 'ogg' };
  return { mime: detected.mime, ext: detected.ext };
}

/**
 * Allowed file extensions for each asset type, from the same shared list.
 */
export const ALLOWED_EXTENSIONS = UPLOAD_EXTENSIONS satisfies Record<AssetType, readonly string[]>;

/**
 * Generate a unique filename with UUID and preserve extension
 * @param originalFilename Original filename from upload
 * @returns Unique filename with UUID and extension
 */
export function generateUniqueFilename(originalFilename: string): string {
  const ext = path.extname(originalFilename).toLowerCase();
  const uuid = randomUUID();
  return `${uuid}${ext}`;
}

/**
 * Get the file path for an asset based on type, scope, and campaign
 * @param assetType Type of asset (MAP, TOKEN, AUDIO, AVATAR)
 * @param scope Scope of asset (GLOBAL or CAMPAIGN)
 * @param campaignId Campaign ID (required if scope is CAMPAIGN)
 * @returns Relative file path from uploads directory
 */
export function getFilePath(
  assetType: AssetType,
  scope: AssetScope,
  campaignId?: string
): string {
  const baseDir = process.env.UPLOAD_DIR || 'uploads';

  switch (assetType) {
    case 'MAP':
      if (scope === 'GLOBAL') {
        return path.join(baseDir, 'maps', 'global');
      } else {
        if (!campaignId) {
          throw new Error('campaignId is required for CAMPAIGN scope');
        }
        return path.join(baseDir, 'maps', 'campaigns', campaignId);
      }

    case 'TOKEN':
      if (scope === 'GLOBAL') {
        return path.join(baseDir, 'tokens', 'global');
      } else {
        if (!campaignId) {
          throw new Error('campaignId is required for CAMPAIGN scope');
        }
        return path.join(baseDir, 'tokens', 'campaigns', campaignId);
      }

    case 'AUDIO':
      if (scope === 'GLOBAL') {
        return path.join(baseDir, 'audio', 'global');
      } else {
        if (!campaignId) {
          throw new Error('campaignId is required for CAMPAIGN scope');
        }
        return path.join(baseDir, 'audio', 'campaigns', campaignId);
      }

    case 'AVATAR':
      return path.join(baseDir, 'avatars');

    case 'DOCUMENT':
      if (scope === 'GLOBAL') {
        return path.join(baseDir, 'documents', 'global');
      } else {
        if (!campaignId) {
          throw new Error('campaignId is required for CAMPAIGN scope');
        }
        return path.join(baseDir, 'documents', 'campaigns', campaignId);
      }

    default:
      // OTHER has no upload path. relocateUpload swallows this and leaves the
      // file in temp, which is why the route must never let OTHER reach here.
      throw new Error(`Unknown asset type: ${assetType}`);
  }
}

/**
 * Get the full file path (directory + filename)
 * @param assetType Type of asset
 * @param scope Scope of asset
 * @param filename Filename
 * @param campaignId Campaign ID (if CAMPAIGN scope)
 * @returns Full file path
 */
export function getFullFilePath(
  assetType: AssetType,
  scope: AssetScope,
  filename: string,
  campaignId?: string
): string {
  const directory = getFilePath(assetType, scope, campaignId);
  return path.join(directory, filename);
}

/**
 * Delete a file from the filesystem
 * @param filePath Relative or absolute file path
 * @returns Promise<boolean> true if deleted, false if file didn't exist
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      // File doesn't exist, consider it already deleted
      return false;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Replace a file's contents so that a reader, or the server after a crash,
 * finds either the old contents or the new, never part of either.
 *
 * Writing over a file empties it before the new bytes go in. Here they go to
 * a new file beside it, which is flushed to disk and then renamed over the
 * original; a rename within one directory takes effect all at once. Two saves
 * at the same moment each rename a complete file, so the later one wins whole.
 * If anything fails, the new file is removed and the original is untouched.
 */
export async function writeFileAtomically(filePath: string, data: Buffer): Promise<void> {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  try {
    // `wx`: a new file, never one that is already there.
    await fs.writeFile(temporary, data, { flag: 'wx' });
    const handle = await fs.open(temporary, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param dirPath Directory path
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Get file size limit for an asset type
 * @param assetType Type of asset
 * @returns Size limit in bytes (falls back to the largest configured limit for
 *          unknown types, so callers never end up formatting `undefined`)
 */
export function getFileSizeLimit(assetType: AssetType): number {
  return FILE_SIZE_LIMITS[assetType] ?? MAX_UPLOAD_BYTES;
}

/**
 * Check if a MIME type is allowed for an asset type
 * @param assetType Type of asset
 * @param mimeType MIME type to check
 * @returns true if allowed
 */
export function isAllowedMimeType(assetType: AssetType, mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES[assetType] as readonly string[]).includes(mimeType);
}

/**
 * Check if a file extension is allowed for an asset type
 * @param assetType Type of asset
 * @param extension File extension (with or without dot)
 * @returns true if allowed
 */
export function isAllowedExtension(assetType: AssetType, extension: string): boolean {
  const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return (ALLOWED_EXTENSIONS[assetType] as readonly string[]).includes(ext);
}

/**
 * Whether a file whose bytes were identified as `detected` (after
 * storedFileType) may be stored as this asset type: its type must be allowed,
 * and so must the extension it is stored under. The type alone is not
 * enough: MPEG layer 1 and 2 audio is audio/mpeg like an MP3, but would be
 * stored as .mp1 or .mp2, which the audio route does not serve and no browser
 * plays. The upload and the campaign import both decide by this.
 */
export function isAcceptedContent(assetType: AssetType, detected: { mime: string; ext: string }): boolean {
  return isAllowedMimeType(assetType, detected.mime) && isAllowedExtension(assetType, detected.ext);
}

/**
 * Options for `res.sendFile` and `res.download` on a path the server built
 * itself, from a stored row or a name it has checked. Express 5's file sender
 * refuses any path with a folder whose name starts with a dot, and the
 * uploads or backups folder may sit inside one, such as
 * `~/.local/share/cozyvtt`. Never pass this for a path taken from a request.
 */
export const SERVER_BUILT_PATH = { dotfiles: 'allow' } as const;

/**
 * The uploads folder as an absolute path: `UPLOAD_DIR`, or `uploads` in the
 * working directory. Read when asked, so a test that sets UPLOAD_DIR is
 * followed.
 */
export function getUploadsDirectory(): string {
  return path.resolve(process.env.UPLOAD_DIR || 'uploads');
}

/**
 * Get temporary upload directory path
 * @returns Path to temp directory
 */
export function getTempDirectory(): string {
  const baseDir = process.env.UPLOAD_DIR || 'uploads';
  return path.join(baseDir, 'temp');
}

/**
 * Move an uploaded file into the directory its type and scope call for.
 *
 * Uploads arrive as multipart, and the asset type is a *field* of the same body
 * as the file — so it cannot be read until multer has already parsed and written
 * the file somewhere. Multer's destination callback therefore ran before
 * anything knew what was being uploaded and fell back to MAP, which is why every
 * asset, of every type, ended up in `uploads/maps/global/`.
 *
 * Nothing was broken by that: the database records wherever the file actually
 * is, so serving and deleting worked. But the directories described a layout
 * that never happened, which is misleading to anyone looking through their own
 * uploads folder.
 *
 * Returns the path the file now occupies. If the move fails for any reason the
 * original path is returned and the upload proceeds from there — a tidier
 * directory is not worth losing somebody's file over.
 */
export async function relocateUpload(
  currentPath: string,
  assetType: AssetType,
  scope: AssetScope,
  campaignId?: string
): Promise<string> {
  try {
    const targetDir =
      assetType === 'AVATAR'
        ? getFilePath('AVATAR', 'GLOBAL')
        : scope === 'CAMPAIGN' && campaignId
          ? getFilePath(assetType, scope, campaignId)
          : getFilePath(assetType, 'GLOBAL');

    const targetPath = path.join(targetDir, path.basename(currentPath));
    if (path.resolve(targetPath) === path.resolve(currentPath)) return currentPath;

    await ensureDirectory(targetDir);
    await fs.rename(currentPath, targetPath);
    return targetPath;
  } catch {
    return currentPath;
  }
}

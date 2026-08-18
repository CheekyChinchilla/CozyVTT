import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import logger from './logger';

/**
 * Asset types supported by the application
 */
export type AssetType = 'MAP' | 'TOKEN' | 'AUDIO' | 'AVATAR';

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
};

const ASSET_TYPES: AssetType[] = ['MAP', 'TOKEN', 'AUDIO', 'AVATAR'];

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
  const limits = {} as Record<AssetType, number>;

  for (const assetType of ASSET_TYPES) {
    const varName = `MAX_${assetType}_SIZE_MB`;
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
 * src/server.ts calls dotenv.config() on its first lines, before any import
 * that reaches this module. Keep that ordering intact.
 */
export const FILE_SIZE_LIMITS: Record<AssetType, number> = resolveFileSizeLimits();

/**
 * The largest configured limit — the cap for the generic multer instance that
 * parses uploads before the asset type is known (see middleware/upload.ts).
 */
export const MAX_UPLOAD_BYTES: number = Math.max(...Object.values(FILE_SIZE_LIMITS));

/**
 * Allowed MIME types for each asset type
 */
export const ALLOWED_MIME_TYPES = {
  MAP: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
  TOKEN: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  AUDIO: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
  AVATAR: ['image/png', 'image/jpeg', 'image/webp'],
} as const;

/**
 * Allowed file extensions for each asset type
 */
export const ALLOWED_EXTENSIONS = {
  MAP: ['.png', '.jpg', '.jpeg', '.webp', '.pdf'],
  TOKEN: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  AUDIO: ['.mp3', '.ogg', '.wav'],
  AVATAR: ['.png', '.jpg', '.jpeg', '.webp'],
} as const;

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

    default:
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
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, consider it already deleted
      return false;
    }
    // Re-throw other errors
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
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
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
 * Get temporary upload directory path
 * @returns Path to temp directory
 */
export function getTempDirectory(): string {
  const baseDir = process.env.UPLOAD_DIR || 'uploads';
  return path.join(baseDir, 'temp');
}

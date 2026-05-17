import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { Request } from 'express';
import {
  AssetType,
  AssetScope,
  generateUniqueFilename,
  getFilePath,
  getFileSizeLimit,
  isAllowedExtension,
  ensureDirectory,
  getTempDirectory,
} from '../utils/fileUtils';

/**
 * Extended request interface to include asset metadata
 */
export interface UploadRequest extends Request {
  assetType?: AssetType;
  assetScope?: AssetScope;
  campaignId?: string;
}

/**
 * Configure multer storage
 * Stores files with unique UUID filenames in appropriate directories
 */
const storage = multer.diskStorage({
  destination: async (req: UploadRequest, _file, cb) => {
    try {
      const assetType = req.assetType || 'MAP';
      const scope = req.assetScope || 'GLOBAL';
      const campaignId = req.campaignId;

      // Get the appropriate directory path
      let uploadPath: string;

      if (assetType === 'AVATAR') {
        // Avatars don't use scope/campaign
        uploadPath = getFilePath('AVATAR', 'GLOBAL');
      } else if (scope === 'CAMPAIGN' && campaignId) {
        // Campaign-scoped assets need campaignId
        uploadPath = getFilePath(assetType, scope, campaignId);
      } else {
        // Global assets
        uploadPath = getFilePath(assetType, 'GLOBAL');
      }

      // Ensure directory exists
      await ensureDirectory(uploadPath);

      cb(null, uploadPath);
    } catch (error: any) {
      cb(error, getTempDirectory()); // Fallback to temp directory
    }
  },

  filename: (_req, file, cb) => {
    // Generate unique filename with UUID
    const uniqueFilename = generateUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  },
});

/**
 * File filter to validate file types
 * Checks extension against allowed types for the asset
 */
const fileFilter = (req: UploadRequest, file: Express.Multer.File, cb: FileFilterCallback) => {
  const assetType = req.assetType || 'MAP';
  const ext = path.extname(file.originalname);

  // Check if extension is allowed for this asset type
  if (isAllowedExtension(assetType, ext)) {
    cb(null, true); // Accept file
  } else {
    cb(
      new Error(
        `Invalid file type. ${assetType} files must be one of: ${getAllowedExtensionsString(assetType)}`
      )
    );
  }
};

/**
 * Helper to get allowed extensions as a string
 */
function getAllowedExtensionsString(assetType: AssetType): string {
  const extensions = {
    MAP: '.png, .jpg, .jpeg, .webp, .pdf',
    TOKEN: '.png, .jpg, .jpeg, .webp, .gif',
    AUDIO: '.mp3, .ogg, .wav',
    AVATAR: '.png, .jpg, .jpeg, .webp',
  };
  return extensions[assetType] || '';
}

/**
 * Create multer upload middleware for a specific asset type
 * @param assetType Type of asset being uploaded
 * @returns Configured multer middleware
 */
export function createUploadMiddleware(assetType: AssetType) {
  const sizeLimit = getFileSizeLimit(assetType);

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: sizeLimit,
      files: 1, // Only allow one file per request
    },
  });
}

/**
 * Middleware to set asset metadata on request before upload
 * @param assetType Type of asset
 * @param scope Scope of asset (optional, defaults to GLOBAL)
 */
export function setAssetMetadata(assetType: AssetType, scope: AssetScope = 'GLOBAL') {
  return (req: UploadRequest, res: any, next: any) => {
    req.assetType = assetType;
    req.assetScope = scope;

    // If scope is CAMPAIGN, extract campaignId from route params
    if (scope === 'CAMPAIGN') {
      req.campaignId = req.params.campaignId || req.body.campaignId;

      if (!req.campaignId) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Campaign ID is required for campaign-scoped assets',
        });
      }
    }

    next();
  };
}

/**
 * Generic upload middleware that accepts all file types
 * Used when asset type is determined from request body
 * File type validation happens in subsequent middleware
 */
export const uploadGeneric = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // Max 25MB (largest allowed size)
    files: 1, // Only allow one file per request
  },
  // No fileFilter - accept all files, validate in middleware
});

/**
 * Pre-configured upload middleware for each asset type
 */
export const uploadMap = createUploadMiddleware('MAP');
export const uploadToken = createUploadMiddleware('TOKEN');
export const uploadAudio = createUploadMiddleware('AUDIO');
export const uploadAvatar = createUploadMiddleware('AVATAR');

/**
 * Error handler middleware for multer errors
 */
export function handleUploadError(err: any, req: any, res: any, next: any) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const assetType = (req as UploadRequest).assetType || 'FILE';
      const limit = getFileSizeLimit(assetType as AssetType);
      const limitMB = (limit / (1024 * 1024)).toFixed(0);

      return res.status(400).json({
        error: 'File Too Large',
        message: `${assetType} files must be smaller than ${limitMB}MB`,
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Unexpected file field. Only one file allowed per upload.',
      });
    }

    return res.status(400).json({
      error: 'Upload Error',
      message: err.message,
    });
  }

  if (err) {
    return res.status(400).json({
      error: 'Upload Error',
      message: err.message || 'File upload failed',
    });
  }

  next();
}

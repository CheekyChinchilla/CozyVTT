import multer from 'multer';
import { errorMessage } from '../utils/errors';
import { Request, Response, NextFunction } from 'express';
import {
  AssetType,
  AssetScope,
  isConfigurableAssetType,
  MAX_UPLOAD_BYTES,
  generateUniqueFilename,
  getFilePath,
  getFileSizeLimit,
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
    } catch (error: unknown) {
      cb(error as Error, getTempDirectory()); // Fallback to temp directory
    }
  },

  filename: (_req, file, cb) => {
    // Generate unique filename with UUID
    const uniqueFilename = generateUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  },
});

/**
 * Generic upload middleware that accepts all file types
 * Used when asset type is determined from request body
 * File type validation happens in subsequent middleware
 *
 * The cap is the largest configured per-type limit — multer runs before the
 * asset type is known, so the exact per-type limit is enforced afterwards by
 * validateFileSize() in middleware/fileValidation.ts.
 */
export const uploadGeneric = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES, // Largest MAX_<TYPE>_SIZE_MB configured
    files: 1, // Only allow one file per request
  },
  // No fileFilter - accept all files, validate in middleware
});

/**
 * Error handler middleware for multer errors
 */
export function handleUploadError(err: unknown, req: Request, res: Response, next: NextFunction): Response | void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // On the generic upload route multer aborts mid-stream, so req.assetType
      // is not set yet. The client sends `type` before the file part, so fall
      // back to the parsed body, then to a type-agnostic message.
      const bodyType = typeof req.body?.type === 'string' ? req.body.type.toUpperCase() : undefined;
      const assetType = (req as UploadRequest).assetType || bodyType;
      const isKnownType = !!assetType && isConfigurableAssetType(assetType);
      const limit = isKnownType ? getFileSizeLimit(assetType) : MAX_UPLOAD_BYTES;
      const limitMB = (limit / (1024 * 1024)).toFixed(0);

      return res.status(400).json({
        error: 'File Too Large',
        message: isKnownType
          ? `${assetType} files must be smaller than ${limitMB}MB`
          : `File exceeds the maximum upload size of ${limitMB}MB`,
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
      message: errorMessage(err) || 'File upload failed',
    });
  }

  next();
}

import { Response, NextFunction } from 'express';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs/promises';
import path from 'path';
import { AssetType, isAllowedMimeType, deleteFile } from '../utils/fileUtils';
import { UploadRequest } from './upload';

/**
 * Validate uploaded file by checking actual MIME type from file content (magic bytes)
 * This prevents users from uploading malicious files with fake extensions
 */
export async function validateFileType(
  req: UploadRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check if file was uploaded
    if (!req.file) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'No file uploaded',
      });
      return;
    }

    const assetType = req.assetType || 'MAP';
    const filePath = req.file.path;

    // Check file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Uploaded file not found',
      });
      return;
    }

    // Get MIME type from file content (magic bytes)
    const fileType = await fileTypeFromFile(filePath);

    // Special case: PDFs and some audio files may not be detected by file-type
    // Verify by extension for these cases
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isPDF = ext === '.pdf';
    const isMP3 = ext === '.mp3';

    // If file-type couldn't detect type, check if it's a known exception
    if (!fileType) {
      if (isPDF && assetType === 'MAP') {
        // PDF for maps is allowed
        next();
        return;
      } else if (isMP3 && assetType === 'AUDIO') {
        // MP3 for audio is allowed
        next();
        return;
      } else {
        // Unknown file type
        await deleteFile(filePath);
        res.status(400).json({
          error: 'Validation Error',
          message: 'Could not determine file type. File may be corrupted or invalid.',
        });
        return;
      }
    }

    // Validate MIME type against allowed types for this asset
    if (!isAllowedMimeType(assetType, fileType.mime)) {
      // Delete the file
      await deleteFile(filePath);

      res.status(400).json({
        error: 'Validation Error',
        message: `Invalid file type. ${assetType} files must be one of: ${getAllowedMimeTypesString(assetType)}`,
      });
      return;
    }

    // File is valid, proceed
    next();
  } catch (error: any) {
    console.error('Error validating file type:', error);

    // Attempt to delete the file if it exists
    if (req.file?.path) {
      try {
        await deleteFile(req.file.path);
      } catch (deleteError) {
        console.error('Error deleting invalid file:', deleteError);
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate file type',
    });
  }
}

/**
 * Helper to get allowed MIME types as a string
 */
function getAllowedMimeTypesString(assetType: AssetType): string {
  const mimeTypes = {
    MAP: 'PNG, JPEG, WEBP, PDF',
    TOKEN: 'PNG, JPEG, WEBP, GIF',
    AUDIO: 'MP3, OGG, WAV',
    AVATAR: 'PNG, JPEG, WEBP',
  };
  return mimeTypes[assetType] || '';
}

/**
 * Validate file size explicitly (in addition to multer's limit)
 * Useful for custom error messages or additional checks
 */
export async function validateFileSize(
  req: UploadRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'No file uploaded',
      });
      return;
    }

    const filePath = req.file.path;
    const stats = await fs.stat(filePath);
    const fileSizeInBytes = stats.size;

    // Get size limit for asset type
    const assetType = req.assetType || 'MAP';
    const limits = {
      MAP: 25 * 1024 * 1024,      // 25 MB
      TOKEN: 5 * 1024 * 1024,     // 5 MB
      AUDIO: 10 * 1024 * 1024,    // 10 MB
      AVATAR: 2 * 1024 * 1024,    // 2 MB
    };

    const limit = limits[assetType];

    if (fileSizeInBytes > limit) {
      // Delete the file
      await deleteFile(filePath);

      const limitMB = (limit / (1024 * 1024)).toFixed(0);
      res.status(400).json({
        error: 'File Too Large',
        message: `${assetType} files must be smaller than ${limitMB}MB`,
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Error validating file size:', error);

    // Attempt to delete the file if it exists
    if (req.file?.path) {
      try {
        await deleteFile(req.file.path);
      } catch (deleteError) {
        console.error('Error deleting oversized file:', deleteError);
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate file size',
    });
  }
}

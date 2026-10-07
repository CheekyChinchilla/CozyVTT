import { Response, NextFunction } from 'express';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs/promises';
import path from 'path';
import { AssetType, isAllowedMimeType, deleteFile, getFileSizeLimit, ALLOWED_EXTENSIONS } from '../utils/fileUtils';
import { UploadRequest } from './upload';
import logger from '../utils/logger';
import { isPlainTextFile } from '../utils/textFile';

/** The first bytes of a file, or an empty buffer if it cannot be read. */
async function leadingBytes(filePath: string, count: number): Promise<Buffer> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const buf = Buffer.alloc(count);
    const { bytesRead } = await handle.read(buf, 0, count, 0);
    return buf.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    await handle?.close();
  }
}

/**
 * An MP3 begins with an ID3v2 tag, or with an MPEG audio frame sync: eleven set
 * bits, 0xFF followed by a byte whose top three bits are set. Also used by the
 * campaign importer.
 */
export async function startsWithMp3Header(filePath: string): Promise<boolean> {
  const head = await leadingBytes(filePath, 3);
  if (head.length >= 3 && head.toString('latin1') === 'ID3') return true;
  return head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
}

/**
 * Rename the stored file so its extension matches the validated content.
 *
 * multer writes the file under the name the client chose, and the upload path
 * applies no extension filter, so a genuine image can arrive as `evil.html` or
 * a GIF whose header is also valid JavaScript as `x.js`. Left in place, the
 * serving route hands it back with a Content-Type taken from that extension.
 * Once the content is known the extension is forced to the canonical one for
 * it, so nothing but a real image extension is ever stored. Returns the new
 * on-disk path.
 */
async function normalizeStoredExtension(
  file: Express.Multer.File,
  detectedExt: string
): Promise<void> {
  const wanted = `.${detectedExt.toLowerCase()}`;
  const current = path.extname(file.path).toLowerCase();
  if (current === wanted) return;

  const dir = path.dirname(file.path);
  const base = path.basename(file.filename, path.extname(file.filename));
  const newFilename = `${base}${wanted}`;
  const newPath = path.join(dir, newFilename);
  await fs.rename(file.path, newPath);
  file.path = newPath;
  file.filename = newFilename;
}

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

    // Special case: some audio files and plain text may not be detected by file-type
    // Verify by extension for these cases
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isMP3 = ext === '.mp3';
    const isTextDocument = assetType === 'DOCUMENT' && (ext === '.txt' || ext === '.md');

    // If file-type couldn't detect type, check if it's a known exception.
    //
    // These exceptions used to accept on extension alone. file-type does
    // identify real MP3s, so the only files that reach here under that name
    // are ones it could not identify at all, and a filename is not evidence.
    // The leading bytes are checked instead: an MP3 starts with an ID3 tag or
    // an MPEG frame sync.
    if (!fileType) {
      if (isMP3 && assetType === 'AUDIO' && (await startsWithMp3Header(filePath))) {
        next();
        return;
      } else if (isTextDocument && (await isPlainTextFile(filePath))) {
        // Plain text and Markdown have no magic bytes, so file-type cannot
        // identify them and they always land here. The extension is not
        // trusted on its own: the bytes have to prove they are text. A PDF
        // document does not need this branch, because file-type identifies a
        // real PDF and it passes the MIME check below like any other file.
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
        message: `Invalid file type. ${assetType} files must be one of: ${getAllowedExtensionsString(assetType)}`,
      });
      return;
    }

    // The content is known and allowed. Force the stored extension to match it,
    // so the serving route cannot be told the file is a page or a script.
    await normalizeStoredExtension(req.file, fileType.ext);

    // File is valid, proceed
    next();
  } catch (error) {
    logger.error('Error validating file type', { err: error });

    // Attempt to delete the file if it exists
    if (req.file?.path) {
      try {
        await deleteFile(req.file.path);
      } catch (deleteError) {
        logger.error('Error deleting invalid file', { err: deleteError });
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate file type',
    });
  }
}

/**
 * The allowed extensions for an error message, read from the one table that
 * decides them. This used to be a hand-written list of format names that had
 * drifted from the real list; extensions are also what a person recognises.
 */
function getAllowedExtensionsString(assetType: AssetType): string {
  return ALLOWED_EXTENSIONS[assetType].join(', ');
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

    // Get size limit for asset type (resolved from MAX_<TYPE>_SIZE_MB at startup)
    const assetType = req.assetType || 'MAP';
    const limit = getFileSizeLimit(assetType);

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
  } catch (error) {
    logger.error('Error validating file size', { err: error });

    // Attempt to delete the file if it exists
    if (req.file?.path) {
      try {
        await deleteFile(req.file.path);
      } catch (deleteError) {
        logger.error('Error deleting oversized file', { err: deleteError });
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate file size',
    });
  }
}

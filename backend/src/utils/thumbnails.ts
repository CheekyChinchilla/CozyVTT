/**
 * Map and token thumbnails.
 *
 * Lifted out of the upload route so the UVTT import can make them the same
 * way. It could not before, and its maps were the only ones in the asset
 * library with no preview.
 *
 * A thumbnail is a convenience, not part of the asset: if sharp cannot read
 * the image, or the file is not a PNG, JPEG, WebP or GIF picture (which
 * sharp is never given; see sharpInput.ts), the caller still gets its file
 * and a null here. Anything that must reject an unreadable image has to say
 * so itself.
 */

import path from 'path';
import logger from './logger';
import { openPicture, NotAPictureError } from './sharpInput';

/** Longest edge of a generated thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 512;

/**
 * Write a thumbnail beside the image it came from.
 *
 * @param imagePath the image already on disk
 * @returns the thumbnail's path, or null if one could not be made
 */
export async function generateThumbnail(imagePath: string): Promise<string | null> {
  const thumbnailPath = path.join(
    path.dirname(imagePath),
    `thumb_${path.basename(imagePath)}`
  );

  try {
    const image = await openPicture(imagePath);
    await image
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'inside',          // Maintain aspect ratio
        withoutEnlargement: true, // Don't upscale small images
      })
      .toFile(thumbnailPath);
    return thumbnailPath.replace(/\\/g, '/');
  } catch (error) {
    if (error instanceof NotAPictureError) {
      logger.warn('No thumbnail made: the file is not a PNG, JPEG, WebP or GIF picture', { imagePath, reason: error.message });
    } else {
      logger.error('Error generating thumbnail', { err: error });
    }
    return null;
  }
}

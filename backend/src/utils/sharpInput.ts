/**
 * The one way into sharp.
 *
 * sharp hands its input to whichever libvips reader claims it, and libvips
 * has readers for far more than the pictures CozyVTT stores: SVG through
 * librsvg, TIFF, HEIF and others, each a parser of its own. An upload's
 * bytes are checked when it arrives, but what reaches sharp is whatever file
 * a stored row names, so the bytes are identified again here, by their
 * content, and sharp is given only PNG, JPEG, WebP or GIF. Nothing else in
 * the backend imports sharp (a test holds it to that).
 */

import sharp from 'sharp';
import type { Sharp } from 'sharp';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';

/** What sharp is allowed to read: the formats a map, token or avatar picture can be. */
export const SHARP_INPUT_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** The bytes are not a PNG, JPEG, WebP or GIF picture, so sharp was not given them. */
export class NotAPictureError extends Error {
  constructor(detected: string | undefined) {
    super(`Not a PNG, JPEG, WebP or GIF picture (${detected ?? 'unidentified'})`);
    this.name = 'NotAPictureError';
  }
}

/**
 * sharp, reading `input` (bytes, or the path of a file), once its content is
 * identified as PNG, JPEG, WebP or GIF. Anything else throws NotAPictureError
 * before sharp sees it.
 *
 * A path is identified from the file's first bytes and then read again by
 * sharp, so a large picture is not held in memory whole for this. Pass a
 * path only for a file nothing rewrites, such as an upload just written: a
 * typed document's text can be replaced between the two reads.
 */
export async function openPicture(input: Buffer | string): Promise<Sharp> {
  const detected = typeof input === 'string' ? await fileTypeFromFile(input) : await fileTypeFromBuffer(input);
  if (!detected || !SHARP_INPUT_TYPES.includes(detected.mime)) {
    throw new NotAPictureError(detected?.mime);
  }
  return sharp(input);
}

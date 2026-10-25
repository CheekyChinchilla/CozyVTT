/**
 * The one way into sharp.
 *
 * sharp hands its input to whichever libvips reader claims it, and libvips
 * has readers for far more than the pictures CozyVTT stores: SVG through
 * librsvg, TIFF, HEIF and others, each a parser of its own. An upload's
 * bytes are checked when it arrives, but what reaches sharp is whatever file
 * a stored row names. Two things keep it to PNG, JPEG, WebP and GIF:
 *
 * - When this module loads, every libvips reader is switched off for the
 *   whole process except those four, from a file and from bytes. Bytes that
 *   look like one format to us and another to libvips still reach no other
 *   reader.
 * - openPicture identifies the bytes again, by their content, and refuses
 *   anything else before sharp sees it, with an error a caller can answer.
 *
 * Nothing else in the backend imports sharp (a test holds it to that).
 */

import { promises as fs } from 'fs';
import sharp from 'sharp';
import type { Sharp, SharpOptions } from 'sharp';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';

/**
 * The libvips readers left on: PNG, JPEG, WebP and GIF, each from a file and
 * from bytes. The names are libvips's own (8.18, in sharp 0.35.5); a name it
 * does not know switches nothing on, so the tests read each format from a
 * file and from bytes after this module has loaded.
 */
export const ALLOWED_LIBVIPS_READERS: readonly string[] = [
  'VipsForeignLoadPngFile',
  'VipsForeignLoadPngBuffer',
  'VipsForeignLoadJpegFile',
  'VipsForeignLoadJpegBuffer',
  'VipsForeignLoadWebpFile',
  'VipsForeignLoadWebpBuffer',
  'VipsForeignLoadNsgifFile',
  'VipsForeignLoadNsgifBuffer',
];

sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({ operation: [...ALLOWED_LIBVIPS_READERS] });

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
 * The first six bytes of `input`. file-type calls anything that starts with
 * the letters GIF a GIF, and libvips reads as one only what starts GIF87a or
 * GIF89a, so a GIF's header is checked here in full.
 */
async function leadingBytes(input: Buffer | string): Promise<string> {
  if (typeof input !== 'string') return input.subarray(0, 6).toString('latin1');
  const file = await fs.open(input, 'r');
  try {
    const head = Buffer.alloc(6);
    const { bytesRead } = await file.read(head, 0, 6, 0);
    return head.subarray(0, bytesRead).toString('latin1');
  } finally {
    await file.close();
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
 *
 * `options` go to sharp as they are; without them, sharp refuses a picture
 * of more than 16,383 pixels squared.
 */
export async function openPicture(input: Buffer | string, options?: SharpOptions): Promise<Sharp> {
  const detected = typeof input === 'string' ? await fileTypeFromFile(input) : await fileTypeFromBuffer(input);
  if (!detected || !SHARP_INPUT_TYPES.includes(detected.mime)) {
    throw new NotAPictureError(detected?.mime);
  }
  if (detected.mime === 'image/gif' && !['GIF87a', 'GIF89a'].includes(await leadingBytes(input))) {
    throw new NotAPictureError('image/gif without a GIF87a or GIF89a header');
  }
  return sharp(input, options);
}

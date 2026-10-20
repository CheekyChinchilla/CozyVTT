/**
 * How large a map, token or avatar picture may be, in pixels and frames.
 *
 * A browser unpacks every frame of an animated GIF or WebP, so a file of a
 * few megabytes can take gigabytes in each player's browser. The limits are
 * read from the picture's header, which names its size and counts its frames
 * without unpacking any of them, before the picture is stored.
 *
 * They apply to pictures as they arrive (an upload, a campaign import, a
 * Universal VTT import). Pictures already stored are not checked again.
 */

import { promises as fs } from 'fs';
import { openPicture } from './sharpInput';

export const PICTURE_LIMITS = {
  /** The most pixels a picture, or each frame of one, may be on each side. */
  maxSide: 16_384,
  /** The most frames an animated picture may have. */
  maxFrames: 1_000,
  /** The most pixels an animated picture may hold across all its frames: width by height by frames. */
  maxAnimatedPixels: { MAP: 200_000_000, TOKEN: 50_000_000, AVATAR: 50_000_000 },
} as const;

/** The kinds of asset that are pictures. */
export type PictureAssetType = keyof typeof PICTURE_LIMITS.maxAnimatedPixels;

export function isPictureAssetType(type: string): type is PictureAssetType {
  return Object.hasOwn(PICTURE_LIMITS.maxAnimatedPixels, type);
}

const ANIMATION_WORDS: Record<PictureAssetType, string> = {
  MAP: 'An animated map',
  TOKEN: 'An animated token picture',
  AVATAR: 'An animated avatar',
};

export const UNREADABLE_PICTURE_MESSAGE =
  'CozyVTT could not read the size of this picture, so it cannot be checked. Save it again in an image editor and try once more.';

const count = (n: number) => n.toLocaleString('en-US');

/** Millions to one decimal place, rounded up, so a total over a limit never reads as the limit. */
const millions = (n: number) => `${count(Math.ceil(n / 100_000) / 10)} million`;

/**
 * A GIF's logical screen, the canvas a browser draws its frames on. The
 * image library reads a screen wider or taller than 2,048 pixels as a
 * mistake and reports the frames' size instead, so it is read here.
 */
async function gifScreen(input: Buffer | string): Promise<{ width: number; height: number }> {
  let head: Buffer;
  if (typeof input === 'string') {
    const file = await fs.open(input, 'r');
    try {
      head = Buffer.alloc(10);
      const { bytesRead } = await file.read(head, 0, 10, 0);
      head = head.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  } else {
    head = input.subarray(0, 10);
  }
  if (head.length < 10) return { width: 0, height: 0 };
  return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
}

/**
 * Reads `length` bytes at `offset` of a picture, fewer at its end. It
 * answers at once when the bytes are at hand, so a walk over many small
 * chunks does not wait once per chunk.
 */
type ReadAt = (offset: number, length: number) => Buffer | Promise<Buffer>;

/**
 * Calls `use` with a way to read `input` (bytes, or the path of a file) and
 * its length. A file is read through a window of 64 KiB.
 */
async function withReader<T>(input: Buffer | string, use: (readAt: ReadAt, length: number) => Promise<T>): Promise<T> {
  if (typeof input !== 'string') {
    return use((offset, length) => input.subarray(offset, offset + length), input.length);
  }
  const file = await fs.open(input, 'r');
  try {
    const size = (await file.stat()).size;
    let windowStart = 0;
    let window = Buffer.alloc(0);
    const readAt: ReadAt = (offset, length) => {
      if (offset >= windowStart && offset + length <= windowStart + window.length) {
        return window.subarray(offset - windowStart, offset - windowStart + length);
      }
      return (async () => {
        const buffer = Buffer.alloc(Math.max(64 * 1024, length));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
        windowStart = offset;
        window = buffer.subarray(0, bytesRead);
        return window.subarray(0, length);
      })();
    };
    return await use(readAt, size);
  } finally {
    await file.close();
  }
}

/** The tag of a WebP animation frame, 'ANMF', as a number. */
const ANMF = 0x414e4d46;

/**
 * How many frames a WebP holds, counting no further than one past the
 * limit, or null when `input` is not a WebP.
 *
 * The image library takes time that grows with the square of a WebP's
 * frames before it reports how many there are (10 seconds for 100,000), on
 * the threads every upload and thumbnail shares, so the frames are counted
 * here first. A WebP is a RIFF file: a 12-byte header, then chunks of an
 * 8-byte header (a tag and a length) and that many bytes, padded to an even
 * length. Each frame of an animation is an ANMF chunk. The walk stops at the
 * end of the file or of the RIFF length, whichever comes first, as the image
 * library does, and every step moves on by at least 8 bytes, so it ends
 * whatever the lengths say.
 */
async function webpFrames(input: Buffer | string): Promise<number | null> {
  return withReader(input, async (readAt, length) => {
    const head = await readAt(0, 12);
    if (head.length < 12 || head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WEBP') {
      return null;
    }
    const end = Math.min(length, 8 + head.readUInt32LE(4));
    let frames = 0;
    let offset = 12;
    while (offset + 8 <= end && frames <= PICTURE_LIMITS.maxFrames) {
      const read = readAt(offset, 8);
      const chunk = read instanceof Promise ? await read : read;
      if (chunk.length < 8) break;
      if (chunk.readUInt32BE(0) === ANMF) frames += 1;
      const size = chunk.readUInt32LE(4);
      offset += 8 + size + (size % 2);
    }
    return frames;
  });
}

/**
 * What is wrong with the size of a picture of `type`, in words, or null when
 * it is within the limits. `input` is the picture's bytes or the path of a
 * file nothing rewrites, already identified as a PNG, JPEG, WebP or GIF. A
 * picture whose size cannot be read is refused, since it cannot be checked.
 */
export async function pictureLimitProblem(input: Buffer | string, type: PictureAssetType): Promise<string | null> {
  const tooManyFrames = `An animated picture can have at most ${count(PICTURE_LIMITS.maxFrames)}.`;
  let width: number;
  let height: number;
  let frames: number;
  try {
    if (((await webpFrames(input)) ?? 0) > PICTURE_LIMITS.maxFrames) {
      return `This animation has more than ${count(PICTURE_LIMITS.maxFrames)} frames. ${tooManyFrames}`;
    }
    // Without `animated`, the height is one frame's and `pages` counts them.
    // Only the header is read, so the image library's default pixel limit
    // (16,383 squared, below 16,384 on each side) is lifted for it.
    const metadata = await (await openPicture(input, { limitInputPixels: false })).metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
    frames = metadata.pages ?? 1;
    if (metadata.format === 'gif') {
      const screen = await gifScreen(input);
      width = Math.max(width, screen.width);
      height = Math.max(height, screen.height);
    }
  } catch {
    return UNREADABLE_PICTURE_MESSAGE;
  }
  if (!(width > 0 && height > 0 && frames > 0)) return UNREADABLE_PICTURE_MESSAGE;

  const side = `A picture can be at most ${count(PICTURE_LIMITS.maxSide)} pixels on each side.`;
  if (width > PICTURE_LIMITS.maxSide) return `This picture is ${count(width)} pixels wide. ${side}`;
  if (height > PICTURE_LIMITS.maxSide) return `This picture is ${count(height)} pixels tall. ${side}`;
  if (frames === 1) return null;

  if (frames > PICTURE_LIMITS.maxFrames) {
    return `This animation has ${count(frames)} frames. ${tooManyFrames}`;
  }
  const pixels = width * height * frames;
  const limit = PICTURE_LIMITS.maxAnimatedPixels[type];
  if (pixels > limit) {
    return `This animation is ${millions(pixels)} pixels across its frames. ${ANIMATION_WORDS[type]} can be at most ${millions(limit)}.`;
  }
  return null;
}

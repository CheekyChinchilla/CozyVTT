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
 * What is wrong with the size of a picture of `type`, in words, or null when
 * it is within the limits. `input` is the picture's bytes or the path of a
 * file nothing rewrites, already identified as a PNG, JPEG, WebP or GIF. A
 * picture whose size cannot be read is refused, since it cannot be checked.
 */
export async function pictureLimitProblem(input: Buffer | string, type: PictureAssetType): Promise<string | null> {
  let width: number;
  let height: number;
  let frames: number;
  try {
    // Without `animated`, the height is one frame's and `pages` counts them.
    const metadata = await (await openPicture(input)).metadata();
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
    return `This animation has ${count(frames)} frames. An animated picture can have at most ${count(PICTURE_LIMITS.maxFrames)}.`;
  }
  const pixels = width * height * frames;
  const limit = PICTURE_LIMITS.maxAnimatedPixels[type];
  if (pixels > limit) {
    return `This animation is ${millions(pixels)} pixels across its frames. ${ANIMATION_WORDS[type]} can be at most ${millions(limit)}.`;
  }
  return null;
}

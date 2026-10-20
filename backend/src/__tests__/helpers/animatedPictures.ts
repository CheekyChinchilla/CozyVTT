/**
 * Animated pictures of any size and frame count, a few kilobytes each.
 *
 * Every frame is a single pixel in the corner of a canvas as large as the
 * test needs, so a GIF of 1,001 frames or one 20,000 pixels wide stays small
 * on disk while its header says what a browser would have to unpack.
 */

import sharp from 'sharp';

/**
 * A GIF89a whose logical screen is `width` by `height`, holding `frames`
 * frames of `frameWidth` by `frameHeight` pixels (one pixel by default), each
 * with a graphic control extension, at the canvas's top left.
 */
export function craftedGif(options: { width: number; height: number; frames: number; frameWidth?: number; frameHeight?: number }): Buffer {
  const { width, height, frames, frameWidth = 1, frameHeight = 1 } = options;
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0x80; // a global colour table of two entries
  const colourTable = Buffer.from([0, 0, 0, 255, 255, 255]);
  const loop = Buffer.concat([Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([3, 1, 0, 0, 0])]);
  const control = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00]);
  const descriptor = Buffer.from([0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  descriptor.writeUInt16LE(frameWidth, 5);
  descriptor.writeUInt16LE(frameHeight, 7);
  // LZW with a minimum code size of 2: clear, colour 0, end. A larger frame
  // is short of pixels, which decoders fill in.
  const pixels = Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00]);
  const frame = Buffer.concat([control, descriptor, pixels]);
  return Buffer.concat([Buffer.from('GIF89a', 'latin1'), screen, colourTable, loop, ...Array<Buffer>(frames).fill(frame), Buffer.from([0x3b])]);
}

const u24 = (value: number) => Buffer.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]);

function riffChunk(tag: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(tag, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

/**
 * An animated WebP whose canvas is `width` by `height`, holding `frames`
 * frames of one lossless pixel each. WebP itself allows at most 16,383
 * pixels on a side.
 */
export async function craftedAnimatedWebp(options: { width: number; height: number; frames: number }): Promise<Buffer> {
  const { width, height, frames } = options;
  const still = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ff000080' } }).webp({ lossless: true }).toBuffer();
  const bitstream = still.subarray(12); // its VP8L chunk, header and all
  const canvas = Buffer.concat([Buffer.from([0x12, 0, 0, 0]), u24(width - 1), u24(height - 1)]); // animation and alpha
  const anim = Buffer.from([0, 0, 0, 0, 0, 0]);
  const frame = riffChunk('ANMF', Buffer.concat([u24(0), u24(0), u24(0), u24(0), u24(100), Buffer.from([0]), bitstream]));
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), riffChunk('VP8X', canvas), riffChunk('ANIM', anim), ...Array<Buffer>(frames).fill(frame)]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** A still PNG of `width` by `height` pixels, of one colour. */
export function plainPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#808080' } }).png({ compressionLevel: 9 }).toBuffer();
}

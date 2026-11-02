/**
 * The codec Paint keeps its undo tiles in, the QOI image format. It is
 * lossless, so a tile comes back exactly as it was whatever it holds: every
 * step between neighbours at and just past the limits of the one and two
 * byte chunks, runs of every length across the longest one chunk can say,
 * colours seen before, changes of transparency, random tiles of every shape
 * a tile can be cut to, and a tile of one colour packs to about a kilobyte.
 * A tiny picture packs to the bytes worked out by hand from the format, so
 * a change to the hash or a chunk's layout that still reads back its own
 * bytes is caught too. A failure names the first pixel that differs.
 */

import { describe, it, expect } from 'vitest';
import { qoiEncode, qoiDecodeInto } from '../qoi';

/** The first pixel where `back` differs from `data`, described, or null where they are the same. */
function firstDifference(back: Uint8ClampedArray, data: Uint8ClampedArray): string | null {
  if (back.length !== data.length) return `lengths differ: ${back.length} against ${data.length}`;
  for (let i = 0; i < data.length; i += 1) {
    if (back[i] !== data[i]) {
      const px = Math.floor(i / 4) * 4;
      return `byte ${i}, pixel ${px / 4}: [${[...back.subarray(px, px + 4)]}] where it was [${[...data.subarray(px, px + 4)]}]`;
    }
  }
  return null;
}

/** Packs and unpacks `data` into a buffer holding other bytes, as the store's reused buffers do. */
function roundTrip(data: Uint8ClampedArray): { packed: Uint8Array; difference: string | null; whole: boolean } {
  const packed = qoiEncode(data);
  const back = new Uint8ClampedArray(data.length).fill(0xa5);
  const whole = qoiDecodeInto(packed, back);
  return { packed, difference: firstDifference(back, data), whole };
}

function expectExact(data: Uint8ClampedArray) {
  const { difference, whole } = roundTrip(data);
  expect(difference).toBeNull();
  expect(whole).toBe(true);
}

const pixels = (...px: number[][]) => new Uint8ClampedArray(px.flat());

/** A xorshift generator, every one of its 32 bits used: no period short enough to show in a tile. */
function random(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** Pairs of pixels, a base then the base moved by each step, all opaque, one picture. */
function steps(base: readonly [number, number, number], moves: Array<[number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(moves.length * 8);
  moves.forEach(([dr, dg, db], k) => {
    data.set([base[0], base[1], base[2], 255, (base[0] + dr) & 255, (base[1] + dg) & 255, (base[2] + db) & 255, 255], k * 8);
  });
  return data;
}

const BASES: Array<[number, number, number]> = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [127, 127, 127], [128, 128, 128], [253, 253, 253], [254, 254, 254], [255, 255, 255], [10, 128, 250]];

/** The tile shapes a picture's edge can cut a 256 pixel tile to, and the whole one. */
const SHAPES: Array<[number, number]> = [[256, 256], [1, 1], [1, 256], [256, 1], [17, 256], [256, 17], [255, 255], [61, 3], [62, 1], [63, 1], [100, 37], [120, 40]];

describe('the undo tile codec', () => {
  it('packs a tiny picture to the bytes the format gives it', () => {
    // A run of the starting colour, a small step, a larger one, a colour not
    // seen, a change of transparency, a colour seen before and a literal.
    const data = pixels(
      [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255],
      [1, 1, 1, 255],
      [10, 12, 14, 255],
      [0, 0, 0, 255],
      [128, 0, 0, 128],
      [10, 12, 14, 255],
      [200, 50, 50, 255],
    );
    expect([...qoiEncode(data)]).toEqual([0xc2, 0x7f, 0xab, 0x6a, 0x94, 0xa6, 0xff, 0x80, 0x00, 0x00, 0x80, 0x31, 0xfe, 0xc8, 0x32, 0x32]);
    expectExact(data);
  });

  it('reads a run of the starting colour as seen, as the format\'s own decoder does', () => {
    // Two of the starting colour, a literal, then the starting colour by its place among those seen.
    const back = new Uint8ClampedArray(5 * 4);
    expect(qoiDecodeInto(new Uint8Array([0xc1, 0xfe, 0x32, 0x3c, 0x46, 0x35, 0xc0]), back)).toBe(true);
    expect(firstDifference(back, pixels([0, 0, 0, 255], [0, 0, 0, 255], [50, 60, 70, 255], [0, 0, 0, 255], [0, 0, 0, 255]))).toBeNull();
  });

  it('gives back every small step exactly, those just past its limit too', () => {
    const moves: Array<[number, number, number]> = [];
    for (let dr = -3; dr <= 2; dr += 1) for (let dg = -3; dg <= 2; dg += 1) for (let db = -3; db <= 2; db += 1) moves.push([dr, dg, db]);
    for (const base of BASES) expectExact(steps(base, moves));
  });

  it('gives back every larger step exactly, those just past its limits too', () => {
    const moves: Array<[number, number, number]> = [];
    for (let dg = -33; dg <= 32; dg += 1) {
      for (let rg = -9; rg <= 8; rg += 1) for (let bg = -9; bg <= 8; bg += 1) moves.push([dg + rg, dg, dg + bg]);
    }
    for (const base of BASES) expectExact(steps(base, moves));
  });

  it('gives back runs of every length up to 200 exactly, at the start, in the middle and at the end', () => {
    for (const colour of [[0, 0, 0, 255], [0, 0, 0, 0], [232, 220, 196, 255]]) {
      for (let length = 1; length <= 200; length += 1) {
        const run = Array.from({ length }, () => colour);
        expectExact(pixels(...run, [9, 9, 9, 255]));
        expectExact(pixels([9, 9, 9, 255], ...run, [7, 7, 7, 255]));
        expectExact(pixels([9, 9, 9, 255], ...run));
      }
    }
  });

  it('gives back colours seen before and changes of transparency exactly', () => {
    expectExact(pixels(
      [10, 20, 30, 255], [11, 20, 29, 255], [12, 21, 28, 255],
      [40, 50, 60, 255], [70, 60, 90, 255],
      [10, 20, 30, 255], [11, 20, 29, 255],
      [0, 0, 0, 0], [0, 0, 0, 0], [12, 34, 56, 128], [12, 34, 56, 255], [12, 34, 56, 0], [0, 0, 0, 255],
    ));
  });

  it('gives back random tiles of every shape exactly: noise, steps, and a few colours', () => {
    const next = random(0x9e3779b9);
    for (const [w, h] of SHAPES) {
      const n = w * h * 4;
      const noise = new Uint8ClampedArray(n);
      for (let i = 0; i < n; i += 4) {
        const v = next();
        noise.set([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24], i);
      }
      expectExact(noise);

      // A random walk: mostly the one and two byte chunks.
      const walk = new Uint8ClampedArray(n);
      let c = [128, 128, 128];
      for (let i = 0; i < n; i += 4) {
        const v = next();
        const spread = v & 1 ? 2 : 40;
        c = c.map((x, k) => (x + (((v >>> (8 * k + 1)) & 255) % (2 * spread + 1)) - spread) & 255);
        walk.set([c[0], c[1], c[2], 255], i);
      }
      expectExact(walk);

      // Five colours in runs of random lengths: runs and colours seen before.
      const palette = [[232, 220, 196, 255], [85, 89, 95, 255], [74, 52, 35, 255], [121, 160, 80, 255], [0, 0, 0, 0]];
      const few = new Uint8ClampedArray(n);
      for (let i = 0; i < n;) {
        const v = next();
        const colour = palette[v % palette.length];
        for (let left = (v >>> 8) % 150; left >= 0 && i < n; left -= 1, i += 4) few.set(colour, i);
      }
      expectExact(few);
    }
  });

  it('packs a tile of one colour to about a kilobyte', () => {
    const data = new Uint8ClampedArray(256 * 256 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([232, 220, 196, 255], i);
    const { packed, difference } = roundTrip(data);
    expect(difference).toBeNull();
    // A literal and runs of 62.
    expect(packed.length).toBe(4 + Math.ceil((256 * 256 - 1) / 62));
  });

  it('says so when the bytes do not make up the tile exactly', () => {
    const data = new Uint8ClampedArray(64 * 4);
    const next = random(7);
    for (let i = 0; i < data.length; i += 1) data[i] = next() & 255;
    const packed = qoiEncode(data);
    const back = new Uint8ClampedArray(data.length);
    expect(qoiDecodeInto(packed, back)).toBe(true);
    expect(qoiDecodeInto(packed.slice(0, packed.length - 1), back)).toBe(false);
    expect(qoiDecodeInto(new Uint8Array([...packed, 0xc0]), back)).toBe(false);
    expect(qoiDecodeInto(packed, new Uint8ClampedArray(data.length + 4))).toBe(false);
  });
});

// ============================================
// The QOI image format ("Quite OK Image"), without its header and end
// marker, which Paint keeps its undo tiles in. It is lossless and quick
// both ways in plain script, so a tile packs to the same bytes in every
// browser, in a fraction of a millisecond, and comes back exactly. A
// painted map's flat colours pack small: runs of one colour, colours seen
// lately, and small steps between neighbours each take a byte or two.
// ============================================

/** The opening bytes of each kind of chunk. */
const OP_INDEX = 0x00;
const OP_DIFF = 0x40;
const OP_LUMA = 0x80;
const OP_RUN = 0xc0;
const OP_RGB = 0xfe;
const OP_RGBA = 0xff;
const MASK = 0xc0;

/** The most pixels one run can say. */
const LONGEST_RUN = 62;

/** Where the colour is kept among the 64 seen lately. */
const slot = (r: number, g: number, b: number, a: number) => (r * 3 + g * 5 + b * 7 + a * 11) & 63;

/** Reused between tiles: the most a tile can take, five bytes a pixel. */
let scratch = new Uint8Array(0);

/** Pixels, four bytes each as getImageData gives them, packed. */
export function qoiEncode(data: Uint8ClampedArray): Uint8Array<ArrayBuffer> {
  const end = data.length - (data.length % 4);
  if (scratch.length < (end / 4) * 5) scratch = new Uint8Array((end / 4) * 5);
  const out = scratch;
  const seen = new Uint32Array(64);
  let o = 0;
  let pr = 0;
  let pg = 0;
  let pb = 0;
  let pa = 255;
  let run = 0;
  for (let i = 0; i < end; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (r === pr && g === pg && b === pb && a === pa) {
      run += 1;
      if (run === LONGEST_RUN) {
        out[o++] = OP_RUN | (run - 1);
        run = 0;
      }
      continue;
    }
    if (run > 0) {
      out[o++] = OP_RUN | (run - 1);
      run = 0;
    }
    const h = slot(r, g, b, a);
    const colour = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    if (seen[h] === colour) {
      out[o++] = OP_INDEX | h;
    } else {
      seen[h] = colour;
      if (a === pa) {
        const dr = r - pr;
        const dg = g - pg;
        const db = b - pb;
        const drg = dr - dg;
        const dbg = db - dg;
        if (dr > -3 && dr < 2 && dg > -3 && dg < 2 && db > -3 && db < 2) {
          out[o++] = OP_DIFF | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2);
        } else if (dg > -33 && dg < 32 && drg > -9 && drg < 8 && dbg > -9 && dbg < 8) {
          out[o++] = OP_LUMA | (dg + 32);
          out[o++] = ((drg + 8) << 4) | (dbg + 8);
        } else {
          out[o++] = OP_RGB;
          out[o++] = r;
          out[o++] = g;
          out[o++] = b;
        }
      } else {
        out[o++] = OP_RGBA;
        out[o++] = r;
        out[o++] = g;
        out[o++] = b;
        out[o++] = a;
      }
    }
    pr = r;
    pg = g;
    pb = b;
    pa = a;
  }
  if (run > 0) out[o++] = OP_RUN | (run - 1);
  return out.slice(0, o);
}

/**
 * Packed pixels unpacked into `data`. True when the bytes make up exactly
 * as many pixels as `data` holds; false for bytes cut short, bytes left
 * over, or a run past the end, when what `data` holds is not to be used.
 */
export function qoiDecodeInto(packed: Uint8Array, data: Uint8ClampedArray): boolean {
  const seen = new Uint8Array(256);
  const end = data.length - (data.length % 4);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let p = 0;
  let i = 0;
  while (i < end && p < packed.length) {
    const b1 = packed[p++];
    let count = 1;
    if (b1 === OP_RGB) {
      r = packed[p++];
      g = packed[p++];
      b = packed[p++];
    } else if (b1 === OP_RGBA) {
      r = packed[p++];
      g = packed[p++];
      b = packed[p++];
      a = packed[p++];
    } else if ((b1 & MASK) === OP_INDEX) {
      const h = b1 * 4;
      r = seen[h];
      g = seen[h + 1];
      b = seen[h + 2];
      a = seen[h + 3];
    } else if ((b1 & MASK) === OP_DIFF) {
      r = (r + ((b1 >> 4) & 3) - 2) & 255;
      g = (g + ((b1 >> 2) & 3) - 2) & 255;
      b = (b + (b1 & 3) - 2) & 255;
    } else if ((b1 & MASK) === OP_LUMA) {
      const b2 = packed[p++];
      const dg = (b1 & 63) - 32;
      r = (r + dg - 8 + ((b2 >> 4) & 15)) & 255;
      g = (g + dg) & 255;
      b = (b + dg - 8 + (b2 & 15)) & 255;
    } else {
      // A run of the colour before.
      count = (b1 & 63) + 1;
    }
    // Every colour read is among those seen, a run's too, as the format's own decoder keeps them.
    const h = slot(r, g, b, a) * 4;
    seen[h] = r;
    seen[h + 1] = g;
    seen[h + 2] = b;
    seen[h + 3] = a;
    for (; count > 0; count -= 1) {
      if (i >= end) return false;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
      i += 4;
    }
  }
  return i === end && p === packed.length;
}

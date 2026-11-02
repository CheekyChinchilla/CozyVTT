// ============================================
// The fill bucket, tile by tile. Pure: the page hands it the picture's
// tiles to read and write, and it never reads the whole picture at once.
//
// The area filled is the pixels joined side to side or up and down (not
// corner to corner) to the one pressed, whose colour is within the
// tolerance of its colour on every channel, as MS Paint's bucket does with
// a tolerance of 0. The tolerance lets the soft edge of a brush stroke be
// filled up to.
//
// A tile is read as the fill reaches it, filled as far as the fill goes
// inside it, written back and let go of; where a run of the fill touches
// the tile's edge, the next tile is given that run to go on from. A mask
// of one bit a pixel, kept for each tile reached, stops anything being
// filled twice, and a tile the fill comes back to is read again only if
// some of what it is given to go on from is not filled yet. So one
// tile's pixels are held at a time, and each tile changed is handed over
// as it was, once, before its first change, for undo.
// ============================================

import type { PaintBox, TileRect } from './paintHistory';
import type { Rgba } from './pixelColour';

/** Pixels, four bytes each, red, green, blue and alpha, row by row (an ImageData). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** The picture, as the fill reads and writes it: by tiles of `tileSize` pixels, in pixels of type P. */
export interface FillTiles<P extends Pixels = Pixels> {
  width: number;
  height: number;
  tileSize: number;
  /** The tile's pixels as the picture has them now; the fill writes into them. */
  read(tile: TileRect): P;
  /** The tile is about to change for the first time: its pixels as they are. */
  changing(tile: TileRect, pixels: P): void;
  /** Put the tile's changed pixels back on the picture. */
  write(tile: TileRect, pixels: P): void;
  /** The fill is done with the tile's pixels for now. */
  done?(tile: TileRect): void;
}

/** A run of pixels in one row of the picture, from x0 to x1 inclusive, to go on filling from. */
interface Span {
  x0: number;
  x1: number;
  y: number;
}

/**
 * Fill the area at (x, y) with `colour`, taking in pixels within
 * `tolerance` (0 to 255) of the pressed pixel's colour on every channel.
 * Answers the box changed, or null for nothing changed: a press off the
 * picture, or on the fill colour itself.
 */
export function floodFillTiled<P extends Pixels>(tiles: FillTiles<P>, x: number, y: number, colour: Rgba, tolerance: number): PaintBox | null {
  const { width, height, tileSize } = tiles;
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;
  const columns = Math.ceil(width / tileSize);

  const tileAt = (tx: number, ty: number): TileRect => {
    const tileX = tx * tileSize;
    const tileY = ty * tileSize;
    return { tx, ty, x: tileX, y: tileY, w: Math.min(tileSize, width - tileX), h: Math.min(tileSize, height - tileY) };
  };

  // The colour pressed, from its own tile.
  const first = tileAt(Math.floor(sx / tileSize), Math.floor(sy / tileSize));
  const firstPixels = tiles.read(first);
  const at = ((sy - first.y) * first.w + (sx - first.x)) * 4;
  const seed = [firstPixels.data[at], firstPixels.data[at + 1], firstPixels.data[at + 2], firstPixels.data[at + 3]];
  if (seed[0] === colour[0] && seed[1] === colour[1] && seed[2] === colour[2] && seed[3] === colour[3]) {
    tiles.done?.(first);
    return null;
  }
  /** The pressed tile's pixels, read already, which its first turn fills. */
  let firstRead: P | null = firstPixels;
  const firstKey = first.ty * columns + first.tx;

  /** One bit a pixel, for each tile reached: filled already. */
  const masks = new Map<number, Uint8Array>();
  /** The runs each tile is to go on from, and the tiles with some, in the order given. */
  const spans = new Map<number, Span[]>();
  const order: number[] = [];
  const changed = new Set<number>();
  const give = (span: Span) => {
    const key = Math.floor(span.y / tileSize) * columns + Math.floor(span.x0 / tileSize);
    const waiting = spans.get(key);
    if (waiting) {
      waiting.push(span);
      return;
    }
    spans.set(key, [span]);
    order.push(key);
  };
  give({ x0: sx, x1: sx, y: sy });

  let bx0 = sx;
  let bx1 = sx;
  let by0 = sy;
  let by1 = sy;

  while (order.length > 0) {
    const key = order.pop()!;
    const given = spans.get(key);
    spans.delete(key);
    if (!given || given.length === 0) continue;
    const tile = tileAt(key % columns, Math.floor(key / columns));
    const { w, h } = tile;
    let mask = masks.get(key);
    if (!mask) {
      mask = new Uint8Array(Math.ceil((w * h) / 8));
      masks.set(key, mask);
    }
    const filled = (i: number) => (mask[i >> 3] & (1 << (i & 7))) !== 0;
    // Pixels inside this tile to fill from, in its own coordinates, two numbers each: none filled already.
    const stack: number[] = [];
    for (const span of given) {
      for (let gx = Math.max(span.x0, tile.x); gx <= Math.min(span.x1, tile.x + w - 1); gx += 1) {
        if (!filled((span.y - tile.y) * w + gx - tile.x)) stack.push(gx - tile.x, span.y - tile.y);
      }
    }
    // All filled: the tile is not read again.
    if (stack.length === 0) continue;
    const pixels = key === firstKey && firstRead ? firstRead : tiles.read(tile);
    if (key === firstKey) firstRead = null;
    const data = pixels.data;
    let wrote = false;
    const matches = (i: number) => {
      if (filled(i)) return false;
      const o = i * 4;
      return Math.abs(data[o] - seed[0]) <= tolerance && Math.abs(data[o + 1] - seed[1]) <= tolerance
        && Math.abs(data[o + 2] - seed[2]) <= tolerance && Math.abs(data[o + 3] - seed[3]) <= tolerance;
    };
    while (stack.length > 0) {
      const ly = stack.pop()!;
      let lx = stack.pop()!;
      const row = ly * w;
      if (!matches(row + lx)) continue;
      while (lx > 0 && matches(row + lx - 1)) lx -= 1;
      const runStart = lx;
      let above = false;
      let below = false;
      for (; lx < w && matches(row + lx); lx += 1) {
        const i = row + lx;
        if (!wrote) {
          if (!changed.has(key)) {
            tiles.changing(tile, pixels);
            changed.add(key);
          }
          wrote = true;
        }
        mask[i >> 3] |= 1 << (i & 7);
        data[i * 4] = colour[0];
        data[i * 4 + 1] = colour[1];
        data[i * 4 + 2] = colour[2];
        data[i * 4 + 3] = colour[3];
        if (ly > 0) {
          const fits = matches(i - w);
          if (fits && !above) stack.push(lx, ly - 1);
          above = fits;
        }
        if (ly < h - 1) {
          const fits = matches(i + w);
          if (fits && !below) stack.push(lx, ly + 1);
          below = fits;
        }
      }
      const runEnd = lx - 1;
      const gy = tile.y + ly;
      // The run goes on into the tiles beside, above and below.
      if (runStart === 0 && tile.x > 0) give({ x0: tile.x - 1, x1: tile.x - 1, y: gy });
      if (runEnd === w - 1 && tile.x + w < width) give({ x0: tile.x + w, x1: tile.x + w, y: gy });
      if (ly === 0 && tile.y > 0) give({ x0: tile.x + runStart, x1: tile.x + runEnd, y: gy - 1 });
      if (ly === h - 1 && tile.y + h < height) give({ x0: tile.x + runStart, x1: tile.x + runEnd, y: gy + 1 });
      bx0 = Math.min(bx0, tile.x + runStart);
      bx1 = Math.max(bx1, tile.x + runEnd);
      by0 = Math.min(by0, gy);
      by1 = Math.max(by1, gy);
    }
    if (wrote) tiles.write(tile, pixels);
    tiles.done?.(tile);
  }
  return changed.size > 0 ? { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 } : null;
}

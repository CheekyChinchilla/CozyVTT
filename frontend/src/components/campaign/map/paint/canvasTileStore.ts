// ============================================
// Paint's undo tiles as the browser keeps them.
//
// The picture's canvas is made to be read often (willReadFrequently), which
// keeps its pixels where the page reads them fastest, so a tile is read
// straight off it, at once, in every browser. A tile is read as a change
// first reaches it and packed there and then (qoi.ts: a few hundred bytes
// for a tile of one colour, a few kilobytes for a painted one, in a
// fraction of a millisecond), so no tile is held as raw pixels and the
// lift has nothing left to do. Packed alike in every browser, a tile counts
// the same against undo's budget in each. It is put back by unpacking it
// into a buffer kept for its size and writing that over the tile: at once,
// and exactly, whatever the context's transform, alpha or compositing.
// ============================================

import type { TileRect, TileStore } from './paintHistory';
import { qoiDecodeInto, qoiEncode } from './qoi';

/** A tile's pixels, four bytes each, as getImageData gives them. */
export type TilePixels = ImageData;

/** A tile as kept: its pixels packed, until let go of. */
export interface KeptTile {
  packed: Uint8Array<ArrayBuffer> | null;
}

export interface CanvasTileStore extends TileStore<KeptTile> {
  /** The tile's pixels as the picture has them now, a copy the caller may change. */
  read(tile: TileRect): TilePixels;
  /** Keep a tile's pixels already read, as the fill does before it changes them: packed at once. */
  keep(tile: TileRect, pixels: TilePixels): KeptTile;
  /** Let go of the buffers tiles are put back through. */
  dispose(): void;
}

/** The tile store for the picture `ctx` draws on, which every read and restore works on. */
export function createCanvasTileStore(ctx: CanvasRenderingContext2D): CanvasTileStore {
  /** A buffer for each size of tile put back: a whole one, and those cut at the right and bottom edges. */
  const buffers = new Map<string, TilePixels>();

  const read = (tile: TileRect): TilePixels => ctx.getImageData(tile.x, tile.y, tile.w, tile.h);
  const keep = (_tile: TileRect, pixels: TilePixels): KeptTile => ({ packed: qoiEncode(pixels.data) });

  return {
    read,
    keep,
    capture: (tile: TileRect) => keep(tile, read(tile)),

    restore(tile: TileRect, kept: KeptTile): void {
      if (!kept.packed) {
        console.warn('[paint] A tile kept for undo is gone; undo leaves it as it is.');
        return;
      }
      const size = `${tile.w}x${tile.h}`;
      let buffer = buffers.get(size);
      if (!buffer) {
        buffer = ctx.createImageData(tile.w, tile.h);
        buffers.set(size, buffer);
      }
      qoiDecodeInto(kept.packed, buffer.data);
      ctx.putImageData(buffer, tile.x, tile.y);
    },

    bytes: (kept: KeptTile) => kept.packed?.byteLength ?? 0,

    release(kept: KeptTile) {
      kept.packed = null;
    },

    dispose() {
      buffers.clear();
    },
  };
}

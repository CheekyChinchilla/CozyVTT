// ============================================
// Paint's undo tiles as the browser keeps them: each one copied off the
// picture onto a small canvas and packed as a PNG, a few hundred bytes for
// a tile of one colour, a few tens of kilobytes for a busy one.
//
// The copy is a drawImage onto a canvas the tile's size, which the GPU
// does, so the picture's canvas is never read back pixel by pixel and stays
// quick to draw on the map. A canvas hands toBlob a copy of its pixels as
// it is asked, so the one small canvas is used again for the next tile at
// once; until a PNG is made, its tile's copy waits in the browser, which
// packingBytes() counts.
// ============================================

import type { TileRect, TileStore } from './paintHistory';
import { pictureToPng, releaseCanvas, type MakeCanvas } from './blankPicture';

/** A tile as kept: its PNG once packed. */
export interface PackedTile {
  png: Blob | null;
  /** The PNG on its way, until it is made. */
  packing: Promise<Blob | null> | null;
  /** The bytes of the tile's copy while it waits to be packed. */
  rawBytes: number;
  released: boolean;
}

export interface CanvasTileStore extends TileStore<PackedTile> {
  /** The bytes of tiles copied and not yet packed. */
  packingBytes(): number;
  /** Let go of the small canvas. */
  dispose(): void;
}

export interface CanvasTileStoreOptions {
  /** Told each time a tile is packed, so the history can hold to its budget. */
  onPacked: () => void;
  make?: MakeCanvas;
}

/** A PNG decoded, to draw: by createImageBitmap, or a picture where a browser has none. */
async function decode(png: Blob): Promise<{ image: CanvasImageSource; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(png);
    return { image: bitmap, done: () => bitmap.close() };
  }
  const url = URL.createObjectURL(png);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { image, done: () => URL.revokeObjectURL(url) };
}

/** The tile store for a picture held in `picture`, which every capture and restore works on. */
export function createCanvasTileStore(picture: HTMLCanvasElement, options: CanvasTileStoreOptions): CanvasTileStore {
  const make = options.make ?? (() => document.createElement('canvas'));
  let scratch: HTMLCanvasElement | null = null;
  let waiting = 0;

  return {
    capture(tile: TileRect): PackedTile {
      scratch ??= make();
      if (scratch.width !== tile.w) scratch.width = tile.w;
      if (scratch.height !== tile.h) scratch.height = tile.h;
      const kept: PackedTile = { png: null, packing: null, rawBytes: tile.w * tile.h * 4, released: false };
      const ctx = scratch.getContext('2d');
      if (!ctx) return kept;
      ctx.clearRect(0, 0, tile.w, tile.h);
      ctx.drawImage(picture, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
      waiting += kept.rawBytes;
      kept.packing = pictureToPng(scratch).then((png) => {
        waiting -= kept.rawBytes;
        kept.packing = null;
        if (kept.released) return null;
        kept.png = png;
        options.onPacked();
        return png;
      });
      return kept;
    },

    async restore(tile: TileRect, kept: PackedTile): Promise<void> {
      const png = kept.png ?? (kept.packing ? await kept.packing : null);
      if (!png) {
        console.warn('[paint] A tile kept for undo could not be packed; undo leaves it as it is.');
        return;
      }
      const { image, done } = await decode(png);
      const ctx = picture.getContext('2d');
      if (!ctx) {
        done();
        return;
      }
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(tile.x, tile.y, tile.w, tile.h);
        ctx.drawImage(image, tile.x, tile.y);
      } finally {
        ctx.restore();
        done();
      }
    },

    bytes: (kept: PackedTile) => kept.png?.size ?? 0,

    release(kept: PackedTile) {
      kept.released = true;
      kept.png = null;
    },

    packingBytes: () => waiting,

    dispose() {
      if (scratch) releaseCanvas(scratch);
      scratch = null;
    },
  };
}

// ============================================
// Paint's undo tiles as the browser keeps them.
//
// A tile is copied off the picture onto a small canvas of its own as a
// stroke first reaches it: a drawImage, which is quick, and leaves the
// picture's canvas unread pixel by pixel, so it stays quick to draw on the
// map. Packing it as a PNG is not quick (Safari makes the PNG there and
// then, a few milliseconds a tile), so it waits for the page to be idle and
// goes one tile a slice; the copy's canvas is then used again for the next
// tile. A PNG is a few hundred bytes for a tile of one colour, a few tens of
// kilobytes for a busy one; until then a tile counts as its copy, four
// bytes a pixel. A tile is put back from its copy while it has one, at
// once, else from its PNG, decoded first.
// ============================================

import type { TileRect, TileStore } from './paintHistory';
import { pictureToPng, releaseCanvas, type MakeCanvas } from './blankPicture';

/** A tile as kept: its copy until packed, then its PNG. */
export interface PackedTile {
  copy: HTMLCanvasElement | null;
  png: Blob | null;
  /** The bytes of the copy. */
  rawBytes: number;
  released: boolean;
}

export interface CanvasTileStore extends TileStore<PackedTile> {
  /** The bytes of tiles copied and not yet packed. */
  packingBytes(): number;
  /** Let go of every copy and the canvases kept for the next. */
  dispose(): void;
}

/** Runs `run` when the page is next idle. */
export type IdleSchedule = (run: () => void) => void;

/** requestIdleCallback where the browser has it (Safari has not), else a short timeout. */
export const whenIdle: IdleSchedule = (run) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 500 });
  else setTimeout(run, 16);
};

export interface CanvasTileStoreOptions {
  /** Told each time a tile is packed, so the history can hold to its budget. */
  onPacked: () => void;
  make?: MakeCanvas;
  schedule?: IdleSchedule;
}

/** How many copies' canvases are kept, emptied, for the next tiles. */
const SPARE_CANVASES = 8;

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

/** Draw `image` over the tile's place on `picture`, replacing what is there. */
function putBack(picture: HTMLCanvasElement, tile: TileRect, image: CanvasImageSource): void {
  const ctx = picture.getContext('2d');
  if (!ctx) return;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(tile.x, tile.y, tile.w, tile.h);
    ctx.drawImage(image, tile.x, tile.y);
  } finally {
    ctx.restore();
  }
}

/** The tile store for a picture held in `picture`, which every capture and restore works on. */
export function createCanvasTileStore(picture: HTMLCanvasElement, options: CanvasTileStoreOptions): CanvasTileStore {
  const make = options.make ?? (() => document.createElement('canvas'));
  const schedule = options.schedule ?? whenIdle;
  const spare: HTMLCanvasElement[] = [];
  /** Tiles copied and waiting to be packed, oldest first. */
  const waiting: PackedTile[] = [];
  /** Every tile with a copy still, packed or not, so dispose can let go of them. */
  const copied = new Set<PackedTile>();
  let packing: PackedTile | null = null;
  let asked = false;
  let disposed = false;

  const letGo = (canvas: HTMLCanvasElement) => {
    if (!disposed && spare.length < SPARE_CANVASES) spare.push(canvas);
    else releaseCanvas(canvas);
  };
  const dropCopy = (kept: PackedTile) => {
    if (kept.copy) letGo(kept.copy);
    kept.copy = null;
    copied.delete(kept);
  };

  /** Pack the next tile waiting, in the next idle slice. */
  const pump = () => {
    if (asked || packing || disposed) return;
    while (waiting.length > 0 && waiting[0].released) waiting.shift();
    if (waiting.length === 0) return;
    asked = true;
    schedule(() => {
      asked = false;
      while (waiting.length > 0 && waiting[0].released) waiting.shift();
      const next = waiting.shift();
      if (!next?.copy || disposed) {
        pump();
        return;
      }
      packing = next;
      void pictureToPng(next.copy).then((png) => {
        packing = null;
        if (next.released || disposed) {
          dropCopy(next);
        } else if (png) {
          next.png = png;
          dropCopy(next);
          options.onPacked();
        }
        // One that could not be packed keeps its copy, to be put back from.
        pump();
      });
    });
  };

  return {
    capture(tile: TileRect): PackedTile {
      const copy = spare.pop() ?? make();
      if (copy.width !== tile.w) copy.width = tile.w;
      if (copy.height !== tile.h) copy.height = tile.h;
      const kept: PackedTile = { copy, png: null, rawBytes: tile.w * tile.h * 4, released: false };
      const ctx = copy.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, tile.w, tile.h);
        ctx.drawImage(picture, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
      }
      copied.add(kept);
      waiting.push(kept);
      pump();
      return kept;
    },

    async restore(tile: TileRect, kept: PackedTile): Promise<void> {
      if (kept.copy) {
        putBack(picture, tile, kept.copy);
        return;
      }
      if (!kept.png) {
        console.warn('[paint] A tile kept for undo is gone; undo leaves it as it is.');
        return;
      }
      const { image, done } = await decode(kept.png);
      try {
        putBack(picture, tile, image);
      } finally {
        done();
      }
    },

    bytes: (kept: PackedTile) => (kept.png ? kept.png.size : kept.copy ? kept.rawBytes : 0),

    release(kept: PackedTile) {
      kept.released = true;
      kept.png = null;
      // A copy being packed goes when its PNG is made.
      if (packing !== kept) dropCopy(kept);
    },

    packingBytes: () => [...copied].reduce((n, kept) => n + (kept.png || kept.released ? 0 : kept.rawBytes), 0),

    dispose() {
      disposed = true;
      for (const kept of copied) {
        if (kept.copy) releaseCanvas(kept.copy);
        kept.copy = null;
      }
      copied.clear();
      waiting.length = 0;
      for (const canvas of spare) releaseCanvas(canvas);
      spare.length = 0;
    },
  };
}

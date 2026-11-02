// ============================================
// Paint's undo and redo, by tiles.
//
// A 4,096 by 4,096 picture is 64 MiB, so a copy of it for every step would
// run a phone out of memory within a few strokes. Before a change lands,
// only the 256 by 256 tiles its box touches are kept as they were, and a
// store keeps them as small as it can (the browser's, as PNGs: a few hundred
// bytes for a tile of one colour). Undo puts a step's tiles back, keeping
// what they held so redo can put that back in turn.
//
// The steps are held within a byte budget and a count. The oldest goes
// first, never the newest, so the last change can always be undone; a new
// change drops what could be redone. A store may still be packing a tile
// when it is kept, and counts it once packed (`trim` is then asked again).
//
// Putting tiles back can wait on the browser (a PNG is decoded first), so
// undo and redo run one at a time, and a change made meanwhile waits until
// they are done: an undo never paints over a stroke made after it.
// ============================================

import { errorSummary } from '@/utils/errors';

/** The side of a tile, in picture pixels. */
export const PAINT_TILE = 256;

/** A box of picture pixels, x0 and y0 in, x1 and y1 out. */
export interface PaintBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A tile: its column and row, and the pixels it covers, cut at the picture's edge. */
export interface TileRect {
  tx: number;
  ty: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The tiles of a `width` by `height` picture a box overlaps, row by row. */
export function tilesTouching(box: PaintBox, width: number, height: number, size = PAINT_TILE): TileRect[] {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(width, Math.ceil(box.x1));
  const y1 = Math.min(height, Math.ceil(box.y1));
  if (!(x1 > x0 && y1 > y0)) return [];
  const tiles: TileRect[] = [];
  for (let ty = Math.floor(y0 / size); ty <= Math.floor((y1 - 1) / size); ty += 1) {
    for (let tx = Math.floor(x0 / size); tx <= Math.floor((x1 - 1) / size); tx += 1) {
      const x = tx * size;
      const y = ty * size;
      tiles.push({ tx, ty, x, y, w: Math.min(size, width - x), h: Math.min(size, height - y) });
    }
  }
  return tiles;
}

/** How the pixels of a tile are kept and put back. */
export interface TileStore<K> {
  /** Keep the tile's pixels as they are now; taken at once, though packing them may finish later. */
  capture(tile: TileRect): K;
  /** Put kept pixels back over what the tile holds now. */
  restore(tile: TileRect, kept: K): void | Promise<void>;
  /** The bytes kept pixels take now; nothing for a tile not yet packed. */
  bytes(kept: K): number;
  /** Let go of kept pixels. */
  release(kept: K): void;
}

export interface PaintHistoryOptions {
  /** The picture's size, in pixels. */
  width: number;
  height: number;
  /** The most bytes the kept tiles may take together, undo and redo alike. */
  budgetBytes: number;
  /** The most steps that may be undone. */
  maxSteps: number;
  /** Told after every change, undo, redo or trim. */
  onChange?: () => void;
}

export interface PaintHistoryCounts {
  undo: number;
  redo: number;
  bytes: number;
  tiles: number;
}

export interface PaintHistory {
  /**
   * Make a change to the pixels in `box`: its tiles are kept first, then
   * `apply` draws it. At once, unless an undo or a redo is under way, which
   * it waits for; the promise settles once it is made.
   */
  change(box: PaintBox, apply: () => void): Promise<void>;
  /** Undo the last change. True when there was one. */
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Whether an undo, a redo or a change waiting for one is under way. */
  busy(): boolean;
  counts(): PaintHistoryCounts;
  /** Hold the steps to the budget again, after the store has packed some tiles. */
  trim(): void;
  /** Let go of every step. */
  clear(): void;
}

interface Step<K> {
  tiles: Array<{ tile: TileRect; kept: K }>;
}

export function createPaintHistory<K>(store: TileStore<K>, options: PaintHistoryOptions): PaintHistory {
  const { width, height, budgetBytes, maxSteps, onChange } = options;
  const undone: Step<K>[] = [];
  const redoable: Step<K>[] = [];
  let queue: Promise<void> = Promise.resolve();
  let waiting = 0;

  const keep = (tiles: readonly TileRect[]): Step<K> => ({ tiles: tiles.map((tile) => ({ tile, kept: store.capture(tile) })) });
  const release = (step: Step<K>) => {
    for (const { kept } of step.tiles) store.release(kept);
  };
  const bytesOf = (step: Step<K>) => step.tiles.reduce((n, { kept }) => n + store.bytes(kept), 0);
  const total = () => [...undone, ...redoable].reduce((n, step) => n + bytesOf(step), 0);

  const trim = () => {
    while (undone.length > maxSteps) release(undone.shift()!);
    let bytes = total();
    while (bytes > budgetBytes && undone.length > 1) {
      const oldest = undone.shift()!;
      bytes -= bytesOf(oldest);
      release(oldest);
    }
    // Still over with one step to undo: the furthest redo goes.
    while (bytes > budgetBytes && redoable.length > 0) {
      const furthest = redoable.shift()!;
      bytes -= bytesOf(furthest);
      release(furthest);
    }
  };

  const make = (box: PaintBox, apply: () => void) => {
    const step = keep(tilesTouching(box, width, height));
    apply();
    while (redoable.length > 0) release(redoable.pop()!);
    undone.push(step);
    trim();
    onChange?.();
  };

  /** Run `job` after everything before it, one at a time. */
  const enqueue = (job: () => void | Promise<void>): Promise<void> => {
    waiting += 1;
    const run = queue
      .then(job)
      .catch((err: unknown) => {
        console.error('[paint] An undo or a redo failed:', errorSummary(err));
      })
      .finally(() => {
        waiting -= 1;
        onChange?.();
      });
    queue = run;
    return run;
  };

  /** Take the last step of `from`, put its tiles back, and keep what they held on `to`. */
  const swap = async (from: Step<K>[], to: Step<K>[]): Promise<boolean> => {
    const step = from.pop();
    if (!step) return false;
    const now = keep(step.tiles.map(({ tile }) => tile));
    try {
      await Promise.all(step.tiles.map(({ tile, kept }) => store.restore(tile, kept)));
    } catch (err) {
      release(now);
      throw err;
    } finally {
      release(step);
    }
    to.push(now);
    trim();
    return true;
  };

  const turn = (from: Step<K>[], to: Step<K>[]): Promise<boolean> => {
    let done = false;
    return enqueue(async () => {
      done = await swap(from, to);
    }).then(() => done);
  };

  return {
    change(box, apply) {
      if (waiting === 0) {
        make(box, apply);
        return Promise.resolve();
      }
      return enqueue(() => make(box, apply));
    },
    undo: () => turn(undone, redoable),
    redo: () => turn(redoable, undone),
    canUndo: () => undone.length > 0,
    canRedo: () => redoable.length > 0,
    busy: () => waiting > 0,
    counts: () => ({
      undo: undone.length,
      redo: redoable.length,
      bytes: total(),
      tiles: [...undone, ...redoable].reduce((n, step) => n + step.tiles.length, 0),
    }),
    trim() {
      trim();
      onChange?.();
    },
    clear() {
      while (undone.length > 0) release(undone.pop()!);
      while (redoable.length > 0) release(redoable.pop()!);
      onChange?.();
    },
  };
}

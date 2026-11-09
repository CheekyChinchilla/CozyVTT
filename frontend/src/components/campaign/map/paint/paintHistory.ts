// ============================================
// Paint's undo and redo, by tiles.
//
// A 4,096 by 4,096 picture is 64 MiB, so a copy of it for every step would
// run a phone out of memory within a few strokes. Only the 256 by 256 tiles
// a change touches are kept as they were, each as the change first reaches
// it (a stroke's, as it is drawn: begin() and cover()), so landing the
// change keeps nothing more and stays quick. A store keeps them as small as
// it can (the browser's packs each as it is kept: about a kilobyte for a
// tile of one colour). Undo puts a step's tiles back, keeping what they
// held so redo can put that back in turn.
//
// The steps are held within a byte budget and a count. The oldest goes
// first, never the newest, so the last change can always be undone; a new
// change drops what could be redone.
//
// A store may take its time putting tiles back, so undo and redo run one
// at a time, and a change made meanwhile waits until they are done: an
// undo never paints over a stroke made after it. A tile
// a change reached while an undo was under way, or that another change has
// landed on since it was kept, is kept again as the change lands.
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
  /** Keep the tile's pixels as they are now. */
  capture(tile: TileRect): K;
  /** Put kept pixels back over what the tile holds now. */
  restore(tile: TileRect, kept: K): void | Promise<void>;
  /** The bytes kept pixels count against the budget. */
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
  /** Told after every change, undo or redo. */
  onChange?: () => void;
  /**
   * Told of the tiles whose pixels a change, an undo or a redo has just
   * changed, once they are painted: what a draft writes next.
   */
  onTouched?: (tiles: readonly TileRect[]) => void;
}

export interface PaintHistoryCounts {
  undo: number;
  redo: number;
  bytes: number;
  tiles: number;
}

/**
 * What a change does besides its pixels, such as the walls a room adds:
 * told when an undo takes the change back and when a redo makes it again.
 */
export interface PaintStepNote {
  undone(): void;
  redone(): void;
}

/** A change on its way, such as a stroke being drawn. */
export interface PaintStep<K = unknown> {
  /** Keep the tiles `box` touches that this change has not kept yet, as they are now. */
  cover(box: PaintBox): void;
  /** Keep a tile the caller has already kept, as the fill does with the pixels it read. */
  keep(tile: TileRect, kept: K): void;
  /**
   * Make the change: `apply` draws it, at once unless an undo or a redo is
   * under way, which it waits for. The promise settles once it is made.
   * `note` goes with the change through every undo and redo.
   */
  land(apply: () => void, note?: PaintStepNote): Promise<void>;
  /** The change is not made: let go of what it kept. */
  drop(): void;
}

export interface PaintHistory<K = unknown> {
  /** Start a change whose tiles are kept as it goes (PaintStep.cover). */
  begin(): PaintStep<K>;
  /** Make a change to the pixels in `box` in one go: begin, cover `box`, land. */
  change(box: PaintBox, apply: () => void, note?: PaintStepNote): Promise<void>;
  /** Undo the last change. True when there was one. */
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Whether an undo, a redo or a change waiting for one is under way. */
  busy(): boolean;
  /** Settles once no undo, redo or change waiting for one is under way. */
  settled(): Promise<void>;
  counts(): PaintHistoryCounts;
  /** Let go of every step. */
  clear(): void;
}

interface Step<K> {
  tiles: Array<{ tile: TileRect; kept: K }>;
  note?: PaintStepNote;
}

export function createPaintHistory<K>(store: TileStore<K>, options: PaintHistoryOptions): PaintHistory<K> {
  const { width, height, budgetBytes, maxSteps, onChange, onTouched } = options;
  const undone: Step<K>[] = [];
  const redoable: Step<K>[] = [];
  let queue: Promise<void> = Promise.resolve();
  let waiting = 0;
  /** Counts every change landed, undo and redo: a tile kept at another count may have changed since. */
  let epoch = 0;

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

  const begin = (): PaintStep<K> => {
    /** The tiles kept so far, by column and row, with the count each was kept at. */
    const kept = new Map<string, { tile: TileRect; kept: K; at: number }>();
    /** Tiles reached while an undo or a redo was under way, kept as the change lands. */
    const reached = new Map<string, TileRect>();
    let over = false;
    const keyOf = (tile: TileRect) => `${tile.tx},${tile.ty}`;
    const keepNow = (tile: TileRect) => {
      kept.set(keyOf(tile), { tile, kept: store.capture(tile), at: epoch });
    };
    return {
      cover(box) {
        if (over) return;
        for (const tile of tilesTouching(box, width, height)) {
          const key = keyOf(tile);
          if (kept.has(key)) continue;
          if (waiting > 0) reached.set(key, tile);
          else keepNow(tile);
        }
      },
      keep(tile, k) {
        const key = keyOf(tile);
        if (over || kept.has(key)) {
          store.release(k);
          return;
        }
        kept.set(key, { tile, kept: k, at: epoch });
      },
      land(apply, note) {
        const make = () => {
          if (over) return;
          over = true;
          for (const [key, tile] of reached) if (!kept.has(key)) keepNow(tile);
          for (const entry of [...kept.values()]) {
            if (entry.at === epoch) continue;
            store.release(entry.kept);
            keepNow(entry.tile);
          }
          apply();
          epoch += 1;
          while (redoable.length > 0) release(redoable.pop()!);
          const step = { tiles: [...kept.values()].map(({ tile, kept: k }) => ({ tile, kept: k })), note };
          undone.push(step);
          onTouched?.(step.tiles.map(({ tile }) => tile));
          trim();
          onChange?.();
        };
        if (waiting === 0) {
          make();
          return Promise.resolve();
        }
        return enqueue(make);
      },
      drop() {
        if (over) return;
        over = true;
        for (const entry of kept.values()) store.release(entry.kept);
        kept.clear();
        reached.clear();
      },
    };
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
    onTouched?.(step.tiles.map(({ tile }) => tile));
    epoch += 1;
    to.push({ ...now, note: step.note });
    if (from === undone) step.note?.undone();
    else step.note?.redone();
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
    begin,
    change(box, apply, note) {
      const step = begin();
      step.cover(box);
      return step.land(apply, note);
    },
    undo: () => turn(undone, redoable),
    redo: () => turn(redoable, undone),
    canUndo: () => undone.length > 0,
    canRedo: () => redoable.length > 0,
    busy: () => waiting > 0,
    async settled() {
      while (waiting > 0) await queue;
    },
    counts: () => ({
      undo: undone.length,
      redo: redoable.length,
      bytes: total(),
      tiles: [...undone, ...redoable].reduce((n, step) => n + step.tiles.length, 0),
    }),
    clear() {
      while (undone.length > 0) release(undone.pop()!);
      while (redoable.length > 0) release(redoable.pop()!);
      onChange?.();
    },
  };
}

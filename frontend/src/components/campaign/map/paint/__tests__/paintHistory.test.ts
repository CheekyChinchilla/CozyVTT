/**
 * Undo and redo for Paint, by tiles of 256 by 256 pixels: before a change
 * lands, the tiles it touches are kept as they were, and only those, so a
 * stroke across one corner of a 16 megapixel picture keeps one tile, not the
 * picture. The steps are held within a byte budget and a count, the oldest
 * let go first, never the newest; a new change drops what could be redone.
 *
 * The tiles are kept here by a store over a plain pixel buffer, as the
 * browser's keeps them over the canvas (as PNGs), so what undo puts back can
 * be read pixel by pixel.
 */

import { describe, it, expect } from 'vitest';
import { createPaintHistory, tilesTouching, PAINT_TILE, type TileRect, type TileStore } from '../paintHistory';

/** A picture's pixels, one byte a pixel: enough to tell what changed. */
interface Picture { width: number; height: number; px: Uint8Array }

const picture = (width: number, height: number, fill = 0): Picture => ({ width, height, px: new Uint8Array(width * height).fill(fill) });

/** Lets every queued undo, redo and change run as far as it can. */
const settle = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

function paint(p: Picture, box: { x0: number; y0: number; x1: number; y1: number }, value: number) {
  for (let y = box.y0; y < box.y1; y += 1) for (let x = box.x0; x < box.x1; x += 1) p.px[y * p.width + x] = value;
}

/** Keeps a tile's pixels as a copy; `bytes` says what each copy costs, as a packed tile's size would. */
function bufferStore(p: Picture, bytes = (t: TileRect) => t.w * t.h): TileStore<{ t: TileRect; copy: Uint8Array }> & { released: number; captured: number } {
  const store = {
    released: 0,
    captured: 0,
    capture(t: TileRect) {
      store.captured += 1;
      const copy = new Uint8Array(t.w * t.h);
      for (let y = 0; y < t.h; y += 1) copy.set(p.px.subarray((t.y + y) * p.width + t.x, (t.y + y) * p.width + t.x + t.w), y * t.w);
      return { t, copy };
    },
    restore(t: TileRect, kept: { copy: Uint8Array }) {
      for (let y = 0; y < t.h; y += 1) p.px.set(kept.copy.subarray(y * t.w, (y + 1) * t.w), (t.y + y) * p.width + t.x);
    },
    bytes: (kept: { t: TileRect }) => bytes(kept.t),
    release() { store.released += 1; },
  };
  return store;
}

describe('the tiles a change touches', () => {
  it('are the 256 pixel tiles its box overlaps, cut at the picture\'s edge', () => {
    expect(PAINT_TILE).toBe(256);
    expect(tilesTouching({ x0: 10, y0: 10, x1: 20, y1: 20 }, 1000, 1000)).toEqual([{ tx: 0, ty: 0, x: 0, y: 0, w: 256, h: 256 }]);
    expect(tilesTouching({ x0: 250, y0: 900, x1: 260, y1: 1000 }, 1000, 1000)).toEqual([
      { tx: 0, ty: 3, x: 0, y: 768, w: 256, h: 232 },
      { tx: 1, ty: 3, x: 256, y: 768, w: 256, h: 232 },
    ]);
  });

  it('are none for a box off the picture or of no size', () => {
    expect(tilesTouching({ x0: -50, y0: -50, x1: -1, y1: -1 }, 1000, 1000)).toEqual([]);
    expect(tilesTouching({ x0: 1000, y0: 10, x1: 1200, y1: 20 }, 1000, 1000)).toEqual([]);
    expect(tilesTouching({ x0: 40, y0: 40, x1: 40, y1: 90 }, 1000, 1000)).toEqual([]);
  });

  it('are every tile of the picture, once each, for a box over all of it', () => {
    const all = tilesTouching({ x0: -10, y0: -10, x1: 5000, y1: 5000 }, 4096, 4096);
    expect(all).toHaveLength(256);
    expect(new Set(all.map((t) => `${t.tx},${t.ty}`)).size).toBe(256);
  });
});

describe('undo and redo', () => {
  it('put back what a change painted over, and paint it again', async () => {
    const p = picture(600, 600, 1);
    const history = createPaintHistory(bufferStore(p), { width: p.width, height: p.height, budgetBytes: 10_000_000, maxSteps: 50 });
    const box = { x0: 100, y0: 100, x1: 300, y1: 200 };
    history.change(box, () => paint(p, box, 7));
    expect(p.px[150 * 600 + 150]).toBe(7);

    expect(await history.undo()).toBe(true);
    expect(p.px[150 * 600 + 150]).toBe(1);
    expect(p.px.every((v) => v === 1)).toBe(true);

    expect(await history.redo()).toBe(true);
    expect(p.px[150 * 600 + 150]).toBe(7);
    expect(p.px[150 * 600 + 299]).toBe(7);
    expect(p.px[150 * 600 + 300]).toBe(1);
  });

  it('keep only the tiles a change touches', () => {
    const p = picture(4096, 4096);
    const store = bufferStore(p);
    const history = createPaintHistory(store, { width: p.width, height: p.height, budgetBytes: 100_000_000, maxSteps: 50 });
    history.change({ x0: 10, y0: 10, x1: 30, y1: 30 }, () => undefined);
    expect(store.captured).toBe(1);
    history.change({ x0: 250, y0: 250, x1: 260, y1: 260 }, () => undefined);
    expect(store.captured).toBe(5);
  });

  it('undo changes in the order they were made, last first, and stop when there are none', async () => {
    const p = picture(300, 300);
    const history = createPaintHistory(bufferStore(p), { width: p.width, height: p.height, budgetBytes: 10_000_000, maxSteps: 50 });
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    history.change(box, () => paint(p, box, 1));
    history.change(box, () => paint(p, box, 2));
    history.change(box, () => paint(p, box, 3));
    expect(history.counts()).toMatchObject({ undo: 3, redo: 0 });
    await history.undo();
    expect(p.px[0]).toBe(2);
    await history.undo();
    expect(p.px[0]).toBe(1);
    await history.undo();
    expect(p.px[0]).toBe(0);
    expect(await history.undo()).toBe(false);
    expect(history.counts()).toMatchObject({ undo: 0, redo: 3 });
    await history.redo();
    await history.redo();
    expect(p.px[0]).toBe(2);
  });

  it('drop what could be redone when a new change is made', async () => {
    const p = picture(300, 300);
    const store = bufferStore(p);
    const history = createPaintHistory(store, { width: p.width, height: p.height, budgetBytes: 10_000_000, maxSteps: 50 });
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    history.change(box, () => paint(p, box, 1));
    await history.undo();
    expect(history.canRedo()).toBe(true);
    history.change(box, () => paint(p, box, 5));
    expect(history.canRedo()).toBe(false);
    expect(await history.redo()).toBe(false);
    expect(store.released).toBeGreaterThan(0);
  });

  it('let go of the oldest steps past the step count, never the newest', () => {
    const p = picture(300, 300);
    const store = bufferStore(p);
    const history = createPaintHistory(store, { width: p.width, height: p.height, budgetBytes: 10_000_000, maxSteps: 30 });
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    for (let i = 0; i < 40; i += 1) history.change(box, () => paint(p, box, i));
    expect(history.counts().undo).toBe(30);
    expect(store.released).toBe(10);
  });

  it('let go of the oldest steps past the byte budget, keeping the newest however large', () => {
    const p = picture(1024, 1024);
    const store = bufferStore(p, () => 1000);
    const history = createPaintHistory(store, { width: p.width, height: p.height, budgetBytes: 5_000, maxSteps: 100 });
    const one = { x0: 0, y0: 0, x1: 10, y1: 10 };
    for (let i = 0; i < 4; i += 1) history.change(one, () => undefined);
    expect(history.counts()).toMatchObject({ undo: 4, bytes: 4000 });
    // Sixteen tiles, 16,000 bytes alone: every older step goes, this one stays.
    history.change({ x0: 0, y0: 0, x1: 1024, y1: 1024 }, () => undefined);
    expect(history.counts()).toMatchObject({ undo: 1, bytes: 16_000 });
    history.change(one, () => undefined);
    expect(history.counts()).toMatchObject({ undo: 1, bytes: 1000 });
  });

  it('count a tile still being packed once it is, and trim then', () => {
    const p = picture(300, 300);
    let packed = false;
    const store = bufferStore(p, () => (packed ? 3000 : 0));
    const history = createPaintHistory(store, { width: p.width, height: p.height, budgetBytes: 5_000, maxSteps: 100 });
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    history.change(box, () => undefined);
    history.change(box, () => undefined);
    expect(history.counts()).toMatchObject({ undo: 2, bytes: 0 });
    packed = true;
    history.trim();
    expect(history.counts()).toMatchObject({ undo: 1, bytes: 3000 });
  });

  it('hold a change made while an undo is putting tiles back until it has, so the undo never paints over it', async () => {
    const p = picture(300, 300);
    const base = bufferStore(p);
    let holding = true;
    let finishRestore: () => void = () => undefined;
    const slow: TileStore<{ t: TileRect; copy: Uint8Array }> = {
      ...base,
      capture: (t) => base.capture(t),
      restore: (t, kept) => {
        if (!holding) {
          base.restore(t, kept);
          return undefined;
        }
        return new Promise<void>((resolve) => {
          finishRestore = () => { base.restore(t, kept); resolve(); };
        });
      },
    };
    const history = createPaintHistory(slow, { width: p.width, height: p.height, budgetBytes: 10_000_000, maxSteps: 50 });
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    history.change(box, () => paint(p, box, 4));
    const undoing = history.undo();
    expect(history.busy()).toBe(true);
    const later = history.change(box, () => paint(p, box, 9));
    await settle();
    // Not yet: the undo has not put its tile back.
    expect(p.px[0]).toBe(4);
    finishRestore();
    await undoing;
    await later;
    expect(history.busy()).toBe(false);
    expect(p.px[0]).toBe(9);
    expect(history.counts()).toMatchObject({ undo: 1, redo: 0 });
    // Undoing the held change goes back to what the undo had put back.
    holding = false;
    await history.undo();
    expect(p.px[0]).toBe(0);
  });

  it('let go of every kept tile when cleared', async () => {
    const p = picture(300, 300);
    const store = bufferStore(p);
    const history = createPaintHistory(store, { width: p.width, height: p.height, budgetBytes: 10_000_000, maxSteps: 50 });
    const box = { x0: 0, y0: 0, x1: 300, y1: 300 };
    history.change(box, () => undefined);
    history.change(box, () => undefined);
    await history.undo();
    const before = store.released;
    history.clear();
    expect(history.counts()).toEqual({ undo: 0, redo: 0, bytes: 0, tiles: 0 });
    // Two steps of four tiles each, one of them now on the redo side.
    expect(store.released - before).toBe(8);
  });
});

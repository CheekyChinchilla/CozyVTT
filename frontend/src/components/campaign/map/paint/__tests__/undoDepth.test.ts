/**
 * How deep undo goes, with the history and the browser's tile store
 * together, on a 4,096 by 4,096 picture: 50 strokes back to back, each
 * reaching every one of its 256 tiles, as a stroke snaking across the
 * whole map does, leave at least 30 steps to undo. The tiles read back
 * hold a painted map's pattern (a floor colour, a wall band and a stroke
 * across), packed as the browser packs them.
 *
 * Every tile of a stroke packs to the same bytes, so a step's bytes are its
 * tiles times one tile's, and the history keeps a step or lets it go by
 * bytes and count alone. A picture an eighth as wide, 4 tiles a stroke
 * under a 64th of the budget, then keeps exactly the steps the whole
 * picture keeps, with a 64th of the tiles to pack.
 */

import { describe, it, expect, vi } from 'vitest';
import { createCanvasTileStore, type TilePixels } from '../canvasTileStore';
import { createPaintHistory } from '../paintHistory';
import { PAINT_UNDO_BUDGET_BYTES, PAINT_UNDO_STEPS } from '../usePaintSurface';
import { recordingContext } from '@/test/recordingCanvas';

vi.mock('@/services/map.service', () => ({ default: {} }));
vi.mock('@/services/api', () => ({ api: {} }));

const SIZE = 4096;
/** The picture standing in for the whole one, and its share of the budget. */
const SMALL = 512;
const SMALL_BUDGET = PAINT_UNDO_BUDGET_BYTES * (SMALL / SIZE) ** 2;

const FLOOR = [232, 220, 196];
const WALL = [85, 89, 95];
const WOOD = [74, 52, 35];
const GRASS = [121, 160, 80];

/**
 * A tile of a painted map: floor, a wall band, and two strokes across (this
 * one's and an older one's, by its number), each with a soft edge three
 * pixels wide. Packed, it is about 5 KB, as a painted map's tiles are in
 * the browser. Made once a stroke.
 */
const tiles = new Map<string, TilePixels>();
function paintedTile(w: number, h: number, stroke: number): TilePixels {
  const key = `${w},${h},${stroke}`;
  const made = tiles.get(key);
  if (made) return made;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ground = y > 100 && y < 130 ? WALL : FLOOR;
      let [r, g, b] = ground;
      // Each stroke over what is under it, its soft edge mixed in.
      for (let k = 0; k < 2; k += 1) {
        const d = k === 0 ? Math.abs(x - y - (stroke % 64)) : Math.abs(x + y - 256 - ((stroke * 37) % 128));
        const ink = k === 0 ? WOOD : GRASS;
        if (d < 20) {
          [r, g, b] = ink;
        } else if (d < 23) {
          const t = (d - 19) / 4;
          r = Math.round(r * t + ink[0] * (1 - t));
          g = Math.round(g * t + ink[1] * (1 - t));
          b = Math.round(b * t + ink[2] * (1 - t));
        }
      }
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tile = { width: w, height: h, data, colorSpace: 'srgb' } satisfies TilePixels;
  tiles.set(key, tile);
  return tile;
}

/** A picture whose tiles read back as the pattern of the stroke being painted, with the calls the store makes on it. */
function pictureOf(stroke: () => number, size = SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const { ctx, calls } = recordingContext(canvas);
  Object.assign(ctx, { getImageData: (_x: number, _y: number, w: number, h: number) => {
    calls.push({ method: 'getImageData', args: [_x, _y, w, h] });
    return paintedTile(w, h, stroke());
  } });
  return { ctx, calls };
}

describe('undo after 50 strokes over the whole picture', () => {
  it('keeps at least 30 steps', () => {
    let stroke = 0;
    const { ctx } = pictureOf(() => stroke, SMALL);
    const store = createCanvasTileStore(ctx);
    const history = createPaintHistory(store, { width: SMALL, height: SMALL, budgetBytes: SMALL_BUDGET, maxSteps: PAINT_UNDO_STEPS });
    for (stroke = 0; stroke < PAINT_UNDO_STEPS; stroke += 1) {
      const step = history.begin();
      // Row by row across the picture, as a snaking stroke reaches each tile.
      for (let ty = 0; ty < SMALL / 256; ty += 1) {
        for (let tx = 0; tx < SMALL / 256; tx += 1) {
          step.cover({ x0: tx * 256 + 10, y0: ty * 256 + 10, x1: tx * 256 + 20, y1: ty * 256 + 20 });
        }
      }
      void step.land(() => undefined);
    }
    const { undo, bytes } = history.counts();
    expect(undo).toBeGreaterThanOrEqual(30);
    // The budget let the oldest go, as it does on the whole picture: the bytes decided, not the count.
    expect(undo).toBeLessThan(PAINT_UNDO_STEPS);
    expect(bytes).toBeLessThanOrEqual(SMALL_BUDGET);
  });

  it('reads each tile as the stroke first reaches it, and nothing as it lands', () => {
    const { ctx, calls } = pictureOf(() => 0);
    const store = createCanvasTileStore(ctx);
    const history = createPaintHistory(store, { width: SIZE, height: SIZE, budgetBytes: PAINT_UNDO_BUDGET_BYTES, maxSteps: PAINT_UNDO_STEPS });
    const step = history.begin();
    for (let i = 0; i < 120; i += 1) {
      const tx = i % 16;
      const ty = Math.floor(i / 16);
      step.cover({ x0: tx * 256 + 10, y0: ty * 256 + 10, x1: tx * 256 + 20, y1: ty * 256 + 20 });
      expect(calls.filter((c) => c.method === 'getImageData')).toHaveLength(i + 1);
    }
    // Packed as it was read: the step counts its bytes as soon as it lands, with nothing more read.
    void step.land(() => undefined);
    expect(calls.filter((c) => c.method === 'getImageData')).toHaveLength(120);
    expect(history.counts().bytes).toBeGreaterThan(0);
  });
});

/**
 * How deep undo goes, with the history and the browser's tile store
 * together, on a 4,096 by 4,096 picture: 50 strokes back to back, each
 * reaching every one of its 256 tiles, as a stroke snaking across the
 * whole map does, leave at least 30 steps to undo. The tiles read back
 * hold a painted map's pattern (a floor colour, a wall band and a stroke
 * across), packed as the browser packs them.
 */

import { describe, it, expect } from 'vitest';
import { createCanvasTileStore, type TilePixels } from '../canvasTileStore';
import { createPaintHistory } from '../paintHistory';
import { recordingContext } from '@/test/recordingCanvas';

const SIZE = 4096;

const FLOOR = [232, 220, 196];
const WALL = [85, 89, 95];
const WOOD = [74, 52, 35];
const GRASS = [121, 160, 80];
const mix = (a: number[], b: number[], t: number) => a.map((v, k) => Math.round(v * t + b[k] * (1 - t)));

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
      let colour = y > 100 && y < 130 ? WALL : FLOOR;
      const strokes: Array<[number, number[]]> = [
        [Math.abs(x - y - (stroke % 64)), WOOD],
        [Math.abs(x + y - 256 - ((stroke * 37) % 128)), GRASS],
      ];
      for (const [d, ink] of strokes) {
        if (d < 20) colour = ink;
        else if (d < 23) colour = mix(colour, ink, (d - 19) / 4);
      }
      data.set([colour[0], colour[1], colour[2], 255], (y * w + x) * 4);
    }
  }
  const tile = { width: w, height: h, data, colorSpace: 'srgb' } as TilePixels;
  tiles.set(key, tile);
  return tile;
}

/** A picture whose tiles read back as the pattern of the stroke being painted, with the calls the store makes on it. */
function pictureOf(stroke: () => number) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
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
    const { ctx } = pictureOf(() => stroke);
    const store = createCanvasTileStore(ctx);
    const history = createPaintHistory(store, { width: SIZE, height: SIZE, budgetBytes: 48 * 1024 * 1024, maxSteps: 50 });
    for (stroke = 0; stroke < 50; stroke += 1) {
      const step = history.begin();
      // Row by row across the picture, as a snaking stroke reaches each tile.
      for (let ty = 0; ty < SIZE / 256; ty += 1) {
        for (let tx = 0; tx < SIZE / 256; tx += 1) {
          step.cover({ x0: tx * 256 + 10, y0: ty * 256 + 10, x1: tx * 256 + 20, y1: ty * 256 + 20 });
        }
      }
      void step.land(() => undefined);
    }
    expect(history.counts().undo).toBeGreaterThanOrEqual(30);
    expect(history.counts().bytes).toBeLessThanOrEqual(48 * 1024 * 1024);
  }, 30_000);

  it('reads each tile as the stroke first reaches it, and nothing as it lands', () => {
    const { ctx, calls } = pictureOf(() => 0);
    const store = createCanvasTileStore(ctx);
    const history = createPaintHistory(store, { width: SIZE, height: SIZE, budgetBytes: 48 * 1024 * 1024, maxSteps: 50 });
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

/**
 * How deep undo goes, with the history and the browser's tile store
 * together, on a 4,096 by 4,096 picture: 50 strokes back to back, each
 * reaching every one of its 256 tiles, as a stroke snaking across the
 * whole map does, leave at least 30 steps to undo, and the raw tiles
 * waiting to be packed never hold more than their cap.
 *
 * The tiles read back hold a painted map's pattern (a floor colour, a wall
 * band and a stroke across), and a PNG is as large as the runs of one
 * colour along its rows, five bytes a run: larger than a real PNG of such
 * a tile, not smaller. No idle time is given between the strokes, the
 * worst case.
 */

import { describe, it, expect } from 'vitest';
import { createCanvasTileStore, PENDING_CAP_BYTES, type TilePixels } from '../canvasTileStore';
import { createPaintHistory } from '../paintHistory';
import { recordingContext } from '@/test/recordingCanvas';

const SIZE = 4096;

/** A tile of a painted map: floor, a wall band, and this stroke's line across, by its number; made once a stroke. */
const tiles = new Map<string, TilePixels>();
function paintedTile(w: number, h: number, stroke: number): TilePixels {
  const key = `${w},${h},${stroke}`;
  const made = tiles.get(key);
  if (made) return made;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const wall = y > 100 && y < 130;
      const line = Math.abs(x - y - (stroke % 64)) < 20;
      const [r, g, b] = line ? [74, 52, 35] : wall ? [85, 89, 95] : [232, 220, 196];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tile = { width: w, height: h, data, colorSpace: 'srgb' } as TilePixels;
  tiles.set(key, tile);
  return tile;
}

/** Five bytes for every run of one colour along each row: a PNG's size, overestimated; counted once a tile. */
const sizes = new WeakMap<TilePixels, number>();
function runLengthSize(pixels: TilePixels): number {
  const known = sizes.get(pixels);
  if (known !== undefined) return known;
  const { data, width } = pixels;
  let runs = 0;
  for (let i = 0; i < data.length; i += 4) {
    const atRowStart = (i / 4) % width === 0;
    if (atRowStart || data[i] !== data[i - 4] || data[i + 1] !== data[i - 3] || data[i + 2] !== data[i - 2]) runs += 1;
  }
  sizes.set(pixels, runs * 5);
  return runs * 5;
}

describe('undo after 50 strokes over the whole picture', () => {
  it('keeps at least 30 steps, and never more raw tiles waiting than the cap', () => {
    let stroke = 0;
    const make = () => {
      const canvas = document.createElement('canvas');
      const { ctx } = recordingContext(canvas);
      Object.assign(ctx, { getImageData: (_x: number, _y: number, w: number, h: number) => paintedTile(w, h, stroke) });
      Object.defineProperty(canvas, 'getContext', { value: () => ctx });
      return canvas;
    };
    const picture = make();
    picture.width = SIZE;
    picture.height = SIZE;
    let history: ReturnType<typeof createPaintHistory> | null = null;
    let mostWaiting = 0;
    const store = createCanvasTileStore(picture, {
      onPacked: () => history?.trim(),
      make,
      // No idle time at all: only the cap packs.
      schedule: () => undefined,
      encode: (pixels) => new Uint8Array(runLengthSize(pixels)),
    });
    history = createPaintHistory(store, { width: SIZE, height: SIZE, budgetBytes: 48 * 1024 * 1024, maxSteps: 50 });
    for (stroke = 0; stroke < 50; stroke += 1) {
      const step = history.begin();
      // Row by row across the picture, as a snaking stroke reaches each tile.
      for (let ty = 0; ty < SIZE / 256; ty += 1) {
        for (let tx = 0; tx < SIZE / 256; tx += 1) {
          step.cover({ x0: tx * 256 + 10, y0: ty * 256 + 10, x1: tx * 256 + 20, y1: ty * 256 + 20 });
          mostWaiting = Math.max(mostWaiting, store.packingBytes());
        }
      }
      void step.land(() => undefined);
    }
    expect(mostWaiting).toBeLessThanOrEqual(PENDING_CAP_BYTES);
    expect(history.counts().undo).toBeGreaterThanOrEqual(30);
  });

  it('packs a stroke\'s oldest tiles as it goes past the cap, and none as it lands', () => {
    let encoded = 0;
    const make = () => {
      const canvas = document.createElement('canvas');
      const { ctx } = recordingContext(canvas);
      Object.assign(ctx, { getImageData: (_x: number, _y: number, w: number, h: number) => paintedTile(w, h, 0) });
      Object.defineProperty(canvas, 'getContext', { value: () => ctx });
      return canvas;
    };
    const picture = make();
    picture.width = SIZE;
    picture.height = SIZE;
    const store = createCanvasTileStore(picture, {
      onPacked: () => undefined,
      make,
      schedule: () => undefined,
      encode: (pixels) => { encoded += 1; return new Uint8Array(runLengthSize(pixels)); },
    });
    const history = createPaintHistory(store, { width: SIZE, height: SIZE, budgetBytes: 48 * 1024 * 1024, maxSteps: 50 });
    const step = history.begin();
    // 120 tiles: 24 past the 96 the cap holds.
    for (let i = 0; i < 120; i += 1) {
      const tx = i % 16;
      const ty = Math.floor(i / 16);
      step.cover({ x0: tx * 256 + 10, y0: ty * 256 + 10, x1: tx * 256 + 20, y1: ty * 256 + 20 });
    }
    expect(encoded).toBe(120 - PENDING_CAP_BYTES / (256 * 256 * 4));
    const beforeLanding = encoded;
    void step.land(() => undefined);
    expect(encoded - beforeLanding).toBe(0);
  });
});

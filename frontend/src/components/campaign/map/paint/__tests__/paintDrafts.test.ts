/**
 * Paint's drafts as pure functions: the tiles packed off a picture and put
 * back into one, when a draft says it was written, and the drafts dropped
 * for maps that are gone. jsdom has no IndexedDB, so the browser's store is
 * checked only for what it does without one; the rest is the browser pass.
 */

import { describe, it, expect } from 'vitest';
import { draftKey, draftTime, dropDrafts, packDraftTiles, paintDraftStore, putDraftTiles } from '../paintDrafts';
import { memoryDraftStore } from '@/test/memoryDraftStore';
import { tilesTouching } from '../paintHistory';

/** A 2D context over real pixels, for the two calls a draft makes of it and the one it puts back with. */
function pixelContext(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  const ctx = {
    data,
    getImageData(x: number, y: number, w: number, h: number) {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row += 1) out.set(data.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
      return { width: w, height: h, data: out };
    },
    createImageData(w: number, h: number) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData(pixels: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) {
      for (let row = 0; row < pixels.height; row += 1) {
        data.set(pixels.data.subarray(row * pixels.width * 4, (row + 1) * pixels.width * 4), ((y + row) * width + x) * 4);
      }
    },
  };
  return ctx as typeof ctx & CanvasRenderingContext2D;
}

const at = (ctx: { data: Uint8ClampedArray }, width: number, x: number, y: number) => [...ctx.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];

describe('a draft\'s tiles', () => {
  it('put back the pixels they were packed from, in their places, the edge tiles cut', () => {
    const from = pixelContext(600, 300);
    for (let i = 0; i < from.data.length; i += 4) from.data.set([i % 251, (i >> 8) % 253, 40, 255], i);
    const tiles = packDraftTiles(from, tilesTouching({ x0: 0, y0: 0, x1: 600, y1: 300 }, 600, 300));
    expect(tiles.map((t) => `${t.tx},${t.ty}`)).toEqual(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1']);

    const to = pixelContext(600, 300);
    const put = putDraftTiles(to, tiles, 600, 300);
    expect(put).toHaveLength(6);
    expect(to.data).toEqual(from.data);
    expect(at(to, 600, 599, 299)).toEqual(at(from, 600, 599, 299));
  });

  it('leave out a tile that no longer fits its place, in a picture of another size', () => {
    const from = pixelContext(600, 300);
    const tiles = packDraftTiles(from, tilesTouching({ x0: 0, y0: 0, x1: 600, y1: 300 }, 600, 300));
    const smaller = pixelContext(500, 300);
    // Tile 1,0 was 256 wide and is now 244; tile 2,0 is off the picture.
    expect(putDraftTiles(smaller, tiles, 500, 300).map((t) => `${t.tx},${t.ty}`)).toEqual(['0,0', '0,1']);
  });
});

describe('when a draft was written', () => {
  it('is the time on its own day, and the day too on another', () => {
    const now = new Date(2026, 10, 2, 18, 0).getTime();
    const earlier = new Date(2026, 10, 2, 14, 5).getTime();
    const yesterday = new Date(2026, 10, 1, 14, 5).getTime();
    expect(draftTime(earlier, now)).toBe(new Date(earlier).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
    expect(draftTime(yesterday, now)).toContain(new Date(yesterday).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  });
});

describe('the store', () => {
  it('is none in a browser without IndexedDB', () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(paintDraftStore()).toBeNull();
  });

  it('drops the drafts picked, and keeps the rest', async () => {
    const store = memoryDraftStore();
    const header = (mapId: string) => ({ key: draftKey('me', 'c1', mapId), userId: 'me', campaignId: 'c1', mapId, baseUrl: '', width: 10, height: 10, savedAt: 0 });
    await store.put(header('kept'), [], true);
    await store.put(header('gone'), [], true);
    await dropDrafts(store, (h) => h.mapId === 'gone');
    expect([...store.headers.values()].map((h) => h.mapId)).toEqual(['kept']);
  });

  it('is left as it is when it cannot be read', async () => {
    const store = memoryDraftStore();
    store.failing = true;
    await expect(dropDrafts(store, () => true)).resolves.toBeUndefined();
  });
});

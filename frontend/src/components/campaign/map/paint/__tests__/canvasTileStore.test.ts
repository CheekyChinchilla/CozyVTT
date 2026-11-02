/**
 * How the browser keeps Paint's undo tiles.
 *
 * A tile is read straight off the picture (whose canvas is made to be read
 * often) as a change first reaches it, and packed there and then, so no
 * tile waits raw and the lift has nothing to pack. It counts its packed
 * bytes against undo's budget from the start. It is put back at once,
 * exactly as it was, by writing its pixels over the tile.
 */

import { describe, it, expect, vi } from 'vitest';
import { createCanvasTileStore, type TilePixels } from '../canvasTileStore';
import { recordingContext, type Call } from '@/test/recordingCanvas';

const tile = (tx: number, ty = 0, w = 256, h = 256) => ({ tx, ty, x: tx * 256, y: ty * 256, w, h });

/** A tile's pixels: a floor colour with a band across, which the tile's column shifts. */
function pixelsOf(x: number, w: number, h: number): TilePixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const band = Math.floor(i / w) % 64 < 8 + (x / 256);
    data.set(band ? [85, 89, 95, 255] : [232, 220, 196, 255], i * 4);
  }
  return { width: w, height: h, data, colorSpace: 'srgb' } as TilePixels;
}

function setUp() {
  const picture = document.createElement('canvas');
  picture.width = 1024;
  picture.height = 1024;
  const { ctx, calls } = recordingContext(picture);
  const read = vi.fn((x: number, _y: number, w: number, h: number) => pixelsOf(x, w, h));
  Object.assign(ctx, { getImageData: (...args: [number, number, number, number]) => {
    calls.push({ method: 'getImageData', args });
    return read(...args);
  } });
  const made = vi.spyOn(document, 'createElement');
  const store = createCanvasTileStore(ctx);
  return { ctx, calls, store, made };
}

const of = (calls: Call[], method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

describe('a kept tile', () => {
  it('is read straight off the picture as it is kept, with no canvas made for it', () => {
    const { calls, store, made } = setUp();
    store.capture(tile(0));
    store.capture(tile(1));
    store.capture(tile(2, 1, 200, 256));
    expect(of(calls, 'getImageData')).toEqual([[0, 0, 256, 256], [256, 0, 256, 256], [512, 256, 200, 256]]);
    expect(made).not.toHaveBeenCalledWith('canvas');
    made.mockRestore();
  });

  it('is packed as it is kept, and counts its packed bytes, a small part of its pixels', () => {
    const { store } = setUp();
    const kept = store.capture(tile(1));
    const bytes = store.bytes(kept);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(256 * 256 * 4 / 50);
  });

  it('is put back at once, exactly as it was read, over the tile', () => {
    const { calls, store } = setUp();
    const kept = store.capture(tile(1, 2));
    calls.length = 0;
    const back = store.restore(tile(1, 2), kept);
    // Nothing to wait for: it is back before restore returns.
    expect(back).toBeUndefined();
    const puts = calls.filter((c) => c.method === 'putImageData');
    expect(puts).toHaveLength(1);
    expect(puts[0].args.slice(1)).toEqual([256, 512]);
    const put = puts[0].args[0] as TilePixels;
    expect([put.width, put.height]).toEqual([256, 256]);
    expect(put.data).toEqual(pixelsOf(256, 256, 256).data);
  });

  it('is put back exactly at the picture\'s edge, where a tile is cut short', () => {
    const { calls, store } = setUp();
    const edge = tile(3, 3, 120, 40);
    const kept = store.capture(edge);
    calls.length = 0;
    store.restore(edge, kept);
    const put = calls.find((c) => c.method === 'putImageData')!;
    expect(put.args.slice(1)).toEqual([768, 768]);
    expect((put.args[0] as TilePixels).data).toEqual(pixelsOf(768, 120, 40).data);
  });

  it('can be handed in already read, as the fill does, without being read again', () => {
    const { calls, store } = setUp();
    const pixels = store.read(tile(0));
    const kept = store.keep(tile(0), pixels);
    expect(of(calls, 'getImageData')).toHaveLength(1);
    // Packed then: the fill may change the pixels it read after handing them over.
    pixels.data.fill(0);
    calls.length = 0;
    store.restore(tile(0), kept);
    expect((calls.find((c) => c.method === 'putImageData')!.args[0] as TilePixels).data).toEqual(pixelsOf(0, 256, 256).data);
  });

  it('let go of no longer counts, and is not put back', () => {
    const { calls, store } = setUp();
    const kept = store.capture(tile(0));
    store.release(kept);
    expect(store.bytes(kept)).toBe(0);
    calls.length = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.restore(tile(0), kept);
    expect(calls.some((c) => c.method === 'putImageData')).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

/**
 * How the browser keeps Paint's undo tiles: each tile copied from the
 * picture onto a small canvas of its own size and packed as a PNG, which
 * counts as its size once packed; put back by clearing the tile and drawing
 * the decoded PNG in its place. The canvases here record what is drawn on
 * them, and the PNGs and their decoding are stand-ins.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCanvasTileStore } from '../canvasTileStore';
import { recordingContext, type Call } from '@/test/recordingCanvas';

const tile = { tx: 1, ty: 0, x: 256, y: 0, w: 200, h: 256 };

let made: Array<{ canvas: HTMLCanvasElement; calls: Call[] }>;
let finishPng: Array<(blob: Blob | null) => void>;
const decoded = { close: vi.fn() };

beforeEach(() => {
  made = [];
  finishPng = [];
  decoded.close.mockReset();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(decoded));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A canvas that records its drawing and packs a PNG when the test says. */
function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const { ctx, calls } = recordingContext(c);
  Object.defineProperty(c, 'getContext', { value: () => ctx });
  Object.defineProperty(c, 'toBlob', { value: (done: BlobCallback) => { finishPng.push(done); } });
  made.push({ canvas: c, calls });
  return c;
}

function setUp() {
  const picture = canvas();
  picture.width = 456;
  picture.height = 256;
  const onPacked = vi.fn();
  const store = createCanvasTileStore(picture, { onPacked, make: canvas });
  const pictureCalls = made[0].calls;
  return { picture, pictureCalls, store, onPacked };
}

describe('a kept tile', () => {
  it('is copied from the picture onto a canvas its own size, and packed as a PNG', async () => {
    const { picture, store, onPacked } = setUp();
    const kept = store.capture(tile);
    const scratch = made[1];
    expect([scratch.canvas.width, scratch.canvas.height]).toEqual([200, 256]);
    expect(scratch.calls.map((c) => c.method)).toEqual(['clearRect', 'drawImage']);
    expect(scratch.calls[1].args).toEqual([picture, 256, 0, 200, 256, 0, 0, 200, 256]);
    // Counted once packed, as the PNG's size; until then the store says how much is waiting.
    expect(store.bytes(kept)).toBe(0);
    expect(store.packingBytes()).toBe(200 * 256 * 4);
    finishPng[0](new Blob(['x'.repeat(321)], { type: 'image/png' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.bytes(kept)).toBe(321);
    expect(store.packingBytes()).toBe(0);
    expect(onPacked).toHaveBeenCalledTimes(1);
  });

  it('is put back by clearing its place on the picture and drawing the PNG there', async () => {
    const { pictureCalls, store } = setUp();
    const png = new Blob(['png'], { type: 'image/png' });
    const kept = store.capture(tile);
    finishPng[0](png);
    pictureCalls.length = 0;
    await store.restore(tile, kept);
    expect(createImageBitmap).toHaveBeenCalledWith(png);
    const drawn = pictureCalls.map((c) => c.method);
    expect(drawn).toContain('clearRect');
    expect(pictureCalls.find((c) => c.method === 'clearRect')?.args).toEqual([256, 0, 200, 256]);
    expect(pictureCalls.find((c) => c.method === 'drawImage')?.args).toEqual([decoded, 256, 0]);
    expect(drawn.indexOf('clearRect')).toBeLessThan(drawn.indexOf('drawImage'));
    expect(decoded.close).toHaveBeenCalled();
  });

  it('waits for its PNG before it is put back', async () => {
    const { pictureCalls, store } = setUp();
    const kept = store.capture(tile);
    pictureCalls.length = 0;
    const putting = store.restore(tile, kept);
    await Promise.resolve();
    expect(pictureCalls.some((c) => c.method === 'drawImage')).toBe(false);
    finishPng[0](new Blob(['png'], { type: 'image/png' }));
    await putting;
    expect(pictureCalls.some((c) => c.method === 'drawImage')).toBe(true);
  });

  it('let go of before it is packed keeps nothing', async () => {
    const { store, onPacked } = setUp();
    const kept = store.capture(tile);
    store.release(kept);
    finishPng[0](new Blob(['x'.repeat(50)], { type: 'image/png' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.bytes(kept)).toBe(0);
    expect(store.packingBytes()).toBe(0);
    expect(onPacked).not.toHaveBeenCalled();
  });

  it('that could not be packed is left as it is on undo, and said so', async () => {
    const { pictureCalls, store } = setUp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const kept = store.capture(tile);
    finishPng[0](null);
    pictureCalls.length = 0;
    await store.restore(tile, kept);
    expect(pictureCalls.some((c) => c.method === 'drawImage')).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

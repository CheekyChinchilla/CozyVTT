/**
 * How the browser keeps Paint's undo tiles: each tile copied off the
 * picture onto a small canvas its own size as a stroke reaches it, which is
 * quick, and packed as a PNG later, one tile at a time when the page is
 * idle, which is not; a tile counts as its copy's bytes until packed, then
 * as its PNG's. A tile is put back from its copy while it has one, at once,
 * else by decoding its PNG. The canvases here record what is drawn on them,
 * the idle time is the test's to give, and the PNGs and their decoding are
 * stand-ins.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCanvasTileStore } from '../canvasTileStore';
import { recordingContext, type Call } from '@/test/recordingCanvas';

const tile = { tx: 1, ty: 0, x: 256, y: 0, w: 200, h: 256 };
const other = { tx: 0, ty: 0, x: 0, y: 0, w: 256, h: 256 };

let made: Array<{ canvas: HTMLCanvasElement; calls: Call[] }>;
let finishPng: Array<(blob: Blob | null) => void>;
let idle: Array<() => void>;
const decoded = { close: vi.fn() };

beforeEach(() => {
  made = [];
  finishPng = [];
  idle = [];
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
  const store = createCanvasTileStore(picture, { onPacked, make: canvas, schedule: (run) => { idle.push(run); } });
  return { picture, pictureCalls: made[0].calls, store, onPacked };
}

/** Give the page one slice of idle time, and let what it starts settle. */
async function idleOnce() {
  const run = idle.shift();
  if (!run) throw new Error('nothing waits for idle time');
  run();
  await Promise.resolve();
}
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

describe('a kept tile', () => {
  it('is copied off the picture onto a canvas its own size at once, and not packed then', () => {
    const { picture, store } = setUp();
    const kept = store.capture(tile);
    const copy = made[1];
    expect([copy.canvas.width, copy.canvas.height]).toEqual([200, 256]);
    expect(copy.calls.map((c) => c.method)).toEqual(['clearRect', 'drawImage']);
    expect(copy.calls[1].args).toEqual([picture, 256, 0, 200, 256, 0, 0, 200, 256]);
    expect(finishPng).toHaveLength(0);
    // Counted as its copy until packed.
    expect(store.bytes(kept)).toBe(200 * 256 * 4);
    expect(store.packingBytes()).toBe(200 * 256 * 4);
  });

  it('is packed when the page is idle, one tile a slice, and then counts as its PNG', async () => {
    const { store, onPacked } = setUp();
    const first = store.capture(tile);
    const second = store.capture(other);
    // Each copy is a canvas of its own.
    expect(made).toHaveLength(3);
    await idleOnce();
    expect(finishPng).toHaveLength(1);
    finishPng[0](new Blob(['x'.repeat(321)], { type: 'image/png' }));
    await flush();
    expect(store.bytes(first)).toBe(321);
    expect(store.bytes(second)).toBe(256 * 256 * 4);
    expect(onPacked).toHaveBeenCalledTimes(1);
    await idleOnce();
    finishPng[1](new Blob(['y'.repeat(50)], { type: 'image/png' }));
    await flush();
    expect(store.bytes(second)).toBe(50);
    expect(store.packingBytes()).toBe(0);
    // Each copy's canvas is used again for the next tile kept.
    store.capture(tile);
    expect(made).toHaveLength(3);
  });

  it('is put back from its copy at once while it has one, with nothing decoded', async () => {
    const { pictureCalls, store } = setUp();
    const kept = store.capture(tile);
    const copy = made[1].canvas;
    pictureCalls.length = 0;
    const back = store.restore(tile, kept);
    expect(pictureCalls.find((c) => c.method === 'clearRect')?.args).toEqual([256, 0, 200, 256]);
    expect(pictureCalls.find((c) => c.method === 'drawImage')?.args).toEqual([copy, 256, 0]);
    await back;
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('is put back by decoding its PNG once packed', async () => {
    const { pictureCalls, store } = setUp();
    const png = new Blob(['png'], { type: 'image/png' });
    const kept = store.capture(tile);
    await idleOnce();
    finishPng[0](png);
    await flush();
    pictureCalls.length = 0;
    await store.restore(tile, kept);
    expect(createImageBitmap).toHaveBeenCalledWith(png);
    const drawn = pictureCalls.map((c) => c.method);
    expect(pictureCalls.find((c) => c.method === 'clearRect')?.args).toEqual([256, 0, 200, 256]);
    expect(pictureCalls.find((c) => c.method === 'drawImage')?.args).toEqual([decoded, 256, 0]);
    expect(drawn.indexOf('clearRect')).toBeLessThan(drawn.indexOf('drawImage'));
    expect(decoded.close).toHaveBeenCalled();
  });

  it('let go of before it is packed is never packed, and its canvas is used again', async () => {
    const { store, onPacked } = setUp();
    const kept = store.capture(tile);
    store.release(kept);
    expect(store.bytes(kept)).toBe(0);
    expect(store.packingBytes()).toBe(0);
    while (idle.length > 0) await idleOnce();
    expect(finishPng).toHaveLength(0);
    expect(onPacked).not.toHaveBeenCalled();
    store.capture(tile);
    expect(made).toHaveLength(2);
  });

  it('that could not be packed keeps its copy, and is put back from it', async () => {
    const { pictureCalls, store } = setUp();
    const kept = store.capture(tile);
    const copy = made[1].canvas;
    await idleOnce();
    finishPng[0](null);
    await flush();
    expect(store.bytes(kept)).toBe(200 * 256 * 4);
    pictureCalls.length = 0;
    await store.restore(tile, kept);
    expect(pictureCalls.find((c) => c.method === 'drawImage')?.args).toEqual([copy, 256, 0]);
  });

  it('is let go of with every other when the store is', async () => {
    const { store } = setUp();
    store.capture(tile);
    store.capture(other);
    store.dispose();
    expect(made.slice(1).map((m) => [m.canvas.width, m.canvas.height])).toEqual([[0, 0], [0, 0]]);
    expect(store.packingBytes()).toBe(0);
  });
});

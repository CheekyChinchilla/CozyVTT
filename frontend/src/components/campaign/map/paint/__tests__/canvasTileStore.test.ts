/**
 * How the browser keeps Paint's undo tiles.
 *
 * A tile is read as raw bytes through one small canvas as a change first
 * reaches it, and waits, raw, to be packed as a PNG: on one other reused
 * canvas, a few milliseconds of tiles at a time while the page is idle,
 * never while a stroke is under way. The raw tiles waiting have a cap of
 * their own; a tile kept past it packs the oldest at once, so they never
 * hold more. A tile counts against undo's budget only once packed. It is
 * put back from its raw bytes while it has them, else from its PNG.
 *
 * The canvases here record what is drawn on them; the idle time, the clock,
 * the PNG encoding and decoding are the test's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvasTileStore, PENDING_CAP_BYTES, PACK_SLICE_MS, type TilePixels } from '../canvasTileStore';
import { recordingContext, type Call } from '@/test/recordingCanvas';

const tile = (tx: number, ty = 0, w = 256, h = 256) => ({ tx, ty, x: tx * 256, y: ty * 256, w, h });
const TILE_BYTES = 256 * 256 * 4;

let made: Array<{ canvas: HTMLCanvasElement; calls: Call[] }>;
let idle: Array<() => void>;
let clock: number;
let encoded: number;
let busy: boolean;
/** What a PNG decodes to here: a canvas, which can be drawn, and let go of. */
const decoded = Object.assign(document.createElement('canvas'), { close: vi.fn() });

beforeEach(() => {
  made = [];
  idle = [];
  clock = 0;
  encoded = 0;
  busy = false;
  decoded.close.mockReset();
});

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const { ctx, calls } = recordingContext(c);
  Object.defineProperty(c, 'getContext', { value: () => ctx });
  made.push({ canvas: c, calls });
  return c;
}

/** Each PNG takes 2 ms on the test's clock and is 300 bytes, or nothing where `fails`. */
function setUp(opts: { fails?: boolean; cap?: number } = {}) {
  const picture = canvas();
  picture.width = 1024;
  picture.height = 1024;
  const onPacked = vi.fn();
  const decode = vi.fn(async () => decoded);
  const store = createCanvasTileStore(picture, {
    onPacked,
    make: canvas,
    schedule: (run) => { idle.push(run); },
    now: () => clock,
    busy: () => busy,
    capBytes: opts.cap,
    encode: () => {
      encoded += 1;
      clock += 2;
      return opts.fails ? null : new Uint8Array(300);
    },
    decode,
  });
  return { picture, pictureCalls: made[0].calls, store, onPacked, decode };
}

async function idleOnce() {
  const run = idle.shift();
  if (!run) throw new Error('nothing waits for idle time');
  run();
  await Promise.resolve();
}

describe('a kept tile', () => {
  it('is read as raw bytes through one small canvas, however many are kept, and not packed then', () => {
    const { picture, store } = setUp();
    const kept = [store.capture(tile(0)), store.capture(tile(1)), store.capture(tile(2, 1, 200, 256))];
    // The picture, the one canvas tiles are read through: none a tile.
    expect(made).toHaveLength(2);
    const reader = made[1];
    expect(reader.calls.filter((c) => c.method === 'drawImage').map((c) => c.args)).toEqual([
      [picture, 0, 0, 256, 256, 0, 0, 256, 256],
      [picture, 256, 0, 256, 256, 0, 0, 256, 256],
      [picture, 512, 256, 200, 256, 0, 0, 200, 256],
    ]);
    expect(reader.calls.filter((c) => c.method === 'getImageData').map((c) => c.args)).toEqual([[0, 0, 256, 256], [0, 0, 256, 256], [0, 0, 200, 256]]);
    expect(encoded).toBe(0);
    // Raw, it counts against its own cap and not against undo's budget.
    expect(kept.map((k) => store.bytes(k))).toEqual([0, 0, 0]);
    expect(store.packingBytes()).toBe(2 * TILE_BYTES + 200 * 256 * 4);
  });

  it('is packed while the page is idle, a few milliseconds of tiles a slice on one reused canvas, then counts as its PNG', async () => {
    const { store, onPacked } = setUp();
    const kept = Array.from({ length: 6 }, (_, i) => store.capture(tile(i % 4, Math.floor(i / 4))));
    await idleOnce();
    // 2 ms a tile: the slice stops once PACK_SLICE_MS has passed.
    expect(encoded).toBe(Math.ceil(PACK_SLICE_MS / 2));
    expect(idle).toHaveLength(1);
    while (idle.length > 0) await idleOnce();
    expect(encoded).toBe(6);
    expect(kept.map((k) => store.bytes(k))).toEqual([300, 300, 300, 300, 300, 300]);
    expect(store.packingBytes()).toBe(0);
    expect(onPacked).toHaveBeenCalled();
    // The reader and one packing canvas, whatever was packed.
    expect(made.length).toBeLessThanOrEqual(3);
  });

  it('is not packed while a stroke is under way, and is caught up after', async () => {
    const { store } = setUp();
    store.capture(tile(0));
    store.capture(tile(1));
    busy = true;
    await idleOnce();
    expect(encoded).toBe(0);
    expect(idle).toHaveLength(1);
    busy = false;
    await idleOnce();
    expect(encoded).toBe(2);
  });

  it('past the cap of raw tiles waiting, packs the oldest at once, so they never hold more', () => {
    const { store } = setUp();
    expect(PENDING_CAP_BYTES).toBe(24 * 1024 * 1024);
    const most = PENDING_CAP_BYTES / TILE_BYTES;
    for (let i = 0; i < most; i += 1) store.capture(tile(i % 4, Math.floor(i / 4)));
    expect(encoded).toBe(0);
    for (let i = 0; i < 20; i += 1) {
      store.capture(tile(i % 4, 30));
      expect(store.packingBytes()).toBeLessThanOrEqual(PENDING_CAP_BYTES);
    }
    expect(encoded).toBe(20);
  });

  it('is put back from its raw bytes at once while it has them, with nothing decoded', async () => {
    const { pictureCalls, store, decode } = setUp();
    const kept = store.capture(tile(1));
    pictureCalls.length = 0;
    const back = store.restore(tile(1), kept);
    const put = pictureCalls.find((c) => c.method === 'putImageData');
    expect((put?.args[0] as TilePixels).width).toBe(256);
    expect(put?.args.slice(1)).toEqual([256, 0]);
    await back;
    expect(decode).not.toHaveBeenCalled();
  });

  it('is put back by decoding its PNG once packed, over a cleared tile', async () => {
    const { pictureCalls, store, decode } = setUp();
    const kept = store.capture(tile(1));
    while (idle.length > 0) await idleOnce();
    pictureCalls.length = 0;
    await store.restore(tile(1), kept);
    expect(decode).toHaveBeenCalledTimes(1);
    const drawn = pictureCalls.map((c) => c.method);
    expect(pictureCalls.find((c) => c.method === 'clearRect')?.args).toEqual([256, 0, 256, 256]);
    expect(pictureCalls.find((c) => c.method === 'drawImage')?.args).toEqual([decoded, 256, 0]);
    expect(drawn.indexOf('clearRect')).toBeLessThan(drawn.indexOf('drawImage'));
    expect(decoded.close).toHaveBeenCalled();
  });

  it('let go of before it is packed is never packed, and no longer counts', async () => {
    const { store } = setUp();
    const kept = store.capture(tile(0));
    store.release(kept);
    expect(store.packingBytes()).toBe(0);
    while (idle.length > 0) await idleOnce();
    expect(encoded).toBe(0);
  });

  it('that could not be packed keeps its raw bytes, and is put back from them', async () => {
    const { pictureCalls, store } = setUp({ fails: true });
    const kept = store.capture(tile(0));
    while (idle.length > 0) await idleOnce();
    expect(encoded).toBe(1);
    pictureCalls.length = 0;
    await store.restore(tile(0), kept);
    expect(pictureCalls.some((c) => c.method === 'putImageData')).toBe(true);
  });

  it('can be handed in already read, as the fill does, without being read again', () => {
    const { store } = setUp();
    const pixels = store.read(tile(0));
    const reads = made[1].calls.filter((c) => c.method === 'getImageData').length;
    store.adopt(tile(0), pixels);
    expect(made[1].calls.filter((c) => c.method === 'getImageData')).toHaveLength(reads);
    expect(store.packingBytes()).toBe(TILE_BYTES);
  });

  it('is let go of with every other when the store is, with its canvases', () => {
    const { store } = setUp();
    store.capture(tile(0));
    store.capture(tile(1));
    store.dispose();
    expect(store.packingBytes()).toBe(0);
    expect(made.slice(1).every((m) => m.canvas.width === 0 && m.canvas.height === 0)).toBe(true);
  });
});

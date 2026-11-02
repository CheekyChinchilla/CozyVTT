// ============================================
// Paint's undo tiles as the browser keeps them.
//
// A tile is read as raw bytes as a change first reaches it: drawn onto one
// small canvas kept for reading (willReadFrequently, so it lives where it
// is read fastest) and read back from there, so the picture's own canvas is
// never read pixel by pixel and stays where it is drawn fastest. No tile
// keeps a canvas of its own: a canvas costs a browser far more than its
// pixels, and Safari most.
//
// Raw tiles wait to be packed as PNGs (a few hundred bytes for a tile of
// one colour, a few kilobytes for a painted one), on one other reused
// canvas, a few milliseconds of tiles at a time while the page is idle
// (requestIdleCallback, or the next animation frame where a browser has
// none), never while a stroke is under way. They have a cap of their own,
// PENDING_CAP_BYTES: a tile kept past it packs the oldest at once, there and
// then, so the raw tiles waiting never hold more. A tile counts against
// undo's budget only once packed (bytes()), so a large change no longer
// pushes older steps out while it waits. A tile is put back from its raw
// bytes while it has them, at once, else from its PNG, decoded first.
// ============================================

import type { TileRect, TileStore } from './paintHistory';
import { releaseCanvas, type MakeCanvas } from './blankPicture';

/** A tile's pixels, four bytes each, as getImageData gives them. */
export type TilePixels = ImageData;

/** The most the raw tiles waiting to be packed may hold: 96 tiles of 256 by 256. */
export const PENDING_CAP_BYTES = 24 * 1024 * 1024;

/** How long one slice of idle time packs tiles for, in milliseconds. */
export const PACK_SLICE_MS = 6;

/** A tile as kept: its raw bytes until packed, then its PNG. */
export interface KeptTile {
  raw: TilePixels | null;
  png: Uint8Array<ArrayBuffer> | null;
  rawBytes: number;
  /** Waiting to be packed. */
  pending: boolean;
  released: boolean;
}

export interface CanvasTileStore extends TileStore<KeptTile> {
  /** The tile's pixels as the picture has them now, read through the reading canvas. */
  read(tile: TileRect): TilePixels;
  /** A copy of `pixels`, which the picture's next change cannot alter. */
  copy(pixels: TilePixels): TilePixels;
  /** Keep a tile's pixels already read, as the fill does: raw, to be packed as any other. */
  adopt(tile: TileRect, pixels: TilePixels): KeptTile;
  /** The bytes of raw tiles waiting to be packed. */
  packingBytes(): number;
  /** Let go of every tile and both canvases. */
  dispose(): void;
}

/** Runs `run` when the page is next idle. */
export type IdleSchedule = (run: () => void) => void;

/** requestIdleCallback where the browser has it, else the next animation frame. */
export const whenIdle: IdleSchedule = (run) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 200 });
  else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => run());
  else setTimeout(run, 16);
};

export interface CanvasTileStoreOptions {
  /** Told each time tiles are packed, so the history can hold to its budget. */
  onPacked: () => void;
  make?: MakeCanvas;
  schedule?: IdleSchedule;
  /** A stroke is under way: packing waits. */
  busy?: () => boolean;
  now?: () => number;
  capBytes?: number;
  /** A tile's PNG, made there and then, or null where the browser makes none. */
  encode?: (pixels: TilePixels, canvas: HTMLCanvasElement) => Uint8Array<ArrayBuffer> | null;
  /** A PNG decoded, to draw, with what lets go of it. */
  decode?: (png: Uint8Array<ArrayBuffer>) => Promise<CanvasImageSource & { close?: () => void }>;
}

/** A tile's PNG, through the packing canvas, by toDataURL, which makes it there and then. */
function encodePng(pixels: TilePixels, canvas: HTMLCanvasElement): Uint8Array<ArrayBuffer> | null {
  if (canvas.width !== pixels.width) canvas.width = pixels.width;
  if (canvas.height !== pixels.height) canvas.height = pixels.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(pixels, 0, 0);
  const url = canvas.toDataURL('image/png');
  const comma = url.indexOf(',');
  if (!url.startsWith('data:image/png') || comma === -1) return null;
  const text = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** A PNG decoded: by createImageBitmap, or a picture where a browser has none. */
async function decodePng(png: Uint8Array<ArrayBuffer>): Promise<CanvasImageSource & { close?: () => void }> {
  const blob = new Blob([png], { type: 'image/png' });
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  return image;
}

/** The tile store for a picture held in `picture`, which every read and restore works on. */
export function createCanvasTileStore(picture: HTMLCanvasElement, options: CanvasTileStoreOptions): CanvasTileStore {
  const make = options.make ?? (() => document.createElement('canvas'));
  const schedule = options.schedule ?? whenIdle;
  const busy = options.busy ?? (() => false);
  const now = options.now ?? (() => performance.now());
  const cap = options.capBytes ?? PENDING_CAP_BYTES;
  const encode = options.encode ?? encodePng;
  const decode = options.decode ?? decodePng;

  let reader: HTMLCanvasElement | null = null;
  let readerCtx: CanvasRenderingContext2D | null = null;
  let packer: HTMLCanvasElement | null = null;
  /** Raw tiles waiting to be packed, oldest first. */
  const waiting: KeptTile[] = [];
  let waitingBytes = 0;
  let asked = false;
  let disposed = false;

  const readContext = (): CanvasRenderingContext2D | null => {
    if (!reader) {
      reader = make();
      readerCtx = reader.getContext('2d', { willReadFrequently: true });
    }
    return readerCtx;
  };

  const unwait = (kept: KeptTile) => {
    if (!kept.pending) return;
    kept.pending = false;
    waitingBytes -= kept.rawBytes;
    const at = waiting.indexOf(kept);
    if (at !== -1) waiting.splice(at, 1);
  };

  /** Pack the oldest raw tile waiting; false when there is none. */
  const packOldest = (): boolean => {
    const kept = waiting[0];
    if (!kept) return false;
    unwait(kept);
    if (!kept.raw) return true;
    packer ??= make();
    const png = encode(kept.raw, packer);
    // One that could not be packed keeps its raw bytes, to be put back from.
    if (png) {
      kept.png = png;
      kept.raw = null;
    } else {
      console.warn('[paint] A tile kept for undo could not be packed; it is kept as it is.');
    }
    return true;
  };

  /** Pack in slices of idle time, while no stroke is under way. */
  const pump = () => {
    if (asked || disposed || waiting.length === 0) return;
    asked = true;
    schedule(() => {
      asked = false;
      if (disposed) return;
      if (!busy()) {
        const until = now() + PACK_SLICE_MS;
        let packed = false;
        while (waiting.length > 0 && now() < until) packed = packOldest() || packed;
        if (packed) options.onPacked();
      }
      pump();
    });
  };

  const read = (tile: TileRect): TilePixels => {
    const ctx = readContext();
    if (!ctx || !reader) throw new Error('This browser gave no canvas to read the picture through.');
    if (reader.width < tile.w) reader.width = tile.w;
    if (reader.height < tile.h) reader.height = tile.h;
    ctx.clearRect(0, 0, tile.w, tile.h);
    ctx.drawImage(picture, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
    return ctx.getImageData(0, 0, tile.w, tile.h);
  };

  const adopt = (tile: TileRect, pixels: TilePixels): KeptTile => {
    const kept: KeptTile = { raw: pixels, png: null, rawBytes: tile.w * tile.h * 4, pending: true, released: false };
    waiting.push(kept);
    waitingBytes += kept.rawBytes;
    // Past the cap, the oldest are packed now, so the raw tiles never hold more.
    let packed = false;
    while (waitingBytes > cap && packOldest()) packed = true;
    if (packed) options.onPacked();
    pump();
    return kept;
  };

  return {
    read,
    copy(pixels: TilePixels): TilePixels {
      const ctx = readContext();
      if (!ctx) throw new Error('This browser gave no canvas to read the picture through.');
      const out = ctx.createImageData(pixels.width, pixels.height);
      out.data.set(pixels.data);
      return out;
    },
    adopt,
    capture: (tile: TileRect) => adopt(tile, read(tile)),

    async restore(tile: TileRect, kept: KeptTile): Promise<void> {
      const ctx = picture.getContext('2d');
      if (!ctx) return;
      if (kept.raw) {
        // Exact, whatever the context's transform, alpha or compositing.
        ctx.putImageData(kept.raw, tile.x, tile.y);
        return;
      }
      if (!kept.png) {
        console.warn('[paint] A tile kept for undo is gone; undo leaves it as it is.');
        return;
      }
      const image = await decode(kept.png);
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(tile.x, tile.y, tile.w, tile.h);
        ctx.drawImage(image, tile.x, tile.y);
      } finally {
        ctx.restore();
        image.close?.();
      }
    },

    bytes: (kept: KeptTile) => kept.png?.byteLength ?? 0,

    release(kept: KeptTile) {
      kept.released = true;
      unwait(kept);
      kept.raw = null;
      kept.png = null;
    },

    packingBytes: () => waitingBytes,

    dispose() {
      disposed = true;
      for (const kept of waiting) {
        kept.pending = false;
        kept.raw = null;
      }
      waiting.length = 0;
      waitingBytes = 0;
      if (reader) releaseCanvas(reader);
      if (packer) releaseCanvas(packer);
      reader = null;
      readerCtx = null;
      packer = null;
    },
  };
}

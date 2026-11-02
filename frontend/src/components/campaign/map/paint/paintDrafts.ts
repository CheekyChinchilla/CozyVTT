// ============================================
// Drafts of what Paint holds not saved, kept in this browser.
//
// A reload, a closed tab or a phone that drops a page it put in the
// background would take paint not saved with it, so Paint keeps a draft in
// the browser's IndexedDB: at least every DRAFT_INTERVAL_MS while there is
// something new, and at once when the page is hidden or the picture is let
// go of. A draft is the picture it was made from (its address) and the
// tiles painted on it since (PAINT_TILE pixels a side, packed as the undo
// tiles are, qoi.ts), one record a tile overwritten in place, so it is never
// larger than the picture packed and each write carries only the tiles
// changed since the one before.
//
// Drafts are kept per user, campaign and map, offered back when Paint opens
// on that map again, and cleared by Save and by Discard. A browser that
// keeps none (no IndexedDB, a private window, storage full) says so once,
// and Paint carries on without them.
// ============================================

/** The longest Paint goes without writing what is new to its draft. */
export const DRAFT_INTERVAL_MS = 10_000;

import { PAINT_TILE, type TileRect } from './paintHistory';
import { qoiDecodeInto, qoiEncode } from './qoi';

/** What a browser that keeps no drafts says, once a page. */
export const DRAFTS_UNAVAILABLE = 'This browser cannot keep a draft of your painting, so save it often: what is not saved is lost if the page closes.';

/** A draft, without its tiles. */
export interface DraftHeader {
  key: string;
  userId: string;
  campaignId: string;
  mapId: string;
  /** The address of the picture the tiles were painted on, or '' for none. */
  baseUrl: string;
  /** The painted picture's size, in pixels. */
  width: number;
  height: number;
  /** When it was last written, in milliseconds since 1970. */
  savedAt: number;
}

/** A tile of a draft: its column and row, and its pixels packed (qoi.ts). */
export interface DraftTile {
  tx: number;
  ty: number;
  packed: Uint8Array<ArrayBuffer>;
}

/** Where drafts are kept: IndexedDB in the browser, a map in the tests. */
export interface DraftStore {
  header(key: string): Promise<DraftHeader | undefined>;
  tiles(key: string): Promise<DraftTile[]>;
  /**
   * Write the header and these tiles over any kept under the same key;
   * `fresh` first drops every tile kept under it, for a draft begun anew.
   */
  put(header: DraftHeader, tiles: DraftTile[], fresh: boolean): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every draft's header. */
  list(): Promise<DraftHeader[]>;
}

/** The store could not be opened or written. */
export class DraftsUnavailable extends Error {
  constructor(reason?: string) {
    super(reason ? `Drafts cannot be kept: ${reason}` : 'Drafts cannot be kept');
    this.name = 'DraftsUnavailable';
  }
}

export const draftKey = (userId: string, campaignId: string, mapId: string) => `${userId}|${campaignId}|${mapId}`;

/** When a draft was written, for the question offering it back: the time, and the day if not today. */
export function draftTime(savedAt: number, now: number = Date.now()): string {
  const at = new Date(savedAt);
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === new Date(now).toDateString()
    ? time
    : `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

/** The tiles' pixels as the picture `ctx` holds them now, packed for a draft. */
export function packDraftTiles(ctx: CanvasRenderingContext2D, tiles: readonly TileRect[]): DraftTile[] {
  return tiles.map((t) => ({ tx: t.tx, ty: t.ty, packed: qoiEncode(ctx.getImageData(t.x, t.y, t.w, t.h).data) }));
}

/**
 * Put a draft's tiles back into a `width` by `height` picture, answering the
 * tiles put. A tile that does not fit its place (the picture is another size
 * now) is left out.
 */
export function putDraftTiles(ctx: CanvasRenderingContext2D, tiles: readonly DraftTile[], width: number, height: number): TileRect[] {
  const put: TileRect[] = [];
  for (const { tx, ty, packed } of tiles) {
    const x = tx * PAINT_TILE;
    const y = ty * PAINT_TILE;
    if (tx < 0 || ty < 0 || x >= width || y >= height) continue;
    const rect: TileRect = { tx, ty, x, y, w: Math.min(PAINT_TILE, width - x), h: Math.min(PAINT_TILE, height - y) };
    const pixels = ctx.createImageData(rect.w, rect.h);
    if (!qoiDecodeInto(packed, pixels.data)) continue;
    ctx.putImageData(pixels, x, y);
    put.push(rect);
  }
  return put;
}

const DB_NAME = 'cozyvtt-paint-drafts';
const DB_VERSION = 1;
const HEADERS = 'drafts';
const TILES = 'tiles';

interface TileRecord extends DraftTile {
  /** `<draft key>#<column>,<row>`, so a draft's tiles are one range of keys. */
  id: string;
}

const tileId = (key: string, tx: number, ty: number) => `${key}#${tx},${ty}`;
const tilesOf = (key: string) => IDBKeyRange.bound(`${key}#`, `${key}#￿`);

const failure = (error: DOMException | null | undefined) => new DraftsUnavailable(error?.message);

/** A draft store over the browser's IndexedDB. */
export function indexedDbDraftStore(factory: IDBFactory): DraftStore {
  let opening: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(new DraftsUnavailable(err instanceof Error ? err.message : undefined));
        return;
      }
      request.onupgradeneeded = () => {
        const made = request.result;
        if (!made.objectStoreNames.contains(HEADERS)) made.createObjectStore(HEADERS, { keyPath: 'key' });
        if (!made.objectStoreNames.contains(TILES)) made.createObjectStore(TILES, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(failure(request.error));
      request.onblocked = () => reject(new DraftsUnavailable('another tab holds an older version open'));
    });
    return opening;
  };

  /** Run `work` in one transaction, settling once it has committed with what `work` answers. */
  const inTransaction = async <T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => () => T): Promise<T> => {
    const tx = (await db()).transaction([HEADERS, TILES], mode);
    const answer = work(tx);
    return new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve(answer());
      tx.onerror = () => reject(failure(tx.error));
      tx.onabort = () => reject(failure(tx.error));
    });
  };

  return {
    header: (key) => inTransaction('readonly', (tx) => {
      const request = tx.objectStore(HEADERS).get(key);
      return () => request.result as DraftHeader | undefined;
    }),
    tiles: (key) => inTransaction('readonly', (tx) => {
      const request = tx.objectStore(TILES).getAll(tilesOf(key));
      return () => (request.result as TileRecord[]).map(({ tx: col, ty, packed }) => ({ tx: col, ty, packed }));
    }),
    put: (header, tiles, fresh) => inTransaction('readwrite', (tx) => {
      const store = tx.objectStore(TILES);
      // Requests in one transaction run in the order they are made: the
      // old tiles go before the new ones are written.
      if (fresh) store.delete(tilesOf(header.key));
      for (const tile of tiles) {
        const record: TileRecord = { id: tileId(header.key, tile.tx, tile.ty), tx: tile.tx, ty: tile.ty, packed: tile.packed };
        store.put(record);
      }
      tx.objectStore(HEADERS).put(header);
      return () => undefined;
    }),
    remove: (key) => inTransaction('readwrite', (tx) => {
      tx.objectStore(TILES).delete(tilesOf(key));
      tx.objectStore(HEADERS).delete(key);
      return () => undefined;
    }),
    list: () => inTransaction('readonly', (tx) => {
      const request = tx.objectStore(HEADERS).getAll();
      return () => request.result as DraftHeader[];
    }),
  };
}

let shared: DraftStore | null | undefined;

/** This browser's draft store, or null where it has no IndexedDB. */
export function paintDraftStore(): DraftStore | null {
  if (shared === undefined) {
    shared = typeof indexedDB === 'undefined' ? null : indexedDbDraftStore(indexedDB);
  }
  return shared;
}

/** Drop every draft `drop` picks, such as those of a map deleted. A store that fails is left as it is. */
export async function dropDrafts(store: DraftStore | null, drop: (header: DraftHeader) => boolean): Promise<void> {
  if (!store) return;
  try {
    const headers = await store.list();
    await Promise.all(headers.filter(drop).map((header) => store.remove(header.key)));
  } catch {
    // Kept until a later look: a draft offers itself only on its own map.
  }
}

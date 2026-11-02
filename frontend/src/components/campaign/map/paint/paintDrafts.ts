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
// changed since the one before, in transactions of DRAFT_CHUNK tiles.
//
// Drafts are kept per user, campaign, map and tab, so two tabs painting one
// map never cut each other's. A tab is told apart by an id it keeps in
// sessionStorage (a reload keeps it) and, where the browser has Web Locks,
// by a lock it holds while it is open: a duplicated tab, which copies the
// id, takes a new one, and a draft whose tab is still open is that tab's
// live work, never offered, cleared or dropped elsewhere. Paint offers the
// newest draft of the map on screen when it opens there, and takes it over:
// it writes it as its own and drops the one it came from. Save and Discard
// clear the tab's own draft. A write that finds its draft gone (cleared from
// another tab, or the browser's site data cleared) says so, and the whole
// painting is written again. A browser that keeps none (no IndexedDB, a
// private window, storage full) says so once, and Paint carries on.
// ============================================

import { PAINT_TILE, type TileRect } from './paintHistory';
import { qoiDecodeInto, qoiEncode } from './qoi';
import { optionalSessionStorage } from '@/utils/optionalStorage';

/** The longest Paint goes without writing what is new to its draft. */
export const DRAFT_INTERVAL_MS = 10_000;
/** The tiles written in one transaction, so a large write never holds them all at once. */
export const DRAFT_CHUNK = 32;
/** How long Paint waits for its draft to be looked for before opening without it. */
export const DRAFT_LOOKUP_MS = 3_000;

/** What a browser that keeps no drafts says, once a page. */
export const DRAFTS_UNAVAILABLE = 'This browser cannot keep a draft of your painting, so save it often: what is not saved is lost if the page closes.';
/** What a browser out of room for drafts says, once a page. */
export const DRAFTS_FULL = 'This browser has no room left to keep a draft of your painting, so save it often: what is not saved is lost if the page closes.';

/** A draft, without its tiles. */
export interface DraftHeader {
  key: string;
  userId: string;
  campaignId: string;
  mapId: string;
  /** The tab that wrote it. */
  tabId: string;
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
  tiles(key: string): Promise<DraftTile[]>;
  /**
   * Write the header and these tiles over any kept under the same key;
   * `fresh` first drops every tile kept under it, for a draft begun anew.
   * Answers false when a write that goes on from an earlier one finds the
   * draft gone (cleared from elsewhere meanwhile): the whole painting is
   * then to be written again.
   */
  put(header: DraftHeader, tiles: DraftTile[], fresh: boolean): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** Every draft's header. */
  list(): Promise<DraftHeader[]>;
}

/** The store could not be opened or written: `full` when the browser is out of room. */
export class DraftsUnavailable extends Error {
  readonly full: boolean;
  constructor(reason?: string, full = false) {
    super(reason ? `Drafts cannot be kept: ${reason}` : 'Drafts cannot be kept');
    this.name = 'DraftsUnavailable';
    this.full = full;
  }
}

/** What the DM is told when drafts cannot be kept. */
export const draftsFailedMessage = (err: unknown) => (err instanceof DraftsUnavailable && err.full ? DRAFTS_FULL : DRAFTS_UNAVAILABLE);

export const draftKey = (userId: string, campaignId: string, mapId: string, tabId: string) => `${userId}|${campaignId}|${mapId}|${tabId}`;

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

// ---- What is read back, checked: the store outlives the code that wrote it.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

export function isDraftHeader(value: unknown): value is DraftHeader {
  if (!isRecord(value)) return false;
  const { key, userId, campaignId, mapId, tabId, baseUrl, width, height, savedAt } = value;
  return typeof key === 'string' && typeof userId === 'string' && typeof campaignId === 'string' && typeof mapId === 'string'
    && typeof tabId === 'string' && typeof baseUrl === 'string' && isCount(width) && isCount(height)
    && typeof savedAt === 'number' && Number.isFinite(savedAt);
}

function toDraftTile(value: unknown): DraftTile | null {
  if (!isRecord(value)) return null;
  const { tx, ty, packed } = value;
  if (!isCount(tx) || !isCount(ty) || !(packed instanceof Uint8Array)) return null;
  return { tx, ty, packed: new Uint8Array(packed) };
}

// ---- Tabs

/** This tab, as drafts tell tabs apart. */
export interface PaintTab {
  /** Its id, kept for the tab in sessionStorage. */
  id(): string;
  /** The ids of the tabs open now, or null where the browser cannot tell (no Web Locks). */
  open(): Promise<Set<string> | null>;
}

const TAB_STORAGE = 'cozyvtt-paint-tab';
const TAB_LOCK = 'cozyvtt-paint-tab:';

function newTabId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * This tab's id, kept in `storage`, and where `locks` is given, a lock held
 * on it for as long as the page is open: one already held belongs to the
 * tab this one was duplicated from, so this one takes another id.
 */
export function makePaintTab(storage: Pick<Storage, 'getItem' | 'setItem'>, locks: LockManager | undefined): PaintTab {
  let id: string | null = null;
  const hold = (manager: LockManager, tabId: string) => new Promise<boolean>((resolve) => {
    manager.request(`${TAB_LOCK}${tabId}`, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      // Held until the page goes.
      return lock ? new Promise<void>(() => undefined) : undefined;
    }).catch(() => resolve(true));
  });
  const claimed = (async () => {
    if (!locks) return;
    if (await hold(locks, ownId())) return;
    id = newTabId();
    storage.setItem(TAB_STORAGE, id);
    await hold(locks, id);
  })();
  function ownId(): string {
    if (!id) {
      id = storage.getItem(TAB_STORAGE) ?? newTabId();
      storage.setItem(TAB_STORAGE, id);
    }
    return id;
  }
  return {
    id: ownId,
    async open() {
      if (!locks) return null;
      await claimed;
      try {
        const { held = [] } = await locks.query();
        return new Set(held.flatMap((lock) => (lock.name?.startsWith(TAB_LOCK) ? [lock.name.slice(TAB_LOCK.length)] : [])));
      } catch {
        return null;
      }
    },
  };
}

let sharedTab: PaintTab | null = null;

/** This tab. */
export function paintTab(): PaintTab {
  sharedTab ??= makePaintTab(optionalSessionStorage, typeof navigator !== 'undefined' ? navigator.locks : undefined);
  return sharedTab;
}

/**
 * The draft to offer when Paint opens on a map: the newest of this user's
 * for it, of this tab or of a tab no longer open.
 */
export async function newestDraft(store: DraftStore, tab: PaintTab, where: { userId: string; campaignId: string; mapId: string }): Promise<DraftHeader | null> {
  const [headers, open] = await Promise.all([store.list(), tab.open()]);
  const own = tab.id();
  let newest: DraftHeader | null = null;
  for (const header of headers) {
    if (header.userId !== where.userId || header.campaignId !== where.campaignId || header.mapId !== where.mapId) continue;
    if (header.tabId !== own && open?.has(header.tabId)) continue;
    if (!newest || header.savedAt > newest.savedAt) newest = header;
  }
  return newest;
}

// ---- The browser's store

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

/** What a getAll answered, as values still to be checked. */
const rowsOf = (result: unknown): unknown[] => (Array.isArray(result) ? result : []);

const failure = (error: DOMException | null | undefined) => new DraftsUnavailable(error?.message, error?.name === 'QuotaExceededError');
/** A connection the browser closed under the page, or lost: worth opening again once. */
const isLost = (err: unknown) => err instanceof DOMException && (err.name === 'InvalidStateError' || err.name === 'UnknownError');

/**
 * A draft store over the browser's IndexedDB. The connection is opened on
 * first use and opened again when the browser closes it (a tab in the
 * background, site data cleared) or a newer version asks for it.
 */
export function indexedDbDraftStore(factory: IDBFactory): DraftStore {
  let opening: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (opening) return opening;
    const mine = new Promise<IDBDatabase>((resolve, reject) => {
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
      request.onsuccess = () => {
        const connection = request.result;
        const forget = () => {
          if (opening === mine) opening = null;
        };
        // A newer version opened in another tab waits for this one to go.
        connection.onversionchange = () => {
          connection.close();
          forget();
        };
        connection.onclose = forget;
        resolve(connection);
      };
      request.onerror = () => reject(failure(request.error));
      // Blocked by an older version open in another tab: it closes on
      // versionchange, and success or error follows.
      request.onblocked = () => undefined;
    });
    opening = mine;
    mine.catch(() => {
      if (opening === mine) opening = null;
    });
    return mine;
  };

  /**
   * Run `work` in one transaction, settling once it has committed with what
   * `work` answers. A transaction that fails, or a `work` that throws, is
   * aborted whole. A lost connection is opened again once.
   */
  const inTransaction = async <T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => () => T, again = true): Promise<T> => {
    let tx: IDBTransaction;
    try {
      tx = (await db()).transaction([HEADERS, TILES], mode);
    } catch (err) {
      if (again && isLost(err)) {
        opening = null;
        return inTransaction(mode, work, false);
      }
      throw err instanceof DraftsUnavailable ? err : failure(err instanceof DOMException ? err : null);
    }
    return new Promise<T>((resolve, reject) => {
      let failed: DOMException | null = null;
      let answer: (() => T) | null = null;
      tx.oncomplete = () => {
        if (answer) resolve(answer());
      };
      // A request's error is the event's; the transaction's is set as it aborts.
      tx.onerror = (event) => {
        const target: unknown = event.target;
        if (isRecord(target) && target.error instanceof DOMException) failed = target.error;
      };
      tx.onabort = () => {
        const error = tx.error ?? failed;
        if (again && isLost(error)) {
          opening = null;
          inTransaction(mode, work, false).then(resolve, reject);
          return;
        }
        reject(failure(error));
      };
      try {
        answer = work(tx);
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // Already finished.
        }
        reject(err instanceof DOMException ? failure(err) : err);
      }
    });
  };

  const record = (key: string, tile: DraftTile): TileRecord => ({ id: tileId(key, tile.tx, tile.ty), tx: tile.tx, ty: tile.ty, packed: tile.packed });

  return {
    tiles: (key) => inTransaction('readonly', (tx) => {
      const request = tx.objectStore(TILES).getAll(tilesOf(key));
      return () => rowsOf(request.result).flatMap((value) => toDraftTile(value) ?? []);
    }),
    async put(header, tiles, fresh) {
      let had = false;
      // The header first, with the first tiles: a write cut short leaves a
      // draft with what it got to, never tiles with no header.
      await inTransaction('readwrite', (tx) => {
        const headers = tx.objectStore(HEADERS);
        const store = tx.objectStore(TILES);
        const look = headers.get(header.key);
        look.onsuccess = () => {
          had = isDraftHeader(look.result);
          // Requests in one transaction run in the order they are made: the
          // old tiles go before the new ones are written.
          if (fresh || !had) store.delete(tilesOf(header.key));
          headers.put(header);
          for (const tile of tiles.slice(0, DRAFT_CHUNK)) store.put(record(header.key, tile));
        };
        return () => had;
      });
      for (let at = DRAFT_CHUNK; at < tiles.length; at += DRAFT_CHUNK) {
        const chunk = tiles.slice(at, at + DRAFT_CHUNK);
        await inTransaction('readwrite', (tx) => {
          const store = tx.objectStore(TILES);
          for (const tile of chunk) store.put(record(header.key, tile));
          return () => undefined;
        });
      }
      return fresh || had;
    },
    remove: (key) => inTransaction('readwrite', (tx) => {
      tx.objectStore(TILES).delete(tilesOf(key));
      tx.objectStore(HEADERS).delete(key);
      return () => undefined;
    }),
    list: () => inTransaction('readonly', (tx) => {
      const request = tx.objectStore(HEADERS).getAll();
      return () => rowsOf(request.result).filter(isDraftHeader);
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

/**
 * Drop every draft `drop` picks, such as those of a map deleted, but those
 * of another tab still open, which are its live work. A store that fails is
 * left as it is.
 */
export async function dropDrafts(store: DraftStore | null, drop: (header: DraftHeader) => boolean, tab: PaintTab = paintTab()): Promise<void> {
  if (!store) return;
  try {
    const [headers, open] = await Promise.all([store.list(), tab.open()]);
    const own = tab.id();
    await Promise.all(headers
      .filter((header) => drop(header) && (header.tabId === own || !open?.has(header.tabId)))
      .map((header) => store.remove(header.key)));
  } catch {
    // Kept until a later look: a draft offers itself only on its own map.
  }
}

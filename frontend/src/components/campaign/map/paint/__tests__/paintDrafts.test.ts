/**
 * Paint's drafts: the tiles packed off a picture and put back into one, when
 * a draft says it was written, the drafts dropped for maps that are gone,
 * the draft offered as Paint opens, tabs told apart, what is read back
 * checked, and the browser's store run over an IndexedDB stand-in
 * (test/fakeIndexedDb.ts), since jsdom has none: real engines are the
 * browser pass.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DRAFT_CHUNK, DRAFTS_FULL, DraftsUnavailable, draftKey, draftsFailedMessage, draftTime, dropDrafts, indexedDbDraftStore, isDraftHeader,
  makePaintTab, newestDraft, packDraftTiles, paintDraftStore, putDraftTiles, type DraftHeader, type DraftStore, type PaintTab,
} from '../paintDrafts';
import { qoiEncode } from '../qoi';
import { memoryDraftStore } from '@/test/memoryDraftStore';
import { fakeIndexedDb, type FakeIndexedDb } from '@/test/fakeIndexedDb';
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

/** A tab with its id, and the tabs it says are open (null: the browser cannot tell). */
const tabOf = (id: string, open: string[] | null = null): PaintTab => ({ id: () => id, open: () => Promise.resolve(open ? new Set(open) : null) });
const header = (mapId: string, tabId = 'tab-a', savedAt = 0): DraftHeader => ({
  key: draftKey('me', 'c1', mapId, tabId), userId: 'me', campaignId: 'c1', mapId, tabId, baseUrl: '', width: 10, height: 10, savedAt,
});

describe('the drafts kept', () => {
  it('are none in a browser without IndexedDB', () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(paintDraftStore()).toBeNull();
  });

  it('are dropped as picked, but those of another tab still open, which are its live work', async () => {
    const store = memoryDraftStore();
    await store.put(header('kept', 'tab-a'), [], true);
    await store.put(header('gone', 'tab-a'), [], true);
    await store.put(header('gone', 'tab-b'), [], true);
    await store.put(header('gone', 'tab-c'), [], true);
    await dropDrafts(store, (h) => h.mapId === 'gone', tabOf('tab-a', ['tab-a', 'tab-b']));
    expect([...store.headers.values()].map((h) => `${h.mapId} ${h.tabId}`)).toEqual(['kept tab-a', 'gone tab-b']);
  });

  it('are dropped whatever their tab where the browser cannot tell which are open', async () => {
    const store = memoryDraftStore();
    await store.put(header('gone', 'tab-b'), [], true);
    await dropDrafts(store, () => true, tabOf('tab-a'));
    expect(store.headers.size).toBe(0);
  });

  it('are left as they are when the store cannot be read', async () => {
    const store = memoryDraftStore();
    store.failing = 'unavailable';
    await expect(dropDrafts(store, () => true, tabOf('tab-a'))).resolves.toBeUndefined();
  });
});

describe('the draft offered as Paint opens on a map', () => {
  it('is the newest of the map\'s, this tab\'s or a closed tab\'s, never one of another tab still open', async () => {
    const store = memoryDraftStore();
    await store.put(header('map-1', 'tab-a', 10), [], true);
    await store.put(header('map-1', 'closed', 20), [], true);
    await store.put(header('map-1', 'tab-b', 30), [], true);
    await store.put(header('map-2', 'closed', 40), [], true);
    const where = { userId: 'me', campaignId: 'c1', mapId: 'map-1' };
    expect((await newestDraft(store, tabOf('tab-a', ['tab-a', 'tab-b']), where))?.tabId).toBe('closed');
    // Where the browser cannot tell, the newest of all.
    expect((await newestDraft(store, tabOf('tab-a'), where))?.tabId).toBe('tab-b');
    expect(await newestDraft(store, tabOf('tab-a'), { ...where, mapId: 'map-3' })).toBeNull();
  });
});

describe('a tab', () => {
  /** A LockManager in memory: a lock is held while its callback's promise is unsettled. */
  function locks(): LockManager & { names: string[] } {
    const names: string[] = [];
    const manager = {
      names,
      request(name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) {
        const free = !names.includes(name);
        if (free) names.push(name);
        const held = free ? ({ name, mode: 'exclusive' } as Lock) : null;
        if (!free && !options.ifAvailable) return new Promise(() => undefined);
        return Promise.resolve(callback(held));
      },
      query: () => Promise.resolve({ held: names.map((name) => ({ name, mode: 'exclusive' as const, clientId: '' })), pending: [] }),
    };
    return manager as unknown as LockManager & { names: string[] };
  }
  const storage = () => {
    const kept = new Map<string, string>();
    return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } };
  };

  it('keeps its id across a reload, as sessionStorage does', () => {
    const kept = storage();
    const first = makePaintTab(kept, undefined).id();
    expect(makePaintTab(kept, undefined).id()).toBe(first);
  });

  it('takes a new id when duplicated from a tab still open, which holds the first', async () => {
    const manager = locks();
    const kept = storage();
    const original = makePaintTab(kept, manager);
    const id = original.id();
    expect(await original.open()).toEqual(new Set([id]));
    // A duplicated tab starts with a copy of the original's sessionStorage.
    const copy = makePaintTab({ getItem: kept.getItem, setItem: () => undefined }, manager);
    const open = await copy.open();
    expect(copy.id()).not.toBe(id);
    expect(open).toEqual(new Set([id, copy.id()]));
  });

  it('cannot tell which tabs are open without Web Locks', async () => {
    expect(await makePaintTab(storage(), undefined).open()).toBeNull();
  });
});

describe('what is read back', () => {
  it('is a header only when every field has its type', () => {
    expect(isDraftHeader(header('m'))).toBe(true);
    expect(isDraftHeader({ ...header('m'), width: '10' })).toBe(false);
    expect(isDraftHeader({ ...header('m'), tabId: undefined })).toBe(false);
    expect(isDraftHeader(null)).toBe(false);
  });
});

describe("the browser's store, over IndexedDB", () => {
  let db: FakeIndexedDb;
  let store: DraftStore;
  const tile = (tx: number, ty = 0) => ({ tx, ty, packed: qoiEncode(new Uint8ClampedArray(4 * 4 * 4)) });

  beforeEach(() => {
    db = fakeIndexedDb();
    db.install();
    store = indexedDbDraftStore(db.factory);
  });

  it('keeps a header and its tiles, overwritten in place, and removes both', async () => {
    expect(await store.put(header('m'), [tile(0), tile(1)], true)).toBe(true);
    expect(await store.put(header('m'), [tile(1), tile(2)], false)).toBe(true);
    expect((await store.tiles(header('m').key)).map((t) => t.tx).sort()).toEqual([0, 1, 2]);
    expect((await store.list()).map((h) => h.key)).toEqual([header('m').key]);
    await store.remove(header('m').key);
    expect(await store.list()).toEqual([]);
    expect(await store.tiles(header('m').key)).toEqual([]);
  });

  it('drops the old tiles when a draft is begun anew, and says a draft that goes on was found gone', async () => {
    await store.put(header('m'), [tile(0), tile(1)], true);
    await store.put(header('m'), [tile(2)], true);
    expect((await store.tiles(header('m').key)).map((t) => t.tx)).toEqual([2]);
    await store.remove(header('m').key);
    expect(await store.put(header('m'), [tile(3)], false)).toBe(false);
  });

  it('writes a large draft in transactions of DRAFT_CHUNK tiles, the header with the first', async () => {
    const many = Array.from({ length: DRAFT_CHUNK * 2 + 5 }, (_, i) => tile(i));
    const before = db.counts.transactions;
    await store.put(header('m'), many, true);
    expect(db.counts.transactions - before).toBe(3);
    expect(await store.tiles(header('m').key)).toHaveLength(many.length);
  });

  it('opens the database again once the browser has closed it under the page', async () => {
    await store.list();
    expect(db.counts.opened).toBe(1);
    db.closeUnderPage();
    await store.put(header('m'), [tile(0)], true);
    expect(db.counts.opened).toBe(2);
    expect(await store.list()).toHaveLength(1);
  });

  it('lets go of the database for a newer version opening in another tab, and opens it again when next used', async () => {
    await store.list();
    db.newerVersion();
    await store.list();
    expect(db.counts.opened).toBe(2);
  });

  it('fails a write the browser has no room for as full, keeping nothing of it', async () => {
    db.failNext('put', 'QuotaExceededError');
    const failed = await store.put(header('m'), [tile(0)], true).catch((err: unknown) => err);
    expect(failed).toBeInstanceOf(DraftsUnavailable);
    expect(draftsFailedMessage(failed)).toBe(DRAFTS_FULL);
  });

  it('reads past a record that is not a draft', async () => {
    await store.put(header('m'), [tile(0)], true);
    db.data.get('drafts')!.set('junk', { key: 'junk', width: 'wide' });
    db.data.get('tiles')!.set(`${header('m').key}#9,9`, { id: 'x', tx: -1, ty: 0, packed: 'no' });
    expect((await store.list()).map((h) => h.key)).toEqual([header('m').key]);
    expect((await store.tiles(header('m').key)).map((t) => t.tx)).toEqual([0]);
  });
});

/**
 * Paint's draft store held in memory, for the tests: jsdom has no IndexedDB.
 * It keeps what the browser's would (map/paint/paintDrafts.ts), records each
 * write, and can be told to fail as a full or refused store does, or to
 * hang as a store that never answers does.
 */

import type { DraftHeader, DraftStore, DraftTile } from '@/components/campaign/map/paint/paintDrafts';
import { DraftsUnavailable } from '@/components/campaign/map/paint/paintDrafts';

export interface MemoryDraftStore extends DraftStore {
  headers: Map<string, DraftHeader>;
  /** Each draft's tiles, by `column,row`. */
  kept: Map<string, Map<string, DraftTile>>;
  /** Every write, in order: the tiles it carried, whether it began the draft anew, and the picture it was painted on. */
  writes: Array<{ key: string; tiles: string[]; fresh: boolean; baseUrl: string }>;
  /** Every write and read fails while set: `full` as a browser out of room does. */
  failing: false | 'unavailable' | 'full';
  /** Nothing answers while set. */
  hanging: boolean;
}

export function memoryDraftStore(): MemoryDraftStore {
  const answer = <T,>(value: () => T): Promise<T> => {
    if (store.hanging) return new Promise<T>(() => undefined);
    if (store.failing) return Promise.reject(new DraftsUnavailable('refused', store.failing === 'full'));
    return Promise.resolve(value());
  };
  const store: MemoryDraftStore = {
    headers: new Map(),
    kept: new Map(),
    writes: [],
    failing: false,
    hanging: false,
    tiles: (key) => answer(() => [...(store.kept.get(key)?.values() ?? [])]),
    put: (header, tiles, fresh) => answer(() => {
      const had = store.headers.has(header.key);
      store.writes.push({ key: header.key, tiles: tiles.map((t) => `${t.tx},${t.ty}`), fresh, baseUrl: header.baseUrl });
      const kept = fresh || !had ? new Map<string, DraftTile>() : store.kept.get(header.key) ?? new Map<string, DraftTile>();
      for (const tile of tiles) kept.set(`${tile.tx},${tile.ty}`, tile);
      store.kept.set(header.key, kept);
      store.headers.set(header.key, { ...header });
      return fresh || had;
    }),
    remove: (key) => answer(() => {
      store.headers.delete(key);
      store.kept.delete(key);
    }),
    list: () => answer(() => [...store.headers.values()]),
  };
  return store;
}

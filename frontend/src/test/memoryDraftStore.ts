/**
 * Paint's draft store held in memory, for the tests: jsdom has no IndexedDB.
 * It keeps what the browser's would (map/paint/paintDrafts.ts), records each
 * write, and can be told to fail as a full or refused store does.
 */

import type { DraftHeader, DraftStore, DraftTile } from '@/components/campaign/map/paint/paintDrafts';
import { DraftsUnavailable } from '@/components/campaign/map/paint/paintDrafts';

export interface MemoryDraftStore extends DraftStore {
  headers: Map<string, DraftHeader>;
  /** Each draft's tiles, by `column,row`. */
  kept: Map<string, Map<string, DraftTile>>;
  /** Every write, in order: the tiles it carried and whether it began the draft anew. */
  writes: Array<{ key: string; tiles: string[]; fresh: boolean; baseUrl: string }>;
  /** Every write and read fails while set. */
  failing: boolean;
}

export function memoryDraftStore(): MemoryDraftStore {
  const refuse = () => Promise.reject(new DraftsUnavailable('the quota is used up'));
  const store: MemoryDraftStore = {
    headers: new Map(),
    kept: new Map(),
    writes: [],
    failing: false,
    header(key) {
      if (store.failing) return refuse();
      return Promise.resolve(store.headers.get(key));
    },
    tiles(key) {
      if (store.failing) return refuse();
      return Promise.resolve([...(store.kept.get(key)?.values() ?? [])]);
    },
    put(header, tiles, fresh) {
      if (store.failing) return refuse();
      store.writes.push({ key: header.key, tiles: tiles.map((t) => `${t.tx},${t.ty}`), fresh, baseUrl: header.baseUrl });
      const kept = fresh || !store.kept.has(header.key) ? new Map<string, DraftTile>() : store.kept.get(header.key)!;
      for (const tile of tiles) kept.set(`${tile.tx},${tile.ty}`, tile);
      store.kept.set(header.key, kept);
      store.headers.set(header.key, { ...header });
      return Promise.resolve();
    },
    remove(key) {
      if (store.failing) return refuse();
      store.headers.delete(key);
      store.kept.delete(key);
      return Promise.resolve();
    },
    list() {
      if (store.failing) return refuse();
      return Promise.resolve([...store.headers.values()]);
    },
  };
  return store;
}

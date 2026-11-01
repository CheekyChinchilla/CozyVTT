import { useGameStore } from '@/stores/gameStore';
import type { CampaignMap } from '@/types';

const idOf = (map: unknown): unknown =>
  typeof map === 'object' && map !== null && 'id' in map ? (map as { id: unknown }).id : undefined;

/**
 * The map actions of a mocked campaign context with no map being prepared,
 * as the real context has them then: the table's map is the one on screen,
 * a map.changed shows that map and its tokens, and an edit by id replaces
 * the map when it is that one. `get` and `set` read and write the mock's
 * map; a mock that keeps its map fixed passes a `set` that does nothing.
 */
export function mapActionsFor(get: () => unknown, set: (map: unknown) => void) {
  return {
    receiveTableMap: (map: CampaignMap): boolean => {
      set(map);
      useGameStore.getState().setTokens(map.tokens ?? [], map.id);
      return true;
    },
    updateMap: (mapId: string, next: CampaignMap | ((current: CampaignMap) => CampaignMap)) => {
      const current = get();
      if (idOf(current) !== mapId) return;
      set(typeof next === 'function' ? next(current as CampaignMap) : next);
    },
  };
}

import api from '@/services/api';
import { useGameStore } from '@/stores/gameStore';
import type { Token } from '@/types';

/** Something that can tell the table the map changed; the real one is the socket. */
export interface MapChangeEmitter {
  emitMapChange(mapId: string): void;
}

export type TokenFlag = 'visible' | 'obscured';

/**
 * Flip one of the DM's two switches on a token, from wherever it is offered:
 * the right-click menu, the roster, the quick editor and the Token Manager.
 * Save it, patch the local copy so the change shows at once, then tell the
 * table the map changed so everyone is sent the token as they may see it.
 * Four copies of these three calls is how the hide switch once came to differ
 * between places; one copy cannot.
 */
export async function setTokenFlag(
  campaignId: string,
  mapId: string,
  token: Pick<Token, 'id'>,
  flag: TokenFlag,
  value: boolean,
  socket: MapChangeEmitter | null | undefined
): Promise<void> {
  const patch = flag === 'visible' ? { visible: value } : { obscured: value };
  await api.updateToken(campaignId, mapId, token.id, patch);
  useGameStore.getState().patchToken(token.id, patch);
  socket?.emitMapChange(mapId);
}

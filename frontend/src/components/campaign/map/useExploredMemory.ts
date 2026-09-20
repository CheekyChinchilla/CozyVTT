// ============================================
// Explored memory on the client — which cells the viewer has seen before,
// asked for and kept per "whose eyes": a player's own, or the player the DM
// is previewing as.
//
// The reply carries the user it belongs to, and only that user's memory is
// kept. Both effects are keyed on `exploringAs`, so the DM switching the
// preview from one player to another asks again and compares the reply with
// the new choice, never with the one the listener was first registered under.
// ============================================

import { useCallback, useEffect, useState } from 'react';

export interface ExplorationState {
  mapId: string;
  /** Whose memory this is; null for a reset, which empties everyone's. */
  userId: string | null;
  cells: number[];
}

/** The slice of a socket the memory needs; the real one is socket.io's. */
export interface ExplorationSocket {
  on(event: 'exploration:state', handler: (data: ExplorationState) => void): unknown;
  off(event: 'exploration:state', handler: (data: ExplorationState) => void): unknown;
  emit(event: 'exploration:request', data: { mapId: string; userId: string }): unknown;
}

export interface ExplorationSocketSource {
  getSocket(): ExplorationSocket | null | undefined;
}

export function useExploredMemory(
  socket: ExplorationSocketSource | null | undefined,
  mapId: string | undefined,
  /** Lighting and explored memory are both on for this map. */
  active: boolean,
  /** Whose memory to hold; null when this canvas explores as nobody (the DM's own view). */
  exploringAs: string | null
) {
  const [exploredCells, setExploredCells] = useState<Set<number> | null>(null);

  // Ask when the map, the setting, or whose memory it is changes. Off, or
  // nobody to ask for: nothing to hold.
  useEffect(() => {
    setExploredCells(null);
    if (!mapId || !active || !exploringAs) return;
    socket?.getSocket()?.emit('exploration:request', { mapId, userId: exploringAs });
  }, [socket, mapId, active, exploringAs]);

  useEffect(() => {
    const live = socket?.getSocket();
    if (!live || !mapId) return;
    const onState = (data: ExplorationState) => {
      if (data.mapId !== mapId) return;
      if (data.userId !== null && data.userId !== exploringAs) return;
      setExploredCells(new Set<number>(data.cells));
    };
    live.on('exploration:state', onState);
    return () => { live.off('exploration:state', onState); };
  }, [socket, mapId, exploringAs]);

  /** Cells this canvas has just seen for itself, added before the server echoes them. */
  const addExplored = useCallback((fresh: readonly number[]) => {
    if (fresh.length === 0) return;
    setExploredCells((prev) => new Set<number>([...(prev ?? []), ...fresh]));
  }, []);

  return { exploredCells, addExplored };
}

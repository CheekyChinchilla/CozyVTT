// ============================================
// useInitiativeSync — mirrors `initiative.state` into the game store
//
// The server broadcasts the full CombatState to every campaign member on
// each mutation, so this hook just writes what arrives; it never derives
// or merges. Mount it ONCE, high in the campaign tree — both the
// initiative tracker (the list) and the map canvas (the active-token
// ring) read the result from the store.
//
// Why it re-subscribes on reconnect: SocketClient.connect() tears down
// the old io() instance (removeAllListeners + disconnect) and builds a
// new one, but `socket` is a module singleton whose identity never
// changes. An effect keyed on `[socket]` alone would therefore attach
// once, lose its listener on the first manual reconnect, and never
// re-attach — leaving the tracker frozen on stale turn data. Keying on
// `status` + `reconnectCount` re-runs the subscription against the new
// instance, and the request_state emit re-syncs whatever was missed
// while the socket was down.
// ============================================

import { useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore } from '@/stores/gameStore';
import type { CombatState } from '@/types';

export function useInitiativeSync() {
  const { socket, status, reconnectCount } = useWebSocket();

  useEffect(() => {
    if (status !== 'connected') return;

    const handleState = (state: CombatState) => {
      useGameStore.getState().setCombatState(state);
    };

    socket.onInitiativeState(handleState);
    // Covers first mount, remount mid-combat, and post-reconnect catch-up.
    socket.emitInitiativeRequestState();

    return () => {
      socket.getSocket()?.off('initiative.state', handleState);
    };
  }, [socket, status, reconnectCount]);
}

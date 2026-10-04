// ============================================
// useInitiativeSync — mirrors `initiative.state` into the game store
//
// The server sends the order to every campaign member on each change, so
// this hook just writes what arrives; it never derives or merges. Mount it
// ONCE, high in the campaign tree — both the initiative tracker (the list)
// and the map canvas (the active-token ring) read the result from the store.
//
// The listener is registered through the socket client, which keeps its own
// table of listeners and puts them back on the socket it builds after a
// reconnect, so it is attached once and left alone across drops. The state
// is asked for when the campaign is joined and again after each rejoin
// (`joinedEpoch`), which is the moment the server will answer: a request
// sent while the transport is back but the campaign not yet rejoined is
// dropped unanswered. This used to key both on the context's `status`, which
// only returned to 'connected' on an event socket.io never emits on the
// Socket, so a drop removed the listener for good and never asked again;
// the tracker froze until a reload.
// ============================================

import { useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore } from '@/stores/gameStore';
import type { CombatState } from '@/types';

export function useInitiativeSync() {
  const { socket, joinedEpoch } = useWebSocket();

  useEffect(() => {
    const handleState = (state: CombatState) => {
      useGameStore.getState().setCombatState(state);
    };

    socket.onInitiativeState(handleState);

    return () => {
      // Through the client, not the raw io instance: the client keeps a
      // registry so listeners survive a reconnect, and `getSocket().off()`
      // only detaches from the current instance. The registry entry would
      // survive and be re-attached on the next reconnect, stacking up one
      // stale handler per reconnect and outliving this hook entirely.
      socket.off('initiative.state', handleState);
    };
  }, [socket]);

  useEffect(() => {
    if (!joinedEpoch) return;
    // Covers first join, remount mid-combat, and the catch-up after a rejoin.
    socket.emitInitiativeRequestState();
  }, [socket, joinedEpoch]);
}

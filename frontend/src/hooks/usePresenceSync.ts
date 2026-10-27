// ============================================
// usePresenceSync — mirrors `presence.state` into the game store
//
// Who has a live connection to the campaign, shown as a dot beside each
// member of the roster and as the order of the chat's To list. The server
// sends the whole set on every join and leave, never a change, so this
// cannot drift after a missed event, and a member with two tabs open is
// online until the last one closes. Mount it ONCE, on the campaign page, as
// useInitiativeSync is; both readers take it from the store.
//
// The set is asked for when the campaign is joined and after each rejoin
// (`joinedEpoch`): the push that came with this page's own join may have
// arrived before anything listened.
// ============================================

import { useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore } from '@/stores/gameStore';

export function usePresenceSync(campaignId: string | undefined) {
  const { socket, joinedEpoch } = useWebSocket();

  useEffect(() => {
    if (!campaignId) return;
    const handlePresence = (data: { campaignId: string; onlineUserIds: string[] }) => {
      if (data?.campaignId !== campaignId) return;
      useGameStore.getState().setOnlineUserIds(data.onlineUserIds ?? []);
    };
    socket.onPresenceState(handlePresence);
    return () => {
      socket.off('presence.state', handlePresence);
    };
  }, [socket, campaignId]);

  useEffect(() => {
    if (!campaignId || !joinedEpoch) return;
    socket.requestPresence();
  }, [socket, campaignId, joinedEpoch]);
}

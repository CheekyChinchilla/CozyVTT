// ============================================
// The table's refusals, as messages
// ============================================

import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';

/** The same refusal again within this long is not shown twice. */
const REPEAT_WINDOW_MS = 5000;

/**
 * Shows each refusal the server sends this page (a move during a pause, a
 * control that is the DM's, a token that has gone) as a message. They used
 * to reach only the Dice panel's banner, which took every one as a refused
 * roll and showed it in a tab that might not be open. Requests that wait
 * for their own answer (chat messages, dice rolls) are answered where they
 * were made, and send nothing here. A refusal before the page has joined
 * the campaign is the connection's, which the connection status reports.
 */
export default function TableRefusals() {
  const { socket } = useWebSocket();
  const { showToast } = useToast();
  const lastShown = useRef(new Map<string, number>());

  useEffect(() => {
    if (!socket) return;
    const handleRefusal = (data: { message?: string }) => {
      const message = typeof data?.message === 'string' ? data.message : '';
      if (!message || !socket.hasJoined()) return;
      const now = Date.now();
      if (now - (lastShown.current.get(message) ?? -Infinity) < REPEAT_WINDOW_MS) return;
      lastShown.current.set(message, now);
      showToast(message, 'error');
    };
    socket.onServerRefusal(handleRefusal);
    return () => socket.off('error', handleRefusal);
  }, [socket, showToast]);

  return null;
}

// ============================================
// Session Panels: Chat, Dice, Initiative, Notes and Session
//
// All five stay mounted, and the ones not open are hidden with
// `invisible` (visibility: hidden) rather than unmounted or
// display: none. This preserves chat history, dice results, and
// socket listeners across tab switches, and keeps hidden panels'
// layout measurable so ChatPanel's autoscroll-to-bottom keeps
// working while the tab is inactive.
//
// Which one is open is the game store's `sessionTab`, which the rail's
// tab bar (SessionSidebar) sets. Each panel fills the box it is drawn
// in, so that box is `position: relative` with a height of its own.
//
// On the desktop each panel is a tab panel named by its tab in the rail.
// The compact layout's bar has buttons, not tabs, and none for Notes and
// Session, which More opens, so there each panel is a group with its own
// name.
// ============================================

import { useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { cn } from '@/utils/cn';
import { SESSION_TAB_LOOKS, type SessionTab } from './sessionTabs';
import ChatPanel from './ChatPanel';
import DiceRoller from './DiceRoller';
import VibeTracker from './VibeTracker';
import InitiativeTracker from './InitiativeTracker';
import SessionControls from './SessionControls';
import SessionHistory from './SessionHistory';
import PersonalNotes from './PersonalNotes';
import type { ChatMessageBroadcast } from '@/types';

/**
 * Count chat messages that arrive while the chat is not on screen, as the
 * game store's `unreadChat`, the Chat tab's badge. ChatPanel stays mounted
 * and handles the messages themselves; this listener only keeps the count.
 */
function useUnreadChatCount() {
  const { socket } = useWebSocket();
  const { user } = useAuth();

  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: ChatMessageBroadcast) => {
      if (user && data.userId === user.id) return; // own messages aren't "unread"
      useGameStore.getState().countUnreadChat();
    };

    socket.onChatMessage(handleChatMessage);
    return () => {
      socket.off('chat.message', handleChatMessage);
    };
  }, [socket, user]);
}

export default function SessionPanels() {
  const activeTab = useGameStore((s) => s.sessionTab);
  const compact = useCompactLayout();
  useUnreadChatCount();

  /** What a panel is: a tab panel named by its tab in the rail, or on the compact layout a group with its own name. */
  const panel = (tab: SessionTab) =>
    compact
      ? { role: 'group', 'aria-label': SESSION_TAB_LOOKS[tab].label }
      : { role: 'tabpanel', 'aria-labelledby': `session-tab-${tab}` };

  return (
    <>
      <div
        id="session-tabpanel-chat"
        {...panel('chat')}
        className={cn('absolute inset-0 p-3', activeTab === 'chat' ? 'animate-fade-in' : 'invisible')}
      >
        <ChatPanel />
      </div>

      <div
        id="session-tabpanel-dice"
        {...panel('dice')}
        className={cn('absolute inset-0 p-3', activeTab === 'dice' ? 'animate-fade-in' : 'invisible')}
      >
        <DiceRoller />
      </div>

      <div
        id="session-tabpanel-initiative"
        {...panel('initiative')}
        className={cn(
          'absolute inset-0 p-3 overflow-y-auto',
          activeTab === 'initiative' ? 'animate-fade-in' : 'invisible'
        )}
      >
        <InitiativeTracker />
      </div>

      <div
        id="session-tabpanel-notes"
        {...panel('notes')}
        className={cn(
          'absolute inset-0 p-3',
          activeTab === 'notes' ? 'animate-fade-in' : 'invisible'
        )}
      >
        <PersonalNotes />
      </div>

      <div
        id="session-tabpanel-session"
        {...panel('session')}
        className={cn(
          'absolute inset-0 p-3 overflow-y-auto space-y-4',
          activeTab === 'session' ? 'animate-fade-in' : 'invisible'
        )}
      >
        <VibeTracker />
        {/* SessionControls renders nothing for players */}
        <SessionControls />
        {/* Everyone: the notes the DM wrote when each session ended */}
        <SessionHistory />
      </div>
    </>
  );
}

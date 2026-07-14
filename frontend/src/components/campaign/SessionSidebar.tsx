// ============================================
// Session Sidebar — tabbed right rail
// Chat / Dice / Initiative / Session share one full-height panel
// instead of stacking in a scrolling column with fixed heights.
//
// All tab panels stay mounted — inactive ones are hidden with
// `invisible` (visibility: hidden) rather than unmounted or
// display: none. This preserves chat history, dice results, and
// socket listeners across tab switches, and keeps hidden panels'
// layout measurable so ChatPanel's autoscroll-to-bottom keeps
// working while the tab is inactive.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Dices, ListOrdered, PlayCircle, type LucideIcon } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/cn';
import ChatPanel from './ChatPanel';
import DiceRoller from './DiceRoller';
import VibeTracker from './VibeTracker';
import InitiativeTracker from './InitiativeTracker';
import SessionControls from './SessionControls';
import type { ChatMessageBroadcast } from '@/types';

type RailTab = 'chat' | 'dice' | 'initiative' | 'session';

const TAB_STORAGE_KEY = 'cozyvtt-session-tab';

const TABS: { key: RailTab; label: string; icon: LucideIcon }[] = [
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'dice', label: 'Dice', icon: Dices },
  { key: 'initiative', label: 'Initiative', icon: ListOrdered },
  { key: 'session', label: 'Session', icon: PlayCircle },
];

function loadInitialTab(): RailTab {
  const stored = localStorage.getItem(TAB_STORAGE_KEY);
  return TABS.some((t) => t.key === stored) ? (stored as RailTab) : 'chat';
}

export default function SessionSidebar() {
  const { socket } = useWebSocket();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<RailTab>(loadInitialTab);
  const [unreadChat, setUnreadChat] = useState(0);

  // Ref mirror so the socket listener sees the current tab without
  // re-subscribing on every tab switch.
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    if (activeTab === 'chat') {
      setUnreadChat(0);
    }
  }, [activeTab]);

  // Count chat messages that arrive while the Chat tab is inactive.
  // ChatPanel stays mounted and handles the messages themselves; this
  // listener only maintains the badge.
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: ChatMessageBroadcast) => {
      if (activeTabRef.current === 'chat') return;
      if (user && data.userId === user.id) return; // own messages aren't "unread"
      setUnreadChat((count) => count + 1);
    };

    socket.onChatMessage(handleChatMessage);
    return () => {
      socket.off('chat.message', handleChatMessage);
    };
  }, [socket, user]);

  // Roving-tabindex keyboard support: Left/Right arrows move between tabs.
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -1 : 1;
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setActiveTab(next.key);
    const tabEl = document.getElementById(`session-tab-${next.key}`);
    tabEl?.focus();
  };

  return (
    <aside className="h-full flex flex-col bg-parchment/30 border-l border-moss-green/20">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Session panels"
        className="flex items-stretch gap-1 px-2 pt-2 border-b border-moss-green/20 flex-shrink-0"
      >
        {TABS.map(({ key, label, icon: Icon }, index) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              id={`session-tab-${key}`}
              role="tab"
              aria-selected={active}
              aria-controls={`session-tabpanel-${key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(key)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-t-lg',
                'text-xs font-medium transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                active
                  ? 'text-brand bg-surface-light/70 border-b-2 border-brand -mb-px'
                  : 'text-ink-muted hover:text-ink hover:bg-surface/60'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{label}</span>
              {key === 'chat' && unreadChat > 0 && (
                <span
                  className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-canvas text-[10px] font-bold flex items-center justify-center"
                  aria-label={`${unreadChat} unread messages`}
                >
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panels — stacked, all mounted, inactive ones invisible */}
      <div className="relative flex-1 min-h-0">
        <div
          id="session-tabpanel-chat"
          role="tabpanel"
          aria-labelledby="session-tab-chat"
          className={cn('absolute inset-0 p-3', activeTab === 'chat' ? 'animate-fade-in' : 'invisible')}
        >
          <ChatPanel />
        </div>

        <div
          id="session-tabpanel-dice"
          role="tabpanel"
          aria-labelledby="session-tab-dice"
          className={cn('absolute inset-0 p-3', activeTab === 'dice' ? 'animate-fade-in' : 'invisible')}
        >
          <DiceRoller />
        </div>

        <div
          id="session-tabpanel-initiative"
          role="tabpanel"
          aria-labelledby="session-tab-initiative"
          className={cn(
            'absolute inset-0 p-3 overflow-y-auto',
            activeTab === 'initiative' ? 'animate-fade-in' : 'invisible'
          )}
        >
          <InitiativeTracker />
        </div>

        <div
          id="session-tabpanel-session"
          role="tabpanel"
          aria-labelledby="session-tab-session"
          className={cn(
            'absolute inset-0 p-3 overflow-y-auto space-y-4',
            activeTab === 'session' ? 'animate-fade-in' : 'invisible'
          )}
        >
          <VibeTracker />
          {/* SessionControls renders nothing for players */}
          <SessionControls />
        </div>
      </div>
    </aside>
  );
}

// ============================================
// Session Sidebar — tabbed right rail
// Chat / Dice / Initiative / Session share one full-height panel
// instead of stacking in a scrolling column with fixed heights.
//
// The rail is its tab bar and the panels below it (SessionPanels),
// which stay mounted while their tab is not open. The open tab is the
// game store's `sessionTab`. On the campaign page the panels are the
// page's, moved into the rail (tableHosts.tsx); drawn on its own, the
// rail draws them itself.
// ============================================

import { MessageCircle, Dices, ListOrdered, PlayCircle, NotebookPen, type LucideIcon } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { cn } from '@/utils/cn';
import SessionPanels from './SessionPanels';
import { SESSION_TABS, type SessionTab } from './sessionTabs';
import { useTableSlot } from './tableHosts';

const TAB_LOOKS: Record<SessionTab, { label: string; icon: LucideIcon }> = {
  chat: { label: 'Chat', icon: MessageCircle },
  dice: { label: 'Dice', icon: Dices },
  initiative: { label: 'Initiative', icon: ListOrdered },
  // Its own tab rather than a widget under Session: long-form writing needs the
  // full height of the rail, and people come back to it constantly during play.
  notes: { label: 'Notes', icon: NotebookPen },
  session: { label: 'Session', icon: PlayCircle },
};

const TABS = SESSION_TABS.map((key) => ({ key, ...TAB_LOOKS[key] }));

export default function SessionSidebar() {
  const activeTab = useGameStore((s) => s.sessionTab);
  const setActiveTab = useGameStore((s) => s.setSessionTab);
  const unreadChat = useGameStore((s) => s.unreadChat);
  const panelsSlot = useTableSlot('session');

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
      {/* Tab bar. Five labelled tabs need about 400 px and the rail is often
          narrower (356 px at 1440 wide), which cut the last tab off; below
          that only the open tab shows its label, and the others keep theirs
          for screen readers and as a hover title. */}
      <div
        role="tablist"
        aria-label="Session panels"
        className="@container flex items-stretch gap-1 px-2 pt-2 border-b border-moss-green/20 shrink-0"
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
              title={label}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-t-lg',
                'text-xs font-medium transition-colors duration-150',
                'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand',
                active
                  ? 'text-brand-ink bg-surface-light/70 border-b-2 border-brand -mb-px'
                  : 'text-ink-muted hover:text-ink hover:bg-surface/60'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className={active ? undefined : 'sr-only @min-[26rem]:not-sr-only'}>{label}</span>
              {key === 'chat' && unreadChat > 0 && (
                <span
                  className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-brand-text text-[10px] font-bold flex items-center justify-center"
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
      <div ref={panelsSlot.ref} className="relative flex-1 min-h-0">
        {!panelsSlot.hosted && <SessionPanels />}
      </div>
    </aside>
  );
}

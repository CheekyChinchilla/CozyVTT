// ============================================
// BottomBar: the compact layout's buttons along the foot of the screen
//
// Map, Chat, Dice, Initiative, Party and More, each a button 56 px tall, in
// a `nav` landmark named "Table", above the phone's own home indicator (the
// safe area). The arrangement says which one is open (`active`, 'map' while
// no sheet is) and opens what is chosen; the bar draws only the buttons.
// They are buttons and not tabs: Map closes every sheet, More opens a menu,
// and Party has no tab panel. The open one is `aria-current`; each that
// opens a sheet says whether it is open (`aria-expanded`) and, once the
// arrangement gives the sheets' ids (`sheetIds`), which sheet it opens
// (`aria-controls`). The Chat button carries the unread count the rail's
// Chat tab shows (the game store's `unreadChat`). On a tablet the buttons
// are at most 672 px wide, centred, as the sheets are.
// ============================================

import { Ellipsis, Map as MapIcon, Users, type LucideIcon } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { cn } from '@/utils/cn';
import { SESSION_TAB_LOOKS, unreadBadge } from '@/components/campaign/sessionTabs';

export type CompactTab = 'map' | 'chat' | 'dice' | 'initiative' | 'party' | 'more';

/** The bar's buttons, in order. */
export const COMPACT_TABS: readonly CompactTab[] = ['map', 'chat', 'dice', 'initiative', 'party', 'more'];

/**
 * The bar's height, its top rule and the safe area under it included: where
 * the arrangement's sheets stand (BottomSheet's `edges`).
 */
export const BOTTOM_BAR_HEIGHT = 'calc(3.5rem + 1px + env(safe-area-inset-bottom, 0px))';

const TAB_LOOKS: Record<CompactTab, { label: string; icon: LucideIcon }> = {
  map: { label: 'Map', icon: MapIcon },
  chat: SESSION_TAB_LOOKS.chat,
  dice: SESSION_TAB_LOOKS.dice,
  initiative: SESSION_TAB_LOOKS.initiative,
  party: { label: 'Party', icon: Users },
  more: { label: 'More', icon: Ellipsis },
};

export interface BottomBarProps {
  /** The button whose sheet is open; 'map' while none is. */
  active: CompactTab;
  onSelect: (tab: CompactTab) => void;
  /** The id of the sheet each button opens, once the arrangement draws them. */
  sheetIds?: Partial<Record<Exclude<CompactTab, 'map'>, string>>;
}

export default function BottomBar({ active, onSelect, sheetIds }: BottomBarProps) {
  const unreadChat = useGameStore((s) => s.unreadChat);

  return (
    <nav aria-label="Table" className="shrink-0 border-t border-brand/20 bg-parchment pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid h-14 w-full max-w-2xl grid-cols-6">
        {COMPACT_TABS.map((tab) => {
          const { label, icon: Icon } = TAB_LOOKS[tab];
          const open = active === tab;
          const badge = tab === 'chat' && unreadChat > 0 ? unreadBadge(unreadChat) : null;
          return (
            <button
              key={tab}
              type="button"
              id={`compact-tab-${tab}`}
              aria-current={open ? 'true' : undefined}
              aria-expanded={tab === 'map' ? undefined : open}
              aria-controls={tab === 'map' ? undefined : sheetIds?.[tab]}
              onClick={() => onSelect(tab)}
              className={cn(
                'relative flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                open ? 'font-semibold text-brand-ink' : 'font-medium text-ink-muted hover:text-ink'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="max-w-full truncate px-0.5">{label}</span>
              {badge && (
                <span
                  aria-label={badge.label}
                  className="absolute top-1 left-1/2 ml-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-fill px-1 text-[11px] font-bold text-white"
                >
                  {badge.text}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

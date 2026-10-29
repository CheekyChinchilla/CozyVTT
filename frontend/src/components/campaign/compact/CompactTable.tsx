// ============================================
// Compact Table: the campaign page's arrangement below 1024 px
//
// The map fills the screen between a one-row header (CompactHeader) and the
// bar (BottomBar): Map, Chat, Dice, Initiative, Party and More. Each opens
// its sheet over the map; Map closes them, and the open one's button closes
// it again.
//
// - Chat, Dice and Initiative open the session sheet, which holds the
//   session panels (SessionPanels) on the chosen one, Chat's taller than
//   half the screen (CHAT_SHEET_HEIGHT); More's Notes and Session open the
//   same sheet on theirs, at full height.
// - Party opens a sheet with the campaign's info, its roster and, for the
//   DM, the Token Roster.
// - More lists what the desktop's header offers (MoreSheet); its windows
//   and slide-overs are the page's, which this only asks to open.
//
// The map, the session panels and the Party content are the page's, drawn
// once and moved into this arrangement's slots (tableHosts.tsx). All three
// slots stay mounted for as long as the arrangement is: a closed sheet keeps
// its content laid out, hidden, so the chat still scrolls to its newest
// message and the roster still fills the hit points the map's bars read.
// The sheets are put on the page in the order they mount, so More, opened
// over the others, mounts after them.
//
// The arrangement's sheets stop under the header and above the bar
// (`edges`), so the bar stays to be pressed beside any of them, More's
// included: one press goes from More to Chat. More is modal for the
// keyboard and a screen reader, which leave it by its X, Escape or Back.
// The menus and pickers opened from the map or a panel cover the bar.
//
// Only an open session sheet shows the chat (the game store's
// `sessionShown`), so messages that arrive while it is closed count on the
// Chat button's badge. A sheet the keyboard was in on the desktop's
// arrangement, as a tablet turns, opens as this one takes over.
//
// On a phone turned on its side (a screen under 500 px tall) there is no
// bar: its buttons sit in the header, and the sheets come from the right
// at the map's full height.
// ============================================

import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SHORT_SCREEN_QUERY } from '@/constants/layout';
import { useCampaign } from '@/contexts/CampaignContext';
import { useGameStore } from '@/stores/gameStore';
import { CampaignStatus } from '@/types';
import type { Campaign } from '@/types';
import { type SessionToolKey } from '@/components/campaign/SessionToolbar';
import { SESSION_TAB_LOOKS, type SessionTab } from '@/components/campaign/sessionTabs';
import { SessionPausedBanner } from '@/components/campaign/sessionStatus';
import { partHoldingFocus, useTableSlot } from '@/components/campaign/tableHosts';
import { BottomSheet, type SheetEdges, type SheetHeight } from './BottomSheet';
import BottomBar, { BOTTOM_BAR_HEIGHT, type CompactTab } from './BottomBar';
import CompactHeader from './CompactHeader';
import MoreSheet, { type MorePanel } from './MoreSheet';

/** The arrangement's sheets, of which one at most is open. */
type CompactSheet = 'session' | 'party' | 'more';

/** The session panels the bar has a button for; More opens the others. */
const BAR_PANELS = ['chat', 'dice', 'initiative'] as const satisfies readonly SessionTab[];

const onTheBar = (tab: SessionTab): tab is (typeof BAR_PANELS)[number] => BAR_PANELS.some((panel) => panel === tab);

/** How high the session sheet opens on `tab`: Notes and Session, for long reading and writing, at full height. */
const openingHeight = (tab: SessionTab): SheetHeight => (onTheBar(tab) ? 'half' : 'full');

/**
 * How tall the session sheet opens on Chat: taller than the other half
 * sheets, since half of a phone held upright (330 px in Safari on an iPhone
 * 15) left the chat one message under its box. The map still shows above.
 */
export const CHAT_SHEET_HEIGHT = '66dvh';

/** An element's height, followed as it changes. */
function useHeight() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, height] as const;
}

export interface CompactTableProps {
  campaign: Campaign;
  /** Whether the viewer owns the campaign, which may differ from running it. */
  isOwner: boolean;
  /** Open one of the DM's slide-overs; `settings` is also an owner's way to the settings. */
  onOpenTool: (key: SessionToolKey) => void;
  onOpenDocuments: () => void;
  onOpenShortcuts: () => void;
}

export default function CompactTable({ campaign, isOwner, onOpenTool, onOpenDocuments, onOpenShortcuts }: CompactTableProps) {
  const { userRole } = useCampaign();
  const sideways = useMediaQuery(SHORT_SCREEN_QUERY);
  const sessionTab = useGameStore((s) => s.sessionTab);
  const setSessionTab = useGameStore((s) => s.setSessionTab);
  const setSessionShown = useGameStore((s) => s.setSessionShown);
  const mapSlot = useTableSlot('map');
  const sessionSlot = useTableSlot('session');
  const partySlot = useTableSlot('party');

  // Taking over from the desktop's arrangement with the keyboard in the
  // rail or the Party column shows that part, so the control stays in sight.
  const [sheet, setSheet] = useState<CompactSheet | null>(() => {
    const part = partHoldingFocus();
    return part === 'session' || part === 'party' ? part : null;
  });
  const [sessionHeight, setSessionHeight] = useState<SheetHeight>(() => openingHeight(sessionTab));
  const [partyHeight, setPartyHeight] = useState<SheetHeight>('half');

  useEffect(() => {
    setSessionShown(sheet === 'session');
  }, [sheet, setSessionShown]);
  // The desktop's rail, or another page, shows the panels again.
  useEffect(() => () => setSessionShown(true), [setSessionShown]);

  const [headerRef, headerHeight] = useHeight();
  const edges: SheetEdges = { top: `${headerHeight}px`, bottom: sideways ? '0px' : BOTTOM_BAR_HEIGHT };

  const sessionSheetId = useId();
  const partySheetId = useId();
  const moreSheetId = useId();

  const openSession = (tab: SessionTab) => {
    if (sheet !== 'session') setSessionHeight(openingHeight(tab));
    setSessionTab(tab);
    setSheet('session');
  };

  const select = (tab: CompactTab) => {
    if (tab === 'map') {
      setSheet(null);
    } else if (tab === 'party' || tab === 'more') {
      if (tab === 'party' && sheet !== 'party') setPartyHeight('half');
      setSheet(sheet === tab ? null : tab);
    } else if (sheet === 'session' && sessionTab === tab) {
      setSheet(null);
    } else {
      openSession(tab);
    }
  };

  const openFromMore = (panel: MorePanel) => openSession(panel);

  // Notes and Session are More's, so the bar shows More while they are open.
  const active: CompactTab =
    sheet === 'session' ? (onTheBar(sessionTab) ? sessionTab : 'more') : (sheet ?? 'map');

  const bar = (
    <BottomBar
      active={active}
      onSelect={select}
      placement={sideways ? 'header' : 'foot'}
      sheetIds={{ chat: sessionSheetId, dice: sessionSheetId, initiative: sessionSheetId, party: partySheetId, more: moreSheetId }}
    />
  );

  return (
    <>
      <CompactHeader ref={headerRef} campaign={campaign} bar={sideways ? bar : undefined} />

      {campaign.status === CampaignStatus.PAUSED && userRole !== 'DM' && <SessionPausedBanner />}

      {/* The map is the page's, moved in here (tableHosts.tsx). */}
      <main ref={mapSlot.ref} className="relative min-h-0 flex-1 overflow-hidden" />

      {!sideways && bar}

      <BottomSheet
        id={sessionSheetId}
        open={sheet === 'session'}
        title={SESSION_TAB_LOOKS[sessionTab].label}
        height={sessionHeight}
        halfHeight={sessionTab === 'chat' ? CHAT_SHEET_HEIGHT : undefined}
        onHeightChange={setSessionHeight}
        onClose={() => setSheet(null)}
        edges={edges}
      >
        {/* The session panels are the page's, moved in here; each fills this box. */}
        <div ref={sessionSlot.ref} className="absolute inset-0" />
      </BottomSheet>

      <BottomSheet
        id={partySheetId}
        open={sheet === 'party'}
        title="Party"
        height={partyHeight}
        onHeightChange={setPartyHeight}
        onClose={() => setSheet(null)}
        edges={edges}
      >
        {/* The Party content is the page's, moved in here. */}
        <div ref={partySlot.ref} className="px-4 pt-1 pb-4" />
      </BottomSheet>

      <MoreSheet
        id={moreSheetId}
        open={sheet === 'more'}
        onClose={() => setSheet(null)}
        isOwner={isOwner}
        onOpenTool={onOpenTool}
        onOpenDocuments={onOpenDocuments}
        onOpenShortcuts={onOpenShortcuts}
        onOpenPanel={openFromMore}
        edges={edges}
      />
    </>
  );
}

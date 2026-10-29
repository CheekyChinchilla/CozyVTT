// ============================================
// Desktop Table: the campaign page's desktop arrangement
// The header, the paused banner and three resizable columns:
// Left: Campaign info, character, party
// Center: Map canvas
// Right: Chat, dice roller, controls
//
// The map, the session panels and the Party content are the page's,
// drawn once and moved into this arrangement's slots (tableHosts.tsx), so
// they outlive it. What is here is the arrangement's own: the header's
// buttons, the columns' sizes and whether a side column is folded away.
// The windows the header opens are the page's too, so its buttons only
// ask the page to open them.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Sun,
  PauseCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen, Settings, BookOpen, Keyboard } from 'lucide-react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type PanelImperativeHandle,
} from 'react-resizable-panels';
import { useCampaign } from '@/contexts/CampaignContext';
import SessionSidebar from '@/components/campaign/SessionSidebar';
import SessionToolbar, { type SessionToolKey } from '@/components/campaign/SessionToolbar';
import { useTableSlot } from '@/components/campaign/tableHosts';
import ConnectionStatus from '@/components/ConnectionStatus';
import { SESSION_STATUS_LABELS, SessionPausedBanner } from '@/components/campaign/sessionStatus';
import { CampaignStatus } from '@/types';
import type { Campaign } from '@/types';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { optionalStorage } from '@/utils/optionalStorage';

interface DesktopTableProps {
  campaign: Campaign;
  /** Whether the viewer owns the campaign, which may differ from running it. */
  isOwner: boolean;
  /** Which of the DM's slide-overs are open, which the toolbar shows pressed. */
  openTools: Record<SessionToolKey, boolean>;
  /** Open one of the DM's slide-overs; `settings` is also an owner's way to the settings. */
  onOpenTool: (key: SessionToolKey) => void;
  onOpenDocuments: () => void;
  onOpenShortcuts: () => void;
}

export default function DesktopTable({
  campaign,
  isOwner,
  openTools,
  onOpenTool,
  onOpenDocuments,
  onOpenShortcuts,
}: DesktopTableProps) {
  const navigate = useNavigate();
  const { userRole } = useCampaign();
  const mapSlot = useTableSlot('map');
  const partySlot = useTableSlot('party');

  // Resizable panel layout — persisted to localStorage so each user's
  // column sizes survive reloads.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'cozyvtt-session-layout',
    storage: optionalStorage,
  });
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const togglePanel = (
    panelRef: React.RefObject<PanelImperativeHandle | null>,
    fallbackSize: string
  ) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      // A panel restored from a collapsed saved layout has no previous
      // size to expand back to — fall back to its default share.
      if (panel.getSize().asPercentage === 0) {
        panel.resize(fallbackSize);
      }
    } else {
      panel.collapse();
    }
  };

  return (
    <>
      {/* Header Bar */}
      {/* Wraps onto a second row in a narrow window instead of running off its edge. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 bg-moss-green/10 border-b border-moss-green/20 shadow-xs">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            onClick={() => navigate('/dashboard')}
            variant="secondary" className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>

          <div className="h-6 w-px bg-moss-green/20" />

          <h1 className="min-w-0 break-words text-xl font-bold text-brand-ink">
            {campaign.name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Status */}
          <ConnectionStatus />

          {/* Session status indicator (visible to all) */}
          {campaign.status === CampaignStatus.ACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success/10 border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success-ink hidden sm:inline">{SESSION_STATUS_LABELS[CampaignStatus.ACTIVE]}</span>
            </div>
          )}
          {campaign.status === CampaignStatus.PAUSED && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <PauseCircle className="w-3.5 h-3.5 text-accent-ink" />
              <span className="text-xs font-medium text-accent-ink hidden sm:inline">{SESSION_STATUS_LABELS[CampaignStatus.PAUSED]}</span>
            </div>
          )}
          {campaign.status === CampaignStatus.INACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-gray/10 border border-stone-gray/20">
              <div className="w-2 h-2 rounded-full bg-stone-gray/50" />
              <span className="text-xs font-medium text-stone-gray hidden sm:inline">{SESSION_STATUS_LABELS[CampaignStatus.INACTIVE]}</span>
            </div>
          )}

          {/* Vibe indicator (visible to all) */}
          {campaign?.currentVibe && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <Sun className="w-3.5 h-3.5 text-accent-ink" />
              <span className="text-xs font-medium text-accent-ink capitalize hidden sm:inline">
                {campaign.currentVibe}
              </span>
            </div>
          )}

          {/* DM tools — grouped icon toolbar */}
          {userRole === 'DM' && (
            <>
              <div className="h-6 w-px bg-moss-green/20" />
              <SessionToolbar
                openPanels={openTools}
                onOpen={onOpenTool}
                spiritLayerEnabled={campaign?.spiritLayerEnabled}
              />
            </>
          )}

          {/* An owner who has handed the game over keeps two powers — deleting
              the campaign and taking the seat back — and this is their way to
              them. It sits here, beside where the DM's own settings gear would
              be, because that is where somebody goes looking for it; tucked in
              the sidebar it read as missing. */}
          {isOwner && userRole !== 'DM' && (
            <>
              <div className="h-6 w-px bg-moss-green/20" />
              <Tooltip content="Owner settings — delete, or take back the DM role" side="bottom">
                <Button
                  variant="ghost"
                  iconOnly
                  icon={Settings}
                  aria-label="Owner Settings"
                  onClick={() => onOpenTool('settings')}
                />
              </Tooltip>
            </>
          )}

          {/* Documents shared with the campaign. Every member, not just the
              DM: a rulebook the table is meant to read has to be reachable by
              the people reading it. */}
          <div className="h-6 w-px bg-moss-green/20" />
          <Tooltip content="Campaign documents" side="bottom">
            <Button
              variant="ghost"
              iconOnly
              icon={BookOpen}
              aria-label="Campaign documents"
              onClick={onOpenDocuments}
            />
          </Tooltip>
          <Tooltip content="Keyboard shortcuts" side="bottom">
            <Button
              variant="ghost"
              iconOnly
              icon={Keyboard}
              aria-label="Keyboard shortcuts"
              onClick={onOpenShortcuts}
            />
          </Tooltip>

          {/* Sidebar collapse toggles (all roles) */}
          <div className="h-6 w-px bg-moss-green/20" />
          <div className="flex items-center gap-1">
            <Tooltip content={leftCollapsed ? 'Show party panel' : 'Hide party panel'} side="bottom">
              <Button
                variant="ghost"
                iconOnly
                icon={leftCollapsed ? PanelLeftOpen : PanelLeftClose}
                aria-label={leftCollapsed ? 'Show party panel' : 'Hide party panel'}
                onClick={() => togglePanel(leftPanelRef, '20%')}
              />
            </Tooltip>
            <Tooltip content={rightCollapsed ? 'Show session panel' : 'Hide session panel'} side="bottom">
              <Button
                variant="ghost"
                iconOnly
                icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
                aria-label={rightCollapsed ? 'Show session panel' : 'Hide session panel'}
                onClick={() => togglePanel(rightPanelRef, '25%')}
              />
            </Tooltip>
          </div>
        </div>
      </header>

      {/* Session Paused Banner — visible to players when session is paused */}
      {campaign.status === CampaignStatus.PAUSED && userRole !== 'DM' && <SessionPausedBanner />}

      {/* Main Content - Three Resizable Panels. Relative, so it clips what is
          absolutely placed inside it too, such as the hidden names of the
          rail's icon tabs, which otherwise widened a narrow page. */}
      <main className="relative flex-1 min-h-0 overflow-hidden">
        {/* The dividers are 6 pixels wide; the library takes a drag over a
            wider strip than it draws. 44 pixels where the primary pointer
            is coarse is the size a finger needs; a mouse keeps its 10. It
            takes a press in the strip on anything inside the group, whatever
            is drawn over the divider, so the menus and pickers opened in
            these columns are drawn on the body (components/ui/FloatingLayer.tsx),
            where being in front keeps their presses. A z-index on <main> or
            the page's root at or above theirs would undo that. */}
        <Group
          orientation="horizontal"
          className="h-full w-full"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 44, fine: 10 }}
        >
          {/* Left Panel — party & campaign info */}
          <Panel
            id="party"
            defaultSize={20}
            minSize="260px"
            collapsible
            panelRef={leftPanelRef}
            onResize={(size) => setLeftCollapsed(size.asPercentage === 0)}
            className="h-full"
          >
            {/* The Party content (campaign info, the roster and, for the DM,
                the Token Roster) is the page's, moved in here (tableHosts.tsx). */}
            <aside ref={partySlot.ref} className="h-full overflow-y-auto p-4 bg-parchment/30 border-r border-moss-green/20" />
          </Panel>

          <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

          {/* Center Panel — map canvas */}
          <Panel id="map" defaultSize={55} minSize={30} className="h-full">
            {/* The map is the page's, moved in here (tableHosts.tsx). */}
            <section ref={mapSlot.ref} className="h-full min-w-0 p-4" />
          </Panel>

          <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

          {/* Right Panel — tabbed session rail (Chat / Dice / Initiative / Session) */}
          <Panel
            id="rail"
            defaultSize={25}
            minSize="300px"
            collapsible
            panelRef={rightPanelRef}
            onResize={(size) => setRightCollapsed(size.asPercentage === 0)}
            className="h-full"
          >
            <SessionSidebar />
          </Panel>
        </Group>
      </main>
    </>
  );
}

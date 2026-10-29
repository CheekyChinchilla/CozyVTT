// ============================================
// MoreSheet: the compact layout's More
//
// What the desktop's header and rail offer that the compact layout's bar
// does not, as a list at full height:
//
// - At the table, for everyone: Notes and Session (the session panels the
//   rail's tabs open, which the compact layout opens in its session sheet),
//   Documents and Shortcuts.
// - DM tools, for the DM: the header's toolbar, every tool in its order
//   (SessionToolbar's TOOL_GROUPS), each opening its slide-over or window.
// - Owner Settings, for an owner who has handed the DM's seat to someone
//   else, as the desktop's header offers it.
//
// A row closes More and opens what it names; the windows are the page's, so
// More only asks for them.
// ============================================

import { useId } from 'react';
import { BookOpen, Keyboard, Settings } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import type { MenuAction } from '@/components/ui/menu';
import { TOOL_GROUPS, type SessionToolKey } from '@/components/campaign/SessionToolbar';
import { SESSION_TAB_LOOKS } from '@/components/campaign/sessionTabs';
import { BottomSheet, type SheetEdges } from './BottomSheet';
import SheetMenuRows from './SheetMenuRows';

/** The session panels More opens; the bar opens the others. */
export type MorePanel = 'notes' | 'session';

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  /** Whether the viewer owns the campaign, which may differ from running it. */
  isOwner: boolean;
  /** Open one of the DM's slide-overs; `settings` is also an owner's way to the settings. */
  onOpenTool: (key: SessionToolKey) => void;
  onOpenDocuments: () => void;
  onOpenShortcuts: () => void;
  /** Open the session sheet on Notes or Session. */
  onOpenPanel: (panel: MorePanel) => void;
  /** Where the arrangement's sheets stop; see BottomSheet. */
  edges?: SheetEdges;
  /** The sheet's id, which the bar's More button names. */
  id?: string;
}

const action = (id: string, label: string, icon: MenuAction['icon'], run: () => void, extra: Partial<MenuAction> = {}): MenuAction => ({
  kind: 'command', id, label, icon, run, ...extra,
});

/** One group of More's rows, under its heading. */
function Group({ heading, items, onClose }: { heading: string; items: MenuAction[]; onClose: () => void }) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId} className="mt-4 first:mt-1">
      <h3 id={headingId} className="mx-1 mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{heading}</h3>
      <div className="overflow-hidden rounded-cozy border border-ink/10 bg-paper/60">
        <SheetMenuRows items={items} onClose={onClose} chevrons />
      </div>
    </div>
  );
}

export default function MoreSheet({
  open,
  onClose,
  isOwner,
  onOpenTool,
  onOpenDocuments,
  onOpenShortcuts,
  onOpenPanel,
  edges,
  id,
}: MoreSheetProps) {
  const { userRole } = useCampaign();

  const atTheTable = [
    action('notes', SESSION_TAB_LOOKS.notes.label, SESSION_TAB_LOOKS.notes.icon, () => onOpenPanel('notes')),
    action('session', SESSION_TAB_LOOKS.session.label, SESSION_TAB_LOOKS.session.icon, () => onOpenPanel('session')),
    action('documents', 'Documents', BookOpen, onOpenDocuments),
    action('shortcuts', 'Shortcuts', Keyboard, onOpenShortcuts),
  ];
  const dmTools = TOOL_GROUPS.flat().map(({ key, label, icon }) =>
    action(key, label, icon, () => onOpenTool(key), key === 'spirit' ? { tone: 'spirit' } : {})
  );
  // The settings an owner keeps after handing the DM's seat over: deleting
  // the campaign and taking the seat back.
  const ownerSettings = [action('owner-settings', 'Owner Settings', Settings, () => onOpenTool('settings'))];

  return (
    <BottomSheet open={open} title="More" height="full" onClose={onClose} edges={edges} id={id}>
      <div className="px-3 pb-3">
        <Group heading="At the table" items={atTheTable} onClose={onClose} />
        {userRole === 'DM' && <Group heading="DM tools" items={dmTools} onClose={onClose} />}
        {isOwner && userRole !== 'DM' && <Group heading="Owner" items={ownerSettings} onClose={onClose} />}
      </div>
    </BottomSheet>
  );
}

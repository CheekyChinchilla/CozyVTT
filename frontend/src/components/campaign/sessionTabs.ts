import { MessageCircle, Dices, ListOrdered, PlayCircle, NotebookPen, type LucideIcon } from 'lucide-react';

/**
 * The session panels (`SessionPanels.tsx`), in the order their tabs show
 * them. The rail's tab bar takes its tabs from here and the game store keeps
 * the open one (`sessionTab`), so a list of tabs is written once.
 */
export const SESSION_TABS = ['chat', 'dice', 'initiative', 'notes', 'session'] as const;

export type SessionTab = (typeof SESSION_TABS)[number];

/**
 * Each panel's name and icon, as the rail's tabs show them; the compact
 * layout's bar and its More list name them the same.
 */
export const SESSION_TAB_LOOKS: Record<SessionTab, { label: string; icon: LucideIcon }> = {
  chat: { label: 'Chat', icon: MessageCircle },
  dice: { label: 'Dice', icon: Dices },
  initiative: { label: 'Initiative', icon: ListOrdered },
  // Its own tab rather than a widget under Session: long-form writing needs the
  // full height of the rail, and people come back to it constantly during play.
  notes: { label: 'Notes', icon: NotebookPen },
  session: { label: 'Session', icon: PlayCircle },
};

/** Whether a stored value names a session panel. */
export function isSessionTab(value: unknown): value is SessionTab {
  return SESSION_TABS.some((tab) => tab === value);
}

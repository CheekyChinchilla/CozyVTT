/**
 * The session panels (`SessionPanels.tsx`), in the order their tabs show
 * them. The rail's tab bar takes its tabs from here and the game store keeps
 * the open one (`sessionTab`), so a list of tabs is written once.
 */
export const SESSION_TABS = ['chat', 'dice', 'initiative', 'notes', 'session'] as const;

export type SessionTab = (typeof SESSION_TABS)[number];

/** Whether a stored value names a session panel. */
export function isSessionTab(value: unknown): value is SessionTab {
  return SESSION_TABS.some((tab) => tab === value);
}

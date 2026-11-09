// ============================================
// Asking before the page is left
//
// The app's router (a BrowserRouter) has no way to hold a move to another
// page while something on it asks, so whatever holds work that leaving
// would lose registers here, and the page's own ways out ask it first: the
// headers' way back to the dashboard (useLeavePage). The browser's own Back
// is held by a history entry instead, and a reload or a closed tab by
// beforeunload (hooks/useLeaveGuard.ts).
// ============================================

/** Asked before the page is left: true to let it go, false to stay. */
export type LeaveGuard = () => Promise<boolean>;

const guards = new Set<LeaveGuard>();

/** Register a guard; returns the function that removes it. */
export function registerLeaveGuard(guard: LeaveGuard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

/**
 * Leave the page with `go` once every guard has let it: at once with none
 * registered, after each has answered with some, and not at all when one
 * says no. Guards are asked one at a time, in the order they registered.
 */
export function leavePageWith(go: () => void): void {
  if (guards.size === 0) {
    go();
    return;
  }
  void (async () => {
    for (const guard of [...guards]) {
      // A guard that fails to answer keeps the page.
      if (!(await guard().catch(() => false))) return;
    }
    go();
  })();
}

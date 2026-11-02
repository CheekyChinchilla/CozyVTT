// ============================================
// Asking before work on the page is left behind
//
// While `active` (work that leaving would lose, such as Paint not saved),
// every way off the page asks `ask` first:
// - the page's own ways out, the headers' way back to the dashboard
//   (services/pageLeave.ts, through useLeavePage);
// - the browser's Back, on both layouts: a history entry is held as a
//   dialog holds one on a phone (compact/sheetHistory.ts), beneath every
//   sheet and dialog, so Back closes those first, then asks, stays on a no,
//   and goes on back past the page on a yes. `holdBack`
//   false leaves Back to something else on the page that asks the same
//   question its own way, such as the phone's Back while preparing a map,
//   which goes back to the table;
// - a reload, a closed tab or an address typed: the browser's own
//   question (beforeunload), worded by the browser.
// ============================================

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { registerLeaveGuard, leavePageWith } from '@/services/pageLeave';
import { BENEATH_EVERY_SHEET, dialogOpened, onSheetEntry, type SheetEntry } from '@/components/campaign/compact/sheetHistory';

export function useLeaveGuard(active: boolean, ask: () => Promise<boolean>, { holdBack }: { holdBack: boolean }): void {
  const askRef = useRef(ask);
  const activeRef = useRef(active);
  const holdBackRef = useRef(holdBack);
  useEffect(() => {
    askRef.current = ask;
    activeRef.current = active;
    holdBackRef.current = holdBack;
  });
  const entryRef = useRef<SheetEntry | null>(null);
  /** A question is out; a second way out pressed meanwhile is not asked again. */
  const deciding = useRef(false);

  /**
   * Ask, then let the history entry go as the answer says: a yes leaves,
   * by Back past the page or in place for the page's own way out to
   * replace; a no keeps the entry while there is still work. The work may
   * end with the yes itself (Discard drops it in its click), which takes the
   * hold down before the answer arrives here: the hold leaves the entry to
   * the answer meanwhile, or the page would stay.
   */
  const decide = useCallback(async (how: 'leave' | 'inPlace'): Promise<boolean> => {
    if (deciding.current) return false;
    deciding.current = true;
    let leave: boolean;
    try {
      leave = await askRef.current();
    } catch {
      // A question that fails to answer keeps the page.
      leave = false;
    } finally {
      deciding.current = false;
    }
    const entry = entryRef.current;
    if (leave) {
      entryRef.current = null;
      entry?.release(how);
    } else if (entry && !(activeRef.current && holdBackRef.current)) {
      entryRef.current = null;
      entry.release();
    }
    return leave;
  }, []);

  // The page's own ways out.
  useEffect(() => {
    if (!active) return undefined;
    return registerLeaveGuard(() => decide('inPlace'));
  }, [active, decide]);

  // The browser's Back. The hold sits beneath every sheet and dialog open,
  // those opened before it too, so Back closes them first, as it does
  // without work on the page, and asks only once none is open.
  useEffect(() => {
    if (!active || !holdBack) return undefined;
    if (!entryRef.current) entryRef.current = dialogOpened(() => { void decide('leave'); }, BENEATH_EVERY_SHEET);
    return () => {
      if (deciding.current) return;
      entryRef.current?.release();
      entryRef.current = null;
    };
  }, [active, holdBack, decide]);
  // The page itself going lets the entry go, a question out or not.
  useEffect(() => () => {
    entryRef.current?.release();
    entryRef.current = null;
  }, []);

  // A reload, a closed tab, an address typed: listened for only while there
  // is work, since a page with the listener may be kept out of the
  // browser's back-forward cache. Both are set: some browsers ask only on
  // returnValue.
  useEffect(() => {
    if (!active) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}

/**
 * The page's own way out to `to`, asking whatever holds work on it first
 * (useLeaveGuard). It takes the place of a sheet's or a dialog's history
 * entry, so Back from where it goes comes straight back here.
 */
export function useLeavePage(): (to: string) => void {
  const navigate = useNavigate();
  return useCallback((to: string) => {
    leavePageWith(() => navigate(to, { replace: onSheetEntry() }));
  }, [navigate]);
}

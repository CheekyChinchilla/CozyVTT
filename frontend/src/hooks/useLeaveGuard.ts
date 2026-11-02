// ============================================
// Asking before work on the page is left behind
//
// While `active` (work that leaving would lose, such as Paint not saved),
// every way off the page asks `ask` first:
// - the page's own ways out, the headers' way back to the dashboard
//   (services/pageLeave.ts, through useLeavePage);
// - the browser's Back, on both layouts: a history entry is held as a
//   dialog holds one on a phone (compact/sheetHistory.ts), so Back asks,
//   stays on a no, and goes on back past the page on a yes. `holdBack`
//   false leaves Back to something else on the page that asks the same
//   question its own way, such as the phone's Back while preparing a map,
//   which goes back to the table;
// - a reload, a closed tab or an address typed: the browser's own
//   question (beforeunload), worded by the browser.
// ============================================

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { registerLeaveGuard, leavePageWith } from '@/services/pageLeave';
import { dialogOpened, nextOpening, onSheetEntry, type SheetEntry } from '@/components/campaign/compact/sheetHistory';

export function useLeaveGuard(active: boolean, ask: () => Promise<boolean>, { holdBack }: { holdBack: boolean }): void {
  const askRef = useRef(ask);
  const activeRef = useRef(active);
  useEffect(() => {
    askRef.current = ask;
    activeRef.current = active;
  });
  const entryRef = useRef<SheetEntry | null>(null);

  // The page's own ways out. One that leaves takes the history entry with
  // it, so the entry is released in place for it to replace.
  useEffect(() => {
    if (!active) return undefined;
    return registerLeaveGuard(async () => {
      const leave = await askRef.current();
      if (leave) {
        entryRef.current?.release('inPlace');
        entryRef.current = null;
      }
      return leave;
    });
  }, [active]);

  // The browser's Back.
  useEffect(() => {
    if (!active || !holdBack) return undefined;
    let asking = false;
    const entry = dialogOpened(() => {
      if (asking) return;
      asking = true;
      void askRef.current().then((leave) => {
        asking = false;
        if (leave && entryRef.current === entry) {
          entryRef.current = null;
          entry.release('leave');
        }
      });
    }, nextOpening());
    entryRef.current = entry;
    return () => {
      if (entryRef.current === entry) entryRef.current = null;
      entry.release();
    };
  }, [active, holdBack]);

  // A reload, a closed tab, an address typed.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (activeRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
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

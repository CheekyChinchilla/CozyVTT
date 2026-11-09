// ============================================
// Whether a Dice panel's log is on the screen, so a roll made from
// somewhere else (a character sheet) can say its result when it is not: on a
// phone, where the sheet covers the table, or on a computer with the Dice
// tab closed or the side column folded away. A log counts while the Dice tab
// is the one open, the session panels are shown (the compact layout says
// whether its sheet is open), and any part of the log is in the viewport. The
// viewport alone is not enough: a closed tab is only invisible, and a closed
// sheet with reduced motion fades where it stands.
// ============================================

import { useEffect, type RefObject } from 'react';
import { useGameStore } from '@/stores/gameStore';

const onScreen = new Set<Element>();

/** Whether any Dice log is on the screen now. */
export function diceLogOnScreen(): boolean {
  const { sessionTab, sessionShown } = useGameStore.getState();
  return sessionShown && sessionTab === 'dice' && onScreen.size > 0;
}

/** Counts `ref`'s element as a Dice log while it is on the screen. */
export function useDiceLogOnScreen(ref: RefObject<Element | null>) {
  useEffect(() => {
    const log = ref.current;
    if (!log || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
    });
    observer.observe(log);
    return () => {
      observer.disconnect();
      onScreen.delete(log);
    };
  }, [ref]);
}

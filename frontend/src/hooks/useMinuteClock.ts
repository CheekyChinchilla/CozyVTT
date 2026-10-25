// ============================================
// A clock that moves on once a minute
// ============================================

import { useSyncExternalStore } from 'react';

const MINUTE_MS = 60_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, MINUTE_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The time, moving on each minute: a component that shows "5 minutes ago"
 * draws itself again with it. One timer serves every component, however
 * many messages are on screen.
 */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, () => now);
}

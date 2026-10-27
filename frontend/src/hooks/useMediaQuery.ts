import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now, following it as it changes. */
export function useMediaQuery(query: string): boolean {
  // One list per query, which the subscription and the reading share. A
  // subscription made anew on each render had React drop its listener and
  // add another every time the component drew, as the map does on every
  // move of the pointer.
  const list = useMemo(
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null),
    [query],
  );
  const subscribe = useCallback((onChange: () => void) => {
    if (!list) return () => {};
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [list]);
  return useSyncExternalStore(subscribe, () => list?.matches === true, () => false);
}

/**
 * The query for a primary pointer that is a finger, as on a phone or a
 * tablet: what Tailwind's `pointer-coarse:` variant asks, so a control that
 * changes in code and one that changes in its classes change together.
 */
export const COARSE_POINTER = '(pointer: coarse)';

/** Whether the primary pointer is a finger. */
export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER);
}

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

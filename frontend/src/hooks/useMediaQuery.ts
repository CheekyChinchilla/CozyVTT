import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now, following it as it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true,
    () => false,
  );
}

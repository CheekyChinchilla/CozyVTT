// ============================================
// useDebounce — delays propagating a rapidly-changing value
// ============================================
//
// Prevents expensive operations (filtering, API calls) from running on every
// keystroke by waiting until the user pauses typing.
//
// Usage:
//   const debouncedSearch = useDebounce(searchQuery, 300);
//   // Use debouncedSearch in useMemo / useEffect instead of searchQuery

import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity.  Useful for search inputs where you want to avoid filtering or
 * fetching on every keystroke.
 *
 * @param value - The value to debounce
 * @param delay - Milliseconds to wait after the last change (default: 300)
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

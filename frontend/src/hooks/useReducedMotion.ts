// ============================================
// useReducedMotion — the OS "reduce motion" preference, for JS animation
//
// index.css collapses every CSS animation/transition under
// `@media (prefers-reduced-motion: reduce)`, and framer-motion is handled
// by <MotionConfig reducedMotion="user"> in App.tsx. Neither can reach a
// requestAnimationFrame loop painting to a canvas — so map animations
// have to ask for the preference explicitly.
// ============================================

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    // Sync once in case the preference changed between render and effect.
    setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

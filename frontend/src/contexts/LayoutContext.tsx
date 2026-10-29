// ============================================
// Layout Context: which arrangement the campaign page draws
//
// The campaign page has a desktop arrangement, three columns
// (components/campaign/DesktopTable.tsx), and a compact one below 1024 px
// (components/campaign/compact/CompactTable.tsx); exactly one is mounted at
// a time, and the parts they arrange are drawn once for the
// page and moved between them (components/campaign/tableHosts.tsx). The page
// says which one with LayoutProvider; a component that changes with it asks
// useCompactLayout. The width is COMPACT_LAYOUT_QUERY's (constants/layout.ts);
// nothing here writes it again.
//
// While the compact arrangement is up the page's root has no overscroll.
// Its header and bar take the browser's own touch handling, and on Android
// a downward swipe there, at the top of a page that does not scroll, can pull
// to refresh, reloading the table mid-session. The map and the sheets keep
// their own (touch-none, overscroll-contain). The desktop arrangement keeps
// the browser's, such as a trackpad's swipe back. The root's value is the
// page's; it is set on the body too, which costs nothing, since the body
// does not scroll.
// ============================================

import { createContext, useContext, useEffect, type ReactNode } from 'react';

const LayoutContext = createContext(false);

/** Gives the components under it the arrangement the campaign page draws. */
export function LayoutProvider({ compact, children }: { compact: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!compact) return undefined;
    const elements = [document.documentElement, document.body];
    const before = elements.map((el) => el.style.overscrollBehavior);
    for (const el of elements) el.style.overscrollBehavior = 'none';
    return () => elements.forEach((el, i) => { el.style.overscrollBehavior = before[i]; });
  }, [compact]);
  return <LayoutContext.Provider value={compact}>{children}</LayoutContext.Provider>;
}

/** Whether the campaign page draws its compact arrangement. False outside a LayoutProvider, as on every other page. */
export function useCompactLayout(): boolean {
  return useContext(LayoutContext);
}

// ============================================
// Layout Context: which arrangement the campaign page draws
//
// The campaign page has a desktop arrangement, three columns
// (components/campaign/DesktopTable.tsx), and room for a compact one; exactly
// one is mounted at a time, and the parts they arrange are drawn once for the
// page and moved between them (components/campaign/tableHosts.tsx). The page
// says which one with LayoutProvider; a component that changes with it asks
// useCompactLayout. The width is COMPACT_LAYOUT_QUERY's (constants/layout.ts);
// nothing here writes it again.
// ============================================

import { createContext, useContext, type ReactNode } from 'react';

const LayoutContext = createContext(false);

/** Gives the components under it the arrangement the campaign page draws. */
export function LayoutProvider({ compact, children }: { compact: boolean; children: ReactNode }) {
  return <LayoutContext.Provider value={compact}>{children}</LayoutContext.Provider>;
}

/** Whether the campaign page draws its compact arrangement. False outside a LayoutProvider, as on every other page. */
export function useCompactLayout(): boolean {
  return useContext(LayoutContext);
}

// ============================================
// Paint on this page, as everything outside the map reads it (zustand).
//
// The map's Paint (components/campaign/map/paint/usePaintSurface.ts) holds
// the picture and its undo; this holds only what the rest of the page asks
// of it: which map has a picture open to paint, whether paint on it is not
// saved yet, and a map just drawn that is to open with Paint on.
// ============================================

import { create } from 'zustand';

interface PaintState {
  /** The map this page has a picture open to paint on: Paint on, or off with paint not saved yet. */
  mapId: string | null;
  /** Paint on that map that is not saved. */
  unsaved: boolean;
  /** A map just made with Draw a map, which opens with Paint on once it is on screen. */
  openOnMapId: string | null;
  /** Written by the map's Paint alone. */
  setSession: (mapId: string | null, unsaved: boolean) => void;
  openWhenShown: (mapId: string | null) => void;
}

export const usePaintStore = create<PaintState>((set) => ({
  mapId: null,
  unsaved: false,
  openOnMapId: null,
  setSession: (mapId, unsaved) => set((s) => (s.mapId === mapId && s.unsaved === unsaved ? s : { mapId, unsaved })),
  openWhenShown: (openOnMapId) => set({ openOnMapId }),
}));

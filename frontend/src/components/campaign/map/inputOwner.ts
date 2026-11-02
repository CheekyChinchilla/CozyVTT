// ============================================
// Who owns the map's presses and keys.
//
// While Paint, Draw or a DM tool (walls, fog, lights) is up, it takes every
// left press on the map, so no token is picked up and no door opened under
// it; the right button pans, no long-press or right-click opens a menu, and
// a double tap pings nothing. Paint takes the keys as well. One value says
// which it is, and every place that keeps the other tools out reads it.
// ============================================

export type MapInputOwner = 'paint' | 'draw' | 'dm-tool' | null;

export interface MapInputState {
  /** Paint is on. */
  painting: boolean;
  /** Draw is open. */
  drawing: boolean;
  /** The DM has a wall, fog or light tool armed. */
  dmTool: boolean;
}

/** Paint first, then Draw, then a DM tool; null while none is up. */
export function mapInputOwner(state: MapInputState): MapInputOwner {
  if (state.painting) return 'paint';
  if (state.drawing) return 'draw';
  if (state.dmTool) return 'dm-tool';
  return null;
}

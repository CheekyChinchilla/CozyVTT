// ============================================
// Map layer types — shared by the pure draw modules
//
// Layer modules follow one rule: `(ctx, state, viewport) => void`,
// no React imports, no component closures. All inputs arrive as
// explicit readonly state so the functions are unit-testable with a
// mock 2D context and reusable across the layered canvases.
// ============================================

/** Camera + map metrics. Sizes are in grid CELLS; gridSize is px per cell. */
export interface Viewport {
  zoom: number;
  panOffset: { x: number; y: number };
  gridSize: number;
  mapWidth: number;
  mapHeight: number;
}

/** Map dimensions in pixels (world space). */
export function mapSizePx(viewport: Viewport): { w: number; h: number } {
  return {
    w: viewport.mapWidth * viewport.gridSize,
    h: viewport.mapHeight * viewport.gridSize,
  };
}

/** In-flight tween for a remotely-moved token. */
export interface TokenAnimation {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  duration: number;
}

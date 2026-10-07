import { MAP_LIMITS } from '@/constants/mapLimits';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A detected grid brought within the map limits, so applying it never fills
 * Create Map or Edit Map with a size the server refuses. Detection looks for
 * squares up to 600 pixels, and a large picture can hold more than 500 of
 * them a side.
 */
export function withinMapLimits(grid: { width: number; height: number; gridSize: number }): {
  width: number;
  height: number;
  gridSize: number;
} {
  return {
    width: clamp(Math.round(grid.width), MAP_LIMITS.minSide, MAP_LIMITS.maxSide),
    height: clamp(Math.round(grid.height), MAP_LIMITS.minSide, MAP_LIMITS.maxSide),
    gridSize: clamp(Math.round(grid.gridSize), MAP_LIMITS.minGridSize, MAP_LIMITS.maxGridSize),
  };
}

/** A feet-per-square value typed in the Custom box, kept within the limits. */
export function feetPerSquareWithinLimits(raw: string): number {
  const value = parseInt(raw, 10) || MAP_LIMITS.minFeetPerSquare;
  return clamp(value, MAP_LIMITS.minFeetPerSquare, MAP_LIMITS.maxFeetPerSquare);
}

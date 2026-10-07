/**
 * The limits on a map's size and on what it holds.
 *
 * The server enforces them and the map dialogs offer nothing outside them.
 * This file exists twice, as backend/src/validators/mapLimits.ts and
 * frontend/src/constants/mapLimits.ts, and a test keeps the two copies
 * identical, so the dialogs never offer a size the server refuses.
 */
export const MAP_LIMITS = {
  /** Width and height, in grid squares. */
  minSide: 1,
  maxSide: 500,
  /** Grid size: pixels per grid square. */
  minGridSize: 10,
  maxGridSize: 500,
  /** Feet per grid square. */
  minFeetPerSquare: 1,
  maxFeetPerSquare: 100,
} as const;

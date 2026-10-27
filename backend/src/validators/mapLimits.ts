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
  /** Tokens on one map. */
  maxTokens: 1000,
  /** Wall segments on one map, doors and windows included. */
  maxWallSegments: 5000,
  /** Light sources on one map. */
  maxLightSources: 200,
  /** Characters in a map's name. */
  maxNameLength: 200,
} as const;

/**
 * The most fog cells one map may have: one per grid square of the largest
 * map, 500 by 500. Fog and explored areas are stored as one entry per cell,
 * so this bounds what loading either can allocate.
 */
export const MAX_FOG_CELLS = MAP_LIMITS.maxSide * MAP_LIMITS.maxSide;

/** The most fog cells one report of what a player's vision covered may name. */
export const MAX_EXPLORATION_REPORT_CELLS = 20000;

/**
 * The furthest any wall end or light may be from the map's corner, in
 * pixels, either way: the far side of the largest map at the largest grid
 * size (500 squares of 500 pixels).
 */
export const MAX_COORDINATE = MAP_LIMITS.maxSide * MAP_LIMITS.maxGridSize;

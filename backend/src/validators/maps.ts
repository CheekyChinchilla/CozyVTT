/**
 * The size of a map, checked the same way on every path that stores one:
 * creating and editing a map, importing a Universal VTT file, and importing
 * a campaign archive.
 *
 * Each path used to keep its own rule. The map routes accepted any whole
 * number up to 2^31-1, and fog of war is one cell per grid square, so a
 * 50,000 by 50,000 map with fog on allocated an array of 2.5 billion entries
 * and took the server down for everyone. The limits are in ./mapLimits.ts,
 * which the map dialogs share.
 */

import { z } from 'zod';
import { MAP_LIMITS } from './mapLimits';

export { MAP_LIMITS };

const between = (what: string, min: number, max: number, unit: string) =>
  `${what} must be a whole number from ${min} to ${max}${unit}`;

/** A map's width or height, in grid squares. */
export const MapSideSchema = (what: 'Map width' | 'Map height') =>
  z
    .number(between(what, MAP_LIMITS.minSide, MAP_LIMITS.maxSide, ' squares'))
    .int(between(what, MAP_LIMITS.minSide, MAP_LIMITS.maxSide, ' squares'))
    .min(MAP_LIMITS.minSide, between(what, MAP_LIMITS.minSide, MAP_LIMITS.maxSide, ' squares'))
    .max(MAP_LIMITS.maxSide, between(what, MAP_LIMITS.minSide, MAP_LIMITS.maxSide, ' squares'));

const GRID_SIZE_MESSAGE = between('Grid size', MAP_LIMITS.minGridSize, MAP_LIMITS.maxGridSize, ' pixels');
/** Pixels per grid square. */
export const GridSizeSchema = z
  .number(GRID_SIZE_MESSAGE)
  .int(GRID_SIZE_MESSAGE)
  .min(MAP_LIMITS.minGridSize, GRID_SIZE_MESSAGE)
  .max(MAP_LIMITS.maxGridSize, GRID_SIZE_MESSAGE);

const FEET_MESSAGE = between('Feet per square', MAP_LIMITS.minFeetPerSquare, MAP_LIMITS.maxFeetPerSquare, '');
/** Feet per grid square. */
export const FeetPerSquareSchema = z
  .number(FEET_MESSAGE)
  .int(FEET_MESSAGE)
  .min(MAP_LIMITS.minFeetPerSquare, FEET_MESSAGE)
  .max(MAP_LIMITS.maxFeetPerSquare, FEET_MESSAGE);

/** Width, height and grid size together, as every path that stores a map has them. */
export const MapDimensionsSchema = z.object({
  width: MapSideSchema('Map width'),
  height: MapSideSchema('Map height'),
  gridSize: GridSizeSchema,
});

/**
 * The most fog cells one map may have: one per grid square of the largest
 * map, 500 by 500. Fog and explored areas are stored as one entry per cell,
 * so this bounds what loading either can allocate.
 */
export const MAX_FOG_CELLS = MAP_LIMITS.maxSide * MAP_LIMITS.maxSide;

/** The first problem with a value sent for one of a map's dimensions, or null. */
export function dimensionProblem(schema: z.ZodType, value: unknown): string | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid map size');
}

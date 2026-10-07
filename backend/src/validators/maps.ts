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

/**
 * What a map name over MAP_LIMITS.maxNameLength answers, on every path that
 * names a map. A campaign archive import shortens one instead.
 */
export const MAP_NAME_TOO_LONG_MESSAGE = `A map name can be at most ${MAP_LIMITS.maxNameLength} characters.`;

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

// ── Where walls and lights may be ───────────────────────────────────────────

/**
 * The furthest any wall end or light may be from the map's corner, in
 * pixels, either way: the far side of the largest map at the largest grid
 * size (500 squares of 500 pixels).
 *
 * Coordinates had no bound at all. Sight on a map with more than 200 walls
 * walks a grid over every wall's extent, so one wall reaching ten million
 * pixels froze the server for every table.
 */
export const MAX_COORDINATE = MAP_LIMITS.maxSide * MAP_LIMITS.maxGridSize;

const COORDINATE_MESSAGE = `Coordinates must be within ${MAX_COORDINATE.toLocaleString('en-US')} pixels of the map's corner`;
/** A wall end's or a light's x or y, in map pixels. */
export const CoordinateSchema = z
  .number()
  .finite()
  .min(-MAX_COORDINATE, COORDINATE_MESSAGE)
  .max(MAX_COORDINATE, COORDINATE_MESSAGE);

/**
 * How far outside a map its walls and lights may reach, in its own grid
 * squares: as far as the largest map is wide. Generous on purpose. A
 * Universal VTT export can carry walls well past its picture, and a DM can
 * draw past the edge; this only refuses geometry nowhere near the map.
 */
export const GEOMETRY_MARGIN_SQUARES = MAP_LIMITS.maxSide;

export const WALL_OUTSIDE_MAP_MESSAGE =
  `A wall reaches too far outside the map. Walls can extend up to ${GEOMETRY_MARGIN_SQUARES} squares past its edges.`;
export const LIGHT_OUTSIDE_MAP_MESSAGE =
  `A light is too far outside the map. Lights can be placed up to ${GEOMETRY_MARGIN_SQUARES} squares past its edges.`;

export interface MapExtent { width: number; height: number; gridSize: number }
interface WallLike { id: string; x1: number; y1: number; x2: number; y2: number }
interface LightLike { id: string; x: number; y: number }

/** The box, in map pixels, that a map's walls and lights must lie in. */
export function geometryRegion(map: MapExtent): { minX: number; minY: number; maxX: number; maxY: number } {
  const margin = GEOMETRY_MARGIN_SQUARES * map.gridSize;
  return {
    minX: Math.max(-MAX_COORDINATE, -margin),
    minY: Math.max(-MAX_COORDINATE, -margin),
    maxX: Math.min(MAX_COORDINATE, map.width * map.gridSize + margin),
    maxY: Math.min(MAX_COORDINATE, map.height * map.gridSize + margin),
  };
}

function pointInRegion(x: number, y: number, r: ReturnType<typeof geometryRegion>): boolean {
  return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
}

/** Whether both ends of a wall lie in the region its map's walls may reach. */
export function wallWithinMap(wall: WallLike, map: MapExtent): boolean {
  const region = geometryRegion(map);
  return pointInRegion(wall.x1, wall.y1, region) && pointInRegion(wall.x2, wall.y2, region);
}

/** Whether a light lies in the region its map's lights may reach. */
export function lightWithinMap(light: LightLike, map: MapExtent): boolean {
  return pointInRegion(light.x, light.y, geometryRegion(map));
}

const wallKey = (w: WallLike) => `${w.id}|${w.x1}|${w.y1}|${w.x2}|${w.y2}`;
const lightKey = (l: LightLike) => `${l.id}|${l.x}|${l.y}`;

/**
 * The first wall that lies outside the map's region, or undefined. A wall
 * that is already stored, unchanged, is let through: one put there before
 * this bound existed must not stop the DM saving the rest of the list.
 */
export function wallOutsideMap(walls: WallLike[], map: MapExtent, stored: unknown = []): WallLike | undefined {
  const region = geometryRegion(map);
  const kept = new Set((Array.isArray(stored) ? (stored as WallLike[]) : []).map(wallKey));
  return walls.find((w) =>
    !(pointInRegion(w.x1, w.y1, region) && pointInRegion(w.x2, w.y2, region)) && !kept.has(wallKey(w))
  );
}

/** The first light outside the map's region, or undefined; as wallOutsideMap. */
export function lightOutsideMap(lights: LightLike[], map: MapExtent, stored: unknown = []): LightLike | undefined {
  const region = geometryRegion(map);
  const kept = new Set((Array.isArray(stored) ? (stored as LightLike[]) : []).map(lightKey));
  return lights.find((l) => !pointInRegion(l.x, l.y, region) && !kept.has(lightKey(l)));
}

// ── Tokens on a map ─────────────────────────────────────────────────────────

/**
 * What adding tokens past MAP_LIMITS.maxTokens answers. A map's tokens are
 * one JSON column that every token write, drag and map fetch reads whole, so
 * the count bounds what each of those costs.
 */
export function tooManyTokensMessage(count: number): string {
  return `A map can hold ${MAP_LIMITS.maxTokens.toLocaleString('en-US')} tokens, and this would make ${count.toLocaleString('en-US')}. ` +
    'Remove some from the map first, or put them on another map.';
}

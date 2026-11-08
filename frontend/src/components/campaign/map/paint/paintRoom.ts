// ============================================
// Paint's Room: a floor and its four walls, on the grid.
//
// The floor is painted as a rectangle with an outline and a fill. Its walls
// are map walls, which the wall tool draws, so they wait with the painting
// and are added to the map when it is saved (usePaintSurface).
// ============================================

import type { WallSegment } from '@/types/walls';
import type { PaintPoint } from './paintStroke';

/** A wall's ends, in map pixels from the top left, as a map wall has them. */
export type WallLine = Pick<WallSegment, 'x1' | 'y1' | 'x2' | 'y2'>;

/** A room's corners on the grid, in map pixels: x0 and y0 the top left. */
export interface RoomBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const toCorner = (value: number, gridSize: number, limit: number) =>
  Math.min(Math.max(Math.round(value / gridSize) * gridSize, 0), limit);

/** The corner of the grid nearest `point` (map pixels), on a map `mapWidth` by `mapHeight` map pixels. */
export function gridCorner(point: PaintPoint, gridSize: number, mapWidth: number, mapHeight: number): [number, number] {
  return [toCorner(point[0], gridSize, mapWidth), toCorner(point[1], gridSize, mapHeight)];
}

/**
 * The room dragged from `from` to `to` (map pixels), each corner put on the
 * nearest corner of the grid and kept on the map, which is `mapWidth` by
 * `mapHeight` map pixels. Null when it has no width or no height.
 */
export function roomBox(from: PaintPoint, to: PaintPoint, gridSize: number, mapWidth: number, mapHeight: number): RoomBox | null {
  const [ax, ay] = gridCorner(from, gridSize, mapWidth, mapHeight);
  const [bx, by] = gridCorner(to, gridSize, mapWidth, mapHeight);
  const box = { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  return box.x1 > box.x0 && box.y1 > box.y0 ? box : null;
}

/** The room's four sides, corner to corner, going round from the top left. */
export function roomWalls(box: RoomBox): WallLine[] {
  const { x0, y0, x1, y1 } = box;
  return [
    { x1: x0, y1: y0, x2: x1, y2: y0 },
    { x1, y1: y0, x2: x1, y2: y1 },
    { x1, y1, x2: x0, y2: y1 },
    { x1: x0, y1, x2: x0, y2: y0 },
  ];
}

/** `walls` with every x times `sx` and every y times `sy`: map pixels to a picture's, or one picture's to another's. */
export function scaleWalls(walls: readonly WallLine[], sx: number, sy: number): WallLine[] {
  return walls.map((w) => ({ x1: w.x1 * sx, y1: w.y1 * sy, x2: w.x2 * sx, y2: w.y2 * sy }));
}

/** `walls` in a picture's pixels as map walls, in whole map pixels, on a map the picture is `sx` by `sy` times as large as. */
export function wallsOnMap(walls: readonly WallLine[], sx: number, sy: number): WallLine[] {
  return walls.map((w) => ({ x1: Math.round(w.x1 / sx), y1: Math.round(w.y1 / sy), x2: Math.round(w.x2 / sx), y2: Math.round(w.y2 / sy) }));
}

/** The same wall whichever way it runs. */
const wallKey = (w: WallLine) =>
  w.x1 < w.x2 || (w.x1 === w.x2 && w.y1 <= w.y2) ? `${w.x1},${w.y1},${w.x2},${w.y2}` : `${w.x2},${w.y2},${w.x1},${w.y1}`;

/**
 * Of `lines`, the walls to add to a map that has `existing`: each once,
 * whichever way it runs, so the side two rooms share is one wall, and none
 * the map already has.
 */
export function wallsToAdd(lines: readonly WallLine[], existing: readonly WallLine[]): WallLine[] {
  const seen = new Set(existing.map(wallKey));
  const added: WallLine[] = [];
  for (const line of lines) {
    const key = wallKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(line);
  }
  return added;
}

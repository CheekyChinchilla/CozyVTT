// ============================================
// Map coordinate conversions
//
// The map deliberately uses TWO Y conventions. This is not a bug, and the
// difference is why this module exists:
//
//   • Token grid coords are BOTTOM-LEFT origin — grid Y 0 is the bottom row.
//     That is the tabletop convention (see useMapControls.screenToGrid), and
//     `token.position.y` is persisted that way in every map's token JSON.
//
//   • Canvas pixels and fog rows are TOP-LEFT origin, because that is what a
//     2D context uses and because fog is a raster indexed row-major from the
//     top (`row * fogCols + col`).
//
// Converting between them used to be bare `mapHeight - 1 - y` arithmetic
// copy-pasted across the draw layers, the vision raycaster and the map
// controls hook. Getting the off-by-one or the direction wrong puts a token
// or a fog cell in the mirror-image row, which is easy to write and hard to
// spot. Everything now goes through the named, tested helpers below.
//
// Pure: no React, no canvas.
// ============================================

import type { FogState } from '@/types/walls';

/**
 * Convert a Y between bottom-left and top-left row indexing.
 *
 * The operation is its own inverse — applying it twice returns the input —
 * so one function serves both directions.
 */
export function flipGridY(gridY: number, mapHeight: number): number {
  return mapHeight - 1 - gridY;
}

/**
 * Top pixel edge of a token's box.
 *
 * A token occupies `heightInCells` rows *upward* from its grid position, so
 * its top edge is that many rows above the position's own row.
 */
export function gridYToTopPx(
  gridY: number,
  heightInCells: number,
  mapHeight: number,
  gridSize: number
): number {
  return (mapHeight - gridY - heightInCells) * gridSize;
}

/** Centre pixel Y of a token's box — for glows, vision sources and labels. */
export function gridYToCentrePx(
  gridY: number,
  heightInCells: number,
  mapHeight: number,
  gridSize: number
): number {
  return (mapHeight - gridY - heightInCells / 2) * gridSize;
}

/** Fog row containing the centre of a token's box. */
export function gridYToFogRow(gridY: number, heightInCells: number, mapHeight: number): number {
  return flipGridY(Math.floor(gridY + (heightInCells - 1) / 2), mapHeight);
}

/** Fog column containing the centre of a token's box. X needs no flip. */
export function gridXToFogCol(gridX: number, widthInCells: number): number {
  return Math.floor(gridX + (widthInCells - 1) / 2);
}

/** Row-major index of a fog cell. */
export function fogCellIndex(col: number, row: number, fog: Pick<FogState, 'fogCols'>): number {
  return row * fog.fogCols + col;
}

/**
 * Which fog cell a map-pixel point falls in. Map pixels are already top-left
 * origin, so this needs no flip — that is exactly why the fog selection tool
 * works in pixels rather than grid coords.
 *
 * Returns null when the point is outside the map, so callers clamp or bail
 * rather than computing an index that silently wraps to the wrong row.
 */
export function mapPxToFogCell(
  x: number,
  y: number,
  fog: FogState
): { col: number; row: number; index: number } | null {
  const col = Math.floor(x / fog.cellPx);
  const row = Math.floor(y / fog.cellPx);
  if (col < 0 || col >= fog.fogCols || row < 0 || row >= fog.fogRows) return null;
  return { col, row, index: fogCellIndex(col, row, fog) };
}

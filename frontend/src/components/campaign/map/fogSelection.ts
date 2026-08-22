// ============================================
// Fog rectangle selection — drag corners to fog cell indices
//
// The DM drags a box; these functions turn the two corners into the exact set
// of fog cells it covers. Everything is in MAP PIXELS, which are already
// top-left origin like the fog raster — so the bottom-left token convention
// never enters the picture and there is no flip to get wrong. See coords.ts.
//
// Pure: no React, no canvas.
// ============================================

import type { FogState } from '@/types/walls';
import { fogCellIndex } from './coords';

export interface FogRect {
  colMin: number;
  colMax: number;
  rowMin: number;
  rowMax: number;
}

/** Clamp to [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Snap two drag corners (map pixels) to the whole fog cells they cover.
 *
 * Corners are normalised, so dragging right-to-left or bottom-to-top gives the
 * same rectangle as the forward drag. The bounds snap *outward*: any cell the
 * drag touches at all is included, which is what makes a zero-movement click
 * resolve to a single square rather than nothing.
 *
 * Returns null only when the rectangle lies entirely off the map — a drag that
 * starts outside and ends inside is clamped rather than rejected.
 */
export function fogRectFromDrag(
  fog: FogState,
  ax: number,
  ay: number,
  bx: number,
  by: number
): FogRect | null {
  const { fogCols, fogRows, cellPx } = fog;

  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);

  // Entirely off one side — nothing to reveal.
  if (maxX < 0 || maxY < 0 || minX >= fogCols * cellPx || minY >= fogRows * cellPx) {
    return null;
  }

  return {
    colMin: clamp(Math.floor(minX / cellPx), 0, fogCols - 1),
    colMax: clamp(Math.floor(maxX / cellPx), 0, fogCols - 1),
    rowMin: clamp(Math.floor(minY / cellPx), 0, fogRows - 1),
    rowMax: clamp(Math.floor(maxY / cellPx), 0, fogRows - 1),
  };
}

/** Every fog cell index inside a rectangle, row-major. */
export function fogCellsInRect(fog: FogState, rect: FogRect): number[] {
  const cells: number[] = [];
  for (let row = rect.rowMin; row <= rect.rowMax; row++) {
    for (let col = rect.colMin; col <= rect.colMax; col++) {
      cells.push(fogCellIndex(col, row, fog));
    }
  }
  return cells;
}

/** Size in whole squares — for the "4 × 7" readout while dragging. */
export function fogRectSize(rect: FogRect): { cols: number; rows: number } {
  return {
    cols: rect.colMax - rect.colMin + 1,
    rows: rect.rowMax - rect.rowMin + 1,
  };
}

/** Pixel bounds of a snapped rectangle, for drawing the preview. */
export function fogRectToPx(
  fog: FogState,
  rect: FogRect
): { x: number; y: number; w: number; h: number } {
  const { cellPx } = fog;
  return {
    x: rect.colMin * cellPx,
    y: rect.rowMin * cellPx,
    w: (rect.colMax - rect.colMin + 1) * cellPx,
    h: (rect.rowMax - rect.rowMin + 1) * cellPx,
  };
}

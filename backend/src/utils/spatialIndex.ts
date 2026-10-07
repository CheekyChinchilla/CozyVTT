/**
 * Spatial Index for Wall Segments
 *
 * A uniform grid over the map. Accelerates ray-segment intersection testing
 * when a map has many wall segments (>200). For smaller maps, the linear
 * scan in raycasting.ts is fast enough.
 *
 * The grid covers the map and nothing beyond it, with at most
 * MAX_CELLS_PER_SIDE cells along either side (the cells grow on a larger
 * map). Each wall is filed under the cells it passes through, column by
 * column, not every cell of its bounding box, and anything past the map's
 * edges is filed under the edge cells nearest it. What the grid costs
 * therefore depends on the map, never on how far a wall's coordinates
 * reach: one wall reaching ten million pixels used to mean a billion cells,
 * on every sight calculation. A wall off the map stays a candidate in the
 * edge cells, so the grid can return a wall it need not, never miss one.
 */

import type { WallSegment } from '../types/walls';

/** The most cells the grid has along either side of the map. */
const MAX_CELLS_PER_SIDE = 128;

export class WallGrid {
  private cells: Map<number, WallSegment[]> = new Map();
  private cellSize: number;
  private cols: number;
  private rows: number;

  constructor(walls: WallSegment[], cellSize: number, mapWidth: number, mapHeight: number) {
    const width = Number.isFinite(mapWidth) && mapWidth > 0 ? mapWidth : cellSize;
    const height = Number.isFinite(mapHeight) && mapHeight > 0 ? mapHeight : cellSize;
    this.cellSize = Math.max(cellSize, Math.max(width, height) / MAX_CELLS_PER_SIDE);
    this.cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    for (const wall of walls) {
      this.insert(wall);
    }
  }

  /** The column holding x, clamped to the grid. */
  private col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }

  /** The row holding y, clamped to the grid. */
  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }

  private insert(wall: WallSegment): void {
    // Left to right, so each column is visited once.
    const leftFirst = wall.x1 <= wall.x2;
    const ax = leftFirst ? wall.x1 : wall.x2;
    const ay = leftFirst ? wall.y1 : wall.y2;
    const bx = leftFirst ? wall.x2 : wall.x1;
    const by = leftFirst ? wall.y2 : wall.y1;
    const firstCol = this.col(ax);
    const lastCol = this.col(bx);
    const slope = bx > ax ? (by - ay) / (bx - ax) : 0;
    // A hair either way, so a wall that runs along a cell boundary is filed
    // on both sides of it whatever the rounding.
    const pad = this.cellSize * 1e-6;

    for (let c = firstCol; c <= lastCol; c++) {
      // The stretch of the wall inside this column (the end columns take
      // whatever lies past the map's edge as well), and the rows it covers.
      const left = c === firstCol ? ax : c * this.cellSize;
      const right = c === lastCol ? bx : (c + 1) * this.cellSize;
      const yLeft = bx > ax ? ay + (left - ax) * slope : ay;
      const yRight = bx > ax ? ay + (right - ax) * slope : by;
      const firstRow = this.row(Math.min(yLeft, yRight) - pad);
      const lastRow = this.row(Math.max(yLeft, yRight) + pad);
      for (let r = firstRow; r <= lastRow; r++) {
        const key = c * this.rows + r;
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(wall);
        else this.cells.set(key, [wall]);
      }
    }
  }

  /**
   * Query segments within a bounding box (x±radius, y±radius).
   * Returns a de-duplicated list of candidate segments.
   */
  query(x: number, y: number, radius: number): WallSegment[] {
    const minCX = this.col(x - radius);
    const maxCX = this.col(x + radius);
    const minCY = this.row(y - radius);
    const maxCY = this.row(y + radius);

    const seen = new Set<string>();
    const result: WallSegment[] = [];

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const bucket = this.cells.get(cx * this.rows + cy);
        if (bucket) {
          for (const seg of bucket) {
            if (!seen.has(seg.id)) {
              seen.add(seg.id);
              result.push(seg);
            }
          }
        }
      }
    }
    return result;
  }
}

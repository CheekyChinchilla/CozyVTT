/**
 * Spatial Index for Wall Segments (server-side copy)
 *
 * Mirrors frontend/src/utils/spatialIndex.ts for use in server-side raycasting.
 */

import type { WallSegment } from '../types/walls';

export class WallGrid {
  private cells: Map<string, WallSegment[]> = new Map();
  private cellSize: number;

  constructor(walls: WallSegment[], cellSize: number) {
    this.cellSize = cellSize;
    for (const wall of walls) {
      this.insert(wall);
    }
  }

  private cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private insert(wall: WallSegment): void {
    const minX = Math.floor(Math.min(wall.x1, wall.x2) / this.cellSize);
    const maxX = Math.floor(Math.max(wall.x1, wall.x2) / this.cellSize);
    const minY = Math.floor(Math.min(wall.y1, wall.y2) / this.cellSize);
    const maxY = Math.floor(Math.max(wall.y1, wall.y2) / this.cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this.cellKey(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket) {
          if (!bucket.includes(wall)) bucket.push(wall);
        } else {
          this.cells.set(key, [wall]);
        }
      }
    }
  }

  query(x: number, y: number, radius: number): WallSegment[] {
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);

    const seen = new Set<string>();
    const result: WallSegment[] = [];

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const bucket = this.cells.get(this.cellKey(cx, cy));
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

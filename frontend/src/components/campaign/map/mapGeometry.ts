// ============================================
// Map geometry
//
// The pure maths behind hit-testing and moving things on a map, kept out of
// MapCanvas so it can be tested on its own and reused. Everything here works
// in **map pixels with a top-left origin**, which is how wall segments and
// light sources are stored.
//
// Tokens are not stored that way: they carry grid coordinates with a flipped
// Y (see flipGridY in coords.ts). Nothing here applies to them, and a future
// caller must not assume otherwise.
// ============================================

import type { WallSegment } from '@/types/walls';

export interface Point {
  x: number;
  y: number;
}

/** How far (px, ft) one grid square is, turned into pixels. */
export function gridSquaresToPx(squares: number, gridSize: number): number {
  return squares * gridSize;
}

/** Shortest distance from a point to a segment, not to its infinite line. */
export function distToSegment(px: number, py: number, seg: WallSegment): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a point; fall through to a plain distance.
  if (lengthSquared === 0) return Math.hypot(px - seg.x1, py - seg.y1);

  // Where the perpendicular lands along the segment, clamped to its ends so a
  // point beyond either end measures from that end.
  const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lengthSquared));
  return Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy));
}

/**
 * Wall segments moved by an offset in pixels.
 *
 * Returns new objects, leaving the originals alone, so an undo stack holding
 * the previous array still describes where things were.
 */
export function translateWallSegments(
  segments: readonly WallSegment[],
  dxPx: number,
  dyPx: number
): WallSegment[] {
  return segments.map((seg) => ({
    ...seg,
    x1: seg.x1 + dxPx,
    y1: seg.y1 + dyPx,
    x2: seg.x2 + dxPx,
    y2: seg.y2 + dyPx,
  }));
}

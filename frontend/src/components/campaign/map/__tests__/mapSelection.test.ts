/**
 * Picking walls out of a map, and moving what was picked.
 *
 * These are the parts of selection that are pure maths, kept out of the canvas
 * component so they can be reasoned about and so the drawing tools can use the
 * same ones later. Everything here works in **map pixels with a top-left
 * origin**, which is how wall segments are stored.
 *
 * Note that tokens are not: they carry grid coordinates with a flipped Y (see
 * `flipGridY` in coords.ts). Nothing here applies to them.
 */

import { describe, it, expect } from 'vitest';
import type { WallSegment } from '@/types/walls';
import {
  rectFromDrag,
  pointInRect,
  segmentIntersectsRect,
  segmentsInRect,
} from '../mapSelection';
import { distToSegment, translateWallSegments, gridSquaresToPx } from '../mapGeometry';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({
  id,
  x1,
  y1,
  x2,
  y2,
  type: 'wall',
});

describe('rectFromDrag', () => {
  it('normalises a drag made in any direction', () => {
    const forward = rectFromDrag(10, 20, 110, 220);
    expect(forward).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 220 });
    // Dragging up and to the left gives the same rectangle.
    expect(rectFromDrag(110, 220, 10, 20)).toEqual(forward);
  });

  it('gives a zero-size rectangle for a click that never moved', () => {
    expect(rectFromDrag(50, 50, 50, 50)).toEqual({ minX: 50, minY: 50, maxX: 50, maxY: 50 });
  });
});

describe('pointInRect', () => {
  const rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it.each([
    ['inside', 50, 50, true],
    ['on the edge', 0, 100, true],
    ['just outside', 101, 50, false],
    ['negative', -1, 50, false],
  ])('%s', (_label, x, y, expected) => {
    expect(pointInRect({ x, y }, rect)).toBe(expected);
  });
});

describe('segmentIntersectsRect', () => {
  const rect = { minX: 100, minY: 100, maxX: 200, maxY: 200 };

  it('takes a wall that lies wholly inside', () => {
    expect(segmentIntersectsRect(wall('a', 110, 110, 190, 190), rect)).toBe(true);
  });

  it('takes a wall with one end inside', () => {
    expect(segmentIntersectsRect(wall('a', 150, 150, 400, 400), rect)).toBe(true);
  });

  it('takes a wall that crosses without either end inside', () => {
    // Straight through the middle, both ends well outside.
    expect(segmentIntersectsRect(wall('a', 0, 150, 400, 150), rect)).toBe(true);
  });

  it('takes a wall that clips a corner', () => {
    expect(segmentIntersectsRect(wall('a', 150, 90, 210, 150), rect)).toBe(true);
  });

  it('leaves a wall that misses entirely', () => {
    expect(segmentIntersectsRect(wall('a', 0, 0, 50, 50), rect)).toBe(false);
  });

  it('leaves a wall that passes near but never touches', () => {
    expect(segmentIntersectsRect(wall('a', 0, 250, 400, 250), rect)).toBe(false);
  });
});

describe('segmentsInRect', () => {
  const walls = [
    wall('inside', 110, 110, 190, 190),
    wall('crossing', 0, 150, 400, 150),
    wall('outside', 0, 0, 10, 10),
  ];

  it('returns the ids of everything the box touches', () => {
    const hit = segmentsInRect(walls, { minX: 100, minY: 100, maxX: 200, maxY: 200 });
    expect([...hit].sort()).toEqual(['crossing', 'inside']);
  });

  it('returns nothing for a box over empty space', () => {
    expect(segmentsInRect(walls, { minX: 900, minY: 900, maxX: 950, maxY: 950 }).size).toBe(0);
  });
});

describe('distToSegment', () => {
  const seg = wall('a', 0, 0, 100, 0);

  it('is zero on the line', () => {
    expect(distToSegment(50, 0, seg)).toBe(0);
  });

  it('measures straight out from the middle', () => {
    expect(distToSegment(50, 10, seg)).toBe(10);
  });

  it('measures from the nearer end when past it, not from the infinite line', () => {
    // 30 beyond the right end, so the distance is 30, not 0.
    expect(distToSegment(130, 0, seg)).toBe(30);
  });

  it('handles a zero-length segment without dividing by zero', () => {
    expect(distToSegment(3, 4, wall('dot', 0, 0, 0, 0))).toBe(5);
  });
});

describe('moving what was selected', () => {
  it('adds the offset to both ends', () => {
    const moved = translateWallSegments([wall('a', 10, 20, 30, 40)], 5, -5);
    expect(moved[0]).toMatchObject({ x1: 15, y1: 15, x2: 35, y2: 35 });
  });

  it('keeps ids and types, so history and rendering still recognise them', () => {
    const door: WallSegment = { ...wall('d', 0, 0, 10, 0), type: 'door-closed' };
    const [moved] = translateWallSegments([door], 3, 3);
    expect(moved.id).toBe('d');
    expect(moved.type).toBe('door-closed');
  });

  it('does not touch the originals', () => {
    const original = wall('a', 10, 20, 30, 40);
    translateWallSegments([original], 100, 100);
    expect(original).toMatchObject({ x1: 10, y1: 20 });
  });


  it('converts whole grid squares to pixels', () => {
    expect(gridSquaresToPx(2, 70)).toBe(140);
    expect(gridSquaresToPx(-1, 70)).toBe(-70);
  });
});

/**
 * Unit tests for pure map-canvas geometry helpers
 * (extracted from MapCanvas.tsx).
 */

import { describe, it, expect } from 'vitest';
import {
  calcGridDistance,
  douglasPeucker,
  snapPointsToEdges,
  type Point,
  type EdgeSnapRegion,
} from '../geometry';

describe('calcGridDistance', () => {
  it('flat rule: diagonals cost the same as straight moves (Chebyshev)', () => {
    expect(calcGridDistance(3, 0, 5, 'flat')).toBe(15);
    expect(calcGridDistance(3, 3, 5, 'flat')).toBe(15);
    expect(calcGridDistance(3, 5, 5, 'flat')).toBe(25);
  });

  it('alternating rule: every second diagonal costs double (PF2e 5/10)', () => {
    // 1 diagonal = 5ft, 2 diagonals = 15ft, 3 = 20ft, 4 = 30ft
    expect(calcGridDistance(1, 1, 5, 'alternating')).toBe(5);
    expect(calcGridDistance(2, 2, 5, 'alternating')).toBe(15);
    expect(calcGridDistance(3, 3, 5, 'alternating')).toBe(20);
    expect(calcGridDistance(4, 4, 5, 'alternating')).toBe(30);
  });

  it('alternating rule: mixes diagonal and straight components', () => {
    // 2 diagonals (15) + 2 straight (10) = 25
    expect(calcGridDistance(4, 2, 5, 'alternating')).toBe(25);
  });

  it('respects feetPerSquare', () => {
    expect(calcGridDistance(2, 0, 10, 'flat')).toBe(20);
  });
});

describe('douglasPeucker', () => {
  it('returns inputs of length <= 2 unchanged', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(douglasPeucker(pts, 1)).toEqual(pts);
    expect(douglasPeucker([{ x: 3, y: 4 }], 1)).toEqual([{ x: 3, y: 4 }]);
  });

  it('collapses collinear points to the two endpoints', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 50, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(douglasPeucker(pts, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('keeps a corner that deviates beyond epsilon', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 40 }, // strong corner
      { x: 100, y: 0 },
    ];
    expect(douglasPeucker(pts, 5)).toEqual(pts);
  });

  it('drops small jitter within epsilon but keeps the real corner', () => {
    // L-shape: horizontal run with 1px jitter, then a sharp 90° turn.
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 25, y: 1 },  // jitter (within epsilon of the horizontal run)
      { x: 50, y: 0 },  // real corner (far from the diagonal chord)
      { x: 50, y: 50 },
    ];
    expect(douglasPeucker(pts, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]);
  });

  it('handles a closed loop (identical first/last point) without dividing by zero', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 0 },
    ];
    const result = douglasPeucker(pts, 1);
    // Farthest-point split on the zero-length chord must retain the loop's extremes
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toContainEqual({ x: 50, y: 0 });
    expect(result).toContainEqual({ x: 50, y: 50 });
  });
});

describe('snapPointsToEdges', () => {
  const region: EdgeSnapRegion = { minX: 1, minY: 1, maxX: 98, maxY: 98 };

  it('returns inputs of length < 2 unchanged', () => {
    const gray = () => 128;
    expect(snapPointsToEdges([{ x: 5, y: 5 }], gray, region, 4)).toEqual([{ x: 5, y: 5 }]);
  });

  it('does not move points on a uniform image (no gradient above threshold)', () => {
    const gray = () => 128; // perfectly flat luminance
    const pts: Point[] = [{ x: 20, y: 20 }, { x: 40, y: 40 }];
    expect(snapPointsToEdges(pts, gray, region, 5)).toEqual(pts);
  });

  it('snaps points onto a strong vertical luminance edge', () => {
    // Dark (0) for x < 30, bright (255) for x >= 30 → strongest horizontal
    // gradient at the boundary column.
    const gray = (x: number) => (x < 30 ? 0 : 255);
    const pts: Point[] = [
      { x: 27, y: 20 }, // 3px left of the edge
      { x: 33, y: 60 }, // 3px right of the edge
    ];
    const result = snapPointsToEdges(pts, gray, region, 5);
    // Both points should land on/adjacent to the boundary (x ≈ 29-30)
    for (const pt of result) {
      expect(Math.abs(pt.x - 30)).toBeLessThanOrEqual(1);
    }
    // y should stay near the original rows (edge is vertical)
    expect(Math.abs(result[0]!.y - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(result[1]!.y - 60)).toBeLessThanOrEqual(1);
  });

  it('leaves points alone when the edge is outside the search radius', () => {
    const gray = (x: number) => (x < 30 ? 0 : 255);
    const pts: Point[] = [{ x: 50, y: 50 }, { x: 60, y: 60 }]; // 20+px from the edge
    expect(snapPointsToEdges(pts, gray, region, 4)).toEqual(pts);
  });
});

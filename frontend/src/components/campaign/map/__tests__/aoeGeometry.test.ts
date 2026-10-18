import { describe, it, expect } from 'vitest';
import {
  coneOutline,
  cubeRect,
  snapSpanCentre,
  snapToGridLine,
  snapToSquareCentre,
  squareExitPoint,
  squaresFor,
} from '../aoeGeometry';

const GRID = 50; // map pixels per square, a common map's grid

/** True when a coordinate sits exactly on a grid line. */
const onGridLine = (v: number) => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-9;

describe('squaresFor', () => {
  it('converts feet to squares', () => {
    expect(squaresFor(10, 5)).toBe(2);
    expect(squaresFor(20, 5)).toBe(4);
    expect(squaresFor(15, 5)).toBe(3);
  });

  it('handles a non-standard grid scale', () => {
    expect(squaresFor(10, 10)).toBe(1);
    expect(squaresFor(10, 2.5)).toBe(4);
  });

  it('is 0 rather than Infinity for a nonsensical scale', () => {
    expect(squaresFor(10, 0)).toBe(0);
  });
});

describe('snapping primitives', () => {
  it('snaps to the nearest grid line', () => {
    expect(snapToGridLine(24, GRID)).toBe(0);
    expect(snapToGridLine(26, GRID)).toBe(50);
    expect(snapToGridLine(74, GRID)).toBe(50);
  });

  it('snaps to the containing square centre', () => {
    expect(snapToSquareCentre(10, GRID)).toBe(25);
    expect(snapToSquareCentre(49, GRID)).toBe(25);
    expect(snapToSquareCentre(51, GRID)).toBe(75);
  });

  // The parity rule the whole fix rests on.
  it('centres an even span on a grid line', () => {
    expect(snapSpanCentre(60, GRID, 2)).toBe(50);
    expect(snapSpanCentre(60, GRID, 4)).toBe(50);
  });

  it('centres an odd span on a square centre', () => {
    expect(snapSpanCentre(60, GRID, 1)).toBe(75);
    expect(snapSpanCentre(60, GRID, 3)).toBe(75);
  });

  it('falls back to the square centre for a fractional span', () => {
    expect(snapSpanCentre(60, GRID, 1.5)).toBe(75);
  });
});

describe('cubeRect', () => {
  // The reported bug: a 10 ft cube on a 5 ft grid is exactly two squares, but
  // it was drawn from a square centre and so straddled four.
  it('covers exactly two squares for a 10 ft cube on a 5 ft grid', () => {
    const rect = cubeRect({ x: 137, y: 88 }, GRID, squaresFor(10, 5));

    expect(rect.size).toBe(2 * GRID);
    expect(onGridLine(rect.x)).toBe(true);
    expect(onGridLine(rect.y)).toBe(true);
  });

  it('puts every edge on a grid line, whatever the cursor position', () => {
    for (const side of [1, 2, 3, 4, 6]) {
      for (const cursor of [0, 7, 24, 25, 26, 49, 51, 99, 137, 260]) {
        const rect = cubeRect({ x: cursor, y: cursor }, GRID, side);

        expect(onGridLine(rect.x)).toBe(true);
        expect(onGridLine(rect.y)).toBe(true);
        expect(onGridLine(rect.x + rect.size)).toBe(true);
        expect(onGridLine(rect.y + rect.size)).toBe(true);
      }
    }
  });

  it('stays centred on the square under the cursor for an odd span', () => {
    // A 15 ft cube is three squares: it should cover the hovered square plus
    // one either side, not shift off to a corner.
    const rect = cubeRect({ x: 60, y: 60 }, GRID, 3);

    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.size).toBe(150);
  });

  it('picks the nearer intersection for an even span', () => {
    expect(cubeRect({ x: 60, y: 60 }, GRID, 2).x).toBe(0);   // nearest line is 50
    expect(cubeRect({ x: 90, y: 90 }, GRID, 2).x).toBe(50);  // nearest line is 100
  });
});

describe('squareExitPoint', () => {
  // The centre of the square spanning (100,50)-(150,100).
  const PIVOT = { x: 125, y: 75 };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  // The reported bug. The apex was snapped to the *nearest* grid line, which is
  // the same line whichever way you point along an axis — so a cone aimed left
  // emerged from the right edge and cut back through the caster's own token.
  describe('leaves the square on the side it is aimed at', () => {
    it('is opposite for left and right', () => {
      const right = squareExitPoint(PIVOT, GRID, 0);
      const left = squareExitPoint(PIVOT, GRID, Math.PI);

      expect(right).toEqual({ x: 150, y: 75 });
      expect(left.x).toBeCloseTo(100);
      expect(left.y).toBeCloseTo(75);
      expect(left.x).not.toBeCloseTo(right.x);
    });

    it('is opposite for up and down', () => {
      const down = squareExitPoint(PIVOT, GRID, Math.PI / 2);
      const up = squareExitPoint(PIVOT, GRID, -Math.PI / 2);

      expect(down.x).toBeCloseTo(125);
      expect(down.y).toBeCloseTo(100);
      expect(up.x).toBeCloseTo(125);
      expect(up.y).toBeCloseTo(50);
    });
  });

  it('lands on the midpoint of an edge when aimed along an axis', () => {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const p = squareExitPoint(PIVOT, GRID, angle);
      const onLine = [p.x, p.y].filter(onGridLine).length;

      // Exactly one axis on a grid line and one at a square centre is what
      // makes the point an edge midpoint rather than a corner.
      expect(onLine).toBe(1);
    }
  });

  it.each([
    ['down-right', Math.PI / 4, 150, 100],
    ['down-left', (3 * Math.PI) / 4, 100, 100],
    ['up-left', (-3 * Math.PI) / 4, 100, 50],
    ['up-right', -Math.PI / 4, 150, 50],
  ])('lands exactly on the corner when aimed %s', (_name, angle, x, y) => {
    const p = squareExitPoint(PIVOT, GRID, angle);
    expect(p.x).toBeCloseTo(x);
    expect(p.y).toBeCloseTo(y);
  });

  // The property the whole fix rests on. The old apex classified the angle into
  // one of eight sectors, so sweeping a cone made its point teleport between a
  // handful of spots instead of sliding around the square. Anyone reintroducing
  // sector logic fails here.
  it('moves continuously through a full sweep', () => {
    const STEPS = 720;
    let prev = squareExitPoint(PIVOT, GRID, -Math.PI);
    const first = prev;

    for (let i = 1; i <= STEPS; i++) {
      const p = squareExitPoint(PIVOT, GRID, -Math.PI + (i / STEPS) * Math.PI * 2);
      const moved = Math.hypot(p.x - prev.x, p.y - prev.y);

      // Half a degree of sweep can move the point at most a fraction of a
      // square; the old code jumped a full half-square at each sector boundary.
      expect(moved).toBeLessThan(GRID / 8);
      prev = p;
    }

    // ...and the sweep closes on itself rather than drifting.
    expect(prev.x).toBeCloseTo(first.x);
    expect(prev.y).toBeCloseTo(first.y);
  });

  it('always sits on the boundary of the pivot square', () => {
    for (let i = 0; i < 360; i++) {
      const p = squareExitPoint(PIVOT, GRID, (i / 360) * Math.PI * 2);

      expect(p.x).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(150 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(50 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(100 + 1e-9);

      // On the boundary, not merely inside it: one coordinate is on an edge.
      const onEdge =
        near(p.x, 100) || near(p.x, 150) || near(p.y, 50) || near(p.y, 100);
      expect(onEdge).toBe(true);
    }
  });

  it('always points the way the template is aimed', () => {
    // The invariant the bug violated: aiming left must not put the origin to
    // the right of the pivot.
    for (let i = 0; i < 360; i++) {
      const angle = (i / 360) * Math.PI * 2;
      const p = squareExitPoint(PIVOT, GRID, angle);
      const dot =
        (p.x - PIVOT.x) * Math.cos(angle) + (p.y - PIVOT.y) * Math.sin(angle);

      expect(dot).toBeGreaterThan(0);
    }
  });

  describe('degenerate input', () => {
    it('collapses to the pivot for a zero grid rather than drifting', () => {
      expect(squareExitPoint(PIVOT, 0, Math.PI / 3)).toEqual(PIVOT);
    });

    it('falls back to the pivot for a non-finite angle', () => {
      expect(squareExitPoint(PIVOT, GRID, NaN)).toEqual(PIVOT);
      expect(squareExitPoint(PIVOT, GRID, Infinity)).toEqual(PIVOT);
    });
  });
});

// The cone was drawn with its far corners on an arc a cone's length out, so it
// fell about a tenth short and narrow of a D&D 5e cone, and Pathfinder 2e's
// cone, a different shape, was drawn the same (F345).
describe('coneOutline', () => {
  const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  };

  it('draws D&D 5e\'s cone as wide at its far end as it is long', () => {
    const outline = coneOutline({ x: 10, y: 20 }, 0, 100, 'width-equals-distance');
    if (outline.kind !== 'triangle') throw new Error('expected a triangle');
    close(outline.points[0], { x: 10, y: 20 });
    close(outline.points[1], { x: 110, y: -30 });
    close(outline.points[2], { x: 110, y: 70 });
  });

  it('keeps that width at every point along it, aimed any way', () => {
    const angle = Math.PI / 3;
    const outline = coneOutline({ x: 0, y: 0 }, angle, 60, 'width-equals-distance');
    if (outline.kind !== 'triangle') throw new Error('expected a triangle');
    const [, a, b] = outline.points;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(60, 6);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    close(mid, { x: Math.cos(angle) * 60, y: Math.sin(angle) * 60 });
  });

  it('draws Pathfinder 2e\'s cone as a quarter circle', () => {
    const outline = coneOutline({ x: 5, y: 5 }, Math.PI / 2, 90, 'quarter-circle');
    expect(outline).toEqual({ kind: 'sector', centre: { x: 5, y: 5 }, radius: 90, from: Math.PI / 4, to: (3 * Math.PI) / 4 });
  });
});

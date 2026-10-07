/**
 * What sight costs on a map with many walls does not depend on how far a
 * wall's coordinates reach.
 *
 * Past 200 walls, sight files every wall under each cell of a grid its
 * bounding box covers, and the grid was unbounded: one wall from (0, 0) to
 * (10,000,000, 10,000,000) meant about 1.5 billion cells, on every sight
 * calculation, for every player, and the server stopped answering anyone.
 * The grid now covers the map and no more.
 */

import { computeVisibility, isPointVisible } from '../raycasting';
import type { WallSegment } from '../../types/walls';

/** 200 short walls scattered over a 2,500-pixel map, plus `extra`. */
function wallsWith(extra: WallSegment): WallSegment[] {
  const walls: WallSegment[] = [];
  for (let i = 0; i < 200; i++) {
    const x = 100 + (i % 20) * 110;
    const y = 100 + Math.floor(i / 20) * 230;
    walls.push({ id: `w${i}`, x1: x, y1: y, x2: x + 60, y2: y, type: 'wall' });
  }
  walls.push(extra);
  return walls;
}

/** The fastest of a few runs, in milliseconds, so one slow tick does not decide. */
function fastest(fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    fn();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe.each([2e5, 1e7])('a wall reaching %d pixels on a 2,500-pixel map', (far) => {
  const walls = wallsWith({ id: 'far', x1: 0, y1: 0, x2: far, y2: far, type: 'wall' });
  const onTheMap = wallsWith({ id: 'far', x1: 0, y1: 0, x2: 2500, y2: 2500, type: 'wall' });

  it('costs a sight calculation no more than the same wall ending at the map edge', () => {
    const near = fastest(() => computeVisibility({ x: 1250, y: 1250 }, onTheMap, 2500, 2500, 0));
    const reaching = fastest(() => computeVisibility({ x: 1250, y: 1250 }, walls, 2500, 2500, 0));
    expect(reaching).toBeLessThan(near * 2 + 10);
  });

  it('still blocks sight where it crosses the map', () => {
    // The far wall runs corner to corner along y = x: from below it, the
    // ground beyond it is out of sight and the ground this side is not.
    const poly = computeVisibility({ x: 1200, y: 1300 }, walls, 2500, 2500, 0);
    expect(isPointVisible({ x: 1300, y: 1200 }, poly)).toBe(false);
    expect(isPointVisible({ x: 1150, y: 1400 }, poly)).toBe(true);
  });
});

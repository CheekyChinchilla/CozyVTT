/**
 * Snap to grid, as Draw and Paint both have it: a point goes to the nearer
 * of the nearest corner of the grid and the middle of the square it is in.
 */

import { describe, it, expect } from 'vitest';
import { snapToGrid } from '../drawingGeometry';

describe('snap to grid', () => {
  it.each([
    [[3, 4], [0, 0]],
    [[47, 52], [50, 50]],
    [[20, 30], [25, 25]],
    [[124, 26], [125, 25]],
    [[-3, 2], [0, 0]],
  ] as const)('puts %j at %j on a grid of 50', (point, snapped) => {
    expect(snapToGrid(point, 50)).toEqual(snapped);
  });
});

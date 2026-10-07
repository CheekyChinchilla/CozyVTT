/**
 * The ceiling on a fog grid: one cell per grid square, at most 250,000 of
 * them, which is the largest map the size limits allow (500 by 500). Past it
 * the grid is refused before anything is allocated, so a map stored larger
 * before the limits existed cannot exhaust the heap.
 */

import { buildWsFogState } from '../shared';

describe('buildWsFogState', () => {
  it('builds a grid of 250,000 cells, the most the largest map needs', () => {
    expect(buildWsFogState({ width: 500, height: 500, gridSize: 50 }).revealed).toHaveLength(250000);
  });

  it('refuses one cell more, saying why', () => {
    expect(() => buildWsFogState({ width: 250001, height: 1, gridSize: 50 })).toThrow(/too big for fog of war/);
  });

  it('refuses a huge map at once, without trying to allocate it', () => {
    const started = Date.now();
    expect(() => buildWsFogState({ width: 70000, height: 70000, gridSize: 50 })).toThrow(/too big for fog of war/);
    expect(Date.now() - started).toBeLessThan(50);
  });
});

/**
 * Stored fog read back against the map as it is now.
 *
 * A fog grid is one cell per square, counted across and down. A grid-size
 * change keeps the same squares, only drawn larger or smaller, but the
 * stored fog and every player's explored memory were thrown away because the
 * cell size no longer matched. They are kept now, at the new cell
 * size; a change to the width or height, which moves the squares, still
 * starts from a fully hidden grid.
 */

import { loadFogState } from '../shared';
import type { FogState } from '../../types/walls';

const map = { width: 4, height: 3, gridSize: 50 };
const stored = (over: Partial<FogState> = {}): FogState => {
  const revealed = new Array(12).fill(false);
  revealed[5] = true;
  return { fogCols: 4, fogRows: 3, cellPx: 50, revealed, ...over };
};

describe('loadFogState', () => {
  it('keeps the revealed squares across a grid-size change, at the new cell size', () => {
    const fog = loadFogState({ ...map, gridSize: 70 }, stored());
    expect(fog.cellPx).toBe(70);
    expect(fog.revealed[5]).toBe(true);
    expect(fog.revealed.filter(Boolean)).toHaveLength(1);
  });

  it('starts fully hidden when the width or height changes', () => {
    expect(loadFogState({ ...map, width: 5 }, stored()).revealed.some(Boolean)).toBe(false);
    expect(loadFogState({ ...map, height: 4 }, stored()).revealed.some(Boolean)).toBe(false);
  });

  it('starts fully hidden with nothing stored', () => {
    expect(loadFogState(map, null).revealed).toEqual(new Array(12).fill(false));
  });

  it('starts fully hidden when the stored grid has the wrong number of cells', () => {
    expect(loadFogState(map, stored({ revealed: [true] })).revealed.some(Boolean)).toBe(false);
  });
});

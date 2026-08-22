/**
 * Map coordinate conversion tests.
 *
 * The map runs two Y conventions on purpose — bottom-left for token grid
 * coords (the tabletop convention, and what's persisted), top-left for canvas
 * pixels and fog rows. These tests pin the direction of every conversion, so
 * a future refactor can't silently mirror a token or a fog cell into the
 * wrong row. That failure mode is easy to write and hard to see.
 */

import { describe, it, expect } from 'vitest';
import {
  flipGridY,
  gridYToTopPx,
  gridYToCentrePx,
  gridYToFogRow,
  gridXToFogCol,
  fogCellIndex,
  mapPxToFogCell,
} from '../coords';
import type { FogState } from '@/types/walls';

/** 20 cols × 15 rows at 50px — the shape the test instance uses. */
const fog: FogState = {
  fogCols: 20,
  fogRows: 15,
  cellPx: 50,
  revealed: new Array(300).fill(false),
};
const MAP_HEIGHT = 15;
const GRID = 50;

describe('flipGridY', () => {
  it('is its own inverse', () => {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      expect(flipGridY(flipGridY(y, MAP_HEIGHT), MAP_HEIGHT)).toBe(y);
    }
  });

  it('maps the bottom grid row to the top raster row and back', () => {
    expect(flipGridY(0, MAP_HEIGHT)).toBe(14);
    expect(flipGridY(14, MAP_HEIGHT)).toBe(0);
  });
});

describe('gridYToTopPx', () => {
  it('puts grid Y 0 at the BOTTOM of the map, not the top', () => {
    // The whole point of the bottom-left convention. A 1×1 token at grid Y 0
    // on a 15-row, 50px map has its top edge at 14*50 = 700.
    expect(gridYToTopPx(0, 1, MAP_HEIGHT, GRID)).toBe(700);
  });

  it('puts the topmost row flush against pixel 0', () => {
    expect(gridYToTopPx(14, 1, MAP_HEIGHT, GRID)).toBe(0);
  });

  it('accounts for a token taller than one cell', () => {
    // A 2-high token at grid Y 0 occupies rows 0 and 1, so its top edge is one
    // row higher than a 1×1 at the same position.
    expect(gridYToTopPx(0, 2, MAP_HEIGHT, GRID)).toBe(650);
  });
});

describe('gridYToCentrePx', () => {
  it('sits half a cell below the token top edge for a 1×1', () => {
    expect(gridYToCentrePx(0, 1, MAP_HEIGHT, GRID))
      .toBe(gridYToTopPx(0, 1, MAP_HEIGHT, GRID) + GRID / 2);
  });

  it('centres a 2×2 token on its own box', () => {
    expect(gridYToCentrePx(0, 2, MAP_HEIGHT, GRID))
      .toBe(gridYToTopPx(0, 2, MAP_HEIGHT, GRID) + GRID);
  });
});

describe('fog cell lookup', () => {
  it('gridYToFogRow agrees with mapPxToFogCell for the same token', () => {
    // Both routes must land on the same fog cell: one goes via grid coords
    // (the token visibility guard in drawTokens), the other via map pixels
    // (the fog selection tool). If they ever disagree, a token can be drawn
    // in a cell the player has not revealed.
    for (const gridY of [0, 1, 7, 13, 14]) {
      const row = gridYToFogRow(gridY, 1, MAP_HEIGHT);
      const centrePx = gridYToCentrePx(gridY, 1, MAP_HEIGHT, GRID);
      expect(mapPxToFogCell(25, centrePx, fog)?.row).toBe(row);
    }
  });

  it('gridXToFogCol needs no flip', () => {
    expect(gridXToFogCol(0, 1)).toBe(0);
    expect(gridXToFogCol(19, 1)).toBe(19);
    // A 2-wide token at col 4 covers 4 and 5; its centre resolves to 4.
    expect(gridXToFogCol(4, 2)).toBe(4);
  });

  it('fogCellIndex is row-major', () => {
    expect(fogCellIndex(0, 0, fog)).toBe(0);
    expect(fogCellIndex(3, 2, fog)).toBe(43); // 2*20 + 3
    expect(fogCellIndex(19, 14, fog)).toBe(299);
  });
});

describe('mapPxToFogCell', () => {
  it('resolves a point to its containing cell', () => {
    expect(mapPxToFogCell(0, 0, fog)).toEqual({ col: 0, row: 0, index: 0 });
    expect(mapPxToFogCell(175, 125, fog)).toEqual({ col: 3, row: 2, index: 43 });
  });

  it('treats a cell boundary as the start of the next cell', () => {
    expect(mapPxToFogCell(49.9, 0, fog)?.col).toBe(0);
    expect(mapPxToFogCell(50, 0, fog)?.col).toBe(1);
  });

  it('returns null outside the map rather than a wrapped index', () => {
    // The dangerous case: a negative X would otherwise produce a valid-looking
    // index one row up.
    expect(mapPxToFogCell(-1, 100, fog)).toBeNull();
    expect(mapPxToFogCell(100, -1, fog)).toBeNull();
    expect(mapPxToFogCell(20 * 50, 100, fog)).toBeNull();
    expect(mapPxToFogCell(100, 15 * 50, fog)).toBeNull();
  });

  it('accepts the last pixel inside the map', () => {
    expect(mapPxToFogCell(999, 749, fog)).toEqual({ col: 19, row: 14, index: 299 });
  });
});

/**
 * Fog boxes and explored ground in parts the live table takes. The map's
 * own sends, on the largest map, are in MapCanvasFogSends.test.tsx.
 */

import { describe, it, expect } from 'vitest';
import { cellsInParts, fogOperationsForBox, explorationReports } from '../fogSends';
import { MAX_EXPLORATION_REPORT_CELLS } from '@/constants/mapLimits';
import type { FogState } from '@/types/walls';

const fog: FogState = { fogCols: 20, fogRows: 15, cellPx: 50, revealed: new Array<boolean>(300).fill(false) };
/** The bytes a list of squares takes as cellsInParts counts it: digits and a comma each. */
const listBytes = (cells: number[]) => cells.reduce((sum, cell) => sum + String(cell).length + 1, 0);

describe('cellsInParts', () => {
  it('keeps every square, in order, with each run within the bytes', () => {
    const cells = Array.from({ length: 1000 }, (_, i) => i);
    const parts = cellsInParts(cells, 100);

    expect(parts.flat()).toEqual(cells);
    for (const part of parts) expect(listBytes(part)).toBeLessThanOrEqual(100);
    // Each run is as long as the bytes allow: one more square would not fit.
    for (const [i, part] of parts.slice(0, -1).entries()) {
      expect(listBytes([...part, parts[i + 1][0]])).toBeGreaterThan(100);
    }
  });

  it('fills a run exactly to the bytes', () => {
    expect(cellsInParts([1, 2, 3, 4], 4)).toEqual([[1, 2], [3, 4]]);
  });

  it('sends nothing for no squares, and a square too long for the bytes alone', () => {
    expect(cellsInParts([], 10)).toEqual([]);
    expect(cellsInParts([123456, 7], 3)).toEqual([[123456], [7]]);
  });
});

describe('fogOperationsForBox', () => {
  it('is reveal_all or hide_all for a box over the whole map', () => {
    const whole = { colMin: 0, colMax: 19, rowMin: 0, rowMax: 14 };
    expect(fogOperationsForBox(fog, whole, true)).toEqual([{ op: 'reveal_all' }]);
    expect(fogOperationsForBox(fog, whole, false)).toEqual([{ op: 'hide_all' }]);
  });

  it('is one operation of its squares for any other box that fits a message', () => {
    expect(fogOperationsForBox(fog, { colMin: 0, colMax: 19, rowMin: 0, rowMax: 13 }, true))
      .toEqual([{ op: 'reveal', cells: Array.from({ length: 280 }, (_, i) => i) }]);
    expect(fogOperationsForBox(fog, { colMin: 1, colMax: 2, rowMin: 3, rowMax: 3 }, false))
      .toEqual([{ op: 'hide', cells: [61, 62] }]);
  });
});

describe('explorationReports', () => {
  it('sends a report of the most squares a report may name whole, and one more in two', () => {
    const most = Array.from({ length: MAX_EXPLORATION_REPORT_CELLS }, (_, i) => i);
    expect(explorationReports(most)).toEqual([most]);

    const reports = explorationReports([...most, MAX_EXPLORATION_REPORT_CELLS]);
    expect(reports.map((r) => r.length)).toEqual([MAX_EXPLORATION_REPORT_CELLS, 1]);
    expect(reports.flat()).toEqual([...most, MAX_EXPLORATION_REPORT_CELLS]);
  });

  it('sends nothing for no squares', () => {
    expect(explorationReports([])).toEqual([]);
  });
});

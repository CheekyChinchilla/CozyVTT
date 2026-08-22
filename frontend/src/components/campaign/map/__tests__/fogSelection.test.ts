/**
 * Fog rectangle selection tests.
 *
 * The whole point of this tool is that it reveals *exactly* the squares the
 * DM dragged over — the circular brush it replaces caught neighbouring cells
 * by accident, which is what the feature request complained about. These
 * tests pin the cell set for a drag, so a regression shows up as a failing
 * count rather than as a player seeing a room they shouldn't.
 */

import { describe, it, expect } from 'vitest';
import {
  fogRectFromDrag,
  fogCellsInRect,
  fogRectSize,
  fogRectToPx,
} from '../fogSelection';
import type { FogState } from '@/types/walls';

/** 20 cols × 15 rows at 50px — the shape the test instance uses. */
const fog: FogState = {
  fogCols: 20,
  fogRows: 15,
  cellPx: 50,
  revealed: new Array(300).fill(false),
};

/** Centre pixel of a cell, so tests read in cells rather than pixels. */
const px = (col: number, row: number) => ({ x: col * 50 + 25, y: row * 50 + 25 });

describe('fogRectFromDrag', () => {
  it('covers exactly the cells dragged over — the 4 × 7 case from the request', () => {
    const a = px(2, 3);
    const b = px(5, 9); // cols 2..5 = 4 wide, rows 3..9 = 7 tall
    const rect = fogRectFromDrag(fog, a.x, a.y, b.x, b.y)!;

    expect(fogRectSize(rect)).toEqual({ cols: 4, rows: 7 });
    expect(fogCellsInRect(fog, rect)).toHaveLength(28);
  });

  it('produces indices matching row * fogCols + col', () => {
    const a = px(3, 2);
    const b = px(4, 3);
    const rect = fogRectFromDrag(fog, a.x, a.y, b.x, b.y)!;

    // rows 2-3 × cols 3-4 → 43, 44, 63, 64
    expect(fogCellsInRect(fog, rect)).toEqual([43, 44, 63, 64]);
  });

  it('gives the same rectangle whichever direction you drag', () => {
    const a = px(2, 3);
    const b = px(5, 9);
    const forward = fogRectFromDrag(fog, a.x, a.y, b.x, b.y);
    const reversed = fogRectFromDrag(fog, b.x, b.y, a.x, a.y);
    const mixedX = fogRectFromDrag(fog, b.x, a.y, a.x, b.y);
    const mixedY = fogRectFromDrag(fog, a.x, b.y, b.x, a.y);

    expect(reversed).toEqual(forward);
    expect(mixedX).toEqual(forward);
    expect(mixedY).toEqual(forward);
  });

  it('resolves a click with no movement to exactly one square', () => {
    const p = px(7, 4);
    const rect = fogRectFromDrag(fog, p.x, p.y, p.x, p.y)!;

    expect(fogRectSize(rect)).toEqual({ cols: 1, rows: 1 });
    expect(fogCellsInRect(fog, rect)).toEqual([4 * 20 + 7]);
  });

  it('includes any square the drag touches at all, however slightly', () => {
    // From 1px inside col 2 to 1px inside col 4 — three columns, not one.
    const rect = fogRectFromDrag(fog, 101, 101, 201, 201)!;
    expect(fogRectSize(rect)).toEqual({ cols: 3, rows: 3 });
  });

  it('clamps a drag that runs off the edge instead of overflowing', () => {
    const inside = px(18, 13);
    const rect = fogRectFromDrag(fog, inside.x, inside.y, 99999, 99999)!;

    expect(rect.colMax).toBe(19);
    expect(rect.rowMax).toBe(14);
    // Every index must be a real cell — an unclamped drag would produce
    // out-of-range indices that the server would silently ignore.
    for (const idx of fogCellsInRect(fog, rect)) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(fog.fogCols * fog.fogRows);
    }
  });

  it('clamps a drag that starts off the map and ends inside', () => {
    const end = px(2, 2);
    const rect = fogRectFromDrag(fog, -500, -500, end.x, end.y)!;
    expect(rect.colMin).toBe(0);
    expect(rect.rowMin).toBe(0);
    expect(rect.colMax).toBe(2);
    expect(rect.rowMax).toBe(2);
  });

  it('returns null only when the drag misses the map entirely', () => {
    expect(fogRectFromDrag(fog, -200, -200, -100, -100)).toBeNull();
    expect(fogRectFromDrag(fog, 5000, 100, 6000, 200)).toBeNull();
    expect(fogRectFromDrag(fog, 100, 5000, 200, 6000)).toBeNull();
  });
});

describe('fogRectToPx', () => {
  it('snaps to cell boundaries rather than the raw cursor', () => {
    // Dragged from mid-cell to mid-cell; the preview must sit on the grid.
    // x 137..233 → cols 2..4 (3 wide); y 88..191 → rows 1..3 (3 tall).
    const rect = fogRectFromDrag(fog, 137, 88, 233, 191)!;
    expect(fogRectToPx(fog, rect)).toEqual({ x: 100, y: 50, w: 150, h: 150 });
  });

  it('gives a single cell box for a click', () => {
    const p = px(3, 3);
    const rect = fogRectFromDrag(fog, p.x, p.y, p.x, p.y)!;
    expect(fogRectToPx(fog, rect)).toEqual({ x: 150, y: 150, w: 50, h: 50 });
  });
});

describe('fogCellsInRect', () => {
  it('walks row-major with no duplicates', () => {
    const a = px(0, 0);
    const b = px(3, 2);
    const cells = fogCellsInRect(fog, fogRectFromDrag(fog, a.x, a.y, b.x, b.y)!);

    expect(cells).toHaveLength(12);
    expect(new Set(cells).size).toBe(12);
    expect(cells).toEqual([...cells].sort((x, y) => x - y));
  });

  it('can select the whole map', () => {
    const rect = fogRectFromDrag(fog, 0, 0, 20 * 50 - 1, 15 * 50 - 1)!;
    expect(fogCellsInRect(fog, rect)).toHaveLength(300);
  });
});

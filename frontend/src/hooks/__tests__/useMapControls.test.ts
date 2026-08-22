/**
 * useMapControls coordinate tests.
 *
 * This hook is where the map's bottom-left grid convention is created and
 * undone — every click on the canvas passes through screenToGrid, and every
 * grid-anchored piece of UI passes back through gridToScreen. It had no tests
 * before the coords refactor, which made it the riskiest place in the map for
 * an origin mistake to hide.
 *
 * Zoom/pan state is exercised only where it affects those conversions.
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMapControls } from '../useMapControls';

/** 20 cols × 15 rows at 50px — the shape the test instance uses. */
const CONFIG = { gridSize: 50, mapWidth: 20, mapHeight: 15 };

function setup() {
  return renderHook(() => useMapControls(CONFIG));
}

describe('screenToGrid', () => {
  it('maps the TOP-LEFT pixel to the TOP grid row, not row 0', () => {
    // The convention that matters: grid Y counts up from the bottom, so the
    // top-left corner of the canvas is the highest row index.
    const { result } = setup();
    expect(result.current.screenToGrid({ x: 0, y: 0 })).toEqual({ x: 0, y: 14 });
  });

  it('maps the BOTTOM-LEFT pixel to grid Y 0', () => {
    const { result } = setup();
    // Last pixel row of a 15×50 = 750px tall map
    expect(result.current.screenToGrid({ x: 0, y: 749 })).toEqual({ x: 0, y: 0 });
  });

  it('resolves a mid-map point to its containing cell', () => {
    const { result } = setup();
    // x 175 → col 3; y 125 → top-row 2 → grid Y 12
    expect(result.current.screenToGrid({ x: 175, y: 125 })).toEqual({ x: 3, y: 12 });
  });

  it('treats a cell boundary as the start of the next cell', () => {
    const { result } = setup();
    expect(result.current.screenToGrid({ x: 49.9, y: 0 }).x).toBe(0);
    expect(result.current.screenToGrid({ x: 50, y: 0 }).x).toBe(1);
  });
});

describe('screenToGrid / gridToScreen round-trip', () => {
  it('returns the same cell after a round-trip at default view', () => {
    const { result } = setup();
    for (const cell of [{ x: 0, y: 0 }, { x: 3, y: 12 }, { x: 19, y: 14 }]) {
      const screen = result.current.gridToScreen(cell);
      expect(result.current.screenToGrid(screen)).toEqual(cell);
    }
  });

  it('survives a round-trip under zoom and pan', () => {
    const { result } = setup();
    act(() => {
      result.current.setZoomLevel(2);
    });
    act(() => {
      result.current.startDrag({ clientX: 0, clientY: 0 } as MouseEvent);
      result.current.handleDrag({ clientX: 137, clientY: -84 } as MouseEvent);
      result.current.stopDrag();
    });

    for (const cell of [{ x: 0, y: 0 }, { x: 5, y: 9 }, { x: 19, y: 14 }]) {
      const screen = result.current.gridToScreen(cell);
      expect(result.current.screenToGrid(screen)).toEqual(cell);
    }
  });

  it('keeps grid Y 0 at the bottom of the map under zoom', () => {
    const { result } = setup();
    act(() => {
      result.current.setZoomLevel(2);
    });
    // Bottom row must still be further down the screen than the top row.
    const bottom = result.current.gridToScreen({ x: 0, y: 0 });
    const top = result.current.gridToScreen({ x: 0, y: 14 });
    expect(bottom.y).toBeGreaterThan(top.y);
  });
});

describe('isWithinBounds', () => {
  it('accepts cells inside the map and rejects the ones past each edge', () => {
    const { result } = setup();
    expect(result.current.isWithinBounds({ x: 0, y: 0 })).toBe(true);
    expect(result.current.isWithinBounds({ x: 19, y: 14 })).toBe(true);
    expect(result.current.isWithinBounds({ x: -1, y: 0 })).toBe(false);
    expect(result.current.isWithinBounds({ x: 0, y: -1 })).toBe(false);
    expect(result.current.isWithinBounds({ x: 20, y: 0 })).toBe(false);
    expect(result.current.isWithinBounds({ x: 0, y: 15 })).toBe(false);
  });
});

describe('zoom', () => {
  it('clamps to the configured bounds', () => {
    const { result } = setup();
    act(() => { result.current.setZoomLevel(99); });
    expect(result.current.zoom).toBe(result.current.maxZoom);
    act(() => { result.current.setZoomLevel(0.001); });
    expect(result.current.zoom).toBe(result.current.minZoom);
  });

  it('scales the on-screen grid size', () => {
    const { result } = setup();
    act(() => { result.current.setZoomLevel(2); });
    expect(result.current.getScaledGridSize()).toBe(100);
  });
});

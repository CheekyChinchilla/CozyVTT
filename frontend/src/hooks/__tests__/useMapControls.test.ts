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

/** 20 cols × 15 rows at 50px, a common map's shape. */
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

/** A wheel event as the browser sends one, over a canvas at the page's corner. */
function wheel(deltaY: number, at = { x: 200, y: 100 }, deltaMode = 0): WheelEvent {
  return { deltaY, deltaMode, clientX: at.x, clientY: at.y, preventDefault: () => {} } as unknown as WheelEvent;
}
const RECT = { left: 0, top: 0 } as DOMRect;

describe('zooming', () => {
  // The buttons zoomed about the map's corner, so the middle of the screen
  // slid away; they now zoom about the point they are given.
  it('keeps the point it is given still when a button zooms', () => {
    const { result } = setup();
    const centre = { x: 400, y: 300 };
    const before = result.current.screenToGrid(centre);
    act(() => { result.current.zoomIn(centre); });
    expect(result.current.zoom).toBe(1.25);
    expect(result.current.screenToGrid(centre)).toEqual(before);
    act(() => { result.current.zoomOut(centre); });
    expect(result.current.screenToGrid(centre)).toEqual(before);
  });

  // Each event read the zoom of the last render, so a second notch before the
  // page drew again was lost.
  it('counts every wheel notch, even two before the next render', () => {
    const { result } = setup();
    const handleWheel = result.current.handleWheel;
    act(() => {
      handleWheel(wheel(-100), RECT);
      handleWheel(wheel(-100), RECT);
    });
    expect(result.current.zoom).toBeCloseTo(1.2);
  });

  // A trackpad sends many small deltas; each counted as a whole notch.
  it('zooms by how far the wheel turned', () => {
    const { result } = setup();
    act(() => { result.current.handleWheel(wheel(-10), RECT); });
    expect(result.current.zoom).toBeCloseTo(1.01);
    act(() => { result.current.handleWheel(wheel(-3, undefined, 1), RECT); });
    expect(result.current.zoom).toBeCloseTo(1.11);
  });
});

describe('pinching', () => {
  // Each step scales the zoom the pinch began at, so the steps never compound.
  it('zooms by the scale from the zoom the pinch began at, about the fingers', () => {
    const { result } = setup();
    const centre = { x: 400, y: 300 };
    act(() => {
      result.current.pinchStart();
      result.current.pinchBy(1.5, centre, 0, 0);
      result.current.pinchBy(2, centre, 0, 0);
    });
    expect(result.current.zoom).toBe(2);
    expect(result.current.panOffset).toEqual({ x: -400, y: -300 });
  });

  // Zooming about the new centre before moving the pan drifted the map out
  // from under the fingers by the centre's move times the zoom's change.
  it('keeps the map under the fingers while their centre moves as they spread', () => {
    const { result } = setup();
    act(() => {
      result.current.pinchStart();
      result.current.pinchBy(2, { x: 110, y: 100 }, 10, 0);
      result.current.pinchBy(3, { x: 130, y: 120 }, 20, 20);
    });
    // Map pixel (100, 100) began under (100, 100), and is under the centre now.
    const { zoom, panOffset } = result.current;
    expect({ x: (130 - panOffset.x) / zoom, y: (120 - panOffset.y) / zoom }).toEqual({ x: 100, y: 100 });
  });

  it('stays within the zoom bounds, as the wheel does', () => {
    const { result } = setup();
    act(() => {
      result.current.pinchStart();
      result.current.pinchBy(10, { x: 0, y: 0 }, 0, 0);
    });
    expect(result.current.zoom).toBe(result.current.maxZoom);
    act(() => { result.current.pinchBy(0.01, { x: 0, y: 0 }, 0, 0); });
    expect(result.current.zoom).toBe(result.current.minZoom);
  });
});

// The keyboard pans a selected token back into sight.
describe('panning by an amount', () => {
  it('moves the view by that many canvas pixels, keeping the zoom', () => {
    const { result } = setup();
    act(() => result.current.zoomIn());
    act(() => result.current.panBy(30, -20));

    expect(result.current.panOffset).toEqual({ x: 30, y: -20 });
    expect(result.current.zoom).toBe(1.25);
  });

  it('adds up two pans made before the next render', () => {
    const { result } = setup();
    act(() => {
      result.current.panBy(10, 0);
      result.current.panBy(5, 5);
    });

    expect(result.current.panOffset).toEqual({ x: 15, y: 5 });
  });
});

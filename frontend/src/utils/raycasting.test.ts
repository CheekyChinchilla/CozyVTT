/**
 * Unit tests for raycasting visibility polygon algorithm.
 */

import { describe, it, expect } from 'vitest';
import { computeVisibility, isPointVisible } from './raycasting';
import type { WallSegment } from '../types/walls';

const MAP_W = 800;
const MAP_H = 600;

/** Helper: create a wall segment */
function wall(x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id: 'test', x1, y1, x2, y2, type: 'wall' };
}

describe('computeVisibility', () => {
  it('returns a polygon with at least 4 points when there are no walls', () => {
    const viewer = { x: 400, y: 300 };
    const result = computeVisibility(viewer, [], MAP_W, MAP_H);
    // Bounding walls produce at least 4 corners visible
    expect(result.points.length).toBeGreaterThanOrEqual(4);
  });

  it('all returned points are within the map bounds', () => {
    const viewer = { x: 400, y: 300 };
    const walls: WallSegment[] = [
      wall(200, 100, 200, 500),
      wall(400, 200, 600, 200),
    ];
    const result = computeVisibility(viewer, walls, MAP_W, MAP_H);
    for (const pt of result.points) {
      expect(pt.x).toBeGreaterThanOrEqual(-1);
      expect(pt.x).toBeLessThanOrEqual(MAP_W + 1);
      expect(pt.y).toBeGreaterThanOrEqual(-1);
      expect(pt.y).toBeLessThanOrEqual(MAP_H + 1);
    }
  });

  it('a point behind a blocking wall is not visible', () => {
    // Wall runs vertically at x=200, from y=0 to y=600 (full height)
    // Viewer at (400, 300). Point at (50, 300) is behind the wall.
    const viewer = { x: 400, y: 300 };
    const blockingWall = wall(200, 0, 200, MAP_H);
    const result = computeVisibility(viewer, [blockingWall], MAP_W, MAP_H);
    const behindWall = { x: 50, y: 300 };
    expect(isPointVisible(behindWall, viewer, result)).toBe(false);
  });

  it('a point in front of a blocking wall is visible', () => {
    const viewer = { x: 400, y: 300 };
    const blockingWall = wall(200, 0, 200, MAP_H);
    const result = computeVisibility(viewer, [blockingWall], MAP_W, MAP_H);
    const inFront = { x: 300, y: 300 };
    expect(isPointVisible(inFront, viewer, result)).toBe(true);
  });

  it('an open door does not block vision', () => {
    const viewer = { x: 400, y: 300 };
    const openDoor: WallSegment = { id: 'door', x1: 200, y1: 0, x2: 200, y2: MAP_H, type: 'door-open' };
    const result = computeVisibility(viewer, [openDoor], MAP_W, MAP_H);
    // Point behind where the door is should be visible since door-open doesn't block
    const behindDoor = { x: 50, y: 300 };
    expect(isPointVisible(behindDoor, viewer, result)).toBe(true);
  });

  it('a window does not block vision', () => {
    const viewer = { x: 400, y: 300 };
    const windowSeg: WallSegment = { id: 'window', x1: 200, y1: 0, x2: 200, y2: MAP_H, type: 'window' };
    const result = computeVisibility(viewer, [windowSeg], MAP_W, MAP_H);
    const behindWindow = { x: 50, y: 300 };
    expect(isPointVisible(behindWindow, viewer, result)).toBe(true);
  });

  it('a closed door blocks vision like a wall', () => {
    const viewer = { x: 400, y: 300 };
    const closedDoor: WallSegment = { id: 'door', x1: 200, y1: 0, x2: 200, y2: MAP_H, type: 'door-closed' };
    const result = computeVisibility(viewer, [closedDoor], MAP_W, MAP_H);
    const behindDoor = { x: 50, y: 300 };
    expect(isPointVisible(behindDoor, viewer, result)).toBe(false);
  });

  it('sight radius clamps visibility to a circle', () => {
    const viewer = { x: 400, y: 300 };
    const radius = 100;
    const result = computeVisibility(viewer, [], MAP_W, MAP_H, radius);
    for (const pt of result.points) {
      const dist = Math.hypot(pt.x - viewer.x, pt.y - viewer.y);
      // Allow small floating-point tolerance
      expect(dist).toBeLessThanOrEqual(radius + 1);
    }
  });
});

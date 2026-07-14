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

  it('a locked door blocks vision like a wall', () => {
    const viewer = { x: 400, y: 300 };
    const lockedDoor: WallSegment = { id: 'door', x1: 200, y1: 0, x2: 200, y2: MAP_H, type: 'door-locked' };
    const result = computeVisibility(viewer, [lockedDoor], MAP_W, MAP_H);
    expect(isPointVisible({ x: 50, y: 300 }, viewer, result)).toBe(false);
  });

  it('a closed room clips visibility to the room interior', () => {
    // 4-wall room from (300,200) to (500,400); viewer at its center.
    const viewer = { x: 400, y: 300 };
    const room: WallSegment[] = [
      wall(300, 200, 500, 200), // top
      wall(500, 200, 500, 400), // right
      wall(500, 400, 300, 400), // bottom
      wall(300, 400, 300, 200), // left
    ];
    const result = computeVisibility(viewer, room, MAP_W, MAP_H);

    // Inside the room: visible
    expect(isPointVisible({ x: 350, y: 250 }, viewer, result)).toBe(true);
    expect(isPointVisible({ x: 450, y: 350 }, viewer, result)).toBe(true);
    // Outside the room in every direction: not visible
    expect(isPointVisible({ x: 400, y: 100 }, viewer, result)).toBe(false);
    expect(isPointVisible({ x: 400, y: 500 }, viewer, result)).toBe(false);
    expect(isPointVisible({ x: 200, y: 300 }, viewer, result)).toBe(false);
    expect(isPointVisible({ x: 600, y: 300 }, viewer, result)).toBe(false);
    // Every polygon point stays within the room bounds (small tolerance)
    for (const pt of result.points) {
      expect(pt.x).toBeGreaterThanOrEqual(299);
      expect(pt.x).toBeLessThanOrEqual(501);
      expect(pt.y).toBeGreaterThanOrEqual(199);
      expect(pt.y).toBeLessThanOrEqual(401);
    }
  });

  it('vision leaks through a doorway gap in a room wall', () => {
    // Same room, but the top wall has a 40px gap (doorway) between x=380 and x=420.
    const viewer = { x: 400, y: 300 };
    const roomWithGap: WallSegment[] = [
      wall(300, 200, 380, 200), // top-left piece
      wall(420, 200, 500, 200), // top-right piece (gap 380..420)
      wall(500, 200, 500, 400),
      wall(500, 400, 300, 400),
      wall(300, 400, 300, 200),
    ];
    const result = computeVisibility(viewer, roomWithGap, MAP_W, MAP_H);

    // Straight through the gap: visible well beyond the wall line
    expect(isPointVisible({ x: 400, y: 100 }, viewer, result)).toBe(true);
    // Behind the remaining solid wall pieces: still hidden
    expect(isPointVisible({ x: 320, y: 100 }, viewer, result)).toBe(false);
    expect(isPointVisible({ x: 480, y: 100 }, viewer, result)).toBe(false);
  });
});

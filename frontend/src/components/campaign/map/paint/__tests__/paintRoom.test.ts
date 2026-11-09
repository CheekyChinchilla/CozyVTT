import { describe, it, expect } from 'vitest';
import { roomBox, roomWalls, scaleWalls, wallsOnMap, wallsToAdd, type WallLine } from '../paintRoom';

describe('roomBox', () => {
  it('puts each corner on the nearest corner of the grid, whichever way it was dragged', () => {
    expect(roomBox([118, 260], [30, 95], 50, 1000, 1000)).toEqual({ x0: 50, y0: 100, x1: 100, y1: 250 });
  });

  it('keeps the room on the map', () => {
    expect(roomBox([-40, -10], [1180, 990], 50, 1000, 800)).toEqual({ x0: 0, y0: 0, x1: 1000, y1: 800 });
  });

  it('is no room when it snaps to no width or no height', () => {
    expect(roomBox([100, 100], [110, 400], 50, 1000, 1000)).toBeNull();
    expect(roomBox([100, 100], [400, 120], 50, 1000, 1000)).toBeNull();
  });
});

describe('roomWalls', () => {
  it('is the four sides of the room, corner to corner', () => {
    expect(roomWalls({ x0: 50, y0: 100, x1: 200, y1: 300 })).toEqual([
      { x1: 50, y1: 100, x2: 200, y2: 100 },
      { x1: 200, y1: 100, x2: 200, y2: 300 },
      { x1: 200, y1: 300, x2: 50, y2: 300 },
      { x1: 50, y1: 300, x2: 50, y2: 100 },
    ]);
  });
});

describe('wallsToAdd', () => {
  const line = (x1: number, y1: number, x2: number, y2: number): WallLine => ({ x1, y1, x2, y2 });

  it('adds a side two rooms share once, whichever way each runs', () => {
    const a = roomWalls({ x0: 0, y0: 0, x1: 100, y1: 100 });
    const b = roomWalls({ x0: 100, y0: 0, x1: 200, y1: 100 });
    const added = wallsToAdd([...a, ...b], []);
    expect(added).toHaveLength(7);
    expect(added.filter((w) => (w.x1 === 100 && w.x2 === 100))).toHaveLength(1);
  });

  it('adds no wall the map already has', () => {
    const existing = [line(100, 0, 0, 0)];
    expect(wallsToAdd([line(0, 0, 100, 0), line(100, 0, 100, 100)], existing)).toEqual([line(100, 0, 100, 100)]);
  });
});

describe('a room\'s walls on the picture and on the map', () => {
  const line = (x1: number, y1: number, x2: number, y2: number): WallLine => ({ x1, y1, x2, y2 });

  it('come back to the map\'s whole pixels from a picture of another scale, so a wall the map has is still known', () => {
    const walls = roomWalls({ x0: 50, y0: 50, x1: 150, y1: 100 });
    const onPicture = scaleWalls(walls, 2 / 3, 2 / 3);
    expect(onPicture[0].x1).not.toBe(Math.round(onPicture[0].x1));
    expect(wallsOnMap(onPicture, 2 / 3, 2 / 3)).toEqual(walls);
    expect(wallsToAdd(wallsOnMap(onPicture, 2 / 3, 2 / 3), walls)).toEqual([]);
  });

  it('follow the picture onto a map made larger', () => {
    expect(wallsOnMap([line(50, 50, 150, 50)], 1000 / 1500, 1000 / 1500)).toEqual([line(75, 75, 225, 75)]);
  });
});

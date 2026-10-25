/**
 * Sight on a map with many walls walks each ray through a grid of cells and
 * stops at the first cell that holds a wall it hits. That must give the very
 * polygon testing every wall gives, point for point, and cost far less than
 * testing every wall.
 *
 * `reference` below is the sight calculation as it was when every ray tested
 * every wall. Keep it as it is: it is what the fast one is held to.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { computeVisibility, type Point, type VisibilityPolygon } from '../raycasting';
import { WallGrid } from '../spatialIndex';
import type { WallSegment, WallType } from '../../types/walls';

interface Seg { ax: number; ay: number; bx: number; by: number }

// Jest reaches every global through a proxy, which makes each Math call in a
// hot loop many times slower than under Node; the same functions, held here,
// keep the reference quick. The answers are the same.
const { abs, atan2, cos, hypot, sin } = Math;

function referenceIntersect(
  ox: number, oy: number, dx: number, dy: number,
  ax: number, ay: number, bx: number, by: number
): { t: number; u: number } | null {
  const denom = dx * (by - ay) - dy * (bx - ax);
  if (abs(denom) < 1e-10) return null;
  const t = ((ax - ox) * (by - ay) - (ay - oy) * (bx - ax)) / denom;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return { t, u };
}

function referenceCastRay(ox: number, oy: number, angle: number, segments: Seg[], maxDist: number): Point {
  const dx = cos(angle);
  const dy = sin(angle);
  let minT = maxDist;
  for (const seg of segments) {
    const hit = referenceIntersect(ox, oy, dx, dy, seg.ax, seg.ay, seg.bx, seg.by);
    if (hit && hit.t < minT) minT = hit.t;
  }
  return { x: ox + dx * minT, y: oy + dy * minT };
}

function reference(viewerPos: Point, walls: WallSegment[], mapWidth: number, mapHeight: number, sightRadius = 0): VisibilityPolygon {
  const { x: ox, y: oy } = viewerPos;
  const maxDist = sightRadius > 0 ? sightRadius : hypot(mapWidth, mapHeight) * 1.1;
  const blockingSegs: Seg[] = [
    { ax: 0, ay: 0, bx: mapWidth, by: 0 },
    { ax: mapWidth, ay: 0, bx: mapWidth, by: mapHeight },
    { ax: mapWidth, ay: mapHeight, bx: 0, by: mapHeight },
    { ax: 0, ay: mapHeight, bx: 0, by: 0 },
  ];
  const candidateWalls = walls.length > 200
    ? new WallGrid(walls, 256, mapWidth, mapHeight).query(ox, oy, maxDist)
    : walls;
  for (const w of candidateWalls) {
    if (w.type === 'wall' || w.type === 'door-closed' || w.type === 'door-locked') {
      blockingSegs.push({ ax: w.x1, ay: w.y1, bx: w.x2, by: w.y2 });
    }
  }
  const angles: number[] = [];
  for (const seg of blockingSegs) {
    for (const [px, py] of [[seg.ax, seg.ay], [seg.bx, seg.by]]) {
      const angle = atan2(py - oy, px - ox);
      angles.push(angle - 0.0001, angle, angle + 0.0001);
    }
  }
  if (sightRadius > 0) {
    const step = (Math.PI * 2) / 64;
    for (let i = 0; i < 64; i++) angles.push(-Math.PI + i * step);
  }
  const points = angles.map((angle) => ({ angle, point: referenceCastRay(ox, oy, angle, blockingSegs, maxDist) }));
  points.sort((a, b) => a.angle - b.angle);
  const deduped: Point[] = [];
  for (const { point } of points) {
    const prev = deduped[deduped.length - 1];
    if (prev && abs(point.x - prev.x) < 0.5 && abs(point.y - prev.y) < 0.5) continue;
    deduped.push(point);
  }
  return { points: deduped };
}

/** A repeatable sequence of numbers in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const TYPES: WallType[] = ['wall', 'wall', 'wall', 'wall', 'door-closed', 'door-locked', 'door-open', 'window'];

/**
 * Walls as a map has them, on grid lines, with the awkward ones mixed in:
 * walls that share ends, run along the map's edge or off it, have no length,
 * appear twice, or end exactly on a cell boundary of the ray grid.
 */
function randomWalls(rnd: () => number, count: number, width: number, height: number, gridSize: number): WallSegment[] {
  const walls: WallSegment[] = [];
  for (let i = 0; i < count; i++) {
    const kind = rnd();
    const type = TYPES[Math.floor(rnd() * TYPES.length)];
    let wall: WallSegment;
    if (kind < 0.7) {
      const x = Math.floor(rnd() * (width / gridSize)) * gridSize;
      const y = Math.floor(rnd() * (height / gridSize)) * gridSize;
      const len = (1 + Math.floor(rnd() * 3)) * gridSize;
      wall = rnd() < 0.5
        ? { id: `w${i}`, x1: x, y1: y, x2: x + len, y2: y, type }
        : { id: `w${i}`, x1: x, y1: y, x2: x, y2: y + len, type };
    } else if (kind < 0.85) {
      const x1 = rnd() * width, y1 = rnd() * height;
      wall = { id: `w${i}`, x1, y1, x2: x1 + (rnd() - 0.5) * 400, y2: y1 + (rnd() - 0.5) * 400, type };
    } else if (kind < 0.9 && walls.length > 0) {
      const prev = walls[Math.floor(rnd() * walls.length)];
      wall = rnd() < 0.5 ? prev : { ...prev, id: `w${i}`, x2: prev.x1 + 64, y2: prev.y1 - 64 };
    } else if (kind < 0.94) {
      const x = Math.round(rnd() * width / 64) * 64;
      wall = { id: `w${i}`, x1: x, y1: rnd() * height, x2: x, y2: rnd() * height, type };
    } else if (kind < 0.97) {
      wall = { id: `w${i}`, x1: -500 + rnd() * 300, y1: rnd() * height, x2: width + rnd() * 3000, y2: rnd() * height * 2, type };
    } else {
      const x = rnd() * width, y = rnd() * height;
      wall = { id: `w${i}`, x1: x, y1: y, x2: x, y2: y, type };
    }
    walls.push(wall);
  }
  walls.push({ id: 'edge', x1: 0, y1: height, x2: width, y2: height, type: 'wall' });
  return walls;
}

/** Where to look from: open floor, wall ends, wall middles, cell boundaries, the map's edge and outside it. */
function viewpoints(rnd: () => number, walls: WallSegment[], width: number, height: number, count: number): Point[] {
  const points: Point[] = [
    { x: 0, y: 0 }, { x: width, y: height }, { x: width / 2, y: 0 }, { x: 0, y: height / 3 },
    { x: 128, y: 192 }, { x: -40, y: height / 2 }, { x: width + 10, y: height + 10 },
  ];
  for (let i = 0; i < count; i++) {
    const r = rnd();
    const w = walls[Math.floor(rnd() * walls.length)];
    if (r < 0.5) points.push({ x: rnd() * width, y: rnd() * height });
    else if (r < 0.7) points.push({ x: w.x1, y: w.y1 });
    else if (r < 0.85) points.push({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
    else points.push({ x: Math.floor(rnd() * width / 64) * 64, y: rnd() * height });
  }
  return points;
}

describe('sight through the ray grid gives the polygon testing every wall gives', () => {
  const maps: Array<[string, number, number, number, number]> = [
    // name, walls, width, height, seed
    ['50 walls (every wall tested)', 50, 1400, 1400, 1],
    ['250 walls on a small map', 250, 1400, 1050, 2],
    ['600 walls on an odd-sized map', 600, 2513, 1777, 3],
    ['1,000 walls on a wide map', 1000, 6300, 2100, 4],
    ['2,000 walls', 2000, 5950, 3920, 5],
    // Wider than 8,192 px, so a ray grid cell is wider than 64 px and not a whole number.
    ['1,500 walls on a map 9,317 px wide', 1500, 9317, 2890, 6],
  ];

  it.each(maps)('%s', (_name, count, width, height, seed) => {
    const rnd = seeded(seed);
    const walls = randomWalls(rnd, count, width, height, 70);
    const views = viewpoints(rnd, walls, width, height, count >= 2000 ? 3 : count >= 1000 ? 6 : 20);
    for (const view of views) {
      for (const radius of [0, 350, 1200]) {
        expect(computeVisibility(view, walls, width, height, radius)).toEqual(reference(view, walls, width, height, radius));
      }
    }
  });

  const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../__fixtures__/vision-scenarios.json'), 'utf8')) as {
    map: { width: number; height: number; gridSize: number };
    scenarios: Array<{ name: string; walls: WallSegment[]; lights: Point[]; tokens: Point[] }>;
  };

  it.each(fixture.scenarios.map((s) => [s.name, s] as const))('the vision scenario "%s", alone and among 300 more walls', (_name, s) => {
    const { width, height, gridSize } = fixture.map;
    const widthPx = width * gridSize;
    const heightPx = height * gridSize;
    const crowded = [...s.walls, ...randomWalls(seeded(s.name.length), 300, widthPx, heightPx, gridSize)];
    const views: Point[] = [
      ...s.tokens.map((t) => ({ x: (t.x + 0.5) * gridSize, y: (height - t.y - 0.5) * gridSize })),
      ...s.lights.map((l) => ({ x: l.x, y: l.y })),
    ];
    for (const view of views) {
      for (const walls of [s.walls, crowded]) {
        for (const radius of [0, 800]) {
          expect(computeVisibility(view, walls, widthPx, heightPx, radius)).toEqual(reference(view, walls, widthPx, heightPx, radius));
        }
      }
    }
  });
});

/** The fastest of five runs, in milliseconds, so one slow tick does not decide. */
function fastest(fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    fn();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe('what sight costs as walls are added', () => {
  /** Walls on grid lines at the same density as each other: the map grows with them. */
  function mapWith(count: number): { walls: WallSegment[]; width: number; height: number } {
    const rnd = seeded(count);
    const cells = Math.max(600, count * 2.4);
    const cols = Math.round(Math.sqrt(cells * 1.5));
    const rows = Math.round(cells / cols);
    const walls: WallSegment[] = [];
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rnd() * cols) * 70;
      const y = Math.floor(rnd() * rows) * 70;
      const len = (1 + Math.floor(rnd() * 3)) * 70;
      walls.push(rnd() < 0.5
        ? { id: `w${i}`, x1: x, y1: y, x2: x + len, y2: y, type: 'wall' }
        : { id: `w${i}`, x1: x, y1: y, x2: x, y2: y + len, type: 'wall' });
    }
    return { walls, width: cols * 70, height: rows * 70 };
  }

  it('grows about as fast as the walls do, not as their square', () => {
    const small = mapWith(200);
    const large = mapWith(2000);
    const smallMs = fastest(() => computeVisibility({ x: small.width / 2, y: small.height / 2 }, small.walls, small.width, small.height, 0));
    const largeMs = fastest(() => computeVisibility({ x: large.width / 2, y: large.height / 2 }, large.walls, large.width, large.height, 0));
    // Ten times the walls: testing every wall from every ray costs about a
    // hundred times as much and more; walking the grid, a few times as much.
    expect(largeMs).toBeLessThan(smallMs * 25 + 5);
  });
});

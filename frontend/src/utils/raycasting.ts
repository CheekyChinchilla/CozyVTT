/**
 * Raycasting Visibility Polygon Algorithm
 *
 * Computes a 2D visibility polygon from a viewer position, given a set of
 * blocking wall segments. Based on the classical "2D Visibility / Ray Endpoint"
 * approach by Amit Patel (redblobgames.com).
 *
 * Wall types that BLOCK vision: 'wall', 'door-closed'
 * Wall types that DO NOT block: 'door-open', 'window'
 */

import type { WallSegment } from '../types/walls';
import { WallGrid } from './spatialIndex';

export interface Point { x: number; y: number; }

export interface VisibilityPolygon {
  points: Point[];
}

/** Internal representation of a blocking segment. */
interface Seg {
  ax: number; ay: number;
  bx: number; by: number;
}

/**
 * Parametric ray-segment intersection.
 * Ray: P(t) = (ox + dx*t, oy + dy*t)
 * Segment: Q(u) = (ax + (bx-ax)*u, ay + (by-ay)*u), u in [0,1]
 *
 * Returns t, how far along the ray the segment is met, or Infinity when the
 * ray misses it.
 */
function raySegmentHit(ox: number, oy: number, dx: number, dy: number, seg: Seg): number {
  const { ax, ay, bx, by } = seg;
  const denom = dx * (by - ay) - dy * (bx - ax);
  if (Math.abs(denom) < 1e-10) return Infinity; // parallel

  const t = ((ax - ox) * (by - ay) - (ay - oy) * (bx - ax)) / denom;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;

  if (t < 0 || u < 0 || u > 1) return Infinity;
  return t;
}

/**
 * Find the nearest blocking intersection along a ray, testing every segment.
 * Returns the intersection point (or point at maxDist if none found).
 */
function castRay(
  ox: number, oy: number,
  angle: number,
  segments: Seg[],
  maxDist: number
): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let minT = maxDist;

  for (const seg of segments) {
    const t = raySegmentHit(ox, oy, dx, dy, seg);
    if (t < minT) minT = t;
  }

  return { x: ox + dx * minT, y: oy + dy * minT };
}

/**
 * Up to this many blocking segments, every ray tests every one. Past it,
 * sight files the segments in a RayGrid, and each ray tests only the cells it
 * crosses: on a map of thousands of walls, testing every wall from each of
 * thousands of rays took seconds.
 */
const RAY_GRID_FROM = 200;

/** The ray grid's smallest cell, in pixels, and the most cells along either side. */
const RAY_GRID_MIN_CELL = 64;
const RAY_GRID_MAX_CELLS_PER_SIDE = 128;

/** The map cut into square cells, each holding the segments that pass through it. */
interface RayGrid {
  cellSize: number;
  cols: number;
  rows: number;
  /** By column * rows + row; a cell no segment crosses holds nothing. */
  cells: Array<Seg[] | undefined>;
  /** Every segment, for a ray that leaves the grid. */
  segments: Seg[];
}

/**
 * File each segment under every cell it passes through, and under the cells
 * either side of a boundary it lies within a hair of, so rounding never hides
 * a segment from a ray that meets it. Whatever lies past the map's edges is
 * filed under the edge cells nearest it, as WallGrid does, so the cost
 * depends on the map and never on how far a wall's coordinates reach.
 */
function buildRayGrid(segments: Seg[], mapWidth: number, mapHeight: number): RayGrid {
  const cellSize = Math.max(RAY_GRID_MIN_CELL, Math.max(mapWidth, mapHeight) / RAY_GRID_MAX_CELLS_PER_SIDE);
  const cols = Math.max(1, Math.ceil(mapWidth / cellSize));
  const rows = Math.max(1, Math.ceil(mapHeight / cellSize));
  const cells: Array<Seg[] | undefined> = new Array(cols * rows);
  const pad = cellSize * 1e-6;
  const col = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor(x / cellSize)));
  const row = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor(y / cellSize)));

  for (const seg of segments) {
    // Left to right, so each column is visited once.
    const leftFirst = seg.ax <= seg.bx;
    const ax = leftFirst ? seg.ax : seg.bx;
    const ay = leftFirst ? seg.ay : seg.by;
    const bx = leftFirst ? seg.bx : seg.ax;
    const by = leftFirst ? seg.by : seg.ay;
    const firstCol = col(ax - pad);
    const lastCol = col(bx + pad);
    const slope = bx > ax ? (by - ay) / (bx - ax) : 0;
    for (let c = firstCol; c <= lastCol; c++) {
      // The stretch of the segment inside this column (the end columns take
      // whatever lies past the map's edge as well), and the rows it covers.
      const left = c === firstCol ? ax : Math.max(ax, c * cellSize - pad);
      const right = c === lastCol ? bx : Math.min(bx, (c + 1) * cellSize + pad);
      const yLeft = bx > ax ? ay + (left - ax) * slope : ay;
      const yRight = bx > ax ? ay + (right - ax) * slope : by;
      const lastRow = row(Math.max(yLeft, yRight) + pad);
      for (let r = row(Math.min(yLeft, yRight) - pad); r <= lastRow; r++) {
        const key = c * rows + r;
        const bucket = cells[key];
        if (bucket) bucket.push(seg);
        else cells[key] = [seg];
      }
    }
  }
  return { cellSize, cols, rows, cells, segments };
}

/**
 * castRay through the grid: walk the cells the ray crosses, nearest first,
 * and stop at the first cell that holds a hit no farther than where the ray
 * leaves it. Every segment met before that point lies in a cell already
 * walked, so the nearest hit, and the point, are exactly castRay's. The
 * viewer must be on the map. A ray that leaves the grid unstopped (one from
 * the map's edge, grazing it) tests every segment, as castRay does, because
 * what it meets lies off the map.
 */
function castRayThroughGrid(
  ox: number, oy: number,
  angle: number,
  grid: RayGrid,
  maxDist: number
): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const { cellSize, cols, rows, cells } = grid;
  let cx = Math.min(cols - 1, Math.max(0, Math.floor(ox / cellSize)));
  let cy = Math.min(rows - 1, Math.max(0, Math.floor(oy / cellSize)));
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  // How far along the ray a whole cell is, across and down, and how far it
  // is to the next column and row boundary.
  const tDeltaX = dx !== 0 ? Math.abs(cellSize / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(cellSize / dy) : Infinity;
  let tMaxX = dx > 0 ? ((cx + 1) * cellSize - ox) / dx : dx < 0 ? (cx * cellSize - ox) / dx : Infinity;
  let tMaxY = dy > 0 ? ((cy + 1) * cellSize - oy) / dy : dy < 0 ? (cy * cellSize - oy) / dy : Infinity;
  let minT = maxDist;

  for (;;) {
    const bucket = cells[cx * rows + cy];
    if (bucket) {
      for (const seg of bucket) {
        const t = raySegmentHit(ox, oy, dx, dy, seg);
        if (t < minT) minT = t;
      }
    }
    if (tMaxX < tMaxY) {
      if (minT <= tMaxX) break;
      cx += stepX;
      if (cx < 0 || cx >= cols) return castRay(ox, oy, angle, grid.segments, maxDist);
      tMaxX += tDeltaX;
    } else {
      if (minT <= tMaxY) break;
      cy += stepY;
      if (cy < 0 || cy >= rows) return castRay(ox, oy, angle, grid.segments, maxDist);
      tMaxY += tDeltaY;
    }
  }

  return { x: ox + dx * minT, y: oy + dy * minT };
}

/**
 * Compute the visibility polygon from `viewerPos` given `walls`.
 *
 * @param viewerPos   Token center in map-space pixels
 * @param walls       All wall segments on the map
 * @param mapWidth    Map image width in pixels (bounding box)
 * @param mapHeight   Map image height in pixels
 * @param sightRadius How far the viewer can see in pixels (0 = full map)
 * @returns VisibilityPolygon with sorted points, or polygon of whole map if no blockers
 */
export function computeVisibility(
  viewerPos: Point,
  walls: WallSegment[],
  mapWidth: number,
  mapHeight: number,
  sightRadius = 0
): VisibilityPolygon {
  const { x: ox, y: oy } = viewerPos;
  const maxDist = sightRadius > 0 ? sightRadius : Math.hypot(mapWidth, mapHeight) * 1.1;

  // Build blocking segment list
  const blockingSegs: Seg[] = [];

  // 1. Bounding walls (map border)
  blockingSegs.push(
    { ax: 0, ay: 0, bx: mapWidth, by: 0 },          // top
    { ax: mapWidth, ay: 0, bx: mapWidth, by: mapHeight }, // right
    { ax: mapWidth, ay: mapHeight, bx: 0, by: mapHeight }, // bottom
    { ax: 0, ay: mapHeight, bx: 0, by: 0 },          // left
  );

  // 2. Map walls (only blocking types)
  // For large maps (>200 segments) use the spatial grid to pre-filter candidates
  // to only those within the viewer's sight range, skipping distant walls entirely.
  const candidateWalls = walls.length > 200
    ? new WallGrid(walls, 256, mapWidth, mapHeight).query(ox, oy, maxDist)
    : walls;
  for (const w of candidateWalls) {
    if (w.type === 'wall' || w.type === 'door-closed' || w.type === 'door-locked') {
      blockingSegs.push({ ax: w.x1, ay: w.y1, bx: w.x2, by: w.y2 });
    }
  }

  // 3. Collect candidate angles from all segment endpoints
  const endpoints: [number, number][] = [];
  for (const seg of blockingSegs) {
    endpoints.push([seg.ax, seg.ay]);
    endpoints.push([seg.bx, seg.by]);
  }

  const angles: number[] = [];
  for (const [px, py] of endpoints) {
    const angle = Math.atan2(py - oy, px - ox);
    angles.push(angle - 0.0001, angle, angle + 0.0001);
  }

  // When the view is range-limited (e.g. a light source or a token's sight
  // radius), wall endpoints alone aren't enough to approximate a circular
  // boundary in open areas — with no nearby walls only the 4 map corners
  // contribute angles, producing a quadrilateral fan instead of a disc.
  // Add evenly-spaced perimeter samples so the capped polygon is round.
  if (sightRadius > 0) {
    const PERIMETER_SAMPLES = 64;
    const step = (Math.PI * 2) / PERIMETER_SAMPLES;
    for (let i = 0; i < PERIMETER_SAMPLES; i++) {
      angles.push(-Math.PI + i * step);
    }
  }

  // 4. Cast a ray for each angle and collect intersection points. Through a
  // grid when many walls block (the four map edges aside), built once for all
  // the rays, and only from a viewer on the map, inside the grid, among walls
  // with real coordinates; otherwise every ray tests every segment.
  const grid = blockingSegs.length - 4 > RAY_GRID_FROM
    && Number.isFinite(mapWidth) && Number.isFinite(mapHeight) && mapWidth > 0 && mapHeight > 0
    && ox >= 0 && oy >= 0 && ox <= mapWidth && oy <= mapHeight
    && blockingSegs.every((s) => Number.isFinite(s.ax) && Number.isFinite(s.ay) && Number.isFinite(s.bx) && Number.isFinite(s.by))
    ? buildRayGrid(blockingSegs, mapWidth, mapHeight)
    : null;
  const points: Array<{ angle: number; point: Point }> = [];
  for (const angle of angles) {
    const pt = grid
      ? castRayThroughGrid(ox, oy, angle, grid, maxDist)
      : castRay(ox, oy, angle, blockingSegs, maxDist);
    points.push({ angle, point: pt });
  }

  // 5. Sort by angle
  points.sort((a, b) => a.angle - b.angle);

  // 6. Deduplicate nearly identical points (within 0.5px)
  const deduped: Point[] = [];
  for (const { point } of points) {
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1];
      if (Math.abs(point.x - prev.x) < 0.5 && Math.abs(point.y - prev.y) < 0.5) continue;
    }
    deduped.push(point);
  }

  return { points: deduped };
}

/**
 * Point-in-polygon test using the ray casting method.
 * Returns true if `point` is inside `visibilityPolygon`.
 */
export function isPointVisible(point: Point, visibilityPolygon: VisibilityPolygon): boolean {
  const { x, y } = point;
  const poly = visibilityPolygon.points;
  const n = poly.length;
  if (n < 3) return false;

  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

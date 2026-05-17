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
 * Returns { t, u } where t is ray parameter and u is segment parameter,
 * or null if no intersection exists.
 */
function raySegmentIntersect(
  ox: number, oy: number,
  dx: number, dy: number,
  ax: number, ay: number,
  bx: number, by: number
): { t: number; u: number } | null {
  const denom = dx * (by - ay) - dy * (bx - ax);
  if (Math.abs(denom) < 1e-10) return null; // parallel

  const t = ((ax - ox) * (by - ay) - (ay - oy) * (bx - ax)) / denom;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;

  if (t < 0 || u < 0 || u > 1) return null;
  return { t, u };
}

/**
 * Find the nearest blocking intersection along a ray.
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
    const hit = raySegmentIntersect(ox, oy, dx, dy, seg.ax, seg.ay, seg.bx, seg.by);
    if (hit && hit.t < minT) minT = hit.t;
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
    ? new WallGrid(walls, 256).query(ox, oy, maxDist)
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

  // 4. Cast a ray for each angle and collect intersection points
  const points: Array<{ angle: number; point: Point }> = [];
  for (const angle of angles) {
    const pt = castRay(ox, oy, angle, blockingSegs, maxDist);
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
export function isPointVisible(
  point: Point,
  _viewerPos: Point,
  visibilityPolygon: VisibilityPolygon
): boolean {
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

/**
 * Server-Side Raycasting Visibility Algorithm
 *
 * This is an intentional port of frontend/src/utils/raycasting.ts to the backend.
 * The client version exists for real-time rendering; this version exists for
 * authoritative server-side token visibility filtering (security boundary).
 *
 * When a map has lightingEnabled=true, only tokens within a player's visibility
 * polygon are included in WebSocket payloads sent to that player.
 */

import type { WallSegment } from '../types/walls';
import { WallGrid } from './spatialIndex';

export interface Point { x: number; y: number; }
export interface VisibilityPolygon { points: Point[]; }

interface Seg { ax: number; ay: number; bx: number; by: number; }

function raySegmentIntersect(
  ox: number, oy: number,
  dx: number, dy: number,
  ax: number, ay: number,
  bx: number, by: number
): { t: number; u: number } | null {
  const denom = dx * (by - ay) - dy * (bx - ax);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((ax - ox) * (by - ay) - (ay - oy) * (bx - ax)) / denom;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return { t, u };
}

function castRay(ox: number, oy: number, angle: number, segments: Seg[], maxDist: number): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let minT = maxDist;
  for (const seg of segments) {
    const hit = raySegmentIntersect(ox, oy, dx, dy, seg.ax, seg.ay, seg.bx, seg.by);
    if (hit && hit.t < minT) minT = hit.t;
  }
  return { x: ox + dx * minT, y: oy + dy * minT };
}

export function computeVisibility(
  viewerPos: Point,
  walls: WallSegment[],
  mapWidth: number,
  mapHeight: number,
  sightRadius = 0
): VisibilityPolygon {
  const { x: ox, y: oy } = viewerPos;
  const maxDist = sightRadius > 0 ? sightRadius : Math.hypot(mapWidth, mapHeight) * 1.1;

  const blockingSegs: Seg[] = [
    { ax: 0, ay: 0, bx: mapWidth, by: 0 },
    { ax: mapWidth, ay: 0, bx: mapWidth, by: mapHeight },
    { ax: mapWidth, ay: mapHeight, bx: 0, by: mapHeight },
    { ax: 0, ay: mapHeight, bx: 0, by: 0 },
  ];

  const candidateWalls = walls.length > 200
    ? new WallGrid(walls, 256).query(ox, oy, maxDist)
    : walls;
  for (const w of candidateWalls) {
    if (w.type === 'wall' || w.type === 'door-closed' || w.type === 'door-locked') {
      blockingSegs.push({ ax: w.x1, ay: w.y1, bx: w.x2, by: w.y2 });
    }
  }

  const endpoints: [number, number][] = [];
  for (const seg of blockingSegs) {
    endpoints.push([seg.ax, seg.ay], [seg.bx, seg.by]);
  }

  const angles: number[] = [];
  for (const [px, py] of endpoints) {
    const angle = Math.atan2(py - oy, px - ox);
    angles.push(angle - 0.0001, angle, angle + 0.0001);
  }

  const points: Array<{ angle: number; point: Point }> = [];
  for (const angle of angles) {
    const pt = castRay(ox, oy, angle, blockingSegs, maxDist);
    points.push({ angle, point: pt });
  }

  points.sort((a, b) => a.angle - b.angle);

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

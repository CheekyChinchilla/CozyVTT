// ============================================
// Which drawing a point is on, for the eraser: the topmost one whose stroke
// passes within half its width and a tolerance of the point, or, filled,
// which holds it; a label by the box its words take. Pure, by the shapes the
// layer draws (drawingGeometry.ts), so what is hit is what is seen.
// ============================================

import type { Drawing } from '@/types/drawings';
import type { PointerKind } from './mapPointer';
import { arrowHead, labelBox, rotationCentre } from './drawingGeometry';

type Point = { x: number; y: number };

/** How near a stroke a press counts as on it, in screen pixels: a finger is less exact than a mouse or a pen. */
const TOLERANCE_CSS_PX: Record<PointerKind, number> = { mouse: 6, pen: 6, touch: 16 };

/** The tolerance for a press of this kind, in map pixels at this zoom. */
export function hitTolerance(kind: PointerKind, zoom: number): number {
  return TOLERANCE_CSS_PX[kind] / zoom;
}

function toSegment(p: Point, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / lengthSq));
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

function toPolyline(p: Point, points: ReadonlyArray<readonly [number, number]>, closed: boolean): number {
  if (points.length === 1) return Math.hypot(p.x - points[0][0], p.y - points[0][1]);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, toSegment(p, points[i - 1], points[i]));
  if (closed && points.length > 2) best = Math.min(best, toSegment(p, points[points.length - 1], points[0]));
  return best;
}

function insidePolygon(p: Point, points: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** An ellipse's curve as a closed line of 64 points, near enough to measure a press against. */
function ellipsePoints(a: readonly [number, number], b: readonly [number, number]): Array<[number, number]> {
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const rx = Math.abs(b[0] - a[0]) / 2;
  const ry = Math.abs(b[1] - a[1]) / 2;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

function rectPoints(a: readonly [number, number], b: readonly [number, number]): Array<[number, number]> {
  return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
}

/** Whether point `p`, in the drawing's own unturned frame, is on it. */
function onDrawing(p: Point, d: Drawing, tolerance: number): boolean {
  const reach = d.width / 2 + tolerance;
  const [a, b] = d.points;
  switch (d.kind) {
    case 'pen':
    case 'line':
      return toPolyline(p, d.points, false) <= reach;
    case 'arrow': {
      if (toPolyline(p, d.points, false) <= reach) return true;
      const head = arrowHead(d);
      if (!head) return false;
      const triangle: Array<[number, number]> = [[head.tip.x, head.tip.y], [head.left.x, head.left.y], [head.right.x, head.right.y]];
      return insidePolygon(p, triangle) || toPolyline(p, triangle, true) <= tolerance;
    }
    case 'rect':
    case 'ellipse':
    case 'polygon': {
      if (!a) return false;
      const outline = d.kind === 'polygon' ? d.points : b ? (d.kind === 'rect' ? rectPoints(a, b) : ellipsePoints(a, b)) : [a];
      if (toPolyline(p, outline, true) <= reach) return true;
      return d.fillColor !== null && outline.length > 2 && insidePolygon(p, outline);
    }
    case 'text': {
      const box = labelBox(d);
      return p.x >= box.minX - tolerance && p.x <= box.maxX + tolerance && p.y >= box.minY - tolerance && p.y <= box.maxY + tolerance;
    }
    default:
      return false;
  }
}

/** The point in a turned drawing's own frame: turned back about its centre. */
function unturned(p: Point, d: Drawing): Point {
  if (!d.rotation) return p;
  const c = rotationCentre(d);
  const angle = (-d.rotation * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: c.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
}

/**
 * The topmost of `drawings` (the last in drawing order) that map pixel
 * `point` is on, within `tolerance` map pixels (hitTolerance), or null.
 * The caller passes only the drawings its screen draws and its viewer may
 * erase.
 */
export function drawingAt(point: Point, drawings: readonly Drawing[], tolerance: number): Drawing | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (onDrawing(unturned(point, d), d, tolerance)) return d;
  }
  return null;
}

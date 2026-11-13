// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

// ============================================
// Pure geometry helpers for the map canvas
// Extracted from MapCanvas.tsx so the math is
// unit-testable and reusable by the upcoming draw-layer modules.
// ============================================

export interface Point {
  x: number;
  y: number;
}

/**
 * Calculate grid distance in feet between two positions.
 * flat: Chebyshev — every diagonal costs the same as a straight move (5E)
 * alternating: every second diagonal costs two squares instead of one (Fantasy d20:
 * 5 ft, then 10 ft, on 5 ft squares)
 */
export function calcGridDistance(
  dx: number,
  dy: number,
  feetPerSquare: number,
  diagonalRule: 'flat' | 'alternating'
): number {
  if (diagonalRule === 'alternating') {
    const diag = Math.min(dx, dy);
    const straight = Math.max(dx, dy) - diag;
    const diagCost = (diag + Math.floor(diag / 2)) * feetPerSquare;
    return diagCost + straight * feetPerSquare;
  }
  return Math.max(dx, dy) * feetPerSquare;
}

/** A distance over the grid: the squares crossed, and the feet they come to. */
export interface GridMeasure {
  squares: number;
  feet: number;
}

/**
 * The distance from square `from` to square `to` on a map: the larger of the
 * two steps in squares, a diagonal counting one, and the feet by the map's
 * diagonal rule. The ruler measures with it, and so does the readout of how
 * far a held token has come (map/tokenHold.ts), so the two never disagree.
 */
export function gridMeasure(
  from: Point,
  to: Point,
  feetPerSquare: number,
  diagonalRule: 'flat' | 'alternating'
): GridMeasure {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return { squares: Math.max(dx, dy), feet: calcGridDistance(dx, dy, feetPerSquare, diagonalRule) };
}

/**
 * A distance as the ruler and the held token's readout write it,
 * "15 ft  (3 sq)". The two spaces part the numbers on the ruler's canvas
 * label; a page shows them as one.
 */
export function gridDistanceLabel({ squares, feet }: GridMeasure): string {
  return `${feet} ft  (${squares} sq)`;
}

/**
 * Ramer–Douglas–Peucker polyline simplification.
 * Returns the subset of points needed to approximate the input polyline
 * within `epsilon` perpendicular distance.
 */
export function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let maxIdx = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lenSq = dx * dx + dy * dy;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    let d: number;
    if (lenSq === 0) {
      d = Math.hypot(p.x - first.x, p.y - first.y);
    } else {
      const t = Math.max(0, Math.min(1, ((p.x - first.x) * dx + (p.y - first.y) * dy) / lenSq));
      d = Math.hypot(p.x - (first.x + t * dx), p.y - (first.y + t * dy));
    }
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
  const right = douglasPeucker(points.slice(maxIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** Inclusive pixel bounds within which `gray` samples (±1px) are valid. */
export interface EdgeSnapRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Snap each point toward the nearest strong image edge using Sobel-style
 * gradient magnitude within a local search window. Pure core — the caller
 * supplies a `gray(x, y)` luminance sampler and the valid sampling region.
 * Points move only when a gradient scoring above the threshold (30) is found;
 * the score slightly favors edges closer to the original point.
 */
export function snapPointsToEdges(
  points: Point[],
  gray: (x: number, y: number) => number,
  region: EdgeSnapRegion,
  searchRadius: number
): Point[] {
  if (points.length < 2) return points;
  const r = Math.ceil(searchRadius);

  const result = [...points];
  for (let pi = 0; pi < points.length; pi++) {
    const pt = points[pi]!;
    const cx = Math.round(pt.x);
    const cy = Math.round(pt.y);
    const x0 = Math.max(region.minX, cx - r);
    const y0 = Math.max(region.minY, cy - r);
    const x1 = Math.min(region.maxX, cx + r);
    const y1 = Math.min(region.maxY, cy + r);
    if (x1 <= x0 || y1 <= y0) continue;

    let bestGrad = 0;
    let bestX = cx;
    let bestY = cy;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.hypot(px - cx, py - cy);
        if (dist > r) continue;
        const gx = gray(px + 1, py) - gray(px - 1, py);
        const gy = gray(px, py + 1) - gray(px, py - 1);
        const mag = Math.sqrt(gx * gx + gy * gy);
        const score = mag * (1 - dist / (r + 1) * 0.3);
        if (score > bestGrad) {
          bestGrad = score;
          bestX = px;
          bestY = py;
        }
      }
    }
    if (bestGrad > 30) {
      result[pi] = { x: bestX, y: bestY };
    }
  }
  return result;
}

/**
 * DOM wrapper around {@link snapPointsToEdges}: rasterizes the relevant
 * region of the map image into an offscreen canvas and snaps the points
 * against its luminance gradients.
 */
export function edgeSnapPoints(
  points: Point[],
  mapImage: HTMLImageElement,
  searchRadius: number
): Point[] {
  if (points.length < 2) return points;
  const imgW = mapImage.naturalWidth;
  const imgH = mapImage.naturalHeight;
  if (imgW === 0 || imgH === 0) return points;

  const r = Math.ceil(searchRadius);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of points) {
    minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
  }
  const roiX = Math.max(0, Math.floor(minX) - r - 1);
  const roiY = Math.max(0, Math.floor(minY) - r - 1);
  const roiW = Math.min(imgW, Math.ceil(maxX) + r + 2) - roiX;
  const roiH = Math.min(imgH, Math.ceil(maxY) + r + 2) - roiY;
  if (roiW <= 0 || roiH <= 0) return points;

  const offscreen = document.createElement('canvas');
  offscreen.width = roiW;
  offscreen.height = roiH;
  const octx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!octx) return points;
  octx.drawImage(mapImage, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH);
  const imgData = octx.getImageData(0, 0, roiW, roiH).data;

  const gray = (px: number, py: number) => {
    const lx = px - roiX;
    const ly = py - roiY;
    if (lx < 0 || lx >= roiW || ly < 0 || ly >= roiH) return 128;
    const i = (ly * roiW + lx) * 4;
    return imgData[i]! * 0.299 + imgData[i + 1]! * 0.587 + imgData[i + 2]! * 0.114;
  };

  return snapPointsToEdges(
    points,
    gray,
    { minX: roiX + 1, minY: roiY + 1, maxX: roiX + roiW - 2, maxY: roiY + roiH - 2 },
    searchRadius
  );
}

/**
 * What each of the first `count` diagonal steps costs in feet under a rule
 * (calcGridDistance), as Create Map and Edit Map list them beside the
 * alternating rule: 5/10/5/10 on 5 ft squares, 10/20/10/20 on 10 ft ones.
 */
export function diagonalStepCosts(
  feetPerSquare: number,
  diagonalRule: 'flat' | 'alternating',
  count = 4
): number[] {
  return Array.from({ length: count }, (_, i) =>
    calcGridDistance(i + 1, i + 1, feetPerSquare, diagonalRule) - calcGridDistance(i, i, feetPerSquare, diagonalRule));
}

/**
 * uvttExporter.ts
 * Export a CozyVTT map to Universal VTT (.uvtt) format.
 *
 * The UVTT format is JSON containing:
 *   - format       : version number (0.3)
 *   - resolution   : grid dimensions and pixels-per-grid
 *   - image        : base64-encoded map image
 *   - line_of_sight: wall polylines in grid-square units
 *   - portals      : door/window segments in grid-square units
 *   - lights       : light sources in grid-square units
 *
 * All CozyVTT coordinates are in pixels. We convert to grid-square units
 * by dividing by gridSizePx.
 */

import type { WallSegment, LightSource } from '../types/walls';
import logger from '../utils/logger';

// ── UVTT output types ─────────────────────────────────────────────────────────

interface UVTTPoint {
  x: number;
  y: number;
}

interface UVTTPortal {
  position: UVTTPoint;
  bounds: UVTTPoint[];
  closed: boolean;
  freestanding: boolean;
}

interface UVTTLight {
  position: UVTTPoint;
  range: number;
  intensity: number;
  color: string;
}

interface UVTTOutput {
  format: number;
  resolution: {
    map_origin: UVTTPoint;
    map_size: UVTTPoint;
    pixels_per_grid: number;
  };
  line_of_sight: UVTTPoint[][];
  portals: UVTTPortal[];
  lights: UVTTLight[];
  image: string;
}

// ── Export input ──────────────────────────────────────────────────────────────

export interface UVTTExportInput {
  mapWidth: number;        // grid squares
  mapHeight: number;       // grid squares
  gridSizePx: number;      // pixels per grid square
  wallSegments: WallSegment[];
  lights: LightSource[];
  imageBuffer: Buffer;     // raw image file bytes
  /** Original image width in pixels — used to calculate pixels_per_grid */
  imageWidthPx?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Round to 2 decimal places for clean UVTT output. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Merge individual wall segments into polylines where endpoints connect.
 * Two segments connect if one's end matches another's start (within a small epsilon).
 * Returns arrays of connected points.
 */
function mergeWallPolylines(segments: WallSegment[]): UVTTPoint[][] {
  if (segments.length === 0) return [];

  const EPSILON = 0.01; // grid-square units

  const pointsMatch = (a: UVTTPoint, b: UVTTPoint): boolean =>
    Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

  // Convert each segment to a 2-point polyline
  type Poly = UVTTPoint[];
  const polys: Poly[] = segments.map((s) => [
    { x: s.x1, y: s.y1 },
    { x: s.x2, y: s.y2 },
  ]);

  // Greedy merging: try to concatenate polylines that share endpoints
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        const a = polys[i];
        const b = polys[j];
        const aEnd = a[a.length - 1];
        const bStart = b[0];
        const bEnd = b[b.length - 1];
        const aStart = a[0];

        if (pointsMatch(aEnd, bStart)) {
          // a's end matches b's start → a + b (skip duplicate point)
          polys[i] = [...a, ...b.slice(1)];
          polys.splice(j, 1);
          merged = true;
          break;
        } else if (pointsMatch(aEnd, bEnd)) {
          // a's end matches b's end → a + reverse(b)
          polys[i] = [...a, ...b.slice(0, -1).reverse()];
          polys.splice(j, 1);
          merged = true;
          break;
        } else if (pointsMatch(aStart, bEnd)) {
          // b's end matches a's start → b + a
          polys[i] = [...b, ...a.slice(1)];
          polys.splice(j, 1);
          merged = true;
          break;
        } else if (pointsMatch(aStart, bStart)) {
          // both start at same point → reverse(b) + a
          polys[i] = [...b.reverse(), ...a.slice(1)];
          polys.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break; // restart outer loop after mutation
    }
  }

  return polys;
}

// ── Exporter ──────────────────────────────────────────────────────────────────

/**
 * Build a UVTT file buffer from CozyVTT map data.
 *
 * @returns Buffer containing the JSON UVTT file content
 */
export function buildUVTT(input: UVTTExportInput): Buffer {
  const { mapWidth, mapHeight, gridSizePx, wallSegments, lights, imageBuffer, imageWidthPx } = input;

  // Calculate pixels_per_grid from actual image dimensions if available
  const ppg = imageWidthPx && mapWidth > 0
    ? Math.round(imageWidthPx / mapWidth)
    : gridSizePx;

  // Separate walls from doors/portals
  const wallSegs = wallSegments.filter(
    (s) => s.type === 'wall' || s.type === 'window'
  );
  const doorSegs = wallSegments.filter(
    (s) => s.type === 'door-closed' || s.type === 'door-open' || s.type === 'door-locked'
  );

  // Convert wall segments to grid-square coordinates
  const wallsInGrid = wallSegs.map((s) => ({
    ...s,
    x1: round2(s.x1 / gridSizePx),
    y1: round2(s.y1 / gridSizePx),
    x2: round2(s.x2 / gridSizePx),
    y2: round2(s.y2 / gridSizePx),
  }));

  // Merge wall segments into polylines for cleaner UVTT output
  const lineOfSight = mergeWallPolylines(wallsInGrid);

  // Convert door segments to UVTT portal format
  const portals: UVTTPortal[] = doorSegs.map((s) => {
    const p1: UVTTPoint = { x: round2(s.x1 / gridSizePx), y: round2(s.y1 / gridSizePx) };
    const p2: UVTTPoint = { x: round2(s.x2 / gridSizePx), y: round2(s.y2 / gridSizePx) };
    return {
      position: {
        x: round2((p1.x + p2.x) / 2),
        y: round2((p1.y + p2.y) / 2),
      },
      bounds: [p1, p2],
      closed: s.type !== 'door-open',
      freestanding: false,
    };
  });

  // Convert light sources to UVTT format
  // Export using dimRadius as the UVTT range (total visible extent).
  // UVTT format only has a single range + intensity, so map bright/dim
  // back to the nearest approximation: range = dimRadius, intensity = 1.
  const uvttLights: UVTTLight[] = lights.filter((l) => l.enabled).map((l) => ({
    position: {
      x: round2(l.x / gridSizePx),
      y: round2(l.y / gridSizePx),
    },
    range: l.dimRadius,
    intensity: 1,
    color: l.color,
  }));

  // Encode image as base64 (no data URI prefix — raw base64 per UVTT convention)
  const imageBase64 = imageBuffer.toString('base64');

  const output: UVTTOutput = {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: mapWidth, y: mapHeight },
      pixels_per_grid: ppg,
    },
    line_of_sight: lineOfSight,
    portals,
    lights: uvttLights,
    image: imageBase64,
  };

  logger.info(
    `[uvtt-export] Exporting: ${mapWidth}×${mapHeight} grid, ${ppg} ppg, ` +
    `${lineOfSight.length} polylines, ${portals.length} portals, ${uvttLights.length} lights`
  );

  return Buffer.from(JSON.stringify(output), 'utf-8');
}

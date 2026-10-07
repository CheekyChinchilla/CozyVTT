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
  /** Not part of the format: other tools skip it, CozyVTT reads it back. */
  bright_range: number;
  /** Not part of the format: false for a light that is switched off. */
  enabled: boolean;
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

/** Two points are the same corner when they round to the same hundredth. */
const cornerKey = (p: UVTTPoint): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/**
 * Merge individual wall segments into polylines where endpoints connect.
 * Returns arrays of connected points.
 *
 * Each corner is looked up in a map from corner to the segments touching it,
 * so a chain is walked in one pass and the whole merge is linear in the number
 * of segments. At a corner where three or more segments meet, the chain
 * continues along whichever is found first and the others start chains of
 * their own; no segment is dropped or written twice.
 */
function mergeWallPolylines(segments: WallSegment[]): UVTTPoint[][] {
  const starts = segments.map((s) => ({ x: s.x1, y: s.y1 }));
  const ends = segments.map((s) => ({ x: s.x2, y: s.y2 }));
  const startKeys = starts.map(cornerKey);
  const endKeys = ends.map(cornerKey);

  // Segments touching each corner, as indices.
  const touching = new Map<string, number[]>();
  const touch = (key: string, index: number) => {
    const list = touching.get(key);
    if (list) list.push(index);
    else touching.set(key, [index]);
  };
  for (let i = 0; i < segments.length; i++) {
    touch(startKeys[i], i);
    touch(endKeys[i], i);
  }

  const used = new Array<boolean>(segments.length).fill(false);

  /** An unused segment at this corner, or -1. */
  const unusedAt = (key: string): number => {
    const list = touching.get(key);
    if (!list) return -1;
    // Spent entries are dropped from the end, so each is passed over once.
    while (list.length > 0 && used[list[list.length - 1]]) list.pop();
    return list.length > 0 ? list[list.length - 1] : -1;
  };

  const polys: UVTTPoint[][] = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;

    // Grow forwards from this segment's far end, then backwards from its near end.
    const forward: UVTTPoint[] = [ends[i]];
    let tailKey = endKeys[i];
    for (let next = unusedAt(tailKey); next !== -1; next = unusedAt(tailKey)) {
      used[next] = true;
      const startsHere = startKeys[next] === tailKey;
      forward.push(startsHere ? ends[next] : starts[next]);
      tailKey = startsHere ? endKeys[next] : startKeys[next];
    }

    const backward: UVTTPoint[] = [];
    let headKey = startKeys[i];
    for (let next = unusedAt(headKey); next !== -1; next = unusedAt(headKey)) {
      used[next] = true;
      const endsHere = endKeys[next] === headKey;
      backward.push(endsHere ? starts[next] : ends[next]);
      headKey = endsHere ? startKeys[next] : endKeys[next];
    }

    polys.push([...backward.reverse(), starts[i], ...forward]);
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

  // Separate walls from doors/portals. A window does not block sight, so it
  // goes out as an open portal: written into line_of_sight it would come back
  // as a solid wall. A locked door has no UVTT form and goes out closed.
  const wallSegs = wallSegments.filter((s) => s.type === 'wall');
  const doorSegs = wallSegments.filter(
    (s) => s.type === 'door-closed' || s.type === 'door-open' || s.type === 'door-locked' || s.type === 'window'
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
      closed: s.type !== 'door-open' && s.type !== 'window',
      freestanding: false,
    };
  });

  // Convert light sources to UVTT format. The format has one range and an
  // intensity: range is the dim radius, and a switched-off light gets
  // intensity 0 so other tools show it dark. The bright radius and the on/off
  // state are also written under their own keys so that CozyVTT can read them
  // back; every light is kept, on or off.
  const uvttLights: UVTTLight[] = lights.map((l) => ({
    position: {
      x: round2(l.x / gridSizePx),
      y: round2(l.y / gridSizePx),
    },
    range: l.dimRadius,
    intensity: l.enabled ? 1 : 0,
    color: l.color,
    bright_range: l.brightRadius,
    enabled: l.enabled,
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

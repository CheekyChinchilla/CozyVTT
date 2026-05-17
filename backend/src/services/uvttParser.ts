/**
 * uvttParser.ts
 * Parse Universal VTT (.uvtt / .dd2vtt) files into CozyVTT map + wall + light data.
 *
 * The UVTT format is JSON containing:
 *   - resolution  : grid dimensions and pixels-per-grid
 *   - image       : base64-encoded map image (PNG/WebP)
 *   - line_of_sight : array of polylines (wall segments) in grid-square units
 *   - portals     : array of door/window segments in grid-square units
 *   - lights      : array of light sources in grid-square units
 *
 * All coordinates in UVTT are in grid-square units. We convert to pixel coords
 * by multiplying by CozyVTT's gridSizePx (default 70).
 *
 * Supported by: Dungeondraft (.dd2vtt), DunGen, Dungeon Alchemist, Arkenforge, etc.
 */

import { randomUUID } from 'crypto';
import logger from '../utils/logger';
import type { WallSegment, LightSource } from '../types/walls';

// ── UVTT file types ────────────────────────────────────────────────────────────

interface UVTTPoint {
  x: number;
  y: number;
}

interface UVTTResolution {
  map_origin: UVTTPoint;
  map_size: UVTTPoint;      // grid dimensions (columns × rows)
  pixels_per_grid: number;
}

interface UVTTPortal {
  position: UVTTPoint;
  bounds: UVTTPoint[];
  closed?: boolean;
  freestanding?: boolean;
}

interface UVTTLight {
  position: UVTTPoint;
  range: number;          // radius in grid squares
  intensity?: number;     // 0.0–1.0
  color?: string;         // hex color string (may or may not have #)
}

interface UVTTFile {
  format?: number;
  resolution: UVTTResolution;
  line_of_sight: UVTTPoint[][];
  portals?: UVTTPortal[];
  lights?: unknown[];
  image: string;              // base64-encoded image data
  environment?: unknown;
}

// ── Parse result ───────────────────────────────────────────────────────────────

export interface UVTTParseResult {
  /** Grid width in squares */
  mapWidth: number;
  /** Grid height in squares */
  mapHeight: number;
  /** Source file's pixels-per-grid (informational) */
  sourcePixelsPerGrid: number;
  /** Map image as a Buffer (decoded from base64) */
  imageBuffer: Buffer;
  /** Image MIME type (best guess from magic bytes) */
  imageMimeType: string;
  /** Wall segments in pixel coordinates (using the provided gridSizePx) */
  wallSegments: WallSegment[];
  /** Light sources in pixel coordinates */
  lightSources: LightSource[];
  /** Number of wall segments from line_of_sight */
  wallCount: number;
  /** Number of door/portal segments */
  portalCount: number;
  /** Number of light sources */
  lightCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6})$/;

/** Normalize a color string to #rrggbb format, or return the default. */
function normalizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const m = HEX_COLOR_RE.exec(raw.trim());
  return m ? `#${m[1].toLowerCase()}` : fallback;
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Parse a UVTT/DD2VTT file buffer into CozyVTT map data.
 *
 * @param fileBuffer  The raw file contents (JSON text)
 * @param gridSizePx  CozyVTT grid size in pixels (default 70)
 */
export function parseUVTT(fileBuffer: Buffer, gridSizePx: number = 70): UVTTParseResult {
  // Parse the JSON
  let data: UVTTFile;
  try {
    data = JSON.parse(fileBuffer.toString('utf-8'));
  } catch {
    throw new Error('Invalid UVTT file: not valid JSON');
  }

  // Validate required fields
  if (!data.resolution) {
    throw new Error('Invalid UVTT file: missing "resolution" field');
  }
  if (!data.resolution.map_size || typeof data.resolution.map_size.x !== 'number') {
    throw new Error('Invalid UVTT file: missing or invalid "resolution.map_size"');
  }
  if (!data.image || typeof data.image !== 'string') {
    throw new Error('Invalid UVTT file: missing "image" field');
  }
  if (!Array.isArray(data.line_of_sight)) {
    throw new Error('Invalid UVTT file: missing "line_of_sight" array');
  }

  const mapWidth  = Math.round(data.resolution.map_size.x);
  const mapHeight = Math.round(data.resolution.map_size.y);
  const ppg       = data.resolution.pixels_per_grid || 140;

  logger.info(
    `[uvtt-parser] Parsing UVTT: ${mapWidth}×${mapHeight} grid, ` +
    `${ppg} px/grid, ${data.line_of_sight.length} polylines, ` +
    `${data.portals?.length ?? 0} portals, ${data.lights?.length ?? 0} lights`
  );

  // ── Decode image ───────────────────────────────────────────────────────────
  // The image field may or may not include a data URI prefix
  let imageBase64 = data.image;
  if (imageBase64.startsWith('data:')) {
    imageBase64 = imageBase64.split(',')[1] || imageBase64;
  }
  const imageBuffer = Buffer.from(imageBase64, 'base64');

  // Detect MIME type from magic bytes
  let imageMimeType = 'image/png';
  if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
    imageMimeType = 'image/jpeg';
  } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
    // RIFF header = WebP
    imageMimeType = 'image/webp';
  }

  // ── Convert line_of_sight polylines → WallSegments ─────────────────────────
  const wallSegments: WallSegment[] = [];
  let wallCount = 0;

  for (const polyline of data.line_of_sight) {
    if (!Array.isArray(polyline) || polyline.length < 2) continue;

    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i];
      const b = polyline[i + 1];
      if (typeof a?.x !== 'number' || typeof a?.y !== 'number') continue;
      if (typeof b?.x !== 'number' || typeof b?.y !== 'number') continue;

      wallSegments.push({
        id: randomUUID(),
        x1: Math.round(a.x * gridSizePx),
        y1: Math.round(a.y * gridSizePx),
        x2: Math.round(b.x * gridSizePx),
        y2: Math.round(b.y * gridSizePx),
        type: 'wall',
      });
      wallCount++;
    }
  }

  // ── Convert portals → door WallSegments ────────────────────────────────────
  let portalCount = 0;

  if (Array.isArray(data.portals)) {
    for (const portal of data.portals) {
      if (!Array.isArray(portal?.bounds) || portal.bounds.length < 2) continue;

      const a = portal.bounds[0];
      const b = portal.bounds[1];
      if (typeof a?.x !== 'number' || typeof a?.y !== 'number') continue;
      if (typeof b?.x !== 'number' || typeof b?.y !== 'number') continue;

      wallSegments.push({
        id: randomUUID(),
        x1: Math.round(a.x * gridSizePx),
        y1: Math.round(a.y * gridSizePx),
        x2: Math.round(b.x * gridSizePx),
        y2: Math.round(b.y * gridSizePx),
        type: portal.closed === false ? 'door-open' : 'door-closed',
      });
      portalCount++;
    }
  }

  // ── Convert lights → LightSource objects ───────────────────────────────────
  const lightSources: LightSource[] = [];
  let lightCount = 0;

  if (Array.isArray(data.lights)) {
    for (const raw of data.lights) {
      const light = raw as UVTTLight;
      if (typeof light?.position?.x !== 'number' || typeof light?.position?.y !== 'number') continue;
      if (typeof light?.range !== 'number' || light.range <= 0) continue;

      // UVTT files provide a single range — treat as dim (total) radius,
      // bright is half that (matching D&D 5e torch pattern: 20ft bright / 40ft dim).
      const dimR = light.range;
      const brightR = Math.max(0, dimR * 0.5);
      lightSources.push({
        id: randomUUID(),
        x: Math.round(light.position.x * gridSizePx),
        y: Math.round(light.position.y * gridSizePx),
        brightRadius: brightR,
        dimRadius: dimR,
        color: normalizeColor(light.color, '#ffcc66'),
        enabled: true,
      });
      lightCount++;
    }
  }

  logger.info(
    `[uvtt-parser] Parsed: ${wallCount} walls, ${portalCount} portals, ${lightCount} lights → ` +
    `${wallSegments.length} total wall segments, ${lightSources.length} light sources`
  );

  return {
    mapWidth,
    mapHeight,
    sourcePixelsPerGrid: ppg,
    imageBuffer,
    imageMimeType,
    wallSegments,
    lightSources,
    wallCount,
    portalCount,
    lightCount,
  };
}

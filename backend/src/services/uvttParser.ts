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
import { MAX_WALL_SEGMENTS, MAX_LIGHT_SOURCES } from '../validators/walls';

// ── UVTT file types ────────────────────────────────────────────────────────────

interface UVTTPoint {
  x: number;
  y: number;
}

interface UVTTResolution {
  /** Where this picture sits in the source map's grid space. Often absent. */
  map_origin?: UVTTPoint;
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
  /** Written by CozyVTT: the bright radius, in grid squares. Other tools omit it. */
  bright_range?: number;
  /** Written by CozyVTT: false for a light that is switched off. */
  enabled?: boolean;
}

interface UVTTFile {
  format?: number;
  resolution: UVTTResolution;
  line_of_sight: UVTTPoint[][];
  /** Walls belonging to objects: furniture, pillars, crates. Dungeondraft 1.0+. */
  objects_line_of_sight?: UVTTPoint[][];
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
  /**
   * Map image as a Buffer, decoded from the file's base64.
   *
   * Deliberately unidentified here. This used to carry a guess from two magic
   * bytes, with PNG as the silent default, and the import stored that guess as
   * the asset's type. The import route asks `file-type` instead, so anything
   * that is not really an image is refused rather than filed as a PNG.
   */
  imageBuffer: Buffer;
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
  /**
   * Wall segments the file keeps in `objects_line_of_sight`: furniture,
   * pillars, crates. Counted whether or not they were imported, so the import
   * can offer them. Included in `wallCount` only when they were asked for.
   */
  objectWallCount: number;
  /**
   * Geometry that lies outside the map image.
   *
   * A UVTT holds one image and the geometry that belongs with it. Some
   * exporters crop the image to part of the map and write out the geometry for
   * all of it, which imports as a map with bare areas and walls that cannot do
   * anything, since sight is clipped to the map's own edges. Counting it lets
   * the import say so before the DM is left wondering.
   *
   * A wall counts only when both of its ends are outside; one end over the line
   * is how a building meets the edge of its own picture.
   */
  outOfBounds: UVTTOutOfBounds;
}

export interface UVTTOutOfBounds {
  walls: number;
  doors: number;
  lights: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6})$/;

/**
 * Eight digits, which UVTT writes as AARRGGBB: alpha first, then the colour.
 *
 * Dropping the leading pair is what the reference importers do. Taking the
 * trailing pair instead would silently return a different colour, so the two
 * patterns are kept apart rather than folded into one loose match.
 */
const ARGB_COLOR_RE = /^#?[0-9a-fA-F]{2}([0-9a-fA-F]{6})$/;

/**
 * Normalize a color string to #rrggbb, or return the default.
 *
 * CozyVTT lights carry no alpha of their own, so an alpha channel is read and
 * discarded rather than folded into the colour.
 */
function normalizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  const m = HEX_COLOR_RE.exec(trimmed) ?? ARGB_COLOR_RE.exec(trimmed);
  return m ? `#${m[1].toLowerCase()}` : fallback;
}

/** How a caller wants the file read. */
export interface UVTTParseOptions {
  /**
   * Bring in the walls belonging to objects. Off by default: they block sight
   * like any other wall, but whether a table or a crate should is the DM's
   * call, so the import asks rather than deciding.
   */
  includeObjectWalls?: boolean;
  /**
   * Largest picture, in bytes once decoded. A longer one is refused from the
   * length of its base64 text, before it is decoded. Unset means no ceiling.
   */
  maxImageBytes?: number;
}

/**
 * Move a point out of the source map's grid space and into the picture's.
 *
 * UVTT coordinates are absolute in the map the picture was taken from, and
 * `map_origin` says where the picture starts. An export of a whole map leaves
 * the origin at 0,0 and this changes nothing; an export of a region does not,
 * and without this every wall lands `map_origin` squares away from where it
 * belongs.
 */
function toPictureSpace(p: UVTTPoint, origin: UVTTPoint): UVTTPoint {
  return { x: p.x - origin.x, y: p.y - origin.y };
}

/** Whether a point in grid units falls outside the map image. */
function isOutside(p: { x: number; y: number }, mapWidth: number, mapHeight: number): boolean {
  return p.x < 0 || p.y < 0 || p.x > mapWidth || p.y > mapHeight;
}

/**
 * The most values a UVTT file may hold, where each point, door, light and
 * setting is a few. A map takes at most 5,000 walls and 200 lights, a few tens
 * of thousands of values; Dungeondraft's furniture walls stay in the file even
 * when they are left out, and can add a few hundred thousand more. Reading 2.7
 * million points as JSON took the backend past its memory limit.
 */
export const MAX_UVTT_JSON_VALUES = 1_000_000;

/**
 * Whether the JSON in `bytes` holds more than `max` values, counted without
 * parsing it: one for each object or list opened and one for each comma,
 * outside strings. JSON's structural characters are ASCII, and no byte of a
 * multi-byte UTF-8 character is, so the bytes are read as they are.
 */
function holdsMoreValuesThan(bytes: Buffer, max: number): boolean {
  let count = 0;
  let inString = false;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (inString) {
      if (c === 0x5c) i++; // a backslash escapes the next character
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) {
      inString = true;
    } else if (c === 0x7b || c === 0x5b || c === 0x2c) {
      if (++count > max) return true;
    }
  }
  return false;
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Parse a UVTT/DD2VTT file buffer into CozyVTT map data.
 *
 * @param fileBuffer  The raw file contents (JSON text)
 * @param gridSizePx  CozyVTT grid size in pixels (default 70)
 */
export function parseUVTT(
  fileBuffer: Buffer,
  gridSizePx: number = 70,
  options: UVTTParseOptions = {}
): UVTTParseResult {
  // Counted from the bytes, because parsing a file with millions of points
  // is itself what runs out of memory.
  if (holdsMoreValuesThan(fileBuffer, MAX_UVTT_JSON_VALUES)) {
    throw new Error(
      `This file holds more than ${MAX_UVTT_JSON_VALUES.toLocaleString('en-US')} points, doors, lights and settings, ` +
        'far more than a map can hold. Split it into smaller maps in the tool that made it.'
    );
  }

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

  // ── Refuse what cannot become a map, before building anything ──────────────
  // A file can hold many more points than a map takes and still pass the
  // count above. Counting from the parsed arrays costs nothing; making a
  // segment and an id for each one first would double what parsing built.
  const objectWallsRaw = Array.isArray(data.objects_line_of_sight) ? data.objects_line_of_sight : [];
  const countSegments = (polylines: unknown[]): number =>
    polylines.reduce<number>(
      (total, polyline) => total + (Array.isArray(polyline) ? Math.max(0, polyline.length - 1) : 0),
      0
    );
  const lineWallTotal = countSegments(data.line_of_sight);
  const objectWallTotal = countSegments(objectWallsRaw);
  const doorTotal = Array.isArray(data.portals) ? data.portals.length : 0;
  const wallTotal = lineWallTotal + doorTotal + (options.includeObjectWalls ? objectWallTotal : 0);
  if (wallTotal > MAX_WALL_SEGMENTS) {
    throw new Error(
      `This file has ${wallTotal} wall segments, more than a map can hold (${MAX_WALL_SEGMENTS}). ` +
        (options.includeObjectWalls && objectWallTotal > 0 && lineWallTotal + doorTotal <= MAX_WALL_SEGMENTS
          ? 'Importing without its furniture walls may bring it under the limit.'
          : 'Split it into smaller maps in the tool that made it.')
    );
  }
  const lightTotal = Array.isArray(data.lights) ? data.lights.length : 0;
  if (lightTotal > MAX_LIGHT_SOURCES) {
    throw new Error(
      `This file has ${lightTotal} lights, more than a map can hold (${MAX_LIGHT_SOURCES} lights). ` +
        'Split it into smaller maps in the tool that made it.'
    );
  }

  const mapWidth  = Math.round(data.resolution.map_size.x);
  const mapHeight = Math.round(data.resolution.map_size.y);
  const ppg       = data.resolution.pixels_per_grid || 140;

  // Absent on most files, and zero on a whole-map export. See toPictureSpace.
  const rawOrigin = data.resolution.map_origin;
  const origin: UVTTPoint = {
    x: typeof rawOrigin?.x === 'number' ? rawOrigin.x : 0,
    y: typeof rawOrigin?.y === 'number' ? rawOrigin.y : 0,
  };

  // The format has been 0.2 or 0.3 in the wild and the fields we read have not
  // moved between them. A version we have never seen is worth a line in the log
  // rather than a refusal: the file may well be readable, and refusing outright
  // would strand a user on a tool that upgraded before we did.
  if (typeof data.format === 'number' && data.format > 0.3) {
    logger.warn(
      `[uvtt-parser] Unfamiliar UVTT format ${data.format}; reading it as 0.3. ` +
      'Some of the file may be ignored.'
    );
  }

  logger.info(
    `[uvtt-parser] Parsing UVTT: ${mapWidth}×${mapHeight} grid, ` +
    `${ppg} px/grid, ${data.line_of_sight.length} polylines, ` +
    `${data.portals?.length ?? 0} portals, ${data.lights?.length ?? 0} lights`
  );

  // ── Decode image ───────────────────────────────────────────────────────────
  // The image field may or may not include a data URI prefix
  // The prefix is cut with indexOf and slice: split would copy the whole
  // picture again as a separate string. The length is checked before decoding,
  // so a picture over the limit never becomes a second full-size buffer.
  let imageBase64 = data.image;
  if (imageBase64.startsWith('data:')) {
    const comma = imageBase64.indexOf(',');
    if (comma !== -1 && comma < imageBase64.length - 1) imageBase64 = imageBase64.slice(comma + 1);
  }
  if (options.maxImageBytes !== undefined) {
    // Three bytes per four characters, less the padding.
    let digits = imageBase64.length;
    while (digits > 0 && imageBase64.charCodeAt(digits - 1) === 61) digits--;
    if (Math.floor((digits * 3) / 4) > options.maxImageBytes) {
      const limitMB = Math.round(options.maxImageBytes / (1024 * 1024));
      throw new Error(`The picture inside this file is too large. Maps must be smaller than ${limitMB}MB.`);
    }
  }
  const imageBuffer = Buffer.from(imageBase64, 'base64');

  // ── Convert line_of_sight polylines → WallSegments ─────────────────────────
  const wallSegments: WallSegment[] = [];
  let wallCount = 0;
  const outOfBounds: UVTTOutOfBounds = { walls: 0, doors: 0, lights: 0 };

  const objectWalls = objectWallsRaw;
  const objectWallCount = objectWallTotal;
  const polylines = options.includeObjectWalls
    ? [...data.line_of_sight, ...objectWalls]
    : data.line_of_sight;

  for (const polyline of polylines) {
    if (!Array.isArray(polyline) || polyline.length < 2) continue;

    for (let i = 0; i < polyline.length - 1; i++) {
      const rawA = polyline[i];
      const rawB = polyline[i + 1];
      if (typeof rawA?.x !== 'number' || typeof rawA?.y !== 'number') continue;
      if (typeof rawB?.x !== 'number' || typeof rawB?.y !== 'number') continue;
      const a = toPictureSpace(rawA, origin);
      const b = toPictureSpace(rawB, origin);

      wallSegments.push({
        id: randomUUID(),
        x1: Math.round(a.x * gridSizePx),
        y1: Math.round(a.y * gridSizePx),
        x2: Math.round(b.x * gridSizePx),
        y2: Math.round(b.y * gridSizePx),
        type: 'wall',
      });
      wallCount++;
      if (isOutside(a, mapWidth, mapHeight) && isOutside(b, mapWidth, mapHeight)) {
        outOfBounds.walls++;
      }
    }
  }

  // ── Convert portals → door WallSegments ────────────────────────────────────
  let portalCount = 0;

  if (Array.isArray(data.portals)) {
    for (const portal of data.portals) {
      if (!Array.isArray(portal?.bounds) || portal.bounds.length < 2) continue;

      const rawA = portal.bounds[0];
      const rawB = portal.bounds[1];
      if (typeof rawA?.x !== 'number' || typeof rawA?.y !== 'number') continue;
      if (typeof rawB?.x !== 'number' || typeof rawB?.y !== 'number') continue;
      const a = toPictureSpace(rawA, origin);
      const b = toPictureSpace(rawB, origin);

      wallSegments.push({
        id: randomUUID(),
        x1: Math.round(a.x * gridSizePx),
        y1: Math.round(a.y * gridSizePx),
        x2: Math.round(b.x * gridSizePx),
        y2: Math.round(b.y * gridSizePx),
        type: portal.closed === false ? 'door-open' : 'door-closed',
      });
      portalCount++;
      if (isOutside(a, mapWidth, mapHeight) && isOutside(b, mapWidth, mapHeight)) {
        outOfBounds.doors++;
      }
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
      // CozyVTT's own export carries the real bright radius and whether the
      // light was on. Files from other tools have neither.
      const brightR =
        typeof light.bright_range === 'number' && light.bright_range >= 0
          ? Math.min(light.bright_range, dimR)
          : Math.max(0, dimR * 0.5);
      const position = toPictureSpace(light.position, origin);
      lightSources.push({
        id: randomUUID(),
        x: Math.round(position.x * gridSizePx),
        y: Math.round(position.y * gridSizePx),
        brightRadius: brightR,
        dimRadius: dimR,
        color: normalizeColor(light.color, '#ffcc66'),
        enabled: light.enabled !== false,
      });
      lightCount++;
      if (isOutside(position, mapWidth, mapHeight)) {
        outOfBounds.lights++;
      }
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
    wallSegments,
    lightSources,
    wallCount,
    portalCount,
    lightCount,
    objectWallCount,
    outOfBounds,
  };
}

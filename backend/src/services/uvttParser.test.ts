/**
 * Reading a UVTT file, and noticing when its picture does not cover its walls.
 *
 * A UVTT holds one map image and the geometry that goes with it. Some exporters
 * crop the image to part of the map and then write out the walls for all of it,
 * which imports as a map with bare areas the DM cannot explain. The parser
 * counts that geometry so the import can ask before going ahead.
 *
 * A wall counts as outside only when **both** ends are. Walls that sit on the
 * map's edge are ordinary, and one endpoint a hair over the line must not set
 * the whole thing off.
 */

import { randomUUID } from 'crypto';
import { parseUVTT } from './uvttParser';

// Wrapped so a test can see whether the parser made an id for anything.
jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, randomUUID: jest.fn(actual.randomUUID) };
});
const uuidMock = randomUUID as unknown as jest.Mock;

/** A 1x1 PNG, enough for the parser to decode and sniff. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

type Point = { x: number; y: number };

function uvtt(overrides: {
  mapSize?: Point;
  mapOrigin?: Point;
  lineOfSight?: Point[][];
  objectsLineOfSight?: Point[][];
  portals?: { bounds: Point[]; closed?: boolean }[];
  lights?: { position: Point; range: number; color?: string }[];
  format?: number;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: overrides.format ?? 0.3,
      resolution: {
        map_origin: overrides.mapOrigin ?? { x: 0, y: 0 },
        map_size: overrides.mapSize ?? { x: 10, y: 10 },
        pixels_per_grid: 140,
      },
      line_of_sight: overrides.lineOfSight ?? [],
      objects_line_of_sight: overrides.objectsLineOfSight ?? [],
      portals: overrides.portals ?? [],
      lights: overrides.lights ?? [],
      environment: { baked_lighting: false, ambient_light: '00000000' },
      image: PNG_BASE64,
    })
  );
}

/** Move a polyline by (dx, dy), for building an offset-export fixture. */
const shift = (points: Point[], dx: number, dy: number): Point[] =>
  points.map((p) => ({ x: p.x + dx, y: p.y + dy }));

/** A square of wall starting at (ox, oy), one grid square on a side. */
const square = (ox: number, oy: number): Point[] => [
  { x: ox, y: oy },
  { x: ox + 1, y: oy },
  { x: ox + 1, y: oy + 1 },
  { x: ox, y: oy + 1 },
  { x: ox, y: oy },
];

describe('parseUVTT', () => {
  describe('geometry the map image covers', () => {
    it('reports nothing out of bounds for a map that fits', () => {
      const result = parseUVTT(uvtt({ lineOfSight: [square(2, 2)] }));
      expect(result.outOfBounds).toEqual({ walls: 0, doors: 0, lights: 0 });
    });

    it('leaves a wall running along the map edge alone', () => {
      const edge: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ];
      expect(parseUVTT(uvtt({ lineOfSight: [edge] })).outOfBounds.walls).toBe(0);
    });

    it('leaves a wall with one end just over the line alone', () => {
      // Half outside is how a building meets the edge of its own picture.
      const straddling: Point[] = [
        { x: 9, y: 5 },
        { x: 11, y: 5 },
      ];
      expect(parseUVTT(uvtt({ lineOfSight: [straddling] })).outOfBounds.walls).toBe(0);
    });
  });

  describe('geometry the map image does not cover', () => {
    it('counts a wall whose both ends are past the right edge', () => {
      const result = parseUVTT(uvtt({ lineOfSight: [square(20, 2)] }));
      // A closed square is four segments.
      expect(result.outOfBounds.walls).toBe(4);
      expect(result.wallCount).toBe(4);
    });

    it('counts a wall at negative coordinates, which is how a crop reads', () => {
      expect(parseUVTT(uvtt({ lineOfSight: [square(-5, 2)] })).outOfBounds.walls).toBe(4);
    });

    it('counts doors and lights separately from walls', () => {
      const result = parseUVTT(
        uvtt({
          lineOfSight: [square(20, 2)],
          portals: [{ bounds: [{ x: 21, y: 3 }, { x: 21, y: 4 }] }],
          lights: [{ position: { x: 22, y: 3 }, range: 4 }],
        })
      );
      expect(result.outOfBounds).toEqual({ walls: 4, doors: 1, lights: 1 });
    });

    it('counts only what is outside when a file holds both', () => {
      const result = parseUVTT(uvtt({ lineOfSight: [square(2, 2), square(20, 2)] }));
      expect(result.wallCount).toBe(8);
      expect(result.outOfBounds.walls).toBe(4);
    });

    it('still returns every segment, because nothing is discarded', () => {
      const result = parseUVTT(uvtt({ lineOfSight: [square(2, 2), square(20, 2)] }));
      expect(result.wallSegments).toHaveLength(8);
    });
  });

  describe('the shape of what it returns', () => {
    it('converts grid units to pixels with the given grid size', () => {
      const result = parseUVTT(uvtt({ lineOfSight: [[{ x: 1, y: 2 }, { x: 3, y: 4 }]] }), 70);
      expect(result.wallSegments[0]).toMatchObject({ x1: 70, y1: 140, x2: 210, y2: 280 });
    });

    it('reads the map size and the source resolution', () => {
      const result = parseUVTT(uvtt({ mapSize: { x: 24, y: 33 } }));
      expect(result.mapWidth).toBe(24);
      expect(result.mapHeight).toBe(33);
      expect(result.sourcePixelsPerGrid).toBe(140);
    });
  });

  describe('map_origin, which says where the picture sits in the source map', () => {
    // A tool exporting a region of a larger map writes the region's offset here
    // and leaves the coordinates in the full map's space. Subtracting it is what
    // puts the geometry back on the picture. Confirmed against the reference
    // importer, which does ((point.x - origin.x) * pixelsPerGrid).
    const room = square(2, 2);

    it('lands geometry in the same place as an unshifted file', () => {
      const plain = parseUVTT(uvtt({ lineOfSight: [room] }));
      const offset = parseUVTT(
        uvtt({ mapOrigin: { x: 5, y: 3 }, lineOfSight: [shift(room, 5, 3)] })
      );
      expect(offset.wallSegments.map(({ id, ...rest }) => rest)).toEqual(
        plain.wallSegments.map(({ id, ...rest }) => rest)
      );
    });

    it('does not call an offset file out of bounds', () => {
      // Without the subtraction this geometry reads as x 7..8 against a 10-wide
      // map, then as x 12..13 once the origin grows, and starts prompting.
      const offset = parseUVTT(
        uvtt({ mapOrigin: { x: 10, y: 10 }, lineOfSight: [shift(room, 10, 10)] })
      );
      expect(offset.outOfBounds).toEqual({ walls: 0, doors: 0, lights: 0 });
    });

    it('moves doors and lights by the same amount', () => {
      const offset = parseUVTT(
        uvtt({
          mapOrigin: { x: 4, y: 1 },
          portals: [{ bounds: [{ x: 6, y: 3 }, { x: 6, y: 4 }] }],
          lights: [{ position: { x: 7, y: 2 }, range: 4 }],
        })
      );
      // (6-4, 3-1) and (7-4, 2-1) in grid units, times the 70px default.
      expect(offset.wallSegments[0]).toMatchObject({ x1: 140, y1: 140, x2: 140, y2: 210 });
      expect(offset.lightSources[0]).toMatchObject({ x: 210, y: 70 });
    });

    it('treats a missing origin as zero rather than throwing', () => {
      const noOrigin = Buffer.from(
        JSON.stringify({
          format: 0.3,
          resolution: { map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
          line_of_sight: [room],
          image: PNG_BASE64,
        })
      );
      expect(parseUVTT(noOrigin).wallSegments[0]).toMatchObject({ x1: 140, y1: 140 });
    });
  });

  describe('object walls, which Dungeondraft keeps separately', () => {
    // Furniture, pillars and crates live in objects_line_of_sight. They block
    // sight, but whether a table should is the DM's call, so they come in only
    // when asked for.
    const walls = [square(2, 2)];
    const furniture = [square(4, 4)];

    it('leaves them out by default', () => {
      const result = parseUVTT(uvtt({ lineOfSight: walls, objectsLineOfSight: furniture }));
      expect(result.wallCount).toBe(4);
      expect(result.objectWallCount).toBe(4);
    });

    it('includes them when asked, in the same array', () => {
      const result = parseUVTT(
        uvtt({ lineOfSight: walls, objectsLineOfSight: furniture }),
        70,
        { includeObjectWalls: true }
      );
      expect(result.wallCount).toBe(8);
      expect(result.wallSegments).toHaveLength(8);
    });

    it('counts none when the file has no such array', () => {
      expect(parseUVTT(uvtt({ lineOfSight: walls })).objectWallCount).toBe(0);
    });

    it('counts object walls outside the picture too, when they are included', () => {
      const result = parseUVTT(
        uvtt({ lineOfSight: walls, objectsLineOfSight: [square(20, 2)] }),
        70,
        { includeObjectWalls: true }
      );
      expect(result.outOfBounds.walls).toBe(4);
    });
  });

  describe('light colours', () => {
    const light = (color: string) => ({ position: { x: 2, y: 2 }, range: 4, color });

    it('takes a six-digit hex, with or without the hash', () => {
      expect(parseUVTT(uvtt({ lights: [light('ff8800')] })).lightSources[0].color).toBe('#ff8800');
      expect(parseUVTT(uvtt({ lights: [light('#FF8800')] })).lightSources[0].color).toBe('#ff8800');
    });

    it('takes eight digits, dropping the leading alpha pair', () => {
      // UVTT writes AARRGGBB. Dropping the trailing pair instead would give
      // #7fff88, a different colour, which is why this is pinned.
      expect(parseUVTT(uvtt({ lights: [light('7fff8800')] })).lightSources[0].color).toBe('#ff8800');
    });

    it('falls back for anything that is not a colour', () => {
      expect(parseUVTT(uvtt({ lights: [light('octarine')] })).lightSources[0].color).toBe('#ffcc66');
    });
  });

  describe('files it refuses', () => {
    it.each([
      ['not JSON at all', Buffer.from('this is not json')],
      ['no resolution', Buffer.from(JSON.stringify({ image: PNG_BASE64 }))],
      ['no image', Buffer.from(JSON.stringify({ resolution: { map_size: { x: 1, y: 1 } }, line_of_sight: [] }))],
    ])('%s', (_label, buffer) => {
      expect(() => parseUVTT(buffer)).toThrow(/Invalid UVTT file/);
    });
  });
  describe('files too big to build, refused before anything is built', () => {
    beforeEach(() => uuidMock.mockClear());
    afterEach(() => jest.restoreAllMocks());

    /** A file whose single polyline has `points` points, all on one spot. */
    const manyPoints = (points: number): Buffer => {
      const body = '{"x":0,"y":0},'.repeat(points - 1) + '{"x":0,"y":0}';
      return Buffer.from(
        `{"format":0.3,"resolution":{"map_size":{"x":10,"y":10},"pixels_per_grid":140},` +
          `"line_of_sight":[[${body}]],"portals":[],"lights":[],"image":"${PNG_BASE64}"}`
      );
    };

    it('refuses a million tiny polyline points without making a segment of any', () => {
      const started = Date.now();
      expect(() => parseUVTT(manyPoints(1_000_000))).toThrow(/more than a map can hold/i);
      expect(uuidMock).not.toHaveBeenCalled();
      expect(Date.now() - started).toBeLessThan(5000);
    }, 30000);

    it('refuses a file with far more points than a map holds before reading it as JSON', () => {
      // Reading 2.7 million points as JSON took the backend past its memory
      // limit, so the count has to come before the parse.
      const parse = jest.spyOn(JSON, 'parse');
      expect(() => parseUVTT(manyPoints(400_000))).toThrow(/more than a map can hold/i);
      expect(parse).not.toHaveBeenCalled();
    }, 30000);

    it('still reads a file with a great many furniture points it leaves out', () => {
      const furniture = Array.from({ length: 2_000 }, (_, i) =>
        Array.from({ length: 50 }, (_, j) => ({ x: (i + j) % 10, y: j % 10 }))
      );
      const lineOfSight = [[{ x: 0, y: 0 }, { x: 1, y: 0 }]];
      expect(parseUVTT(uvtt({ lineOfSight, objectsLineOfSight: furniture })).wallSegments).toHaveLength(1);
    });

    it('counts walls and doors together against the limit', () => {
      const lineOfSight = [Array.from({ length: 4000 }, (_, i) => ({ x: i % 10, y: 0 }))];
      const portals = Array.from({ length: 1100 }, () => ({
        bounds: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      }));
      expect(() => parseUVTT(uvtt({ lineOfSight, portals }))).toThrow(/5000/);
    });

    it('accepts a file exactly at the wall limit', () => {
      const lineOfSight = [Array.from({ length: 5001 }, (_, i) => ({ x: i % 10, y: 0 }))];
      expect(parseUVTT(uvtt({ lineOfSight })).wallSegments).toHaveLength(5000);
    });

    it('suggests leaving the furniture out when that would bring it under', () => {
      const big = [Array.from({ length: 3001 }, (_, i) => ({ x: i % 10, y: 0 }))];
      const buffer = uvtt({ lineOfSight: big, objectsLineOfSight: big });
      expect(() => parseUVTT(buffer, 70, { includeObjectWalls: true })).toThrow(/furniture/i);
      expect(parseUVTT(buffer).wallSegments).toHaveLength(3000);
    });

    it('refuses more than 200 lights without making any', () => {
      const lights = Array.from({ length: 201 }, () => ({ position: { x: 1, y: 1 }, range: 2 }));
      expect(() => parseUVTT(uvtt({ lights }))).toThrow(/200 lights/);
      expect(uuidMock).not.toHaveBeenCalled();
    });

    it('refuses a picture over the size limit before decoding it', () => {
      const decode = jest.spyOn(Buffer, 'from');
      expect(() => parseUVTT(uvtt({}), 70, { maxImageBytes: 10 })).toThrow(/picture.*too large/i);
      expect(decode.mock.calls.some((args) => (args as unknown[])[1] === 'base64')).toBe(false);
    });

    it('measures a picture behind a data: prefix without the prefix', () => {
      const prefixed = Buffer.from(
        JSON.stringify({
          resolution: { map_size: { x: 1, y: 1 } },
          line_of_sight: [],
          image: `data:image/png;base64,${PNG_BASE64}`,
        })
      );
      const exact = Buffer.from(PNG_BASE64, 'base64').length;
      expect(parseUVTT(prefixed, 70, { maxImageBytes: exact }).imageBuffer).toHaveLength(exact);
      expect(() => parseUVTT(prefixed, 70, { maxImageBytes: exact - 1 })).toThrow(/too large/i);
    });
  });

  describe('lights written by CozyVTT', () => {
    it('reads back a bright radius and a switched-off light', () => {
      const buffer = Buffer.from(
        JSON.stringify({
          resolution: { map_size: { x: 10, y: 10 } },
          line_of_sight: [],
          lights: [
            { position: { x: 1, y: 1 }, range: 8, bright_range: 6, enabled: false },
            { position: { x: 2, y: 2 }, range: 8, bright_range: 99 },
            { position: { x: 3, y: 3 }, range: 8 },
          ],
          image: PNG_BASE64,
        })
      );
      const [off, clamped, plain] = parseUVTT(buffer).lightSources;
      expect(off).toMatchObject({ brightRadius: 6, dimRadius: 8, enabled: false });
      expect(clamped).toMatchObject({ brightRadius: 8, enabled: true });
      expect(plain).toMatchObject({ brightRadius: 4, enabled: true });
    });
  });
});

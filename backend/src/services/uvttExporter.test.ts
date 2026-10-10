/**
 * Writing a map out as a Universal VTT file.
 *
 * Walls are merged into polylines so other tools get tidy chains. The merge
 * has to stay linear: it runs inside the export request, so a quadratic one
 * stalls every other table on the instance for as long as a large map takes.
 */

import { buildUVTT } from './uvttExporter';
import type { WallSegment, LightSource } from '../types/walls';

const GRID = 70;

const seg = (x1: number, y1: number, x2: number, y2: number, type: WallSegment['type'] = 'wall'): WallSegment => ({
  id: `${x1}-${y1}-${x2}-${y2}-${type}`,
  x1: x1 * GRID,
  y1: y1 * GRID,
  x2: x2 * GRID,
  y2: y2 * GRID,
  type,
});

const light = (overrides: Partial<LightSource> = {}): LightSource => ({
  id: 'l1',
  x: 2 * GRID,
  y: 2 * GRID,
  brightRadius: 3,
  dimRadius: 6,
  color: '#ffcc66',
  enabled: true,
  ...overrides,
});

interface Exported {
  line_of_sight: { x: number; y: number }[][];
  portals: { bounds: { x: number; y: number }[]; closed: boolean }[];
  lights: { range: number; bright_range: number; enabled: boolean; intensity: number }[];
}

function exportOf(wallSegments: WallSegment[], lights: LightSource[] = []): Exported {
  const out = buildUVTT({
    mapWidth: 5000,
    mapHeight: 5000,
    gridSizePx: GRID,
    wallSegments,
    lights,
    imageBuffer: Buffer.from('x'),
  });
  return JSON.parse(out.toString('utf-8')) as Exported;
}

describe('buildUVTT wall polylines', () => {
  it('joins segments that meet end to start into one chain', () => {
    const { line_of_sight } = exportOf([seg(0, 0, 1, 0), seg(1, 0, 2, 0), seg(2, 0, 2, 1)]);
    expect(line_of_sight).toEqual([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]]);
  });

  it('joins segments drawn in opposite directions', () => {
    const { line_of_sight } = exportOf([seg(0, 0, 1, 0), seg(2, 0, 1, 0), seg(2, 0, 3, 0)]);
    expect(line_of_sight).toHaveLength(1);
    const xs = line_of_sight[0].map((p) => p.x);
    expect(xs === xs.slice().sort((a, b) => a - b) || xs.join() === '3,2,1,0' || xs.join() === '0,1,2,3').toBe(true);
    expect(line_of_sight[0]).toHaveLength(4);
  });

  it('keeps unconnected segments apart and loses none at a junction', () => {
    const segments = [seg(0, 0, 1, 0), seg(1, 0, 2, 0), seg(1, 0, 1, 1), seg(10, 10, 11, 10)];
    const { line_of_sight } = exportOf(segments);
    const pairs = line_of_sight.reduce((n, chain) => n + chain.length - 1, 0);
    expect(pairs).toBe(4);
    expect(line_of_sight.length).toBeGreaterThanOrEqual(2);
  });

  it('closes a loop without running forever', () => {
    const { line_of_sight } = exportOf([seg(0, 0, 1, 0), seg(1, 0, 1, 1), seg(1, 1, 0, 1), seg(0, 1, 0, 0)]);
    expect(line_of_sight).toHaveLength(1);
    expect(line_of_sight[0]).toHaveLength(5);
  });

  it('exports 5000 short separate chains in well under a second', () => {
    const segments: WallSegment[] = [];
    for (let i = 0; i < 2500; i++) {
      segments.push(seg(i * 3, 0, i * 3 + 1, 0), seg(i * 3 + 1, 0, i * 3 + 2, 0));
    }
    const started = Date.now();
    const { line_of_sight } = exportOf(segments);
    expect(line_of_sight).toHaveLength(2500);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('buildUVTT windows, doors and lights', () => {
  it('does not turn a window into a sight-blocking wall', () => {
    const { line_of_sight, portals } = exportOf([seg(0, 0, 1, 0), seg(3, 0, 4, 0, 'window')]);
    expect(line_of_sight).toHaveLength(1);
    expect(portals).toHaveLength(1);
    expect(portals[0].closed).toBe(false);
  });

  it('keeps a switched-off light, marked as off', () => {
    const { lights } = exportOf([], [light({ enabled: false }), light({ id: 'l2' })]);
    expect(lights).toHaveLength(2);
    expect(lights[0]).toMatchObject({ enabled: false, intensity: 0 });
    expect(lights[1]).toMatchObject({ enabled: true, intensity: 1 });
  });

  it('writes the bright radius as well as the range', () => {
    const { lights } = exportOf([], [light()]);
    expect(lights[0]).toMatchObject({ range: 6, bright_range: 3 });
  });
});

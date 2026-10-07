/**
 * The wall grid finds every wall a sight calculation needs.
 *
 * It is a pre-filter: computeVisibility casts rays only against the walls it
 * returns, so a wall it misses is a wall players see through. Checked here
 * against a brute-force answer, with walls that reach far off the map, where
 * the grid clamps them to its edges.
 */

import { WallGrid } from '../spatialIndex';
import type { WallSegment } from '../../types/walls';

/** A small deterministic generator, so a failure can be replayed. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Whether the segment passes through the axis-aligned box (Liang–Barsky). */
function segmentTouchesBox(w: WallSegment, minX: number, minY: number, maxX: number, maxY: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  for (const [p, q] of [[-dx, w.x1 - minX], [dx, maxX - w.x1], [-dy, w.y1 - minY], [dy, maxY - w.y1]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

describe('WallGrid', () => {
  const mapW = 3000;
  const mapH = 2000;

  it('returns every wall that passes through the query box, on and off the map', () => {
    const rand = random(1234);
    const coord = (span: number) => (rand() * 1.6 - 0.3) * span; // a third off either edge
    const walls: WallSegment[] = Array.from({ length: 400 }, (_, i) => ({
      id: `w${i}`,
      x1: coord(mapW), y1: coord(mapH),
      x2: rand() < 0.1 ? coord(mapW) * 50 : coord(mapW), // some reach far off the map
      y2: coord(mapH),
      type: 'wall',
    }));
    // Axis-aligned walls on cell boundaries, where rounding would show.
    walls.push({ id: 'v', x1: 512, y1: 0, x2: 512, y2: 2000, type: 'wall' });
    walls.push({ id: 'h', x1: 0, y1: 768, x2: 3000, y2: 768, type: 'wall' });
    const grid = new WallGrid(walls, 256, mapW, mapH);

    for (let q = 0; q < 300; q++) {
      const x = coord(mapW);
      const y = coord(mapH);
      const r = rand() * 1500;
      const found = new Set(grid.query(x, y, r));
      const missed = walls.filter((w) => segmentTouchesBox(w, x - r, y - r, x + r, y + r) && !found.has(w));
      expect(missed.map((w) => w.id)).toEqual([]);
    }
  });

  it('takes well under 50 ms over a wall reaching ten million pixels', () => {
    const walls: WallSegment[] = Array.from({ length: 200 }, (_, i) => ({
      id: `w${i}`, x1: i * 10, y1: 100, x2: i * 10 + 5, y2: 100, type: 'wall',
    }));
    walls.push({ id: 'far', x1: 0, y1: 0, x2: 1e7, y2: 1e7, type: 'wall' });
    const started = performance.now();
    const found = new WallGrid(walls, 256, 2500, 2500).query(1250, 1250, 4000);
    expect(performance.now() - started).toBeLessThan(50);
    expect(found).toHaveLength(201);
  });

  it('costs the same however far past the map the walls reach', () => {
    const across = (reach: number): WallSegment[] => Array.from({ length: 1000 }, (_, i) => ({
      id: `w${i}`, x1: -reach, y1: (i * 7) % 2500 - reach, x2: 2500 + reach, y2: 2500 - ((i * 7) % 2500) + reach, type: 'wall',
    }));
    const cost = (walls: WallSegment[]) => {
      const started = performance.now();
      new WallGrid(walls, 256, 2500, 2500).query(1250, 1250, 4000);
      return performance.now() - started;
    };
    cost(across(0)); // warm up
    expect(cost(across(1e7))).toBeLessThan(cost(across(0)) * 3 + 20);
  });
});

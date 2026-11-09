/**
 * The fill bucket, tile by tile, on a plain pixel buffer: it fills the area
 * of the colour pressed, side to side and up and down but not corner to
 * corner, takes in colours within its tolerance, stops at anything further
 * off, and answers the box it changed. It reads a tile only as the fill
 * reaches it, never the whole picture, and holds one tile's pixels at a
 * time: each tile is read, filled, written back and let go of, and read
 * again only if the fill comes back to it with something left to fill.
 * Each tile it changes is handed over, as it was, once, before its first
 * change: that is what undo keeps.
 *
 * Tiles here are 3 pixels square, so the small pictures cross many edges.
 */

import { describe, it, expect } from 'vitest';
import { floodFillTiled, type FillTiles, type Pixels } from '../floodFill';
import { hexToRgba } from '../pixelColour';
import type { TileRect } from '../paintHistory';

/** A picture `rows` describes, one character a pixel: `.` white, `#` black, `g` near white, `o` grey. */
function picture(rows: string[]): Pixels {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  const colours: Record<string, [number, number, number]> = { '.': [255, 255, 255], '#': [0, 0, 0], g: [245, 248, 250], o: [128, 128, 128] };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const [r, g, b] = colours[ch];
    data.set([r, g, b, 255], (y * width + x) * 4);
  }));
  return { width, height, data };
}

/** The picture back as rows, `R` for the fill colour. */
function rows(p: Pixels): string[] {
  const out: string[] = [];
  for (let y = 0; y < p.height; y += 1) {
    let row = '';
    for (let x = 0; x < p.width; x += 1) {
      const i = (y * p.width + x) * 4;
      const [r, g, b] = [p.data[i], p.data[i + 1], p.data[i + 2]];
      row += r === 200 && g === 10 && b === 20 ? 'R' : r === 0 ? '#' : r === 128 ? 'o' : r === 245 ? 'g' : '.';
    }
    out.push(row);
  }
  return out;
}

/** The picture's tiles, read and written as copies, with what the fill asked of them. */
function tilesOf(p: Pixels, tileSize = 3) {
  const reads: string[] = [];
  const changing: Array<{ key: string; before: string }> = [];
  let held = 0;
  let mostHeld = 0;
  const access: FillTiles = {
    width: p.width,
    height: p.height,
    tileSize,
    read(t: TileRect) {
      reads.push(`${t.tx},${t.ty}`);
      held += 1;
      mostHeld = Math.max(mostHeld, held);
      const data = new Uint8ClampedArray(t.w * t.h * 4);
      for (let y = 0; y < t.h; y += 1) data.set(p.data.subarray(((t.y + y) * p.width + t.x) * 4, ((t.y + y) * p.width + t.x + t.w) * 4), y * t.w * 4);
      return { width: t.w, height: t.h, data };
    },
    changing(t: TileRect, pixels: Pixels) {
      changing.push({ key: `${t.tx},${t.ty}`, before: [...pixels.data.subarray(0, 4)].join(',') });
    },
    write(t: TileRect, pixels: Pixels) {
      for (let y = 0; y < t.h; y += 1) p.data.set(pixels.data.subarray(y * t.w * 4, (y + 1) * t.w * 4), ((t.y + y) * p.width + t.x) * 4);
    },
    done() {
      held -= 1;
    },
  };
  return { access, reads, changing, mostHeld: () => mostHeld };
}

const red = hexToRgba('#c80a14');

describe('the fill bucket', () => {
  it('fills the area pressed, up to its edges, and not past a corner', () => {
    const p = picture([
      '....#...',
      '....#...',
      '#####...',
      '.....#..',
    ]);
    const box = floodFillTiled(tilesOf(p).access, 1, 1, red, 0);
    expect(rows(p)).toEqual([
      'RRRR#...',
      'RRRR#...',
      '#####...',
      '.....#..',
    ]);
    expect(box).toEqual({ x0: 0, y0: 0, x1: 4, y1: 2 });
  });

  it('runs round a wall across tiles to fill all that touches side to side', () => {
    const p = picture([
      '........',
      '.######.',
      '.#....#.',
      '.######.',
      '........',
    ]);
    floodFillTiled(tilesOf(p).access, 0, 0, red, 0);
    expect(rows(p)).toEqual([
      'RRRRRRRR',
      'R######R',
      'R#....#R',
      'R######R',
      'RRRRRRRR',
    ]);
  });

  it('follows a winding passage back into tiles it has been through', () => {
    const p = picture([
      '.........',
      '########.',
      '.........',
      '.########',
      '.........',
    ]);
    const { access, reads } = tilesOf(p);
    floodFillTiled(access, 0, 0, red, 0);
    expect(rows(p)).toEqual([
      'RRRRRRRRR',
      '########R',
      'RRRRRRRRR',
      'R########',
      'RRRRRRRRR',
    ]);
    // The first tile is read again when the passage comes back to it.
    expect(reads.filter((k) => k === '0,0').length).toBeGreaterThan(1);
  });

  it('takes in colours within its tolerance, and no further', () => {
    const p = picture(['..gg..', '..oo..']);
    floodFillTiled(tilesOf(p).access, 0, 0, red, 0);
    expect(rows(p)).toEqual(['RRgg..', 'RRoo..']);
    const q = picture(['..gg..', '..oo..']);
    floodFillTiled(tilesOf(q).access, 0, 0, red, 12);
    expect(rows(q)).toEqual(['RRRRRR', 'RRooRR']);
  });

  it('changes nothing, and answers no box, where the colour pressed is the fill colour or off the picture', () => {
    const p = picture(['..', '..']);
    expect(floodFillTiled(tilesOf(p).access, 0, 0, hexToRgba('#ffffff'), 40)).toBeNull();
    expect(floodFillTiled(tilesOf(p).access, 5, 5, red, 0)).toBeNull();
  });

  it('reads only the tiles the fill reaches, one at a time, and hands each it changes over once, as it was', () => {
    const p = picture([
      '###.........',
      '#.#.........',
      '###.........',
      '............',
    ]);
    const { access, reads, changing, mostHeld } = tilesOf(p);
    floodFillTiled(access, 1, 1, red, 0);
    expect(rows(p)[1]).toBe('#R#.........');
    expect(reads).toEqual(['0,0']);
    expect(changing).toEqual([{ key: '0,0', before: '0,0,0,255' }]);
    expect(mostHeld()).toBe(1);

    const q = picture(['......', '......', '......', '......', '......', '......']);
    const big = tilesOf(q);
    floodFillTiled(big.access, 4, 4, red, 0);
    expect(big.changing.map((c) => c.key).sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
    expect(big.mostHeld()).toBe(1);
  });

  it('reads no tile again where all it is given to go on from is filled already', () => {
    // One colour throughout: each tile is filled whole on its first turn, so
    // the runs its neighbours hand back to it are all filled.
    const q = picture(['......', '......', '......', '......', '......', '......']);
    const { access, reads } = tilesOf(q);
    floodFillTiled(access, 4, 4, red, 0);
    expect(reads.slice().sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('fills a large area without running out of stack', () => {
    const width = 2000;
    const height = 2000;
    const p: Pixels = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
    expect(floodFillTiled(tilesOf(p, 256).access, 1000, 1000, red, 0)).toEqual({ x0: 0, y0: 0, x1: 2000, y1: 2000 });
    expect([...p.data.subarray(0, 4)]).toEqual([200, 10, 20, 255]);
    expect([...p.data.subarray(p.data.length - 4)]).toEqual([200, 10, 20, 255]);
  });
});

describe('the fill bucket with a texture', () => {
  it('gives each pixel the texture\'s pixel at its place on the picture, across tiles, inside the area only', () => {
    const p = picture(['....#..', '....#..', '....#..']);
    const { access } = tilesOf(p);
    // A 2 by 2 texture: black, grey / grey, black.
    const texture: Pixels = { width: 2, height: 2, data: new Uint8ClampedArray([0, 0, 0, 255, 128, 128, 128, 255, 128, 128, 128, 255, 0, 0, 0, 255]) };
    expect(floodFillTiled(access, 0, 0, red, 0, texture)).toEqual({ x0: 0, y0: 0, x1: 4, y1: 3 });
    expect(rows(p)).toEqual(['#o#o#..', 'o#o##..', '#o#o#..']);
  });
});

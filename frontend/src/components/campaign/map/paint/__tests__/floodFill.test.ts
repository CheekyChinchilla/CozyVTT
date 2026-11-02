/**
 * The fill bucket, on a plain pixel buffer: it fills the area of the colour
 * pressed, side to side and up and down but not corner to corner, takes in
 * colours within its tolerance, stops at anything further off, and answers
 * the box it changed, which is what undo keeps.
 */

import { describe, it, expect } from 'vitest';
import { floodFill, type Pixels } from '../floodFill';
import { hexToRgba } from '../pixelColour';

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

const red = hexToRgba('#c80a14');

describe('the fill bucket', () => {
  it('fills the area pressed, up to its edges, and not past a corner', () => {
    const p = picture([
      '....#...',
      '....#...',
      '#####...',
      '.....#..',
    ]);
    const box = floodFill(p, 1, 1, red, 0);
    expect(rows(p)).toEqual([
      'RRRR#...',
      'RRRR#...',
      '#####...',
      '.....#..',
    ]);
    expect(box).toEqual({ x0: 0, y0: 0, x1: 4, y1: 2 });
  });

  it('runs round a wall to fill all that touches side to side', () => {
    const p = picture([
      '......',
      '.####.',
      '.#..#.',
      '.####.',
      '......',
    ]);
    floodFill(p, 0, 0, red, 0);
    expect(rows(p)).toEqual([
      'RRRRRR',
      'R####R',
      'R#..#R',
      'R####R',
      'RRRRRR',
    ]);
  });

  it('takes in colours within its tolerance, and no further', () => {
    const p = picture([
      '..gg..',
      '..oo..',
    ]);
    floodFill(p, 0, 0, red, 0);
    expect(rows(p)).toEqual(['RRgg..', 'RRoo..']);
    const q = picture(['..gg..', '..oo..']);
    floodFill(q, 0, 0, red, 12);
    expect(rows(q)).toEqual(['RRRRRR', 'RRooRR']);
  });

  it('changes nothing, and answers no box, where the colour pressed is the fill colour', () => {
    const p = picture(['..', '..']);
    const white = hexToRgba('#ffffff');
    expect(floodFill(p, 0, 0, white, 40)).toBeNull();
    expect(floodFill(p, 5, 5, red, 0)).toBeNull();
  });

  it('fills a large area without running out of stack', () => {
    const width = 2000;
    const height = 2000;
    const p: Pixels = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
    expect(floodFill(p, 1000, 1000, red, 0)).toEqual({ x0: 0, y0: 0, x1: 2000, y1: 2000 });
    expect([...p.data.subarray(0, 4)]).toEqual([200, 10, 20, 255]);
  });
});

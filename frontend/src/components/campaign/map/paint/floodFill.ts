// ============================================
// The fill bucket, on a plain pixel buffer. Pure: the page reads the
// picture's pixels, fills them here and puts back only the box that
// changed.
//
// The area filled is the pixels joined side to side or up and down (not
// corner to corner) to the one pressed, whose colour is within the
// tolerance of its colour on every channel, as MS Paint's bucket does with
// a tolerance of 0. The tolerance lets the soft edge of a brush stroke be
// filled up to.
// ============================================

import type { PaintBox } from './paintHistory';
import type { Rgba } from './pixelColour';

/** A picture's pixels, four bytes each, red, green, blue and alpha, row by row (an ImageData). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Fill the area at (x, y) with `colour`, taking in pixels within
 * `tolerance` (0 to 255) of the pressed pixel's colour on every channel.
 * Answers the box changed, or null for nothing changed: a press off the
 * picture, or on the fill colour itself.
 */
export function floodFill(pixels: Pixels, x: number, y: number, colour: Rgba, tolerance: number): PaintBox | null {
  const { width, height, data } = pixels;
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;
  const at = (sy * width + sx) * 4;
  const seed = [data[at], data[at + 1], data[at + 2], data[at + 3]];
  if (seed[0] === colour[0] && seed[1] === colour[1] && seed[2] === colour[2] && seed[3] === colour[3]) return null;
  const done = new Uint8Array(width * height);
  const matches = (i: number) => {
    const o = i * 4;
    return Math.abs(data[o] - seed[0]) <= tolerance && Math.abs(data[o + 1] - seed[1]) <= tolerance
      && Math.abs(data[o + 2] - seed[2]) <= tolerance && Math.abs(data[o + 3] - seed[3]) <= tolerance;
  };
  let x0 = sx;
  let x1 = sx;
  let y0 = sy;
  let y1 = sy;
  // Spans, row by row: each run is filled across, and the rows above and
  // below it are looked along for runs to fill next.
  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const py = stack.pop()!;
    let px = stack.pop()!;
    const row = py * width;
    if (done[row + px] || !matches(row + px)) continue;
    while (px > 0 && !done[row + px - 1] && matches(row + px - 1)) px -= 1;
    let above = false;
    let below = false;
    for (; px < width && !done[row + px] && matches(row + px); px += 1) {
      const i = row + px;
      done[i] = 1;
      data[i * 4] = colour[0];
      data[i * 4 + 1] = colour[1];
      data[i * 4 + 2] = colour[2];
      data[i * 4 + 3] = colour[3];
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py > 0) {
        const up = i - width;
        const fits = !done[up] && matches(up);
        if (fits && !above) stack.push(px, py - 1);
        above = fits;
      }
      if (py < height - 1) {
        const down = i + width;
        const fits = !done[down] && matches(down);
        if (fits && !below) stack.push(px, py + 1);
        below = fits;
      }
    }
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

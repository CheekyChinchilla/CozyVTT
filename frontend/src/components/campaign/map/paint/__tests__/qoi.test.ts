/**
 * The codec Paint keeps its undo tiles in, the QOI image format: lossless,
 * so a tile comes back exactly as it was, whatever it holds (runs of one
 * colour longer than a run can say, colours seen before, small and large
 * steps between neighbours, a change of transparency), and small for a
 * painted map's flat colours.
 */

import { describe, it, expect } from 'vitest';
import { qoiEncode, qoiDecodeInto } from '../qoi';

function roundTrip(data: Uint8ClampedArray): Uint8Array {
  const packed = qoiEncode(data);
  const back = new Uint8ClampedArray(data.length);
  qoiDecodeInto(packed, back);
  expect([...back]).toEqual([...data]);
  return packed;
}

const pixels = (...px: number[][]) => new Uint8ClampedArray(px.flat());

describe('the undo tile codec', () => {
  it('gives back a tile of one colour exactly, in a few bytes', () => {
    const data = new Uint8ClampedArray(256 * 256 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([232, 220, 196, 255], i);
    const packed = roundTrip(data);
    // A literal and runs of 62: about a thousand bytes for 65,536 pixels.
    expect(packed.length).toBeLessThan(1100);
  });

  it('gives back colours seen before, small steps, larger steps and literals exactly', () => {
    roundTrip(pixels(
      [10, 20, 30, 255], [11, 20, 29, 255], [12, 21, 28, 255], // small steps
      [40, 50, 60, 255], [70, 60, 90, 255], // a larger step, then a literal
      [10, 20, 30, 255], [11, 20, 29, 255], // colours seen before
      [0, 0, 0, 255], [255, 255, 255, 255], [254, 255, 0, 255],
    ));
  });

  it('gives back transparency and its changes exactly', () => {
    roundTrip(pixels([0, 0, 0, 0], [0, 0, 0, 0], [12, 34, 56, 128], [12, 34, 56, 255], [12, 34, 56, 0]));
  });

  it('gives back runs longer than one run can say, and a run at the very end', () => {
    const data = new Uint8ClampedArray(200 * 4);
    for (let i = 0; i < 130 * 4; i += 4) data.set([5, 6, 7, 255], i);
    for (let i = 130 * 4; i < data.length; i += 4) data.set([9, 9, 9, 255], i);
    roundTrip(data);
  });

  it('gives back a noisy tile exactly', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    let seed = 7;
    for (let i = 0; i < data.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = i % 4 === 3 ? 255 : seed & 255;
    }
    roundTrip(data);
  });
});

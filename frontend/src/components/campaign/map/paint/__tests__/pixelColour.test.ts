/**
 * The colours read off a picture's pixels, for the eraser's second colour
 * and the eyedropper, and a colour as the fill bucket writes it.
 */

import { describe, it, expect } from 'vitest';
import { hexToRgba, pixelHex, readColour } from '../pixelColour';

describe('a pixel\'s colour', () => {
  it('is its #rrggbb, or none for a pixel with nothing in it', () => {
    const data = new Uint8ClampedArray([74, 52, 35, 255, 0, 0, 0, 0]);
    expect(pixelHex(data, 0)).toBe('#4a3423');
    expect(pixelHex(data, 4)).toBeNull();
  });

  it('reads #rrggbb as red, green, blue and full alpha', () => {
    expect(hexToRgba('#4a3423')).toEqual([74, 52, 35, 255]);
  });
});

describe('the colour at a point of the picture', () => {
  it('is read from that one pixel, or none where it is empty or off the picture', () => {
    const asked: number[][] = [];
    const ctx = {
      canvas: { width: 100, height: 80 },
      getImageData: (x: number, y: number, w: number, h: number) => {
        asked.push([x, y, w, h]);
        return { data: new Uint8ClampedArray(x === 0 ? [232, 220, 196, 255] : [0, 0, 0, 0]) };
      },
    };
    expect(readColour(ctx, 0, 0)).toBe('#e8dcc4');
    expect(readColour(ctx, 10.7, 3.2)).toBeNull();
    expect(asked).toEqual([[0, 0, 1, 1], [10, 3, 1, 1]]);
    expect(readColour(ctx, 100, 3)).toBeNull();
    expect(readColour(ctx, -1, 3)).toBeNull();
    expect(asked).toHaveLength(2);
  });
});

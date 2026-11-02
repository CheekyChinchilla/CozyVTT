// ============================================
// The colours read off a picture's pixels, for the eraser's second colour
// and the eyedropper, and a colour as the fill bucket writes it.
// ============================================

export type Rgba = readonly [number, number, number, number];

/** #rrggbb as red, green, blue and full alpha. */
export function hexToRgba(hex: string): Rgba {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

const two = (n: number) => n.toString(16).padStart(2, '0');

/** The #rrggbb of the pixel at byte `offset`, or null for one with nothing in it (alpha 0). */
export function pixelHex(data: Uint8ClampedArray, offset: number): string | null {
  if (data[offset + 3] === 0) return null;
  return `#${two(data[offset])}${two(data[offset + 1])}${two(data[offset + 2])}`;
}

/** What readColour needs of a 2D context. */
export interface PixelSource {
  canvas: { width: number; height: number };
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}

/** The #rrggbb of the one pixel at (x, y), or null where it holds nothing or is off the picture. */
export function readColour(ctx: PixelSource, x: number, y: number): string | null {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= ctx.canvas.width || py >= ctx.canvas.height) return null;
  return pixelHex(ctx.getImageData(px, py, 1, 1).data, 0);
}

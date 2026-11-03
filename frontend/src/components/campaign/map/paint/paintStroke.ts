// ============================================
// A brush stroke on a drawn map's picture: its points, the box it paints,
// how it is drawn, and the widths the brush offers.
//
// A stroke is gathered in map pixels as the pointer moves, drawn on the
// overlay while it is under way, and painted into the picture on the lift,
// in the picture's own pixels. A width is in the picture's pixels.
// ============================================

import type { PaintBox } from './paintHistory';

export type PaintPoint = readonly [number, number];

/** The brush widths, smallest first; [ and ] step through them. */
export const PAINT_WIDTHS = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64] as const;

/** The next width up (`step` 1) or down (-1) from `width`, held at the ends. */
export function nextWidth(width: number, step: 1 | -1): number {
  if (step === 1) return PAINT_WIDTHS.find((w) => w > width) ?? PAINT_WIDTHS[PAINT_WIDTHS.length - 1];
  return [...PAINT_WIDTHS].reverse().find((w) => w < width) ?? PAINT_WIDTHS[0];
}

/** Points in map pixels, in the picture's pixels: `sx` and `sy` picture pixels to a map pixel. */
export function toPicture(points: readonly PaintPoint[], sx: number, sy: number): PaintPoint[] {
  return points.map(([x, y]) => [x * sx, y * sy] as const);
}

/** The box a stroke of `width` through `points` paints: half its width around them, and a pixel for its soft edge. */
export function strokeBox(points: readonly PaintPoint[], width: number): PaintBox {
  const reach = width / 2 + 1;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0: x0 - reach, y0: y0 - reach, x1: x1 + reach, y1: y1 + reach };
}

/**
 * Draw a stroke through `ctx`, in whatever space its points and width are
 * in: a line with round ends and corners, or a dot as wide as the brush for
 * a stroke that never moved, such as a tap.
 */
export function strokePaint(ctx: CanvasRenderingContext2D, points: readonly PaintPoint[], width: number, colour: string | CanvasPattern): void {
  if (points.length === 0) return;
  const [fx, fy] = points[0];
  const still = points.every(([x, y]) => x === fx && y === fy);
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    if (still) {
      ctx.fillStyle = colour;
      ctx.arc(fx, fy, width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(fx, fy);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  } finally {
    ctx.restore();
  }
}

// ============================================
// Paint's lines, rectangles and ellipses: dragged from one corner (or end)
// to the other, drawn on the overlay as they go and painted in on the lift.
// A rectangle or an ellipse is outlined in the colour, filled with it, or
// outlined in the colour and filled with the second colour.
// ============================================

import type { PaintBox } from './paintHistory';
import { strokePaint, type PaintPoint } from './paintStroke';

export type PaintShapeKind = 'line' | 'rect' | 'ellipse';
export type ShapeStyle = 'outline' | 'fill' | 'both';

export interface PaintShape {
  kind: PaintShapeKind;
  from: PaintPoint;
  to: PaintPoint;
  /** The outline's width, in the space the corners are in. */
  width: number;
  colour: string;
  second: string;
  /** A line is always its outline. */
  style: ShapeStyle;
}

/** `to` turned about `from` to the nearest step of `degrees`, the line keeping its length. */
export function stepAngle(from: PaintPoint, to: PaintPoint, degrees = 15): PaintPoint {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [to[0], to[1]];
  const step = (degrees * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return [from[0] + Math.cos(angle) * length, from[1] + Math.sin(angle) * length];
}

const outlined = (shape: PaintShape) => shape.kind === 'line' || shape.style !== 'fill';

/** The box a shape paints: its corners, half its outline around them, and a pixel for the soft edge. */
export function shapeBox(shape: PaintShape): PaintBox {
  const reach = (outlined(shape) ? shape.width / 2 : 0) + 1;
  return {
    x0: Math.min(shape.from[0], shape.to[0]) - reach,
    y0: Math.min(shape.from[1], shape.to[1]) - reach,
    x1: Math.max(shape.from[0], shape.to[0]) + reach,
    y1: Math.max(shape.from[1], shape.to[1]) + reach,
  };
}

/** A shape in map pixels, in the picture's: `sx` and `sy` picture pixels to a map pixel, the outline by `sx`. */
export function scaleShape(shape: PaintShape, sx: number, sy: number): PaintShape {
  return {
    ...shape,
    from: [shape.from[0] * sx, shape.from[1] * sy],
    to: [shape.to[0] * sx, shape.to[1] * sy],
    width: shape.width * sx,
  };
}

/** Draw a shape through `ctx`, in whatever space its corners are in. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: PaintShape): void {
  if (shape.kind === 'line') {
    strokePaint(ctx, [shape.from, shape.to], shape.width, shape.colour);
    return;
  }
  const x = Math.min(shape.from[0], shape.to[0]);
  const y = Math.min(shape.from[1], shape.to[1]);
  const w = Math.abs(shape.to[0] - shape.from[0]);
  const h = Math.abs(shape.to[1] - shape.from[1]);
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    if (shape.kind === 'rect') ctx.rect(x, y, w, h);
    else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (shape.style !== 'outline') {
      ctx.fillStyle = shape.style === 'both' ? shape.second : shape.colour;
      ctx.fill();
    }
    if (shape.style !== 'fill') {
      ctx.strokeStyle = shape.colour;
      ctx.lineWidth = shape.width;
      ctx.lineJoin = shape.kind === 'rect' ? 'miter' : 'round';
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}

/** Something of Paint's on its way, as the overlay draws it: in map pixels, its width too. */
export type PaintPreview =
  | { kind: 'stroke'; points: readonly PaintPoint[]; width: number; colour: string }
  | { kind: 'shape'; shape: PaintShape };

/** Draw a stroke or a shape on its way. */
export function drawPaintPreview(ctx: CanvasRenderingContext2D, preview: PaintPreview): void {
  if (preview.kind === 'stroke') strokePaint(ctx, preview.points, preview.width, preview.colour);
  else drawShape(ctx, preview.shape);
}

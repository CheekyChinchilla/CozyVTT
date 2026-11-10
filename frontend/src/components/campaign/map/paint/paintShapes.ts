// ============================================
// Paint's lines, rectangles, ellipses, polygons and curves: dragged from one
// corner (or end) to the other, a polygon clicked corner by corner and a
// curve bent by a second drag, drawn on the overlay as they go and painted
// in when done. A rectangle, an ellipse or a polygon is outlined in the
// colour, filled with it, or outlined in the colour and filled with the
// second colour.
// ============================================

import type { PaintBox } from './paintHistory';
import { strokePaint, type PaintPoint } from './paintStroke';
import type { SelectBox } from './paintSelection';
import { tilePattern, type ShadedTexture, type TextureKind } from './paintTextures';
import { drawStamp, type StampPlace } from './paintStamps';

export type PaintShapeKind = 'line' | 'rect' | 'ellipse' | 'polygon' | 'curve';
export type ShapeStyle = 'outline' | 'fill' | 'both';

export interface PaintShape {
  kind: PaintShapeKind;
  from: PaintPoint;
  to: PaintPoint;
  /** The outline's width, in the space the corners are in. */
  width: number;
  colour: string;
  second: string;
  /** A line and a curve are always their outline. */
  style: ShapeStyle;
  /** A polygon's corners, in order; its `from` and `to` are the first and the last. */
  points?: readonly PaintPoint[];
  /** The point a curve bends towards, between `from` and `to`. */
  control?: PaintPoint;
  /** The texture its fill is painted in (paintTextures.ts); its outline stays the colour. */
  texture?: TextureKind;
}

/** Every point that bounds a shape: its corners, a polygon's corners, a curve's bend. */
const pointsOf = (shape: PaintShape): readonly PaintPoint[] => [
  shape.from, shape.to, ...(shape.points ?? []), ...(shape.control ? [shape.control] : []),
];

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

const outlined = (shape: PaintShape) => shape.kind === 'line' || shape.kind === 'curve' || shape.style !== 'fill';
const filled = (shape: PaintShape) => shape.kind !== 'line' && shape.kind !== 'curve' && shape.style !== 'outline';
/** The colour a shape is filled with: the second colour inside an outline, else the colour. */
const fillColour = (shape: PaintShape) => (shape.style === 'both' ? shape.second : shape.colour);

/** The texture a shape's fill is painted in, and the colour it is shaded from; null for none, or for a shape with no fill. */
export function shapeTexture(shape: PaintShape): ShadedTexture | null {
  return shape.texture && filled(shape) ? { kind: shape.texture, colour: fillColour(shape) } : null;
}

/** The box a shape paints: its corners, half its outline around them, and a pixel for the soft edge. */
export function shapeBox(shape: PaintShape): PaintBox {
  const reach = (outlined(shape) ? shape.width / 2 : 0) + 1;
  // A curve lies within the triangle of its ends and its bend.
  const xs = pointsOf(shape).map((p) => p[0]);
  const ys = pointsOf(shape).map((p) => p[1]);
  return { x0: Math.min(...xs) - reach, y0: Math.min(...ys) - reach, x1: Math.max(...xs) + reach, y1: Math.max(...ys) + reach };
}

/** A shape in map pixels, in the picture's: `sx` and `sy` picture pixels to a map pixel, the outline by `sx`. */
export function scaleShape(shape: PaintShape, sx: number, sy: number): PaintShape {
  return {
    ...shape,
    from: [shape.from[0] * sx, shape.from[1] * sy],
    to: [shape.to[0] * sx, shape.to[1] * sy],
    width: shape.width * sx,
    ...(shape.points ? { points: shape.points.map((p): PaintPoint => [p[0] * sx, p[1] * sy]) } : {}),
    ...(shape.control ? { control: [shape.control[0] * sx, shape.control[1] * sy] as PaintPoint } : {}),
  };
}

/** Draw a shape through `ctx`, in whatever space its corners are in; `fill`, its texture's pattern, in place of its fill colour. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: PaintShape, fill: CanvasPattern | null = null): void {
  if (shape.kind === 'line') {
    strokePaint(ctx, [shape.from, shape.to], shape.width, shape.colour);
    return;
  }
  if (shape.kind === 'curve') {
    const control = shape.control ?? shape.from;
    ctx.save();
    try {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(shape.from[0], shape.from[1]);
      ctx.quadraticCurveTo(control[0], control[1], shape.to[0], shape.to[1]);
      ctx.strokeStyle = shape.colour;
      ctx.lineWidth = shape.width;
      ctx.lineCap = 'round';
      ctx.stroke();
    } finally {
      ctx.restore();
    }
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
    else if (shape.kind === 'polygon') {
      (shape.points ?? []).forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
    } else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (filled(shape)) {
      ctx.fillStyle = fill ?? fillColour(shape);
      ctx.fill();
    }
    if (shape.style !== 'fill') {
      ctx.strokeStyle = shape.colour;
      ctx.lineWidth = shape.width;
      ctx.lineJoin = shape.kind === 'ellipse' ? 'round' : 'miter';
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}

/**
 * A texture's tile as the overlay draws it, each tile pixel `scale` map
 * pixels, repeating from the map's top-left corner as it does from the
 * picture's: what is on its way shows the texture it will land in.
 */
export interface PreviewTile {
  image: CanvasImageSource;
  scale: number;
}

/** Something of Paint's on its way, as the overlay draws it: in map pixels, its width too. */
export type PaintPreview =
  /** `tile`, its texture's, or null for the plain colour. */
  | { kind: 'stroke'; points: readonly PaintPoint[]; width: number; colour: string; tile: PreviewTile | null }
  /** `tile`, its fill's texture's (shapeTexture), or null for the plain colour. */
  | { kind: 'shape'; shape: PaintShape; tile: PreviewTile | null }
  /** The stamp a click or a lift would paint, drawn see-through. */
  | { kind: 'stamp'; place: StampPlace }
  /**
   * The brush where the pointer is: a circle its width across, half filled
   * with the colour or its texture's tile, outlined to show on any ground;
   * the eraser's dashed.
   */
  | {
    kind: 'brush';
    at: PaintPoint;
    radius: number;
    colour: string;
    tile: PreviewTile | null;
    eraser: boolean;
    /** Map pixels to a screen pixel, so the outline keeps its width at any zoom. */
    pixel: number;
  }
  | {
    kind: 'selection';
    box: SelectBox;
    /** Where lifted pixels came from, shown in the second colour until they are put down. */
    hole: { box: SelectBox; colour: string } | null;
    /** The pixels lifted, drawn into `box`. */
    lifted: CanvasImageSource | null;
    /** Map pixels to a screen pixel, so the frame and its corners keep their size at any zoom. */
    pixel: number;
  };

/** A corner of a selection, in screen pixels across. */
const HANDLE_SIZE = 8;

/** A selection: the hole its lifted pixels left, the pixels, a dashed frame and its four corners. */
function drawSelection(ctx: CanvasRenderingContext2D, preview: Extract<PaintPreview, { kind: 'selection' }>): void {
  const { box, hole, lifted, pixel } = preview;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  ctx.save();
  try {
    if (hole) {
      ctx.fillStyle = hole.colour;
      ctx.fillRect(hole.box.x0, hole.box.y0, hole.box.x1 - hole.box.x0, hole.box.y1 - hole.box.y0);
    }
    if (lifted) ctx.drawImage(lifted, box.x0, box.y0, width, height);
    // Black under white dashes: seen on any picture.
    ctx.lineWidth = 1.5 * pixel;
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(box.x0, box.y0, width, height);
    ctx.setLineDash([5 * pixel, 4 * pixel]);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(box.x0, box.y0, width, height);
    ctx.setLineDash([]);
    const side = HANDLE_SIZE * pixel;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    for (const [x, y] of [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]) {
      ctx.fillRect(x - side / 2, y - side / 2, side, side);
      ctx.strokeRect(x - side / 2, y - side / 2, side, side);
    }
  } finally {
    ctx.restore();
  }
}

/** How strongly a stamp's preview, and a brush's, is drawn: see-through, so the ground under it shows. */
const STAMP_PREVIEW_ALPHA = 0.5;

/** A preview's texture as a pattern on the overlay, made once and kept (tilePattern); null for the plain colour. */
const previewPattern = (ctx: CanvasRenderingContext2D, tile: PreviewTile | null) => (tile ? tilePattern(ctx, tile.image, tile.scale) : null);

/** The brush under the pointer: its circle, filled and outlined in black under white. */
function drawBrushPreview(ctx: CanvasRenderingContext2D, preview: Extract<PaintPreview, { kind: 'brush' }>): void {
  const { at, colour, tile, eraser, pixel } = preview;
  // Never smaller than a few screen pixels, so a brush 1 pixel wide still shows.
  const radius = Math.max(preview.radius, 2 * pixel);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.arc(at[0], at[1], radius, 0, Math.PI * 2);
    ctx.globalAlpha = STAMP_PREVIEW_ALPHA;
    ctx.fillStyle = previewPattern(ctx, tile) ?? colour;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash(eraser ? [4 * pixel, 3 * pixel] : []);
    ctx.lineWidth = 2 * pixel;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    ctx.lineWidth = pixel;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.setLineDash([]);
  } finally {
    ctx.restore();
  }
}

/** Draw a stroke, a shape, a stamp, the brush or a selection on its way: a stroke or a shape as it will land, in its texture. */
export function drawPaintPreview(ctx: CanvasRenderingContext2D, preview: PaintPreview): void {
  if (preview.kind === 'stroke') strokePaint(ctx, preview.points, preview.width, previewPattern(ctx, preview.tile) ?? preview.colour);
  else if (preview.kind === 'shape') drawShape(ctx, preview.shape, previewPattern(ctx, preview.tile));
  else if (preview.kind === 'stamp') {
    ctx.save();
    try {
      ctx.globalAlpha = STAMP_PREVIEW_ALPHA;
      drawStamp(ctx, preview.place);
    } finally {
      ctx.restore();
    }
  } else if (preview.kind === 'brush') drawBrushPreview(ctx, preview);
  else drawSelection(ctx, preview);
}

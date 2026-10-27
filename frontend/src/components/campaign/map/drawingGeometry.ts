// ============================================
// The shapes of the drawings on a map, with no DOM: their order, the box each
// covers, an arrow's head, a label's size. The drawing layer draws by them and
// the eraser's hit test finds a drawing by them, so the two agree on where a
// drawing is.
//
// Points are map pixels from the map's top-left corner. A drawing turns by its
// `rotation`, in degrees clockwise, about the middle of the box its points
// cover (a label's about its point).
// ============================================

import type { Drawing } from '@/types/drawings';

/** The fields of a drawing its shape is made from: a stored drawing or one being drawn. */
export interface DrawingShape {
  kind: string;
  width: number;
  points: ReadonlyArray<readonly [number, number]>;
  rotation?: number;
  text?: string | null;
}

/** A box in map pixels. */
export interface Box { minX: number; minY: number; maxX: number; maxY: number }

/**
 * The order the server keeps a layer's drawings in, and so draws them: by
 * `sortKey`, then the order they were made, then their id.
 */
export function drawingOrder(a: Drawing, b: Drawing): number {
  if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A label's letters are four times its width tall, in map pixels. */
export function labelFontSize(width: number): number {
  return width * 4;
}

/**
 * Each label's width as the layer measured it, in map pixels, by the
 * drawing: the layer measures a label once, as it first draws it, and the
 * culling and the eraser's hit test then go by the width drawn. A changed
 * drawing is a new object and is measured again, and so is every label
 * once a font has loaded (watchLabelFonts).
 */
let labelWidths = new WeakMap<object, number>();
/** How many times every width has been dropped: what was worked out from them before is stale. */
let labelWidthsDropped = 0;

/** Counts each time every label's width is dropped, so what the layer keeps by them can tell it is stale. */
export function labelMeasureEpoch(): number {
  return labelWidthsDropped;
}

/**
 * Call `onLoaded` each time the page loads a font (`document.fonts`'
 * `loadingdone`), every label's width dropped first: one drawn before its
 * font arrived was measured in the fallback font. The answer stops it.
 */
export function watchLabelFonts(onLoaded: () => void): () => void {
  const fonts: FontFaceSet | undefined = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts) return () => undefined;
  const loaded = () => {
    labelWidths = new WeakMap();
    labelWidthsDropped += 1;
    onLoaded();
  };
  fonts.addEventListener('loadingdone', loaded);
  return () => fonts.removeEventListener('loadingdone', loaded);
}

/** Record a label's measured width (the layer, as it draws it). */
export function rememberLabelWidth(shape: object, width: number): void {
  if (Number.isFinite(width) && width > 0) labelWidths.set(shape, width);
}

/** A label's measured width, if it has been drawn. */
export function measuredLabelWidth(shape: object): number | undefined {
  return labelWidths.get(shape);
}

/**
 * The box a label takes from its point, its top-left corner: as wide as
 * the layer measured it, or, before it has been drawn, a letter-height for
 * each character, which covers the widest scripts and most emoji. The layer
 * clips what it draws to this box's height.
 */
export function labelBox(shape: DrawingShape): Box {
  const [x, y] = shape.points[0] ?? [0, 0];
  const size = labelFontSize(shape.width);
  const length = [...(shape.text ?? '')].length;
  const width = measuredLabelWidth(shape) ?? Math.max(size, length * size);
  return { minX: x, minY: y, maxX: x + width, maxY: y + size * 1.25 };
}

/** The box the points cover, not counting the stroke's width. */
function pointBox(points: DrawingShape['points']): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** The point a drawing turns about. */
export function rotationCentre(shape: DrawingShape): { x: number; y: number } {
  if (shape.kind === 'text') {
    const [x, y] = shape.points[0] ?? [0, 0];
    return { x, y };
  }
  const box = pointBox(shape.points);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/** An arrow's head: its tip, the two corners of its base, and where the shaft stops short of it. */
export interface ArrowHead {
  tip: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
  shaftEnd: { x: number; y: number };
}

/**
 * The head of an arrow from its first point to its second, sized by its
 * width: four widths long, at least 12 map pixels, and never longer than the
 * arrow. The shaft stops inside the head, so its round end does not show
 * past the tip. Null for an arrow of no length.
 */
export function arrowHead(shape: DrawingShape): ArrowHead | null {
  const [from, to] = shape.points;
  if (!from || !to) return null;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  const head = Math.min(length, Math.max(12, shape.width * 4));
  const half = head * 0.55;
  const baseX = to[0] - ux * head;
  const baseY = to[1] - uy * head;
  return {
    tip: { x: to[0], y: to[1] },
    left: { x: baseX - uy * half, y: baseY + ux * half },
    right: { x: baseX + uy * half, y: baseY - ux * half },
    shaftEnd: { x: to[0] - ux * head * 0.6, y: to[1] - uy * head * 0.6 },
  };
}

/**
 * The box a drawing covers on the map, its stroke, an arrow's head and a
 * label included, and turned: a drawing that turns is given the box of the
 * circle it turns within.
 */
export function drawingBounds(shape: DrawingShape): Box {
  let box: Box;
  if (shape.kind === 'text') {
    box = labelBox(shape);
  } else {
    const points = pointBox(shape.points);
    const reach = shape.width / 2 + (shape.kind === 'arrow' ? Math.max(12, shape.width * 4) * 0.55 : 0);
    box = { minX: points.minX - reach, minY: points.minY - reach, maxX: points.maxX + reach, maxY: points.maxY + reach };
  }
  if (!shape.rotation) return box;
  const centre = rotationCentre(shape);
  const radius = Math.max(
    Math.hypot(box.minX - centre.x, box.minY - centre.y),
    Math.hypot(box.maxX - centre.x, box.minY - centre.y),
    Math.hypot(box.minX - centre.x, box.maxY - centre.y),
    Math.hypot(box.maxX - centre.x, box.maxY - centre.y),
  );
  return { minX: centre.x - radius, minY: centre.y - radius, maxX: centre.x + radius, maxY: centre.y + radius };
}

/** Whether two boxes meet. */
export function boxesMeet(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

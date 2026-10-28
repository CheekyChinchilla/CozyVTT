// ============================================
// Drawing layer: what the DM and the players draw on a map (pen strokes,
// lines, arrows, rectangles, ellipses, polygons and text labels), and the
// previews of strokes on their way and of the laser pointer.
//
// The markup layer is the topmost of the map, on the overlay: over the
// tokens, a player's fog and the lit map's darkness, so a table can plan
// over ground it cannot see. The strokes on their way are drawn over it,
// and the laser pointer and the pings over them, since pointing is a signal.
// The ground layer, under the grid, is kept for a DM's map art.
//
// A drawing for the DM alone is drawn, dashed and faded, in the DM's own
// view, and in no other: Player Preview shows what a player is sent, which
// never holds one.
//
// Pure: no React. The traced outline of each drawing is kept in a cache the
// caller holds, by the drawing object, so a pan or a zoom strokes the same
// paths again; a changed drawing is a new object and is traced again. The
// markup layer's pixels are kept there too (drawMarkupLayer), since the
// overlay repaints far more often than they change. Save as picture (a
// later release) calls this with a viewport and a cache of its own.
// ============================================

import type { Viewport } from './types';
import type { Drawing } from '@/types/drawings';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import {
  arrowHead, boxesMeet, drawingBounds, labelBox, labelFontSize, labelMeasureEpoch, measuredLabelWidth, rememberLabelWidth, rotationCentre,
  type Box, type DrawingShape,
} from '../drawingGeometry';

/** A filled shape's fill shows the map through it. */
const FILL_ALPHA = 0.3;
/** A drawing for the DM alone, in the DM's own view. */
const DM_ONLY_ALPHA = 0.6;
const LABEL_FONT = "600 SIZEpx 'Inter', system-ui, sans-serif";
/** The laser pointer's core and glow, in screen pixels at any zoom. */
const LASER_CORE_PX = 4;
const LASER_GLOW_PX = 12;
const LASER_GLOW_ALPHA = 0.35;
/**
 * The strengths a laser's trail is stroked in, each pass: a segment is
 * drawn at its strength rounded up to one of them, so the trail fades in
 * steps and a pass strokes this many paths at most, however many points.
 */
const LASER_BANDS = 8;
/** A stroke on its way stays whole this long after its last frame, then fades out by its time. */
const PREVIEW_FADE_MS = 1000;

/** What a path is traced into: a Path2D, or the context itself where there is no Path2D. */
type PathSink = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'closePath' | 'rect' | 'ellipse'>;

/**
 * A drawing's outline, traced once: what is stroked, and what is filled
 * (null where there is no Path2D, as in jsdom, and the outline is traced
 * into the context each time), and the box it covers, a label's by its
 * measured width.
 */
interface Traced {
  stroke: Path2D | null;
  /** An arrow's head; a closed shape's fill is its stroke path. */
  head: Path2D | null;
  bounds: Box;
  /** For a label, the measure it was boxed by (labelMeasureEpoch). */
  measure: number;
}

/** The markup layer's pixels (drawMarkupLayer), and what they were drawn for. */
interface KeptMarkup {
  canvas: HTMLCanvasElement;
  key: unknown[];
}

/** Each drawing's traced outline, by the drawing object, and the markup layer's pixels. */
export interface DrawingCache {
  traced: WeakMap<Drawing, Traced>;
  markup: KeptMarkup | null;
}

export function createDrawingCache(): DrawingCache {
  return { traced: new WeakMap(), markup: null };
}

export interface DrawingsDrawState {
  /** In drawing order (drawingOrder). */
  drawings: readonly Drawing[];
  layer: 'MARKUP' | 'GROUND';
  /** The DM's own view: drawings for the DM alone are drawn, marked. Anywhere else they are left out. */
  showDmOnly: boolean;
  /** The part of the map on screen, in map pixels; drawings wholly outside it are skipped. Omitted: all are drawn. */
  visible?: Box | null;
  cache?: DrawingCache;
}

const KNOWN_KINDS = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse', 'polygon', 'text']);
const CLOSED_KINDS = new Set(['rect', 'ellipse', 'polygon']);

/** Trace a shape's outline (an arrow's shaft) into `sink`. */
function traceOutline(sink: PathSink, shape: DrawingShape): void {
  const pts = shape.points;
  const first = pts[0];
  if (!first) return;
  switch (shape.kind) {
    case 'pen':
    case 'line':
    case 'polygon': {
      sink.moveTo(first[0], first[1]);
      for (let i = 1; i < pts.length; i++) sink.lineTo(pts[i][0], pts[i][1]);
      if (shape.kind === 'polygon') sink.closePath();
      return;
    }
    case 'arrow': {
      const head = arrowHead(shape);
      const end = head?.shaftEnd ?? { x: pts[1]?.[0] ?? first[0], y: pts[1]?.[1] ?? first[1] };
      sink.moveTo(first[0], first[1]);
      sink.lineTo(end.x, end.y);
      return;
    }
    case 'rect': {
      const second = pts[1] ?? first;
      sink.rect(Math.min(first[0], second[0]), Math.min(first[1], second[1]), Math.abs(second[0] - first[0]), Math.abs(second[1] - first[1]));
      return;
    }
    case 'ellipse': {
      const second = pts[1] ?? first;
      sink.ellipse((first[0] + second[0]) / 2, (first[1] + second[1]) / 2, Math.abs(second[0] - first[0]) / 2, Math.abs(second[1] - first[1]) / 2, 0, 0, Math.PI * 2);
      return;
    }
  }
}

/** Trace an arrow's head into `sink`; false for an arrow of no length. */
function traceHead(sink: PathSink, shape: DrawingShape): boolean {
  const head = arrowHead(shape);
  if (!head) return false;
  sink.moveTo(head.tip.x, head.tip.y);
  sink.lineTo(head.left.x, head.left.y);
  sink.lineTo(head.right.x, head.right.y);
  sink.closePath();
  return true;
}

/** The font a label's letters are written in. */
function labelFont(width: number): string {
  return LABEL_FONT.replace('SIZE', String(labelFontSize(width)));
}

/**
 * A drawing's outline from the cache, traced into new paths the first
 * time; a label measured the first time, in its font, and again once a
 * font has loaded.
 */
function tracedFor(ctx: CanvasRenderingContext2D, d: Drawing, cache: DrawingCache | undefined): Traced {
  const cached = cache?.traced.get(d);
  if (cached && (d.kind !== 'text' || cached.measure === labelMeasureEpoch())) return cached;
  let stroke: Path2D | null = null;
  let head: Path2D | null = null;
  if (d.kind === 'text') {
    if (measuredLabelWidth(d) === undefined) {
      ctx.save();
      ctx.font = labelFont(d.width);
      rememberLabelWidth(d, ctx.measureText(d.text ?? '').width);
      ctx.restore();
    }
  } else if (typeof Path2D !== 'undefined') {
    stroke = new Path2D();
    traceOutline(stroke, d);
    if (d.kind === 'arrow') {
      head = new Path2D();
      if (!traceHead(head, d)) head = null;
    }
  }
  const traced = { stroke, head, bounds: drawingBounds(d), measure: labelMeasureEpoch() };
  cache?.traced.set(d, traced);
  return traced;
}

/** How a stroke is drawn: its colour, width and look. */
interface Look {
  color: string;
  width: number;
  /** For the DM alone, in the DM's view: dashed and faded. */
  dmOnly: boolean;
  /** 0 to 1, over whatever the context's alpha already is. */
  alpha: number;
}

function strokeStyleFor(ctx: CanvasRenderingContext2D, look: Look): void {
  ctx.strokeStyle = look.color;
  ctx.fillStyle = look.color;
  ctx.lineWidth = look.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = look.alpha * (look.dmOnly ? DM_ONLY_ALPHA : 1);
  ctx.setLineDash(look.dmOnly ? [Math.max(6, look.width * 2), Math.max(4, look.width * 1.5)] : []);
}

/** Draw one shape (not a label) in its look: stroked, an arrow's head and a closed shape's fill filled. */
function drawShape(ctx: CanvasRenderingContext2D, shape: DrawingShape, fillColor: string | null, look: Look, traced: Traced | null): void {
  strokeStyleFor(ctx, look);
  const closed = CLOSED_KINDS.has(shape.kind);
  if (traced?.stroke) {
    if (closed && fillColor) {
      const alpha = ctx.globalAlpha;
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = alpha * FILL_ALPHA;
      ctx.fill(traced.stroke);
      ctx.globalAlpha = alpha;
    }
    ctx.stroke(traced.stroke);
    if (traced.head) {
      ctx.fillStyle = look.color;
      ctx.fill(traced.head);
    }
    return;
  }
  ctx.beginPath();
  traceOutline(ctx, shape);
  if (closed && fillColor) {
    const alpha = ctx.globalAlpha;
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = alpha * FILL_ALPHA;
    ctx.fill();
    ctx.globalAlpha = alpha;
  }
  ctx.stroke();
  if (shape.kind === 'arrow') {
    ctx.beginPath();
    if (traceHead(ctx, shape)) {
      ctx.setLineDash([]);
      ctx.fillStyle = look.color;
      ctx.fill();
    }
  }
}

/** A colour's brightness, 0 to 1, for a label's outline in the opposite. */
function brightness(color: string): number {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) return 0.5;
  const n = parseInt(hex[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * Write a label from its point, its top-left corner, with an outline in the
 * opposite of its colour so it reads over any map. It is clipped to its own
 * lines, so marks stacked on its letters paint no further.
 */
function drawLabel(ctx: CanvasRenderingContext2D, d: Drawing, dmOnly: boolean): void {
  const [x, y] = d.points[0] ?? [0, 0];
  const size = labelFontSize(d.width);
  const text = d.text ?? '';
  ctx.font = labelFont(d.width);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = dmOnly ? DM_ONLY_ALPHA : 1;
  ctx.setLineDash([]);
  // As wide as it was measured, once, as it was first drawn.
  const textWidth = labelBox(d).maxX - x;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - size, y - size * 0.25, textWidth + size * 2, size * 1.75);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, size / 6);
  ctx.strokeStyle = brightness(d.color) > 0.6 ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = d.color;
  ctx.fillText(text, x, y);
  ctx.restore();
  if (dmOnly) {
    ctx.strokeStyle = d.color;
    ctx.lineWidth = Math.max(1, size / 12);
    ctx.setLineDash([size / 3, size / 4]);
    ctx.strokeRect(x - size * 0.15, y - size * 0.1, textWidth + size * 0.3, size * 1.35);
  }
}

/**
 * Draw one layer's drawings, in the order given. Drawings of a kind this
 * release does not know are left out, so nothing is drawn as what it is not.
 */
export function drawDrawings(ctx: CanvasRenderingContext2D, state: DrawingsDrawState, _viewport: Viewport): void {
  for (const d of state.drawings) {
    if (d.layer !== state.layer || !KNOWN_KINDS.has(d.kind)) continue;
    const dmOnly = d.audience === 'DM';
    if (dmOnly && !state.showDmOnly) continue;
    const traced = tracedFor(ctx, d, state.cache);
    if (state.visible && !boxesMeet(traced.bounds, state.visible)) continue;

    ctx.save();
    if (d.rotation) {
      const centre = rotationCentre(d);
      ctx.translate(centre.x, centre.y);
      ctx.rotate((d.rotation * Math.PI) / 180);
      ctx.translate(-centre.x, -centre.y);
    }
    if (d.kind === 'text') drawLabel(ctx, d, dmOnly);
    else drawShape(ctx, d, d.fillColor, { color: d.color, width: d.width, dmOnly, alpha: 1 }, traced);
    ctx.restore();
  }
}

export interface MarkupDrawState extends Omit<DrawingsDrawState, 'layer' | 'cache'> {
  cache: DrawingCache;
}

/**
 * Draw the markup layer onto `ctx`, set to the viewport, from pixels kept
 * in the cache. They are drawn again only when the drawings, whose view it
 * is, the view, the canvas's size or the labels' measures change, and
 * copied on at every other repaint, so a repaint of the overlay for a ping,
 * the laser, a stroke on its way or a token moving strokes none of them.
 * Where no canvas can be made for them they are drawn straight on.
 */
export function drawMarkupLayer(ctx: CanvasRenderingContext2D, state: MarkupDrawState, viewport: Viewport): void {
  if (!state.drawings.some((d) => d.layer === 'MARKUP')) return;
  const target: HTMLCanvasElement | undefined = ctx.canvas;
  const canvas = state.cache.markup?.canvas ?? target?.ownerDocument.createElement('canvas');
  const off = canvas?.getContext('2d');
  if (!target || !canvas || !off) {
    drawDrawings(ctx, { ...state, layer: 'MARKUP' }, viewport);
    return;
  }
  const at = ctx.getTransform();
  const seen = state.visible;
  const key = [
    state.drawings, state.showDmOnly, viewport.zoom, viewport.panOffset.x, viewport.panOffset.y, target.width, target.height,
    at.a, at.b, at.c, at.d, at.e, at.f, seen?.minX, seen?.minY, seen?.maxX, seen?.maxY, labelMeasureEpoch(),
  ];
  const kept = state.cache.markup;
  if (!kept || kept.key.some((k, i) => k !== key[i])) {
    // A canvas's size set, even to what it was, clears it and its state.
    if (canvas.width !== target.width) canvas.width = target.width;
    if (canvas.height !== target.height) canvas.height = target.height;
    off.setTransform(1, 0, 0, 1, 0, 0);
    off.clearRect(0, 0, canvas.width, canvas.height);
    off.setTransform(at);
    drawDrawings(off, { ...state, layer: 'MARKUP' }, viewport);
    state.cache.markup = { canvas, key };
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

// ── Strokes on their way, and the laser pointer ──────────────────────────────

/** A stroke someone else is drawing, or their laser pointer, as their frames have brought it. */
export interface ActivePreview {
  /** The sender's id and the stroke's previewId. */
  key: string;
  kind: string;
  color: string;
  width: number;
  audience: 'ALL' | 'DM';
  laser: boolean;
  points: Array<[number, number]>;
  /** When each point arrived, for the laser's trail, which fades point by point. */
  times: number[];
  /** When its last frame arrived. */
  lastAt: number;
}

export interface PreviewDrawState {
  previews: readonly ActivePreview[];
  now: number;
  reducedMotion: boolean;
  /** As for drawings: the DM's own view. */
  showDmOnly: boolean;
  /** The laser pointer's pass, over a player's fog; otherwise the strokes', under it. */
  laser: boolean;
}

/**
 * How much of a stroke on its way shows, `now`, after its last frame at
 * `lastAt`: whole while its frames keep coming (a sender holding still sends
 * one a second), then fading over its last second, and gone
 * DRAWING_LIMITS.previewTtlMs after its last frame. Under reduced motion it
 * shows whole until then.
 */
export function previewOpacity(lastAt: number, now: number, reducedMotion: boolean): number {
  const age = now - lastAt;
  const ttl = DRAWING_LIMITS.previewTtlMs;
  if (age >= ttl) return 0;
  if (reducedMotion || age <= ttl - PREVIEW_FADE_MS) return 1;
  return (ttl - age) / PREVIEW_FADE_MS;
}

/**
 * How much of a point of the laser's trail shows, `now`, for a point that
 * arrived `at`: fading from whole as it arrives to nothing
 * DRAWING_LIMITS.previewTtlMs later, so the trail fades behind the pointer.
 * Under reduced motion it shows whole until then, and goes at its time.
 */
export function laserPointOpacity(at: number, now: number, reducedMotion: boolean): number {
  const age = now - at;
  const ttl = DRAWING_LIMITS.previewTtlMs;
  if (age >= ttl) return 0;
  if (reducedMotion) return 1;
  return Math.max(0, 1 - age / ttl);
}

function drawLaser(ctx: CanvasRenderingContext2D, p: ActivePreview, now: number, reducedMotion: boolean, zoom: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = p.color;
  const segments: Array<{ from: [number, number]; to: [number, number]; alpha: number }> = [];
  for (let i = 1; i < p.points.length; i++) {
    const alpha = laserPointOpacity(p.times[i] ?? p.lastAt, now, reducedMotion);
    if (alpha > 0) segments.push({ from: p.points[i - 1], to: p.points[i], alpha });
  }
  // A pointer held on one spot is a dot.
  if (p.points.length === 1) {
    const alpha = laserPointOpacity(p.times[0] ?? p.lastAt, now, reducedMotion);
    if (alpha > 0) segments.push({ from: p.points[0], to: p.points[0], alpha });
  }
  const bands = Array.from({ length: LASER_BANDS }, (): typeof segments => []);
  for (const s of segments) bands[Math.min(LASER_BANDS, Math.ceil(s.alpha * LASER_BANDS)) - 1].push(s);
  for (const [width, fade] of [[LASER_GLOW_PX, LASER_GLOW_ALPHA], [LASER_CORE_PX, 1]] as const) {
    ctx.lineWidth = width / zoom;
    // Faintest first, so the newest of the trail is on top.
    bands.forEach((band, i) => {
      if (band.length === 0) return;
      ctx.globalAlpha = ((i + 1) / LASER_BANDS) * fade;
      ctx.beginPath();
      let at: [number, number] | null = null;
      for (const s of band) {
        // A segment that goes on from the last one carries its line on.
        if (s.from !== at) ctx.moveTo(s.from[0], s.from[1]);
        ctx.lineTo(s.to[0], s.to[1]);
        at = s.to;
      }
      ctx.stroke();
    });
  }
}

/** Draw the strokes on their way, or the laser pointers, as each fades by its age. */
export function drawDrawingPreviews(ctx: CanvasRenderingContext2D, state: PreviewDrawState, viewport: Viewport): void {
  for (const p of state.previews) {
    if (p.laser !== state.laser) continue;
    const dmOnly = p.audience === 'DM';
    if (dmOnly && !state.showDmOnly) continue;
    ctx.save();
    if (p.laser) {
      drawLaser(ctx, p, state.now, state.reducedMotion, viewport.zoom);
    } else if (KNOWN_KINDS.has(p.kind) && p.kind !== 'text' && p.points.length > 0) {
      const alpha = previewOpacity(p.lastAt, state.now, state.reducedMotion);
      if (alpha > 0) drawShape(ctx, p, null, { color: p.color, width: p.width, dmOnly, alpha }, null);
    }
    ctx.restore();
  }
}

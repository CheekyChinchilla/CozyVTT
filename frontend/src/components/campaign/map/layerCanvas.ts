// ============================================
// The map's canvases at the screen's pixel ratio.
//
// Each visible canvas holds css size times the ratio in pixels, and keeps its
// CSS size, so one canvas pixel is one screen pixel. Everything else about the
// map (the viewport, hit testing, the tools) stays in CSS pixels: the ratio
// enters only here, in the size of the pixel store and in the one transform
// every layer draws through.
// ============================================

import type { Viewport } from './layers/types';

/**
 * The most pixels one canvas may hold: 4,096 squared, the largest canvas
 * Safari on an iPhone or iPad will draw. Applies to each canvas on its own.
 */
export const MAX_BACKING_PIXELS = 16_777_216;

/**
 * The densest phone screens are 3. A browser zoomed far in reports more, and
 * the pixels grow with the square of the ratio for no visible gain.
 */
const MAX_RATIO = 3;

/**
 * The ratio to draw a cssW by cssH canvas at: the device's, at most 3, and
 * lowered while the canvas would hold more than MAX_BACKING_PIXELS. Never
 * below min(1, devicePixelRatio), so a huge screen is not drawn coarser than
 * one pixel per CSS pixel. A missing or unusable ratio counts as 1, and a
 * canvas not yet measured (0 by 0) sets no limit.
 */
export function effectiveDpr(devicePixelRatio: number | undefined, cssW: number, cssH: number): number {
  const device = typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  let ratio = Math.min(device, MAX_RATIO);
  const area = cssW * cssH;
  if (area > 0 && area * ratio * ratio > MAX_BACKING_PIXELS) {
    ratio = Math.sqrt(MAX_BACKING_PIXELS / area);
  }
  return Math.max(ratio, Math.min(1, device));
}

/**
 * The pixel size for a canvas meant to be w by h: as it is while it holds no
 * more than MAX_BACKING_PIXELS, else smaller by one factor on both sides
 * until it does. For the lighting canvases, which are the size of the map.
 */
export function withinBackingLimit(w: number, h: number): { width: number; height: number } {
  if (!(w * h > MAX_BACKING_PIXELS)) return { width: w, height: h };
  const scale = Math.sqrt(MAX_BACKING_PIXELS / (w * h));
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}

/**
 * The ratio each canvas was last sized at here. Its pixel size and ratio
 * decide its CSS size, so when neither changed there is nothing to assign;
 * comparing the CSS strings instead would depend on how the browser writes a
 * fractional length back.
 */
const sizedAt = new WeakMap<HTMLCanvasElement, number>();

/**
 * Sizes a canvas's pixel store to floor(css times ratio) and its CSS size to
 * that over the ratio. Assigns only what changed, since assigning `width` or
 * `height` clears the canvas even when the value is the same, and answers
 * whether it changed anything, so the caller knows to redraw.
 */
export function sizeBackingStore(canvas: HTMLCanvasElement, cssW: number, cssH: number, dpr: number): boolean {
  const w = Math.max(0, Math.floor(cssW * dpr)) || 0;
  const h = Math.max(0, Math.floor(cssH * dpr)) || 0;
  if (canvas.width === w && canvas.height === h && sizedAt.get(canvas) === dpr) return false;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${w / dpr}px`;
  canvas.style.height = `${h / dpr}px`;
  sizedAt.set(canvas, dpr);
  return true;
}

/**
 * The world transform: map pixels to canvas pixels through the zoom, the pan
 * and the ratio. Absolute, so it does not matter what was set before. At
 * ratio 1 it is the matrix translate(pan) then scale(zoom) made.
 */
export function applyViewport(
  ctx: CanvasRenderingContext2D,
  viewport: Pick<Viewport, 'zoom' | 'panOffset'>,
  dpr: number
): void {
  const scale = dpr * viewport.zoom;
  ctx.setTransform(scale, 0, 0, scale, dpr * viewport.panOffset.x, dpr * viewport.panOffset.y);
}

/** The identity transform, then a clear of every pixel the canvas holds. */
export function clearLayer(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

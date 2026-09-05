// ============================================
// Dynamic lighting layer — darkness with light/vision coverage
// subtracted (offscreen compositing, "dim overlap → bright" house
// rule), warm token/light glows, and the DM's light-source icons.
//
// Pure: no React. The two offscreen canvases persist between frames
// (allocating ~5MB per frame causes GC jank), so the caller passes
// mutable holders that this module fills/reuses.
// ============================================

import type { Token } from '@/types';
import type { LightSource } from '@/types/walls';
import { gridYToCentrePx } from '../coords';
import type { LightToolMode } from '@/components/campaign/DmLightControls';
import { mapSizePx, type Viewport } from './types';
import type { VisionSource } from '../vision';

/** Mutable holder for a persistent offscreen canvas (a React ref works). */
export interface CanvasHolder {
  current: HTMLCanvasElement | null;
}

export interface LightingDrawState {
  /** Tokens whose vision contributes coverage (the viewer's tokens). */
  myTokens: readonly Token[];
  enabledLights: readonly LightSource[];
  /** Precomputed via computeVisionState — order must match inputs. */
  tokenVision: readonly VisionSource[];
  /**
   * Line of sight per viewer token, unbounded by sight radius. Light is only
   * allowed to reveal ground inside this — see the clip below.
   */
  tokenSight: readonly VisionSource[];
  lightVision: readonly VisionSource[];
  /** Persistent offscreen canvases (fog composite + light coverage + sight mask). */
  lightingCanvas: CanvasHolder;
  coverageCanvas: CanvasHolder;
  lightCanvas: CanvasHolder;
}

function ensureCanvas(holder: CanvasHolder, w: number, h: number): HTMLCanvasElement {
  if (!holder.current || holder.current.width !== w || holder.current.height !== h) {
    holder.current = document.createElement('canvas');
    holder.current.width = w;
    holder.current.height = h;
  }
  return holder.current;
}

/**
 * Player-view darkness pass. Assumes the caller has already decided the
 * viewer should see fog (actual player, or DM in preview mode).
 */
export function drawDynamicLighting(
  ctx: CanvasRenderingContext2D,
  state: LightingDrawState,
  viewport: Viewport
): void {
  const { w: mapWidthPx, h: mapHeightPx } = mapSizePx(viewport);

  if (state.myTokens.length === 0 && state.enabledLights.length === 0) {
    // No tokens and no lights → full darkness
    ctx.save();
    ctx.fillStyle = 'rgba(15, 12, 25, 1)';
    ctx.fillRect(0, 0, mapWidthPx, mapHeightPx);
    ctx.restore();
    return;
  }

  const offscreen = ensureCanvas(state.lightingCanvas, mapWidthPx, mapHeightPx);
  const offCtx = offscreen.getContext('2d')!;
  // Must clear before reuse — persists between frames
  offCtx.clearRect(0, 0, mapWidthPx, mapHeightPx);

  // ── Light coverage offscreen ────────────────────────────────────
  // Per-pixel "light intensity" map: alpha 1.0 = bright, 0.5 = dim,
  // 0 = dark. Token vision and bright zones contribute alpha 1.0; dim
  // zones contribute 0.5. Alphas sum via 'lighter' compositing and are
  // clamped at 1.0 — so two overlapping dim zones (0.5 + 0.5) become
  // bright. This is the "dim overlap → bright" house rule.
  const coverage = ensureCanvas(state.coverageCanvas, mapWidthPx, mapHeightPx);
  const covCtx = coverage.getContext('2d')!;
  covCtx.clearRect(0, 0, mapWidthPx, mapHeightPx);
  covCtx.globalCompositeOperation = 'lighter';
  covCtx.fillStyle = 'rgba(255, 255, 255, 1)';

  /** Trace a visibility polygon as a path on the given context. */
  const tracePoly = (c: CanvasRenderingContext2D, poly: VisionSource['poly']) => {
    c.beginPath();
    c.moveTo(poly.points[0].x, poly.points[0].y);
    for (let i = 1; i < poly.points.length; i++) c.lineTo(poly.points[i].x, poly.points[i].y);
    c.closePath();
  };

  // ── Light coverage, on its own canvas ───────────────────────────
  // Built separately so it can be intersected with the viewer's line of sight
  // before it joins the coverage mask.
  //
  // Clipping a light to its OWN polygon gives it wall shadows, which is
  // necessary but not sufficient: it says where the light falls, not who can
  // see where it falls. Adding that straight to the coverage mask meant any lit
  // ground anywhere was subtracted from the fog, so a lamp inside a sealed room
  // lit that room for a player standing outside it. Light reveals what you
  // could already have seen; it never sees on your behalf.
  const lightLayer = ensureCanvas(state.lightCanvas, mapWidthPx, mapHeightPx);
  const lightCtx = lightLayer.getContext('2d')!;
  lightCtx.clearRect(0, 0, mapWidthPx, mapHeightPx);
  lightCtx.globalCompositeOperation = 'lighter';

  for (let li = 0; li < state.enabledLights.length; li++) {
    const light = state.enabledLights[li];
    const poly = state.lightVision[li]?.poly;
    if (!poly || poly.points.length < 3) continue;

    const dimRadiusPx = light.dimRadius * viewport.gridSize;
    const brightRadiusPx = light.brightRadius * viewport.gridSize;

    lightCtx.save();
    tracePoly(lightCtx, poly);
    lightCtx.clip();

    if (dimRadiusPx > 0) {
      lightCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      lightCtx.beginPath();
      lightCtx.arc(light.x, light.y, dimRadiusPx, 0, Math.PI * 2);
      lightCtx.fill();
    }
    if (brightRadiusPx > 0) {
      lightCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      lightCtx.beginPath();
      lightCtx.arc(light.x, light.y, brightRadiusPx, 0, Math.PI * 2);
      lightCtx.fill();
    }
    lightCtx.restore();
  }

  // Keep only the lit ground the viewer actually has line of sight to.
  //
  // The union of the sight polygons is built on the coverage canvas first,
  // borrowed as scratch — it is about to be cleared and rebuilt anyway, and a
  // fourth full-map canvas would cost real memory on a large map. The union has
  // to be assembled before the intersection rather than applied polygon by
  // polygon: a second `destination-in` would erase what the first had kept,
  // leaving only the overlap of two tokens' views instead of their sum.
  covCtx.globalCompositeOperation = 'source-over';
  for (const { poly } of state.tokenSight) {
    if (poly.points.length >= 3) {
      tracePoly(covCtx, poly);
      covCtx.fill();
    }
  }
  lightCtx.globalCompositeOperation = 'destination-in';
  lightCtx.drawImage(coverage, 0, 0);
  lightCtx.globalCompositeOperation = 'source-over';

  // ── Coverage mask proper ────────────────────────────────────────
  covCtx.clearRect(0, 0, mapWidthPx, mapHeightPx);
  covCtx.globalCompositeOperation = 'lighter';

  // Token vision → bright (alpha 1.0) within the visibility polygon. This is
  // what a token makes out unaided, so it is not gated on light.
  for (const { poly } of state.tokenVision) {
    if (poly.points.length >= 3) {
      tracePoly(covCtx, poly);
      covCtx.fill();
    }
  }

  // ...then the light the viewer can see, added on top.
  covCtx.drawImage(lightLayer, 0, 0);
  covCtx.globalCompositeOperation = 'source-over';

  // ── Build fog with coverage subtracted ──────────────────────────
  offCtx.fillStyle = 'rgba(15, 12, 25, 0.95)';
  offCtx.fillRect(0, 0, mapWidthPx, mapHeightPx);
  offCtx.globalCompositeOperation = 'destination-out';
  offCtx.drawImage(coverage, 0, 0);
  offCtx.globalCompositeOperation = 'source-over';

  // Composite onto main canvas with soft blur edge
  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.drawImage(offscreen, 0, 0);
  ctx.filter = 'none';
  ctx.restore();

  // Cozy torch-glow: warm radial gradient around each controlled token
  ctx.save();
  for (const token of state.myTokens) {
    const cx = (token.position.x + token.size.width / 2) * viewport.gridSize;
    const cy = gridYToCentrePx(token.position.y, token.size.height, viewport.mapHeight, viewport.gridSize);
    const glowR = Math.max(
      viewport.gridSize * 2,
      (token.sightRadius ?? 3) * viewport.gridSize * 0.25
    );
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0, 'rgba(255, 200, 100, 0.10)');
    glow.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two-zone light glow: bright inner + dim outer. Additive compositing
  // lets overlapping dim zones read as bright.
  //
  // Clipped to the viewer's line of sight for the same reason the coverage mask
  // is. Subtracting the lit ground from the fog was only half of it: this pass
  // paints the warm glow straight onto the canvas, so a lamp sealed in a room
  // still showed as a bright bloom hanging over the wall — telling a player
  // there was a light there, and roughly where, which is most of what the wall
  // was hiding. All the sight polygons go into ONE path so the clip is their
  // union rather than the last one.
  ctx.save();
  ctx.beginPath();
  let clipped = false;
  for (const { poly } of state.tokenSight) {
    if (poly.points.length < 3) continue;
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    for (let i = 1; i < poly.points.length; i++) ctx.lineTo(poly.points[i].x, poly.points[i].y);
    ctx.closePath();
    clipped = true;
  }
  // No viewer tokens means no line of sight at all, so no light is seen either.
  if (!clipped) ctx.rect(0, 0, 0, 0);
  ctx.clip();

  ctx.globalCompositeOperation = 'lighter';
  for (const light of state.enabledLights) {
    const brightPx = light.brightRadius * viewport.gridSize;
    const dimPx = light.dimRadius * viewport.gridSize;
    const r = parseInt(light.color.slice(1, 3), 16);
    const g = parseInt(light.color.slice(3, 5), 16);
    const b = parseInt(light.color.slice(5, 7), 16);

    if (brightPx > 0) {
      const brightGlow = ctx.createRadialGradient(
        light.x, light.y, 0, light.x, light.y, brightPx
      );
      brightGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.12)`);
      brightGlow.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.06)`);
      brightGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = brightGlow;
      ctx.beginPath();
      ctx.arc(light.x, light.y, brightPx, 0, Math.PI * 2);
      ctx.fill();
    }

    if (dimPx > brightPx) {
      const dimGlow = ctx.createRadialGradient(
        light.x, light.y, brightPx * 0.8, light.x, light.y, dimPx
      );
      dimGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.05)`);
      dimGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = dimGlow;
      ctx.beginPath();
      ctx.arc(light.x, light.y, dimPx, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore(); // the sight clip around the light glows
  ctx.restore(); // the token torch-glow save
}

export interface LightIconsDrawState {
  lights: readonly LightSource[];
  selectedLightId: string | null;
  lightMode: LightToolMode;
}

/** DM light-source icons (visible to DM always, including player preview). */
export function drawLightIcons(
  ctx: CanvasRenderingContext2D,
  state: LightIconsDrawState,
  viewport: Viewport
): void {
  ctx.save();
  for (const light of state.lights) {
    const isSelected = state.selectedLightId === light.id;

    // Bright + dim radius circles when in select mode or selected
    if (isSelected || state.lightMode === 'light-select') {
      const enabledColor = light.enabled;
      ctx.save();
      ctx.lineWidth = 1 / viewport.zoom;
      // Dim radius (outer, dashed)
      ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.dimRadius * viewport.gridSize, 0, Math.PI * 2);
      ctx.strokeStyle = enabledColor ? light.color + '33' : 'rgba(100, 100, 100, 0.2)';
      ctx.stroke();
      // Bright radius (inner, solid)
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.brightRadius * viewport.gridSize, 0, Math.PI * 2);
      ctx.strokeStyle = enabledColor ? light.color + '55' : 'rgba(100, 100, 100, 0.3)';
      ctx.stroke();
      ctx.restore();
    }

    // Light icon circle
    const iconR = 8 / viewport.zoom;
    ctx.beginPath();
    ctx.arc(light.x, light.y, iconR, 0, Math.PI * 2);
    ctx.fillStyle = light.enabled ? light.color : '#666666';
    ctx.globalAlpha = light.enabled ? 0.85 : 0.5;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = (isSelected ? 2 : 1) / viewport.zoom;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Small "disabled" X indicator
    if (!light.enabled) {
      const xLen = 4 / viewport.zoom;
      ctx.beginPath();
      ctx.moveTo(light.x - xLen, light.y - xLen);
      ctx.lineTo(light.x + xLen, light.y + xLen);
      ctx.moveTo(light.x + xLen, light.y - xLen);
      ctx.lineTo(light.x - xLen, light.y + xLen);
      ctx.strokeStyle = 'rgba(255,100,100,0.8)';
      ctx.lineWidth = 1.5 / viewport.zoom;
      ctx.stroke();
    }
  }
  ctx.restore();
}

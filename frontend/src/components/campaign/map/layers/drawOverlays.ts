// ============================================
// Interaction overlays — DM wall-tool previews (draw/split/erase/
// brush/polygon), the ruler, AoE templates, and the fog brush cursor.
// Pure: no React, no component closures. Snap helpers arrive as
// callbacks because snapping depends on live tool flags.
// ============================================

import type { WallSegment, WallType } from '@/types/walls';
import { calcGridDistance } from '@/utils/geometry';
import type { Viewport } from './types';

type Pt = { x: number; y: number };

export interface WallDrawOverlayState {
  wallInProgress: readonly Pt[];
  /** Raw map-px cursor position (not grid-quantised). */
  hoverMapPx: Pt | null;
  /** Grid-quantised hover (used only to gate the ghost line, as before). */
  hoverCoords: Pt | null;
  wallType: WallType;
  snapPoint: (mapPx: Pt) => Pt;
  findWallAtPoint: (x: number, y: number, threshold: number) => { seg: WallSegment; point: { x: number; y: number; t: number } } | null;
}

/** In-progress polyline for wall-draw mode (DM only). */
export function drawWallDrawOverlay(
  ctx: CanvasRenderingContext2D,
  state: WallDrawOverlayState,
  viewport: Viewport
): void {
  const { zoom } = viewport;
  const { wallInProgress } = state;
  if (wallInProgress.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 2 / zoom;
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.7)';

  // Placed line segments
  if (wallInProgress.length > 1) {
    ctx.beginPath();
    ctx.moveTo(wallInProgress[0].x, wallInProgress[0].y);
    for (let i = 1; i < wallInProgress.length; i++) {
      ctx.lineTo(wallInProgress[i].x, wallInProgress[i].y);
    }
    ctx.stroke();
  }

  // Vertex dots
  ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
  for (const pt of wallInProgress) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ghost line: last placed point to current cursor (map-space). Uses the raw
  // map-px cursor so that with snap-to-grid disabled the ghost truly tracks
  // the cursor freely.
  if (state.hoverCoords && wallInProgress.length > 0) {
    const lastPt = wallInProgress[wallInProgress.length - 1];
    const rawPx = state.hoverMapPx;
    if (rawPx) {
      const endpoint = state.snapPoint(rawPx);
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
      ctx.beginPath();
      ctx.moveTo(lastPt.x, lastPt.y);
      ctx.lineTo(endpoint.x, endpoint.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Snap-to-wall indicator: when drawing a door/window, show a green dot
      // if the cursor is near an existing wall segment
      if (state.wallType !== 'wall') {
        const snapThreshold = 14 / zoom;
        const cursorHit = state.findWallAtPoint(endpoint.x, endpoint.y, snapThreshold);
        if (cursorHit) {
          ctx.fillStyle = 'rgba(74, 222, 128, 0.9)';
          ctx.beginPath();
          ctx.arc(cursorHit.point.x, cursorHit.point.y, 5 / zoom, 0, Math.PI * 2);
          ctx.fill();
          // Also highlight the starting point if it's on the same wall
          const startHit = state.findWallAtPoint(lastPt.x, lastPt.y, snapThreshold);
          if (startHit && startHit.seg.id === cursorHit.seg.id) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.9)';
            ctx.beginPath();
            ctx.arc(startHit.point.x, startHit.point.y, 5 / zoom, 0, Math.PI * 2);
            ctx.fill();
            // Replacement preview as a colored line
            ctx.strokeStyle = state.wallType === 'window' ? 'rgba(96, 165, 250, 0.7)' : 'rgba(167, 139, 250, 0.7)';
            ctx.lineWidth = 3 / zoom;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(startHit.point.x, startHit.point.y);
            ctx.lineTo(cursorHit.point.x, cursorHit.point.y);
            ctx.stroke();
          }
        }
      }
    }
  }

  ctx.restore();
}

/** Split mode: preview dot at the split hover point. */
export function drawSplitPreview(
  ctx: CanvasRenderingContext2D,
  point: Pt,
  viewport: Viewport
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(253, 224, 71, 0.9)'; // yellow
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5 / viewport.zoom;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 5 / viewport.zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export interface EraseOverlayState {
  hoverMapPx: Pt | null;
  eraseRadius: number;
  erasedIds: ReadonlySet<string>;
  wallSegments: readonly WallSegment[];
}

/** Erase mode: brush circle + red highlight on walls marked for deletion. */
export function drawEraseOverlay(
  ctx: CanvasRenderingContext2D,
  state: EraseOverlayState,
  viewport: Viewport
): void {
  const { zoom } = viewport;

  if (state.hoverMapPx) {
    const mapPx = state.hoverMapPx;
    const r = state.eraseRadius / zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([3 / zoom, 3 / zoom]);
    ctx.beginPath();
    ctx.arc(mapPx.x, mapPx.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (state.erasedIds.size > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.lineWidth = 5 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    for (const seg of state.wallSegments) {
      if (state.erasedIds.has(seg.id)) {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export interface BrushOverlayState {
  points: readonly Pt[];
  brushSize: number;
  hoverMapPx: Pt | null;
}

/** Brush mode: painted stroke trail + brush cursor circle. */
export function drawBrushOverlay(
  ctx: CanvasRenderingContext2D,
  state: BrushOverlayState,
  viewport: Viewport
): void {
  const { zoom } = viewport;
  const pts = state.points;

  if (pts.length >= 2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.6)';
    ctx.lineWidth = state.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (state.hoverMapPx) {
    const mapPx = state.hoverMapPx;
    ctx.save();
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.7)';
    ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([3 / zoom, 3 / zoom]);
    ctx.beginPath();
    ctx.arc(mapPx.x, mapPx.y, state.brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export interface PolygonOverlayState {
  points: readonly Pt[];
  hoverMapPx: Pt | null;
  closeRadius: number;
  snapPoint: (mapPx: Pt) => Pt;
}

/** Polygon mode: placed edges, point dots, close target, cursor ghost line. */
export function drawPolygonOverlay(
  ctx: CanvasRenderingContext2D,
  state: PolygonOverlayState,
  viewport: Viewport
): void {
  const { zoom } = viewport;
  const { points } = state;
  if (points.length === 0) return;

  ctx.save();

  // Placed edges (dashed amber)
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([6 / zoom, 3 / zoom]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Placed point dots (white)
  ctx.fillStyle = '#ffffff';
  for (const pt of points) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  // First point: green "close target" circle when 3+ points placed
  if (points.length >= 3) {
    const first = points[0];
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(first.x, first.y, state.closeRadius / zoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Ghost line from last placed point to cursor
  if (state.hoverMapPx) {
    const last = points[points.length - 1];
    const endpoint = state.snapPoint(state.hoverMapPx);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(endpoint.x, endpoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

export interface RulerOverlayState {
  /** Grid coords of the measurement origin. */
  origin: Pt;
  /** Grid coords of the cursor. */
  target: Pt;
  color: 'amber' | 'purple' | 'black';
  feetPerSquare: number;
  diagonalRule: 'flat' | 'alternating';
}

/** Ruler: dashed measurement line with a distance pill near the cursor. */
export function drawRuler(
  ctx: CanvasRenderingContext2D,
  state: RulerOverlayState,
  viewport: Viewport
): void {
  const { zoom, gridSize: gs, mapHeight: mh } = viewport;

  // Grid coords → world pixel coords (token-center convention)
  const x0 = state.origin.x * gs + gs / 2;
  const y0 = (mh - 1 - state.origin.y) * gs + gs / 2;
  const x1 = state.target.x * gs + gs / 2;
  const y1 = (mh - 1 - state.target.y) * gs + gs / 2;

  const dx = Math.abs(state.target.x - state.origin.x);
  const dy = Math.abs(state.target.y - state.origin.y);
  const squares = Math.max(dx, dy);
  const feet = calcGridDistance(dx, dy, state.feetPerSquare, state.diagonalRule);

  const rulerLineColor = state.color === 'purple' ? 'rgba(168, 85, 247, 0.9)' : state.color === 'black' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(251, 191, 36, 0.9)';
  const rulerPillColor = state.color === 'black' ? 'rgba(255, 255, 255, 0.88)' : 'rgba(0, 0, 0, 0.65)';
  const rulerTextColor = state.color === 'purple' ? 'rgba(216, 180, 254, 1)' : state.color === 'black' ? 'rgba(0, 0, 0, 1)' : 'rgba(251, 220, 100, 1)';

  ctx.save();

  // Dashed line
  ctx.setLineDash([8 / zoom, 4 / zoom]);
  ctx.strokeStyle = rulerLineColor;
  ctx.lineWidth = 2 / zoom;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  // Dot at origin
  ctx.setLineDash([]);
  ctx.fillStyle = rulerLineColor;
  ctx.beginPath();
  ctx.arc(x0, y0, 5 / zoom, 0, Math.PI * 2);
  ctx.fill();

  // Distance label near cursor
  if (feet > 0) {
    const label = `${feet} ft  (${squares} sq)`;
    const fontSize = Math.max(11, 13 / zoom);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = 'bottom';

    const pad = 4 / zoom;
    const textW = ctx.measureText(label).width;
    const boxX = x1 + 10 / zoom;
    const boxY = y1 - 4 / zoom;

    // Background pill
    ctx.fillStyle = rulerPillColor;
    try {
      ctx.beginPath();
      ctx.roundRect(boxX - pad, boxY - fontSize - pad, textW + pad * 2, fontSize + pad * 2, 4 / zoom);
      ctx.fill();
    } catch {
      ctx.fillRect(boxX - pad, boxY - fontSize - pad, textW + pad * 2, fontSize + pad * 2);
    }

    // Text
    ctx.fillStyle = rulerTextColor;
    ctx.fillText(label, boxX, boxY);
  }

  ctx.restore();
}

export type AoEShape = 'sphere' | 'cylinder' | 'cone' | 'line' | 'cube';

export interface AoEConfig {
  shape: AoEShape;
  sizeFt: number;
  widthFt?: number; // line only, default 5
}

export interface AoEOverlayState {
  config: AoEConfig;
  /** Committed origin (grid coords) — null means "follow cursor". */
  origin: Pt | null;
  /** Grid coords of the cursor (aim direction + fallback origin). */
  hoverCoords: Pt | null;
  feetPerSquare: number;
}

/** AoE template: sphere/cylinder/cone/line/cube with a size label. */
export function drawAoEOverlay(
  ctx: CanvasRenderingContext2D,
  state: AoEOverlayState,
  viewport: Viewport
): void {
  const { zoom, gridSize: gs, mapHeight: mh } = viewport;
  const fps = state.feetPerSquare;

  const origin = state.origin ?? state.hoverCoords;
  if (!origin) return;

  const ox = origin.x * gs + gs / 2;
  const oy = (mh - 1 - origin.y) * gs + gs / 2;

  let angle = 0;
  if (state.hoverCoords && state.origin) {
    const mx = state.hoverCoords.x * gs + gs / 2;
    const my = (mh - 1 - state.hoverCoords.y) * gs + gs / 2;
    angle = Math.atan2(my - oy, mx - ox);
  }

  const sizeInPx = (state.config.sizeFt / fps) * gs;
  const widthInPx = ((state.config.widthFt ?? 5) / fps) * gs;

  ctx.save();
  ctx.fillStyle = 'rgba(147, 51, 234, 0.25)';
  ctx.strokeStyle = 'rgba(147, 51, 234, 0.8)';
  ctx.lineWidth = 2 / zoom;

  ctx.beginPath();

  switch (state.config.shape) {
    case 'sphere':
    case 'cylinder':
      ctx.arc(ox, oy, sizeInPx, 0, Math.PI * 2);
      break;

    case 'cone': {
      const halfAngle = Math.atan2(1, 2);
      const left = angle - halfAngle;
      const right = angle + halfAngle;
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(left) * sizeInPx, oy + Math.sin(left) * sizeInPx);
      ctx.lineTo(ox + Math.cos(angle) * sizeInPx, oy + Math.sin(angle) * sizeInPx);
      ctx.lineTo(ox + Math.cos(right) * sizeInPx, oy + Math.sin(right) * sizeInPx);
      ctx.closePath();
      break;
    }

    case 'line': {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const perpCos = Math.cos(angle + Math.PI / 2);
      const perpSin = Math.sin(angle + Math.PI / 2);
      const hw = widthInPx / 2;
      ctx.moveTo(ox + perpCos * hw,                        oy + perpSin * hw);
      ctx.lineTo(ox + cos * sizeInPx + perpCos * hw,       oy + sin * sizeInPx + perpSin * hw);
      ctx.lineTo(ox + cos * sizeInPx - perpCos * hw,       oy + sin * sizeInPx - perpSin * hw);
      ctx.lineTo(ox - perpCos * hw,                        oy - perpSin * hw);
      ctx.closePath();
      break;
    }

    case 'cube': {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const perpCos = Math.cos(angle + Math.PI / 2);
      const perpSin = Math.sin(angle + Math.PI / 2);
      const hs = sizeInPx / 2;
      ctx.moveTo(ox + perpCos * hs,                      oy + perpSin * hs);
      ctx.lineTo(ox + cos * sizeInPx + perpCos * hs,     oy + sin * sizeInPx + perpSin * hs);
      ctx.lineTo(ox + cos * sizeInPx - perpCos * hs,     oy + sin * sizeInPx - perpSin * hs);
      ctx.lineTo(ox - perpCos * hs,                      oy - perpSin * hs);
      ctx.closePath();
      break;
    }
  }

  ctx.fill();
  ctx.stroke();

  // Size label
  const label = state.config.shape === 'line'
    ? `${state.config.sizeFt} ft × ${state.config.widthFt ?? 5} ft`
    : `${state.config.sizeFt} ft`;
  const fontSize = Math.max(10, 12 / zoom);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  const tw = ctx.measureText(label).width;
  const pad = 4 / zoom;
  ctx.fillRect(ox - tw / 2 - pad, oy - fontSize * 2 - pad, tw + pad * 2, fontSize + pad * 2);
  ctx.fillStyle = 'rgba(216, 180, 254, 1)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, ox, oy - fontSize - 2 / zoom);
  ctx.textAlign = 'start';

  ctx.restore();
}

export interface FogBrushCursorState {
  mode: 'fog-reveal' | 'fog-hide';
  /** Grid coords of the cursor. */
  hoverCoords: Pt;
  /** Brush radius in map-space pixels. */
  brushRadius: number;
}

/**
 * Fog brush cursor. Drawn in SCREEN space (zoom-invariant) — the caller
 * must invoke this AFTER restoring the world transform.
 */
export function drawFogBrushCursor(
  ctx: CanvasRenderingContext2D,
  state: FogBrushCursorState,
  viewport: Viewport
): void {
  const screenX = state.hoverCoords.x * viewport.zoom * viewport.gridSize + viewport.panOffset.x;
  const screenY = (viewport.mapHeight - 1 - state.hoverCoords.y) * viewport.zoom * viewport.gridSize + viewport.panOffset.y;
  const screenRadius = state.brushRadius * viewport.zoom;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to screen-space
  ctx.strokeStyle = state.mode === 'fog-reveal' ? 'rgba(163, 230, 53, 0.8)' : 'rgba(249, 115, 22, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

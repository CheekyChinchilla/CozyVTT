// ============================================
// Interaction overlays — DM wall-tool previews (draw/split/erase/
// brush/polygon), the ruler, AoE templates, and the fog selection box.
// Pure: no React, no component closures. Snap helpers arrive as
// callbacks because snapping depends on live tool flags.
// ============================================

import type { FogState, WallSegment, WallType } from '@/types/walls';
import { calcGridDistance } from '@/utils/geometry';
import type { Viewport } from './types';
import { mapPxToFogCell } from '../coords';
import { fogRectFromDrag, fogRectToPx, fogRectSize } from '../fogSelection';
import type { SelectionRect } from '../mapSelection';

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

import { cubeRect, snapToSquareCentre, squareExitPoint, squaresFor, coneOutline, type ConeRule } from '../aoeGeometry';

export type AoEShape = 'sphere' | 'cylinder' | 'cone' | 'line' | 'cube';

export interface AoEConfig {
  shape: AoEShape;
  sizeFt: number;
  widthFt?: number; // line only, default 5
}

/**
 * Where a template is anchored, in **map pixels**.
 *
 * This is a fixed pivot: aiming a cone or line must never move it. Held in
 * pixels rather than grid coordinates so that `exact` placement can express a
 * point part-way into a square.
 */
export interface AoEAnchor {
  point: Pt;
  /**
   * True when the user held Alt to place freely — the origin is then the point
   * itself, with no grid snapping, for an effect cast at a distance rather than
   * from the caster (a wall of fire, say).
   */
  exact: boolean;
}

export interface AoEOverlayState {
  config: AoEConfig;
  /** Committed anchor — null means "follow cursor". */
  anchor: AoEAnchor | null;
  /**
   * Live cursor in map pixels, or null when it is off the canvas. Stands in for
   * the anchor until one is pinned, so nothing is drawn once the cursor leaves.
   */
  hoverMapPx: Pt | null;
  /**
   * What a pinned template aims at: the *last* cursor position, retained rather
   * than cleared when the cursor leaves the canvas. The tool panel sits over
   * the map, so aiming towards it would otherwise swing the template back to
   * pointing right the moment the cursor crossed onto the panel.
   */
  aimMapPx: Pt | null;
  /** True while Alt is held, so the un-pinned preview matches what a click does. */
  hoverExact: boolean;
  feetPerSquare: number;
  /** The campaign's game system's cone (aoeGeometry.ts). */
  coneRule: ConeRule;
}

/** AoE template: sphere/cylinder/cone/line/cube with a size label. */
export function drawAoEOverlay(
  ctx: CanvasRenderingContext2D,
  state: AoEOverlayState,
  viewport: Viewport
): void {
  const { zoom, gridSize: gs } = viewport;
  const fps = state.feetPerSquare;

  // The anchor is the pivot the template turns about. Once pinned it is fixed —
  // deriving it from the aim is what used to make a rotating cone's apex jump
  // between a few spots instead of sweeping around its square. Until it is
  // pinned the cursor stands in for it, so the preview matches what a click
  // would place.
  const anchor: AoEAnchor | null =
    state.anchor ??
    (state.hoverMapPx ? { point: state.hoverMapPx, exact: state.hoverExact } : null);
  if (!anchor) return;

  // A free-placed template pivots about the exact point; otherwise about the
  // centre of the square it was placed in.
  const pivot = anchor.exact
    ? anchor.point
    : { x: snapToSquareCentre(anchor.point.x, gs), y: snapToSquareCentre(anchor.point.y, gs) };

  const sizeSquares = squaresFor(state.config.sizeFt, fps);
  const widthSquares = squaresFor(state.config.widthFt ?? 5, fps);
  const sizeInPx = sizeSquares * gs;
  const widthInPx = widthSquares * gs;

  // Aim direction, measured from the pivot. Only meaningful once the anchor is
  // pinned — before that the cursor *is* the anchor, so there is nothing to aim
  // at and the template rests pointing right.
  const angle =
    state.anchor && state.aimMapPx
      ? Math.atan2(state.aimMapPx.y - pivot.y, state.aimMapPx.x - pivot.x)
      : 0;

  // The cube's rectangle is computed once and reused for both the outline and
  // the label anchor below — deriving them separately let the label drift off
  // the snapped shape by up to half a square. A free-placed cube sits on the
  // pivot; otherwise it snaps to cover whole squares (see aoeGeometry.ts).
  let cube: { x: number; y: number; size: number } | null = null;
  if (state.config.shape === 'cube') {
    cube = anchor.exact
      ? { x: pivot.x - sizeInPx / 2, y: pivot.y - sizeInPx / 2, size: sizeInPx }
      : cubeRect(pivot, gs, sizeSquares);
  }

  // Sphere and cylinder sit on the pivot itself: a circle never tiles squares
  // whatever it is centred on, and that placement was not what was reported as
  // misaligned. Cone and line emerge from the point their aim leaves the
  // anchor square through, so they sweep around the token rather than through
  // it — unless placed freely, where the origin is the point itself.
  const isAimed = state.config.shape === 'cone' || state.config.shape === 'line';
  let { x: ox, y: oy } = pivot;

  if (cube) {
    ox = cube.x + cube.size / 2;
    oy = cube.y + cube.size / 2;
  } else if (isAimed && !anchor.exact) {
    ({ x: ox, y: oy } = squareExitPoint(pivot, gs, angle));
  }

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
      const outline = coneOutline({ x: ox, y: oy }, angle, sizeInPx, state.coneRule);
      if (outline.kind === 'sector') {
        ctx.moveTo(outline.centre.x, outline.centre.y);
        ctx.arc(outline.centre.x, outline.centre.y, outline.radius, outline.from, outline.to);
      } else {
        const [a, b, c] = outline.points;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
      }
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
      // Axis-aligned and snapped to whole squares. It used to be a rotatable
      // rectangle anchored at a square centre, which could not line up with the
      // grid at any angle — a 10 ft cube on a 5 ft grid straddled four squares
      // instead of covering two.
      if (cube) ctx.rect(cube.x, cube.y, cube.size, cube.size);
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

export interface WallSelectionOverlayState {
  /** The box being dragged out, in map pixels, or null when none is. */
  marquee: SelectionRect | null;
  /** Walls currently selected, drawn so a gathered set is visible as one. */
  selectedWallIds: ReadonlySet<string>;
  wallSegments: WallSegment[];
}

/**
 * The wall selection box, and a ring around everything it has caught.
 *
 * Dashed and unsnapped, unlike the fog box: a wall can sit anywhere between
 * grid lines, so the box has to be able to as well.
 */
export function drawWallSelection(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  state: WallSelectionOverlayState
): void {
  const { zoom } = viewport;

  if (state.selectedWallIds.size > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
    ctx.lineWidth = 6 / zoom;
    ctx.lineCap = 'round';
    for (const seg of state.wallSegments) {
      if (!state.selectedWallIds.has(seg.id)) continue;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (state.marquee) {
    const { minX, minY, maxX, maxY } = state.marquee;
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.beginPath();
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export interface FogSelectionState {
  mode: 'fog-reveal' | 'fog-hide';
  fog: FogState;
  /** Drag anchor in map pixels, or null when only hovering. */
  anchor: Pt | null;
  /** Current cursor in map pixels. */
  cursor: Pt | null;
}

const FOG_REVEAL_TINT = '163, 230, 53';  // lime
const FOG_HIDE_TINT = '249, 115, 22';    // orange

/**
 * Fog selection preview — the snapped rectangle being dragged, or the single
 * cell under the cursor when idle.
 *
 * Drawn in WORLD space, unlike the circular brush cursor this replaces: a
 * grid-snapped rectangle has to stay locked to the grid while the DM pans and
 * zooms, so the caller must invoke this BEFORE restoring the world transform.
 */
export function drawFogSelection(
  ctx: CanvasRenderingContext2D,
  state: FogSelectionState,
  viewport: Viewport
): void {
  const { zoom } = viewport;
  const { cursor, anchor, fog } = state;
  if (!cursor) return;

  const tint = state.mode === 'fog-reveal' ? FOG_REVEAL_TINT : FOG_HIDE_TINT;

  // Idle: outline just the cell a click would toggle, so the DM can see
  // exactly which square is in play before committing to a drag.
  if (!anchor) {
    const cell = mapPxToFogCell(cursor.x, cursor.y, fog);
    if (!cell) return;
    ctx.save();
    ctx.strokeStyle = `rgba(${tint}, 0.9)`;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.strokeRect(cell.col * fog.cellPx, cell.row * fog.cellPx, fog.cellPx, fog.cellPx);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  const rect = fogRectFromDrag(fog, anchor.x, anchor.y, cursor.x, cursor.y);
  if (!rect) return;

  const { x, y, w, h } = fogRectToPx(fog, rect);
  const { cols, rows } = fogRectSize(rect);

  ctx.save();

  ctx.fillStyle = `rgba(${tint}, 0.22)`;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = `rgba(${tint}, 0.95)`;
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Size readout on an opaque pill — the text contrasts against its own
  // background rather than the map, same technique as the ruler.
  const label = `${cols} × ${rows}`;
  const fontSize = Math.max(11, 13 / zoom);
  ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const pad = 5 / zoom;
  const textW = ctx.measureText(label).width;
  const pillW = textW + pad * 2;
  const pillH = fontSize + pad * 2;
  const pillX = x + w / 2 - pillW / 2;
  const pillY = y + h / 2 - pillH / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(pillX, pillY, pillW, pillH, 4 / zoom);
  } else {
    ctx.rect(pillX, pillY, pillW, pillH);
  }
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x + w / 2, y + h / 2);

  ctx.restore();
}

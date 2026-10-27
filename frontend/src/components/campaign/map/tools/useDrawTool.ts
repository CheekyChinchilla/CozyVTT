// ============================================
// The draw tool: a pen, lines, arrows, rectangles, ellipses, polygons, text
// labels, the eraser and the laser pointer, for the DM and for a player who
// may draw (utils/drawingRules.ts).
//
// It takes every left press while it is up, so no token is picked up and no
// door opened under it; the right button pans, as under a DM tool, and two
// fingers pan and pinch. One finger draws. The eraser, the text label and
// the polygon act on a tap or a click, so a finger's drag pans under them.
//
// A press is the tool's from its down to its up: a pen hovering over the
// glass reports moves with no press, which draw nothing. While a stroke is
// drawn its frames go to the other screens at most
// DRAWING_LIMITS.previewFramesPerSecond times a second, a pen's and a
// polygon's carrying the points added since the last, a shape's its two
// points whole; a press held still, and a polygon between its corners, sends
// one a second, so the other screens do not fade it. A polygon whose page
// went quiet longer than that (a background tab holds timers back) starts
// again under a new previewId, every corner in its first frame. On the lift the stroke is stored (useMapDrawings), carrying
// its preview's id, so the other screens put the drawing in its place. A
// stroke cancelled (a second finger, the browser taking the pointer, Esc, a
// map switch, the tool put away) sends an end frame, so nothing is left on
// any screen. The laser pointer is frames alone: its trail fades on every
// screen, this one included, and is never stored.
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAWING_LIMITS, type DrawingKind } from '@/constants/drawingLimits';
import type { Drawing, DrawingPreview } from '@/types/drawings';
import { canEraseDrawing, eraseRefusal } from '@/utils/drawingRules';
import { douglasPeucker } from '@/utils/geometry';
import { randomId } from '@/utils/uuid';
import type { MapControls, MapTool, PointerAt } from './types';
import type { MapLayer } from '../useRenderLoop';
import type { ActivePreview } from '../layers/drawDrawings';
import type { MapDrawings } from '../useMapDrawings';
import { drawingAt, hitTolerance } from '../drawingHitTest';
import { previewKey } from '../drawingPreviews';

/** What the Draw panel offers, in its order. */
export const DRAW_TOOL_KINDS = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'polygon', 'text', 'eraser', 'laser'] as const;
export type DrawToolKind = (typeof DRAW_TOOL_KINDS)[number];

/** How the next drawing looks, and who it is for. */
export interface DrawSettings {
  color: string;
  /** Map pixels, DRAWING_LIMITS.minWidth to maxWidth. */
  width: number;
  /** A rectangle, an ellipse or a polygon is filled with its colour. */
  fill: boolean;
  /** Shapes' corners and polygons' corners go to the nearest corner or middle of a square. */
  snap: boolean;
  /** The DM's: the drawing is for the DM alone. */
  dmOnly: boolean;
}

export const DEFAULT_DRAW_SETTINGS: DrawSettings = {
  color: DRAWING_LIMITS.namedColors[0],
  width: 4,
  fill: false,
  snap: false,
  dmOnly: false,
};

/** How far from the first corner, on screen, a tap closes a polygon. */
export const POLYGON_CLOSE_CSS_PX = 14;
/** A press held still, or a polygon between corners, sends a frame this often, so other screens keep its stroke. */
const KEEP_ALIVE_MS = 1000;
/**
 * A silence this long (a background tab holds timers back) and the other
 * screens are fading the stroke, or have dropped it: a polygon's next frame
 * starts it again, every corner in it.
 */
const STALE_AFTER_MS = DRAWING_LIMITS.previewTtlMs - 1000;
const FRAME_MS = 1000 / DRAWING_LIMITS.previewFramesPerSecond;
/** On screen, a pen stroke's points are kept to within this of the line drawn. */
const SIMPLIFY_CSS_PX = 2;

const SHAPE_KINDS = new Set<DrawToolKind>(['line', 'arrow', 'rect', 'ellipse']);
const FILLED = new Set<DrawToolKind>(['rect', 'ellipse', 'polygon']);

type Pt = [number, number];

/** A press of the pen, a shape or the laser, from its down to its up. */
interface Stroke {
  mapId: string;
  kind: 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'laser';
  previewId: string;
  audience: 'ALL' | 'DM';
  color: string;
  width: number;
  fill: boolean;
  /** A pen's points, as drawn. */
  points: Pt[];
  /** A shape's two corners. */
  start: Pt;
  end: Pt;
  /** What the other screens have not been sent yet: a pen's or the laser's new points. */
  unsent: Pt[];
  /** The shape has changed since its last frame. */
  changed: boolean;
  lastFrameAt: number;
  /** The laser's own trail, shown here as the other screens show it. */
  trail: ActivePreview | null;
}

export interface DrawToolOptions {
  kind: DrawToolKind | null;
  setKind: (kind: DrawToolKind | null) => void;
  settings: DrawSettings;
  mapId: string | undefined;
  gridSize: number;
  role: string | null | undefined;
  userId: string | undefined;
  /** The drawings the screen draws: the eraser finds only these. */
  drawnDrawings: () => readonly Drawing[];
  mapControls: MapControls;
  markDirty: (...layers: MapLayer[]) => void;
  drawings: Pick<MapDrawings, 'add' | 'erase' | 'sendPreview' | 'showPreview' | 'dropPreview'>;
  /** Where the pointer is over the map, for a polygon's next side. */
  hoverAt: () => { x: number; y: number } | null;
  /** Tells the person why a press did nothing. */
  hint: (message: string) => void;
}

export interface DrawTextBox {
  /** The label's point, its top-left corner, in map pixels. */
  at: Pt;
  draft: string;
}

const round = (p: { x: number; y: number }): Pt => [Math.round(p.x), Math.round(p.y)];

export function useDrawTool(options: DrawToolOptions) {
  const { kind, setKind, settings, mapId, gridSize, role, userId, drawnDrawings, mapControls, markDirty, drawings, hoverAt, hint } = options;
  const isDM = role === 'DM';
  const strokeRef = useRef<Stroke | null>(null);
  const timersRef = useRef<{ trailing: ReturnType<typeof setTimeout> | null; keepAlive: ReturnType<typeof setTimeout> | null }>({ trailing: null, keepAlive: null });
  /** A finger's drag the tool pans with (eraser, text, polygon). */
  const panningRef = useRef(false);
  const [corners, setCorners] = useState<Pt[]>([]);
  const cornersRef = useRef<{ mapId: string; previewId: string; points: Pt[]; lastFrameAt: number } | null>(null);
  /** The frame that keeps a polygon in progress alive on the other screens. */
  const polygonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [textBox, setTextBox] = useState<DrawTextBox | null>(null);
  const textRef = useRef<(DrawTextBox & { mapId: string }) | null>(null);
  const latest = useRef({ settings, mapId, isDM, gridSize });
  useEffect(() => {
    latest.current = { settings, mapId, isDM, gridSize };
  });

  /** Who the next drawing is for: the DM alone only when the DM asks. */
  const audience = useCallback((): 'ALL' | 'DM' => (latest.current.isDM && latest.current.settings.dmOnly ? 'DM' : 'ALL'), []);

  /** With Snap to grid on, the nearer of the nearest corner of the grid and the middle of the square the point is in. */
  const snapped = useCallback((p: Pt): Pt => {
    if (!latest.current.settings.snap) return p;
    const g = latest.current.gridSize;
    const corner: Pt = [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
    const middle: Pt = [Math.floor(p[0] / g) * g + g / 2, Math.floor(p[1] / g) * g + g / 2];
    const nearer = Math.hypot(p[0] - corner[0], p[1] - corner[1]) <= Math.hypot(p[0] - middle[0], p[1] - middle[1]) ? corner : middle;
    return [Math.round(nearer[0]), Math.round(nearer[1])];
  }, []);

  const frameBase = (s: Stroke): Omit<DrawingPreview, 'points'> => ({
    previewId: s.previewId,
    kind: s.kind === 'laser' ? 'pen' : s.kind,
    color: s.color,
    width: s.width,
    audience: s.kind === 'laser' ? 'ALL' : s.audience,
    laser: s.kind === 'laser',
  });

  /** Send what the other screens have not had of a stroke, or, held still, a frame to keep it. */
  const flush = useCallback((s: Stroke, keepAlive = false) => {
    if (timersRef.current.trailing) {
      clearTimeout(timersRef.current.trailing);
      timersRef.current.trailing = null;
    }
    const now = Date.now();
    if (SHAPE_KINDS.has(s.kind)) {
      if (s.changed || keepAlive) drawings.sendPreview(s.mapId, { ...frameBase(s), points: [s.start, s.end] });
      s.changed = false;
    } else {
      if (keepAlive && s.unsent.length === 0) {
        // The laser held on one spot keeps its dot lit, here and elsewhere.
        const here = s.kind === 'laser' ? s.trail?.points[s.trail.points.length - 1] : undefined;
        if (here && s.trail) {
          s.trail.points.push([here[0], here[1]]);
          s.trail.times.push(now);
          s.trail.lastAt = now;
        }
        drawings.sendPreview(s.mapId, { ...frameBase(s), points: here ? [[here[0], here[1]]] : [] });
      }
      for (let i = 0; i < s.unsent.length; i += DRAWING_LIMITS.maxPreviewPoints) {
        drawings.sendPreview(s.mapId, { ...frameBase(s), points: s.unsent.slice(i, i + DRAWING_LIMITS.maxPreviewPoints) });
      }
      s.unsent = [];
    }
    s.lastFrameAt = now;
    // Held still, the next frame keeps it alive a second from now.
    if (timersRef.current.keepAlive) clearTimeout(timersRef.current.keepAlive);
    timersRef.current.keepAlive = null;
    if (strokeRef.current === s) {
      timersRef.current.keepAlive = setTimeout(() => {
        timersRef.current.keepAlive = null;
        if (strokeRef.current === s) flushRef.current(s, true);
      }, KEEP_ALIVE_MS);
    }
  }, [drawings]);
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  /** A frame now if the last went at least FRAME_MS ago, otherwise when it is due. */
  const frameSoon = useCallback((s: Stroke) => {
    const wait = FRAME_MS - (Date.now() - s.lastFrameAt);
    if (wait <= 0) {
      flush(s);
      return;
    }
    if (!timersRef.current.trailing) {
      timersRef.current.trailing = setTimeout(() => {
        timersRef.current.trailing = null;
        if (strokeRef.current === s) flush(s);
      }, wait);
    }
  }, [flush]);

  const stopTimers = useCallback(() => {
    if (timersRef.current.trailing) clearTimeout(timersRef.current.trailing);
    if (timersRef.current.keepAlive) clearTimeout(timersRef.current.keepAlive);
    timersRef.current = { trailing: null, keepAlive: null };
  }, []);

  const begin = useCallback((s: Stroke) => {
    stopTimers();
    strokeRef.current = s;
    if (s.trail) drawings.showPreview(s.trail);
    flush(s);
    markDirty('overlay');
  }, [drawings, flush, stopTimers, markDirty]);

  const newStroke = useCallback((forMap: string, strokeKind: Stroke['kind'], at: Pt): Stroke => {
    const { settings: look } = latest.current;
    const previewId = randomId();
    const now = Date.now();
    return {
      mapId: forMap, kind: strokeKind, previewId, audience: audience(), color: look.color, width: look.width, fill: look.fill,
      points: [at], start: at, end: at, unsent: [at], changed: true, lastFrameAt: 0,
      trail: strokeKind === 'laser'
        ? { key: previewKey(userId ?? 'me', previewId), kind: 'pen', color: look.color, width: look.width, audience: 'ALL', laser: true, points: [at], times: [now], lastAt: now }
        : null,
    };
  }, [userId, audience]);

  /** Tell the other screens a stroke has ended unstored. */
  const sendEnd = useCallback((s: { mapId: string; previewId: string; kind: DrawingKind }) => {
    const { settings: look } = latest.current;
    drawings.sendPreview(s.mapId, { previewId: s.previewId, kind: s.kind, color: look.color, width: look.width, points: [], end: true });
  }, [drawings]);

  /** Store a pen stroke: its points kept to within SIMPLIFY_CSS_PX on screen of what was drawn. */
  const storePen = useCallback((s: Stroke) => {
    const simplified = douglasPeucker(s.points.map(([x, y]) => ({ x, y })), SIMPLIFY_CSS_PX / mapControls.zoom);
    const points: Pt[] = [];
    for (const p of simplified) {
      const r = round(p);
      const last = points[points.length - 1];
      if (!last || last[0] !== r[0] || last[1] !== r[1]) points.push(r);
    }
    // A tap of the pen is a dot.
    if (points.length === 1) points.push([points[0][0], points[0][1]]);
    drawings.add(s.mapId, { kind: 'pen', color: s.color, width: s.width, audience: s.audience, points }, s.previewId);
  }, [drawings, mapControls.zoom]);

  /** Let go of the stroke being drawn, unstored, and tell the other screens. */
  const dropStroke = useCallback(() => {
    const s = strokeRef.current;
    if (!s) return;
    strokeRef.current = null;
    stopTimers();
    // The laser's trail fades where it was; anything else goes at once.
    if (s.kind !== 'laser') sendEnd({ mapId: s.mapId, previewId: s.previewId, kind: s.kind });
    markDirty('overlay');
  }, [sendEnd, stopTimers, markDirty]);

  const stopPolygonTimer = useCallback(() => {
    if (polygonTimerRef.current) clearTimeout(polygonTimerRef.current);
    polygonTimerRef.current = null;
  }, []);

  /**
   * Send a polygon's new corners, or none to keep it alive, and the next
   * frame a second from now. After a silence the other screens fade, the
   * stroke starts again under a new previewId with every corner so far.
   */
  const sendCorners = useCallback((p: { mapId: string; previewId: string; points: Pt[]; lastFrameAt: number }, fresh: Pt[]) => {
    const now = Date.now();
    const { settings: look } = latest.current;
    const base = { kind: 'polygon' as const, color: look.color, width: look.width, audience: audience() };
    let points = fresh;
    if (p.lastFrameAt > 0 && now - p.lastFrameAt >= STALE_AFTER_MS) {
      drawings.sendPreview(p.mapId, { ...base, previewId: p.previewId, points: [], end: true });
      p.previewId = randomId();
      points = p.points;
    }
    for (let i = 0; i < Math.max(points.length, 1); i += DRAWING_LIMITS.maxPreviewPoints) {
      drawings.sendPreview(p.mapId, { ...base, previewId: p.previewId, points: points.slice(i, i + DRAWING_LIMITS.maxPreviewPoints) });
    }
    p.lastFrameAt = now;
    stopPolygonTimer();
    polygonTimerRef.current = setTimeout(() => {
      polygonTimerRef.current = null;
      if (cornersRef.current === p) sendCornersRef.current(p, []);
    }, KEEP_ALIVE_MS);
  }, [drawings, audience, stopPolygonTimer]);
  const sendCornersRef = useRef(sendCorners);
  useEffect(() => {
    sendCornersRef.current = sendCorners;
  });

  const dropPolygon = useCallback(() => {
    const p = cornersRef.current;
    if (!p) return;
    stopPolygonTimer();
    cornersRef.current = null;
    setCorners([]);
    sendEnd({ mapId: p.mapId, previewId: p.previewId, kind: 'polygon' });
    markDirty('overlay');
  }, [sendEnd, markDirty, stopPolygonTimer]);

  /** Close the polygon being drawn and store it, once it has three corners. */
  const finishPolygon = useCallback(() => {
    const p = cornersRef.current;
    if (!p || p.points.length < 3) return;
    stopPolygonTimer();
    cornersRef.current = null;
    setCorners([]);
    const { settings: look } = latest.current;
    drawings.add(p.mapId, {
      kind: 'polygon', color: look.color, width: look.width, audience: audience(), points: p.points,
      fillColor: look.fill ? look.color : null,
    }, p.previewId);
    markDirty('overlay');
  }, [drawings, markDirty, audience, stopPolygonTimer]);

  const closeText = useCallback(() => {
    textRef.current = null;
    setTextBox(null);
  }, []);

  /** Store the label being written, if it has any words, and close its box. */
  const commitText = useCallback(() => {
    const box = textRef.current;
    if (!box) return;
    closeText();
    const text = box.draft.trim();
    if (!text) return;
    const { settings: look } = latest.current;
    drawings.add(box.mapId, { kind: 'text', color: look.color, width: look.width, audience: audience(), points: [box.at], text });
  }, [drawings, closeText, audience]);

  const setDraft = useCallback((draft: string) => {
    if (!textRef.current) return;
    textRef.current = { ...textRef.current, draft };
    setTextBox({ at: textRef.current.at, draft });
  }, []);

  /** Everything under way goes: a stroke, a polygon, a label's box. */
  const endAll = useCallback(() => {
    dropStroke();
    dropPolygon();
    closeText();
    panningRef.current = false;
  }, [dropStroke, dropPolygon, closeText]);

  // Another tool, another map or none, or the map going (a layout switch):
  // nothing under way is kept.
  const endAllRef = useRef(endAll);
  useEffect(() => {
    endAllRef.current = endAll;
  });
  useEffect(() => () => endAllRef.current(), [kind, mapId]);

  // The window losing focus ends a press as the browser taking the pointer
  // does: its lift may never come back here.
  const dropStrokeRef = useRef(dropStroke);
  useEffect(() => {
    dropStrokeRef.current = dropStroke;
  });
  useEffect(() => {
    const onBlur = () => dropStrokeRef.current();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  const erase = (at: PointerAt) => {
    const shown = drawnDrawings().filter((d) => d.layer === 'MARKUP' && !d.id.startsWith('pending:'));
    const tolerance = hitTolerance(at.e.kind, mapControls.zoom);
    const mine = shown.filter((d) => canEraseDrawing(role ?? undefined, userId, d));
    const hit = drawingAt(at.mapPx, mine, tolerance);
    if (hit) {
      drawings.erase(hit);
      return;
    }
    if (drawingAt(at.mapPx, shown, tolerance)) hint(eraseRefusal(role ?? undefined));
  };

  const tool: MapTool = {
    down(at: PointerAt) {
      const forMap = latest.current.mapId;
      if (!kind || !forMap) return false;
      // An open label is stored as the next press lands, wherever it is.
      if (textRef.current) commitText();
      if (at.via === 'drag' && (kind === 'eraser' || kind === 'text' || kind === 'polygon')) {
        panningRef.current = true;
        mapControls.startDrag(at.e);
        return true;
      }
      const point = round(at.mapPx);
      switch (kind) {
        case 'eraser':
          erase(at);
          return true;
        case 'text':
          textRef.current = { at: point, draft: '', mapId: forMap };
          setTextBox({ at: point, draft: '' });
          return true;
        case 'polygon': {
          const corner = snapped(point);
          const p = cornersRef.current;
          if (!p) {
            const started = { mapId: forMap, previewId: randomId(), points: [corner], lastFrameAt: 0 };
            cornersRef.current = started;
            setCorners([corner]);
            sendCorners(started, [corner]);
            markDirty('overlay');
            return true;
          }
          const [fx, fy] = p.points[0];
          const close = POLYGON_CLOSE_CSS_PX / mapControls.zoom;
          if (p.points.length >= 3 && Math.hypot(at.mapPx.x - fx, at.mapPx.y - fy) <= close) {
            finishPolygon();
            return true;
          }
          const last = p.points[p.points.length - 1];
          // A double-click's second press lands on its first.
          if (last[0] === corner[0] && last[1] === corner[1]) return true;
          if (p.points.length >= DRAWING_LIMITS.maxPoints) return true;
          p.points = [...p.points, corner];
          setCorners(p.points);
          sendCorners(p, [corner]);
          markDirty('overlay');
          return true;
        }
        case 'pen':
        case 'laser':
          begin(newStroke(forMap, kind, point));
          return true;
        default:
          begin(newStroke(forMap, kind, snapped(point)));
          return true;
      }
    },
    move(at: PointerAt) {
      if (panningRef.current) {
        mapControls.handleDrag(at.e);
        markDirty('terrain', 'tokens', 'overlay');
        return true;
      }
      if (kind === 'polygon' && cornersRef.current) {
        // The side to the next corner follows the pointer.
        markDirty('overlay');
        return false;
      }
      const s = strokeRef.current;
      if (!s) return false;
      const point = round(at.mapPx);
      if (s.kind === 'pen' || s.kind === 'laser') {
        const last = s.kind === 'pen' ? s.points[s.points.length - 1] : s.trail?.points[s.trail.points.length - 1];
        if (last && last[0] === point[0] && last[1] === point[1]) return true;
        s.unsent.push(point);
        if (s.trail) {
          const now = Date.now();
          s.trail.points.push(point);
          s.trail.times.push(now);
          s.trail.lastAt = now;
        } else {
          s.points.push(point);
          // As long as a drawing may be: stored, and the stroke goes on as a new one.
          if (s.points.length >= DRAWING_LIMITS.maxPoints) {
            stopTimers();
            strokeRef.current = null;
            storePen(s);
            begin(newStroke(s.mapId, 'pen', point));
            return true;
          }
        }
      } else {
        const end = snapped(point);
        if (end[0] === s.end[0] && end[1] === s.end[1]) return true;
        s.end = end;
        s.changed = true;
      }
      frameSoon(s);
      markDirty('overlay');
      return true;
    },
    up() {
      panningRef.current = false;
      const s = strokeRef.current;
      if (!s) return;
      strokeRef.current = null;
      stopTimers();
      if (s.kind === 'laser') {
        flush(s);
      } else if (s.kind === 'pen') {
        storePen(s);
      } else if (s.start[0] === s.end[0] && s.start[1] === s.end[1]) {
        // A shape of no size: nothing is drawn.
        sendEnd({ mapId: s.mapId, previewId: s.previewId, kind: s.kind });
      } else {
        drawings.add(s.mapId, {
          kind: s.kind, color: s.color, width: s.width, audience: s.audience, points: [s.start, s.end],
          ...(FILLED.has(s.kind) && s.fill ? { fillColor: s.color } : {}),
        }, s.previewId);
      }
      markDirty('overlay');
    },
    cancel() {
      panningRef.current = false;
      dropStroke();
    },
    escape() {
      if (strokeRef.current) {
        dropStroke();
        return true;
      }
      if (cornersRef.current) {
        dropPolygon();
        return true;
      }
      if (textRef.current) {
        closeText();
        return true;
      }
      if (kind) {
        setKind(null);
        return true;
      }
      return false;
    },
  };

  /**
   * This page's own stroke under way, to draw with the others' (the laser's
   * trail is among them): a pen's points, a shape's two corners, a polygon's
   * corners and the side to the pointer.
   */
  const inProgress = (): ActivePreview | null => {
    const s = strokeRef.current;
    const now = Date.now();
    if (s && s.kind !== 'laser') {
      return {
        key: 'own', kind: s.kind, color: s.color, width: s.width, audience: s.audience, laser: false,
        points: s.kind === 'pen' ? s.points : [s.start, s.end], times: [], lastAt: now,
      };
    }
    const p = cornersRef.current;
    if (p && kind === 'polygon') {
      const hover = hoverAt();
      const points: Pt[] = hover ? [...p.points, round(hover)] : p.points;
      return { key: 'own', kind: 'pen', color: settings.color, width: settings.width, audience: audience(), laser: false, points, times: [], lastAt: now };
    }
    return null;
  };

  return {
    tool,
    inProgress,
    /** The polygon's corners so far, for the panel's Done and Cancel. */
    polygonCorners: corners.length,
    finishPolygon,
    cancelPolygon: dropPolygon,
    /** The label being written, and its box's actions. */
    textBox,
    setTextDraft: setDraft,
    commitText,
    cancelText: closeText,
    /** Whether a label's box is open now, for the canvas, which keeps the focus off the map while it is. */
    textOpen: () => textRef.current !== null,
  };
}

export type DrawTool = ReturnType<typeof useDrawTool>;

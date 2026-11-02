// ============================================
// Paint: the DM painting a drawn map's picture on the map itself.
//
// While Paint is on, the picture is held in one canvas of its own pixels,
// which the terrain layer draws in the picture's place, so the grid, the
// tokens, the walls and the lights stay drawn over the paint. A stroke is
// gathered in map pixels and drawn on the overlay as it goes, then painted
// into the picture on the lift; a second finger, the browser taking the
// pointer or Esc drops it, and nothing is painted. Undo and redo keep the
// tiles a stroke touches (paintHistory.ts), never the whole picture, each
// copied as the stroke first reaches it and packed while the page is idle
// (canvasTileStore.ts), so the lift only paints the stroke in.
//
// The canvas is kept, keyed by the map's id, while Paint is on and while
// what was painted is not saved, so Paint turned off keeps the work on
// screen. Meanwhile the page lets go of the map's own decoded picture
// (holdsPicture), so the picture is held once, not twice. With nothing left
// to save, the canvas stays on screen until the map's picture has loaded
// again, then is let go of (its pixels freed at once); at once when another
// map is shown, and when the viewer is no longer the DM.
//
// Paint is the first of the map's tools: while it is on it takes every left
// press, and the keys the other tools take (key()). It owns the map's input
// (map/inputOwner.ts), which MapCanvas reads at each place it keeps the
// other tools out.
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignMap } from '@/types';
import type { MapControls, MapTool, PointerAt } from '../tools/types';
import type { MapLayer } from '../useRenderLoop';
import { mapKeyAction } from '../keyboard';
import { isArrowKey } from '../selection';
import { createPaintHistory, type PaintHistory, type PaintHistoryCounts, type PaintStep } from './paintHistory';
import { createCanvasTileStore, type CanvasTileStore } from './canvasTileStore';
import { releaseCanvas, type MakeCanvas } from './blankPicture';
import { DRAWN_MAP_BACKGROUND, MOST_DRAWN_SQUARES, drawnPictureSize } from './drawnMapSize';
import { nextWidth, strokeBox, strokePaint, toPicture, type PaintPoint } from './paintStroke';
import { readColour } from './pixelColour';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { usePaintStore } from '@/stores/paintStore';

/** The tools Paint offers. */
export type PaintTool = 'brush' | 'eraser';

export interface PaintSettings {
  tool: PaintTool;
  colour: string;
  /**
   * The second colour, which the eraser paints, as MS Paint's does: the
   * colour of the picture's top-left pixel as Paint opens on it.
   */
  second: string;
  /** Picture pixels, 1 to 64. */
  width: number;
}

export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  tool: 'brush',
  colour: DRAWING_LIMITS.namedColors[7],
  second: DRAWN_MAP_BACKGROUND,
  width: 6,
};

/** The tool each letter key chooses while Paint is on. */
const TOOL_KEYS: ReadonlyMap<string, PaintTool> = new Map([['b', 'brush'], ['e', 'eraser']]);

/** The most the undo tiles may take, packed or still copies waiting to be; the oldest steps go first past it. */
export const PAINT_UNDO_BUDGET_BYTES = 48 * 1024 * 1024;
/** The most steps that may be undone, within the budget. */
export const PAINT_UNDO_STEPS = 50;

/** Why Paint did not open, said to the DM. */
export const PAINT_TOO_LARGE = `This map is too large to paint: it has more than ${MOST_DRAWN_SQUARES.toLocaleString('en-US')} squares. Choose fewer squares in Edit Map.`;
export const PAINT_NO_CANVAS = 'This browser could not open a picture that large to paint.';

/** A stroke as it is drawn on the overlay: in map pixels, its width too. */
export interface PaintStrokeShown {
  points: readonly PaintPoint[];
  width: number;
  colour: string;
}

/** What a measurement of Paint's memory reads, in development builds. */
export interface PaintStats {
  pictureWidth: number;
  pictureHeight: number;
  /** The picture canvas's pixels, four bytes each. */
  pictureBytes: number;
  undo: PaintHistoryCounts;
  /** Undo tiles copied and not yet packed. */
  packingBytes: number;
}

declare global {
  interface Window {
    /** Development builds only: what Paint holds now, for measuring memory. */
    cozyPaintStats?: () => PaintStats | null;
  }
}

interface Surface {
  mapId: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Picture pixels to a map pixel, across and down. */
  sx: number;
  sy: number;
  history: PaintHistory;
  store: CanvasTileStore;
  /** Counts every change, undo and redo; differs from `saved` while there is paint to save. */
  revision: number;
  saved: number;
}

interface Stroke {
  mapId: string;
  colour: string;
  /** Picture pixels. */
  width: number;
  points: PaintPoint[];
  /** The undo step its tiles are kept in, as it reaches them. */
  step: PaintStep;
}

export interface PaintSurfaceOptions {
  /** The map on screen. */
  map: Pick<CampaignMap, 'id' | 'width' | 'height' | 'gridSize'> | null;
  /** Its picture as loaded: null for a map with none, and while the page has let go of it (holdsPicture). */
  picture: HTMLImageElement | null;
  /** The page's own picture is drawn again, or has failed to load, or the map has none: nothing is loading. */
  pictureSettled: boolean;
  isDM: boolean;
  mapControls: MapControls;
  markDirty: (...layers: MapLayer[]) => void;
  /** Tells the DM why Paint did not open. */
  refuse: (message: string) => void;
  make?: MakeCanvas;
}

const stillPoint = (a: PaintPoint | undefined, b: PaintPoint) => !!a && a[0] === b[0] && a[1] === b[1];

export function usePaintSurface(options: PaintSurfaceOptions) {
  const { map, picture, pictureSettled, isDM, mapControls, markDirty, refuse, make } = options;
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  const [surface, setSurface] = useState<Surface | null>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const [settings, setSettings] = useState<PaintSettings>(DEFAULT_PAINT_SETTINGS);
  const settingsRef = useRef(settings);
  const strokeRef = useRef<Stroke | null>(null);
  /** Strokes lifted while an undo was under way, shown until they are painted. */
  const waitingRef = useRef<Stroke[]>([]);
  /** Bumped when the history changes, so the panel's Undo and Redo follow. */
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    onRef.current = on;
  }, [on]);

  const show = useCallback((next: Surface | null) => {
    surfaceRef.current = next;
    setSurface(next);
  }, []);

  /** Let go of the picture and every undo tile, now. */
  const dispose = useCallback(() => {
    const s = surfaceRef.current;
    if (!s) return;
    strokeRef.current?.step.drop();
    strokeRef.current = null;
    s.history.clear();
    s.store.dispose();
    releaseCanvas(s.canvas);
    show(null);
    waitingRef.current = [];
    markDirty('terrain', 'overlay');
  }, [show, markDirty]);

  const unsavedOf = (s: Surface | null) => s !== null && s.revision !== s.saved;

  /**
   * Open Paint on the map on screen, at its squares times its grid size
   * (held to the drawn-map size rule), whatever its picture's own size: a
   * new drawn map's picture is one pixel a square. The picture is drawn in
   * stretched to that size, or a map with none starts blank.
   */
  const open = useCallback((): boolean => {
    if (!map || !isDM) return false;
    const held = surfaceRef.current;
    if (held && held.mapId === map.id) {
      setOn(true);
      onRef.current = true;
      return true;
    }
    if (held) dispose();
    const mapW = map.width * map.gridSize;
    const mapH = map.height * map.gridSize;
    const size = drawnPictureSize(map.width, map.height, map.gridSize);
    if (!size.fits) {
      refuse(PAINT_TOO_LARGE);
      return false;
    }
    const { width, height } = size;
    const canvas = (make ?? (() => document.createElement('canvas')))();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      releaseCanvas(canvas);
      refuse(PAINT_NO_CANVAS);
      return false;
    }
    if (picture) {
      ctx.drawImage(picture, 0, 0, width, height);
    } else {
      ctx.fillStyle = DRAWN_MAP_BACKGROUND;
      ctx.fillRect(0, 0, width, height);
    }
    // The eraser's colour: the picture's own, read off its top-left pixel.
    const second = readColour(ctx, 0, 0) ?? DRAWN_MAP_BACKGROUND;
    setSettings((prev) => ({ ...prev, second }));
    // The history is made after the store, which tells it of each tile packed.
    let history: PaintHistory | null = null;
    const store = createCanvasTileStore(canvas, { onPacked: () => history?.trim(), make });
    history = createPaintHistory(store, {
      width,
      height,
      budgetBytes: PAINT_UNDO_BUDGET_BYTES,
      maxSteps: PAINT_UNDO_STEPS,
      onChange: () => {
        bump();
        // For measuring memory on the dev server; a production build drops console.debug.
        if (history && import.meta.env.MODE !== 'test') console.debug('[paint] undo', history.counts(), 'packing', store.packingBytes());
      },
    });
    show({ mapId: map.id, canvas, ctx, sx: width / mapW, sy: height / mapH, history, store, revision: 0, saved: 0 });
    setOn(true);
    onRef.current = true;
    markDirty('terrain', 'overlay');
    return true;
  }, [map, isDM, picture, refuse, make, dispose, show, bump, markDirty]);

  /**
   * Paint off. Paint not saved stays on screen, to go on with; with nothing
   * to save, the canvas is let go of once the map's own picture is back.
   */
  const close = useCallback(() => {
    strokeRef.current?.step.drop();
    strokeRef.current = null;
    setOn(false);
    onRef.current = false;
    markDirty('overlay');
  }, [markDirty]);

  // Another map, or no longer the DM: the picture goes. (Asking first about
  // paint not saved is the page's, before the map changes.)
  const mapId = map?.id ?? null;
  useEffect(() => {
    const s = surfaceRef.current;
    if (s && (s.mapId !== mapId || !isDM)) {
      dispose();
      setOn(false);
      onRef.current = false;
    } else if (!s && on && !isDM) {
      setOn(false);
      onRef.current = false;
    }
  }, [mapId, isDM, on, dispose]);
  // And when the map goes from the page.
  const disposeRef = useRef(dispose);
  useEffect(() => {
    disposeRef.current = dispose;
  }, [dispose]);
  useEffect(() => () => disposeRef.current(), []);

  // What the rest of the page reads.
  const unsaved = unsavedOf(surface);
  // With nothing to save, the canvas goes once the map's own picture is
  // drawn again (or has failed to load), or at once on a map with none.
  useEffect(() => {
    if (surface && !on && !unsaved && pictureSettled) dispose();
  }, [surface, on, unsaved, pictureSettled, dispose]);
  const sessionMapId = surface?.mapId ?? null;
  useEffect(() => {
    usePaintStore.getState().setSession(sessionMapId, unsaved);
  }, [sessionMapId, unsaved]);
  useEffect(() => () => usePaintStore.getState().setSession(null, false), []);

  // Development builds: a measurement of what Paint holds.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.cozyPaintStats = () => {
      const s = surfaceRef.current;
      if (!s) return null;
      return {
        pictureWidth: s.canvas.width,
        pictureHeight: s.canvas.height,
        pictureBytes: s.canvas.width * s.canvas.height * 4,
        undo: s.history.counts(),
        packingBytes: s.store.packingBytes(),
      };
    };
    return () => {
      delete window.cozyPaintStats;
    };
  }, []);

  /** Paint a lifted stroke into the picture, after any undo under way; its tiles are kept already. */
  const commit = useCallback((stroke: Stroke) => {
    const s = surfaceRef.current;
    if (!s || s.mapId !== stroke.mapId) {
      stroke.step.drop();
      return;
    }
    const points = toPicture(stroke.points, s.sx, s.sy);
    waitingRef.current.push(stroke);
    void stroke.step.land(() => {
      strokePaint(s.ctx, points, stroke.width, stroke.colour);
      s.revision += 1;
    }).finally(() => {
      waitingRef.current = waitingRef.current.filter((w) => w !== stroke);
      bump();
      markDirty('terrain', 'overlay');
    });
    markDirty('terrain', 'overlay');
  }, [bump, markDirty]);

  const step = useCallback((direction: 'undo' | 'redo') => {
    const s = surfaceRef.current;
    if (!s) return;
    strokeRef.current?.step.drop();
    strokeRef.current = null;
    void s.history[direction]().then((done) => {
      if (!done || surfaceRef.current !== s) return;
      s.revision += 1;
      bump();
      markDirty('terrain', 'overlay');
    });
  }, [bump, markDirty]);
  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  /** Drop the stroke under way, painting nothing, and let go of the tiles it kept. */
  const dropStroke = useCallback((): boolean => {
    const stroke = strokeRef.current;
    if (!stroke) return false;
    strokeRef.current = null;
    stroke.step.drop();
    markDirty('overlay');
    return true;
  }, [markDirty]);

  // The window losing focus drops a stroke, as the browser taking the pointer does.
  useEffect(() => {
    const onBlur = () => {
      dropStroke();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [dropStroke]);

  const tool: MapTool = {
    down(at: PointerAt) {
      const s = surfaceRef.current;
      if (!onRef.current || !s || !map || s.mapId !== map.id) return false;
      const look = settingsRef.current;
      strokeRef.current?.step.drop();
      const point: PaintPoint = [at.mapPx.x, at.mapPx.y];
      const step = s.history.begin();
      step.cover(strokeBox(toPicture([point], s.sx, s.sy), look.width));
      // The eraser is a brush of the second colour.
      const colour = look.tool === 'eraser' ? look.second : look.colour;
      strokeRef.current = { mapId: s.mapId, colour, width: look.width, points: [point], step };
      markDirty('overlay');
      return true;
    },
    move(at: PointerAt) {
      if (!onRef.current) return false;
      const stroke = strokeRef.current;
      if (stroke) {
        const point: PaintPoint = [at.mapPx.x, at.mapPx.y];
        const last = stroke.points[stroke.points.length - 1];
        if (!stillPoint(last, point)) {
          stroke.points.push(point);
          // The tiles this piece of the stroke reaches, kept as they are before it lands.
          const s = surfaceRef.current;
          if (s) stroke.step.cover(strokeBox(toPicture([last, point], s.sx, s.sy), stroke.width));
        }
        markDirty('overlay');
        return true;
      }
      // No press: the right button's pan goes on, and no token is hovered.
      mapControls.handleDrag(at.e);
      if (mapControls.isDragging) markDirty('terrain', 'tokens', 'overlay');
      return true;
    },
    up() {
      const stroke = strokeRef.current;
      if (!stroke) return;
      strokeRef.current = null;
      commit(stroke);
    },
    cancel() {
      dropStroke();
    },
    escape() {
      if (dropStroke()) return true;
      if (onRef.current) {
        close();
        return true;
      }
      return false;
    },
  };

  /**
   * A key while Paint is on: Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and
   * redo a stroke; on the map, [ and ] change the width and a tool's letter
   * (B, E) chooses it.
   * Every other key a map tool takes (the arrows, Delete, Backspace, Enter,
   * Ctrl+A, comma and full stop) is Paint's too, and does nothing, so no
   * token or wall moves, turns or goes while it is on. True when the key
   * was Paint's. `onMap`: the map's focus stop has the keyboard.
   */
  const key = (e: KeyboardEvent, onMap: boolean): boolean => {
    if (!onRef.current) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const letter = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (ctrl && !e.altKey && letter === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return true;
    }
    if (ctrl && !e.altKey && (letter === 'y' || (letter === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return true;
    }
    if (ctrl && letter === 'a') return true;
    if (isArrowKey(e.key) || e.key === 'Delete' || e.key === 'Backspace') return true;
    const action = mapKeyAction(e);
    if (action?.kind === 'turn') {
      if (onMap) {
        e.preventDefault();
        setSettings((prev) => ({ ...prev, width: nextWidth(prev.width, action.step) }));
      }
      return true;
    }
    if (action && action.kind !== 'shortcuts') return true;
    const chosen = onMap && !ctrl && !e.altKey ? TOOL_KEYS.get(letter) : undefined;
    if (chosen) {
      setSettings((prev) => ({ ...prev, tool: chosen }));
      return true;
    }
    return false;
  };

  /** The strokes under way, in map pixels, for the overlay. */
  const inProgress = useCallback((): PaintStrokeShown[] => {
    const s = surfaceRef.current;
    if (!s) return [];
    const shown = [...waitingRef.current, ...(strokeRef.current ? [strokeRef.current] : [])];
    return shown.map((stroke) => ({ points: stroke.points, width: stroke.width / s.sx, colour: stroke.colour }));
  }, []);

  return {
    /** Paint is on. */
    on,
    open,
    close,
    /** The picture to draw the map with: the one being painted, while there is one for the map on screen. */
    source: surface && map && surface.mapId === map.id ? surface.canvas : null,
    /** Paint is on, or holds paint not saved: the page lets go of the map's own decoded picture meanwhile. */
    holdsPicture: surface !== null && (on || unsaved),
    tool,
    key,
    inProgress,
    settings,
    setSettings,
    undo,
    redo,
    canUndo: surface?.history.canUndo() ?? false,
    canRedo: surface?.history.canRedo() ?? false,
    /** Paint on the map that is not saved. */
    unsaved,
  };
}

export type PaintSurface = ReturnType<typeof usePaintSurface>;

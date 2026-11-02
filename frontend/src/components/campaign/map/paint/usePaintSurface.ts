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
// read and packed as the stroke first reaches it (canvasTileStore.ts), so
// the lift only paints the stroke in. The canvas is made to be read often,
// so the tiles, the fill and the eyedropper read it straight, and quickly
// in WebKit and Chromium alike; the map draws it as it is (ARCHITECTURE.md
// says what that costs).
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
import { createPaintHistory, PAINT_TILE, type PaintBox, type PaintHistory, type PaintHistoryCounts, type PaintStep } from './paintHistory';
import { createCanvasTileStore, type CanvasTileStore, type KeptTile } from './canvasTileStore';
import { releaseCanvas, type MakeCanvas } from './blankPicture';
import { DRAWN_MAP_BACKGROUND, MOST_DRAWN_SQUARES, drawnPictureSize } from './drawnMapSize';
import { nextWidth, strokeBox, strokePaint, toPicture, type PaintPoint } from './paintStroke';
import { hexToRgba, readColour } from './pixelColour';
import { floodFillTiled } from './floodFill';
import { drawShape, scaleShape, shapeBox, stepAngle, type PaintPreview, type PaintShape, type PaintShapeKind, type ShapeStyle } from './paintShapes';
import { labelFontSize, snapToGrid } from '../drawingGeometry';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { usePaintStore } from '@/stores/paintStore';
import type { Asset } from '@/types';
import mapService from '@/services/map.service';
import { api } from '@/services/api';
import { uploadDrawnPicture, DrawnPictureRefused } from '@/services/drawnPicture';
import { apiErrorMessage, errorSummary } from '@/utils/errors';
import { savePaint } from './savePaint';
import { pictureIsDrawn } from './mapPicture';
import { pictureToPng } from './blankPicture';
import { extractAssetId } from '@/utils/assetUrl';

/** The tools Paint offers. */
export type PaintTool = 'brush' | 'eraser' | PaintShapeKind | 'fill' | 'text' | 'eyedropper';

/** The tools that act on a tap or a click: a finger's drag pans under them. */
const TAP_TOOLS: ReadonlySet<PaintTool> = new Set<PaintTool>(['fill', 'text', 'eyedropper']);

/** Text's letters: as tall as Draw's labels for the width, in the app's own type. */
const textFont = (size: number) => `600 ${size}px 'Inter', system-ui, sans-serif`;

/** A line of text being written, at its top-left corner in map pixels. */
export interface PaintTextBox {
  at: PaintPoint;
  draft: string;
}

/** The tools dragged from corner to corner (paintShapes.ts). */
const SHAPE_TOOLS: ReadonlySet<PaintTool> = new Set<PaintShapeKind>(['line', 'rect', 'ellipse']);
const isShapeTool = (tool: PaintTool): tool is PaintShapeKind => SHAPE_TOOLS.has(tool);

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
  /** A rectangle or an ellipse: outlined, filled, or both. */
  style: ShapeStyle;
  /** A line in 15 degree steps (Shift does it for one line). */
  straight: boolean;
  /** Shapes' corners and lines' ends on the grid's corners and the middles of its squares. */
  snap: boolean;
  /** How far, in percent, a colour may be from the one clicked for the fill to take it in. */
  tolerance: number;
}

export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  tool: 'brush',
  colour: DRAWING_LIMITS.namedColors[7],
  second: DRAWN_MAP_BACKGROUND,
  width: 6,
  style: 'outline',
  straight: false,
  snap: false,
  tolerance: 10,
};

/** The tool each letter key chooses while Paint is on. */
const TOOL_KEYS: ReadonlyMap<string, PaintTool> = new Map([['b', 'brush'], ['e', 'eraser'], ['l', 'line'], ['r', 'rect'], ['o', 'ellipse'], ['f', 'fill'], ['t', 'text'], ['i', 'eyedropper']]);

/** The most the undo tiles may take, packed; the oldest steps go first past it. */
export const PAINT_UNDO_BUDGET_BYTES = 48 * 1024 * 1024;
/** The most steps that may be undone, within the budget. */
export const PAINT_UNDO_STEPS = 50;

/** Why Paint did not open, said to the DM. */
export const PAINT_TOO_LARGE = `This map is too large to paint: it has more than ${MOST_DRAWN_SQUARES.toLocaleString('en-US')} squares. Choose fewer squares in Edit Map.`;
export const PAINT_NO_CANVAS = 'This browser could not open a picture that large to paint.';
export const FILL_TOO_LARGE = 'This device could not fill an area that large.';


/** What a measurement of Paint's memory reads, in development builds. */
export interface PaintStats {
  pictureWidth: number;
  pictureHeight: number;
  /** The picture canvas's pixels, four bytes each. */
  pictureBytes: number;
  undo: PaintHistoryCounts;
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
  history: PaintHistory<KeptTile>;
  store: CanvasTileStore;
  /** Counts every change, undo and redo; differs from `saved` while there is paint to save. */
  revision: number;
  saved: number;
  /**
   * The address of the picture the canvas holds: the one it was made from,
   * then each one saved. A map whose picture is now another was changed
   * elsewhere (Edit Map, another tab or device).
   */
  baseUrl: string;
  /**
   * The picture a save under way has uploaded, until the save is done: the
   * server sends the table's map with it before the save answers, which is
   * this page's own picture and no change from elsewhere.
   */
  savingAssetId: string | null;
}

/** A line, a rectangle or an ellipse being dragged: in map pixels, its outline too. */
interface ShapeUnderWay {
  mapId: string;
  shape: PaintShape;
  step: PaintStep;
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
  map: Pick<CampaignMap, 'id' | 'width' | 'height' | 'gridSize' | 'imageUrl'> | null;
  campaignId: string | undefined;
  /** Told of a save: the map as pointed at its new picture, and the picture. */
  onSaved: (map: CampaignMap, picture: Asset) => void;
  /** Told of the map as Save read it, when it differs from the page's: the page shows that one. */
  onMapRead: (map: CampaignMap) => void;
  /** Its picture as loaded: null for a map with none, and while the page has let go of it (holdsPicture). */
  picture: HTMLImageElement | null;
  /** The page's own picture is drawn again, or has failed to load, or the map has none: nothing is loading. */
  pictureSettled: boolean;
  isDM: boolean;
  mapControls: MapControls;
  markDirty: (...layers: MapLayer[]) => void;
  /** Tells the DM why Paint did not open, or a save failed. */
  refuse: (message: string) => void;
  make?: MakeCanvas;
}

const stillPoint = (a: PaintPoint | undefined, b: PaintPoint) => !!a && a[0] === b[0] && a[1] === b[1];

export function usePaintSurface(options: PaintSurfaceOptions) {
  const { map, picture, pictureSettled, campaignId, onSaved, onMapRead, isDM, mapControls, markDirty, refuse, make } = options;
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  const [surface, setSurface] = useState<Surface | null>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const [settings, setSettings] = useState<PaintSettings>(DEFAULT_PAINT_SETTINGS);
  const settingsRef = useRef(settings);
  const strokeRef = useRef<Stroke | null>(null);
  const shapeRef = useRef<ShapeUnderWay | null>(null);
  const [textBox, setTextBox] = useState<PaintTextBox | null>(null);
  const textRef = useRef<(PaintTextBox & { mapId: string }) | null>(null);
  /** The tool before the eyedropper, which a pick goes back to. */
  const lastToolRef = useRef<PaintTool>(DEFAULT_PAINT_SETTINGS.tool);
  /** Strokes and shapes lifted while an undo was under way, shown until they are painted. */
  const waitingRef = useRef<PaintPreview[]>([]);
  const [saving, setSaving] = useState(false);
  /** The question about paint not saved over a picture changed elsewhere is open. */
  const [asking, setAsking] = useState(false);
  const savingRef = useRef(false);
  /**
   * The map as last rendered, for the scale: Edit Map can change its size
   * while Paint holds its picture, which is then stretched over the new size.
   */
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });
  /** Picture pixels to a map pixel, across and down, from the map's size now. */
  const xy = useCallback((s: Surface): [number, number] => {
    const m = mapRef.current;
    if (!m || m.id !== s.mapId) return [1, 1];
    return [s.canvas.width / (m.width * m.gridSize), s.canvas.height / (m.height * m.gridSize)];
  }, []);
  /** Bumped when the history changes, so the panel's Undo and Redo follow. */
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    settingsRef.current = settings;
    if (settings.tool !== 'eyedropper') lastToolRef.current = settings.tool;
  }, [settings]);
  useEffect(() => {
    onRef.current = on;
  }, [on]);

  const show = useCallback((next: Surface | null) => {
    surfaceRef.current = next;
    setSurface(next);
  }, []);

  /**
   * Canvases let go of, whose pixels are freed once the page has rendered
   * without them: until then the map may still be drawn from one, and a
   * canvas 0 pixels wide cannot be drawn.
   */
  const toRelease = useRef<HTMLCanvasElement[]>([]);

  /** Let go of the picture and every undo tile. */
  const dispose = useCallback(() => {
    const s = surfaceRef.current;
    if (!s) return;
    textRef.current = null;
    setTextBox(null);
    (strokeRef.current ?? shapeRef.current)?.step.drop();
    strokeRef.current = null;
    shapeRef.current = null;
    s.history.clear();
    s.store.dispose();
    toRelease.current.push(s.canvas);
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
    // Paint held over a picture changed elsewhere: asked about first.
    if (held && held.mapId === map.id && (map.imageUrl ?? '') !== held.baseUrl && unsavedOf(held)) {
      setAsking(true);
      return false;
    }
    if (held && held.mapId === map.id && (map.imageUrl ?? '') === held.baseUrl) {
      setOn(true);
      onRef.current = true;
      return true;
    }
    if (held) dispose();
    const size = drawnPictureSize(map.width, map.height, map.gridSize);
    if (!size.fits) {
      refuse(PAINT_TOO_LARGE);
      return false;
    }
    const { width, height } = size;
    const canvas = (make ?? (() => document.createElement('canvas')))();
    canvas.width = width;
    canvas.height = height;
    // Read often: undo's tiles, the fill and the eyedropper read it straight.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
    const store = createCanvasTileStore(ctx);
    // The eraser's colour: the picture's own, read off its top-left pixel.
    const second = readColour(ctx, 0, 0) ?? DRAWN_MAP_BACKGROUND;
    setSettings((prev) => ({ ...prev, second }));
    const history: PaintHistory<KeptTile> = createPaintHistory(store, {
      width,
      height,
      budgetBytes: PAINT_UNDO_BUDGET_BYTES,
      maxSteps: PAINT_UNDO_STEPS,
      onChange: () => {
        bump();
        // For measuring memory on the dev server; a production build drops console.debug.
        if (import.meta.env.MODE !== 'test') console.debug('[paint] undo', history.counts());
      },
    });
    show({ mapId: map.id, canvas, ctx, history, store, revision: 0, saved: 0, baseUrl: map.imageUrl ?? '', savingAssetId: null });
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
    // A line of text being written is painted, as the next press would.
    if (textRef.current) commitTextRef.current();
    (strokeRef.current ?? shapeRef.current)?.step.drop();
    strokeRef.current = null;
    shapeRef.current = null;
    setOn(false);
    onRef.current = false;
    markDirty('overlay');
  }, [markDirty]);

  /** Drop the stroke or shape under way, painting nothing, and let go of the tiles it kept. */
  const dropStroke = useCallback((): boolean => {
    const under = strokeRef.current ?? shapeRef.current;
    if (!under) return false;
    strokeRef.current = null;
    shapeRef.current = null;
    under.step.drop();
    markDirty('overlay');
    return true;
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
  useEffect(() => () => {
    disposeRef.current();
    for (const canvas of toRelease.current) releaseCanvas(canvas);
    toRelease.current = [];
  }, []);
  // The pixels of a canvas let go of, once this render no longer draws with it.
  const drawnCanvas = surface?.canvas ?? null;
  useEffect(() => {
    if (toRelease.current.length === 0) return;
    toRelease.current = toRelease.current.filter((canvas) => {
      if (canvas === drawnCanvas) return true;
      releaseCanvas(canvas);
      return false;
    });
  });

  // What the rest of the page reads.
  const unsaved = unsavedOf(surface);
  // The map's picture was changed elsewhere since the canvas was made or
  // last saved: the canvas is no longer what the map shows. The picture a
  // save under way uploaded is this page's own.
  const stale = surface !== null && map !== null && surface.mapId === map.id && (map.imageUrl ?? '') !== surface.baseUrl
    && (surface.savingAssetId === null || extractAssetId(map.imageUrl) !== surface.savingAssetId);
  // Paint not saved over a picture changed elsewhere: kept, and the DM is
  // asked what to do with it, here and each time Paint is pressed until
  // they say. With nothing to save, the canvas simply goes.
  const stranded = stale && unsaved;
  useEffect(() => {
    if (!stale) return;
    strokeRef.current?.step.drop();
    shapeRef.current?.step.drop();
    strokeRef.current = null;
    shapeRef.current = null;
    setOn(false);
    onRef.current = false;
    if (stranded) setAsking(true);
    else dispose();
  }, [stale, stranded, dispose]);
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
      };
    };
    return () => {
      delete window.cozyPaintStats;
    };
  }, []);

  /**
   * Land a change whose tiles are kept already, after any undo under way,
   * showing `preview` on the overlay until it is painted.
   */
  const land = useCallback((step: PaintStep, preview: PaintPreview | null, apply: () => void) => {
    const s = surfaceRef.current;
    if (!s) return;
    if (preview) waitingRef.current.push(preview);
    void step.land(() => {
      apply();
      s.revision += 1;
    }).finally(() => {
      waitingRef.current = waitingRef.current.filter((w) => w !== preview);
      bump();
      markDirty('terrain', 'overlay');
    });
    markDirty('terrain', 'overlay');
  }, [bump, markDirty]);

  /** Paint a lifted stroke into the picture, after any undo under way; its tiles are kept already. */
  const commit = useCallback((stroke: Stroke) => {
    const s = surfaceRef.current;
    if (!s || s.mapId !== stroke.mapId) {
      stroke.step.drop();
      return;
    }
    const points = toPicture(stroke.points, ...xy(s));
    land(stroke.step, { kind: 'stroke', points: stroke.points, width: stroke.width / xy(s)[0], colour: stroke.colour }, () => {
      strokePaint(s.ctx, points, stroke.width, stroke.colour);
    });
  }, [land, xy]);

  /**
   * Fill the area at map pixel `point` with the colour, tile by tile
   * (floodFill.ts): each tile is read off the picture as the fill reaches
   * it, its pixels as they were packed for undo before its first change,
   * and written back. Not while an undo is putting tiles
   * back: the pixels read would be the ones it is replacing. A device that
   * cannot read the picture is told so; a part already filled stays, and
   * Undo takes it back.
   */
  const fillAt = useCallback((point: PaintPoint) => {
    const s = surfaceRef.current;
    if (!s || s.history.busy()) return;
    const look = settingsRef.current;
    const { width, height } = s.canvas;
    const step = s.history.begin();
    let box: PaintBox | null = null;
    let changedTiles = 0;
    try {
      box = floodFillTiled({
        width,
        height,
        tileSize: PAINT_TILE,
        read: (tile) => s.store.read(tile),
        changing: (tile, pixels) => {
          changedTiles += 1;
          step.keep(tile, s.store.keep(tile, pixels));
        },
        write: (tile, pixels) => s.ctx.putImageData(pixels, tile.x, tile.y),
      }, point[0] * xy(s)[0], point[1] * xy(s)[1], hexToRgba(look.colour), Math.round(look.tolerance * 2.55));
    } catch (err) {
      console.warn('[paint] A fill could not read the picture:', errorSummary(err));
      refuse(FILL_TOO_LARGE);
    }
    // Nothing changed: nothing to undo. A fill cut short by a failure keeps what it filled, for Undo.
    if (!box && changedTiles === 0) {
      step.drop();
      return;
    }
    void step.land(() => {
      s.revision += 1;
    }).finally(() => {
      bump();
      markDirty('terrain');
    });
  }, [bump, markDirty, refuse, xy]);

  const closeText = useCallback(() => {
    textRef.current = null;
    setTextBox(null);
  }, []);

  const setTextDraft = useCallback((draft: string) => {
    const open = textRef.current;
    if (!open) return;
    textRef.current = { ...open, draft };
    setTextBox({ at: open.at, draft });
  }, []);

  /**
   * Paint the line of text being written, if it has any words, once the
   * app's type has loaded, in the colour, as tall as Draw's labels for the
   * width. Its box closes at once.
   */
  const commitText = useCallback(() => {
    const open = textRef.current;
    closeText();
    const text = open?.draft.trim();
    const s = surfaceRef.current;
    if (!open || !text || !s || s.mapId !== open.mapId) return;
    const look = settingsRef.current;
    const size = labelFontSize(look.width);
    const font = textFont(size);
    const [x, y] = toPicture([open.at], ...xy(s))[0];
    const loaded = typeof document !== 'undefined' && document.fonts ? document.fonts.load(font).catch(() => undefined) : Promise.resolve();
    void loaded.then(() => {
      if (surfaceRef.current !== s) return;
      s.ctx.save();
      s.ctx.font = font;
      const width = s.ctx.measureText(text).width;
      s.ctx.restore();
      const step = s.history.begin();
      step.cover({ x0: x - 2, y0: y - 2, x1: x + width + 2, y1: y + size * 1.4 + 2 });
      land(step, null, () => {
        s.ctx.save();
        try {
          s.ctx.globalAlpha = 1;
          s.ctx.globalCompositeOperation = 'source-over';
          s.ctx.font = font;
          s.ctx.fillStyle = look.colour;
          s.ctx.textBaseline = 'top';
          s.ctx.fillText(text, x, y);
        } finally {
          s.ctx.restore();
        }
      });
    });
  }, [closeText, land, xy]);

  const commitTextRef = useRef(commitText);
  useEffect(() => {
    commitTextRef.current = commitText;
  }, [commitText]);

  /**
   * Save the picture as the map's (savePaint.ts), once any undo under way
   * has landed. What is painted while the save is under way stays not
   * saved: the picture saved is the one as Save was pressed.
   */
  const save = useCallback(async (overwrite = false) => {
    const s = surfaceRef.current;
    if (!s || !map || !campaignId || savingRef.current || s.mapId !== map.id) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await s.history.settled();
      // The map as the server has it now: a picture changed elsewhere,
      // which this page may not have been told of (a map being prepared
      // hears nothing of another tab's save), is asked about first.
      const latest = await mapService.getMap(campaignId, s.mapId);
      const previous = latest.imageUrl ?? '';
      if (previous !== s.baseUrl && !overwrite) {
        if ((map.imageUrl ?? '') !== previous) onMapRead(latest);
        setAsking(true);
        return;
      }
      const asOf = s.revision;
      const { map: saved, asset } = await savePaint({
        previous,
        makePng: () => pictureToPng(s.canvas),
        upload: async (png) => {
          const uploaded = await uploadDrawnPicture(png, campaignId);
          s.savingAssetId = uploaded.id;
          return uploaded;
        },
        pointMapAt: (assetId) => mapService.updateMap(campaignId, s.mapId, { imageUrl: assetId }),
        previousIsDrawn: () => pictureIsDrawn(previous, campaignId),
        remove: (assetId) => api.deleteAsset(assetId),
      });
      if (surfaceRef.current === s) {
        s.saved = asOf;
        s.baseUrl = saved.imageUrl ?? '';
        bump();
      }
      setAsking(false);
      onSaved(saved, asset);
    } catch (err) {
      refuse(err instanceof DrawnPictureRefused ? err.message : apiErrorMessage(err) || 'Could not save the picture. Try again.');
    } finally {
      s.savingAssetId = null;
      savingRef.current = false;
      setSaving(false);
    }
  }, [map, campaignId, bump, onSaved, onMapRead, refuse]);

  /** The DM's answer about paint not saved over a picture changed elsewhere. */
  const answer = useCallback((choice: 'save' | 'discard' | 'later') => {
    setAsking(false);
    if (choice === 'save') void save(true);
    else if (choice === 'discard') dispose();
  }, [save, dispose]);

  /** The eyedropper: the colour of the pixel at map pixel `point` becomes the colour, and the tool before comes back. */
  const pickAt = useCallback((point: PaintPoint) => {
    const s = surfaceRef.current;
    if (!s) return;
    const [x, y] = toPicture([point], ...xy(s))[0];
    const colour = readColour(s.ctx, x, y);
    setSettings((prev) => ({ ...prev, ...(colour ? { colour } : {}), tool: lastToolRef.current }));
  }, [xy]);

  /** Paint a lifted shape into the picture, as a stroke is. */
  const commitShape = useCallback((under: ShapeUnderWay) => {
    const s = surfaceRef.current;
    if (!s || s.mapId !== under.mapId) {
      under.step.drop();
      return;
    }
    const shape = scaleShape(under.shape, ...xy(s));
    land(under.step, { kind: 'shape', shape: under.shape }, () => drawShape(s.ctx, shape));
  }, [land, xy]);

  const step = useCallback((direction: 'undo' | 'redo') => {
    const s = surfaceRef.current;
    if (!s) return;
    dropStroke();
    void s.history[direction]().then((done) => {
      if (!done || surfaceRef.current !== s) return;
      s.revision += 1;
      bump();
      markDirty('terrain', 'overlay');
    });
  }, [bump, markDirty, dropStroke]);
  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);


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
      dropStroke();
      const point: PaintPoint = [at.mapPx.x, at.mapPx.y];
      if (TAP_TOOLS.has(look.tool)) {
        // A finger's drag moves the map; a tap or a click acts.
        // A line of text being written is painted as the next press lands.
        if (textRef.current) commitText();
        if (at.via === 'drag') mapControls.startDrag(at.e);
        else if (look.tool === 'fill') fillAt(point);
        else if (look.tool === 'eyedropper') pickAt(point);
        else if (look.tool === 'text') {
          textRef.current = { at: point, draft: '', mapId: s.mapId };
          setTextBox({ at: point, draft: '' });
        }
        return true;
      }
      if (isShapeTool(look.tool)) {
        const from = look.snap ? snapToGrid(point, map.gridSize) : point;
        shapeRef.current = {
          mapId: s.mapId,
          step: s.history.begin(),
          shape: { kind: look.tool, from, to: from, width: look.width / xy(s)[0], colour: look.colour, second: look.second, style: look.style },
        };
        markDirty('overlay');
        return true;
      }
      const step = s.history.begin();
      step.cover(strokeBox(toPicture([point], ...xy(s)), look.width));
      // The eraser is a brush of the second colour.
      const colour = look.tool === 'eraser' ? look.second : look.colour;
      strokeRef.current = { mapId: s.mapId, colour, width: look.width, points: [point], step };
      markDirty('overlay');
      return true;
    },
    move(at: PointerAt) {
      if (!onRef.current) return false;
      const under = shapeRef.current;
      if (under) {
        const look = settingsRef.current;
        const point: PaintPoint = [at.mapPx.x, at.mapPx.y];
        let to: PaintPoint = look.snap && map ? snapToGrid(point, map.gridSize) : point;
        if (under.shape.kind === 'line' && (look.straight || at.e.shiftKey)) to = stepAngle(under.shape.from, to);
        under.shape = { ...under.shape, to };
        // The tiles the shape reaches as it grows, kept as they are before it lands.
        const s = surfaceRef.current;
        if (s) under.step.cover(shapeBox(scaleShape(under.shape, ...xy(s))));
        markDirty('overlay');
        return true;
      }
      const stroke = strokeRef.current;
      if (stroke) {
        const point: PaintPoint = [at.mapPx.x, at.mapPx.y];
        const last = stroke.points[stroke.points.length - 1];
        if (!stillPoint(last, point)) {
          stroke.points.push(point);
          // The tiles this piece of the stroke reaches, kept as they are before it lands.
          const s = surfaceRef.current;
          if (s) stroke.step.cover(strokeBox(toPicture([last, point], ...xy(s)), stroke.width));
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
      const under = shapeRef.current;
      if (under) {
        shapeRef.current = null;
        const { from, to } = under.shape;
        // A shape of no size paints nothing.
        if (from[0] === to[0] && from[1] === to[1]) {
          under.step.drop();
          markDirty('overlay');
          return;
        }
        commitShape(under);
        return;
      }
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
      if (textRef.current) {
        closeText();
        return true;
      }
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

  /** The strokes and shapes under way, in map pixels, for the overlay. */
  const inProgress = useCallback((): PaintPreview[] => {
    const s = surfaceRef.current;
    if (!s) return [];
    const shown: PaintPreview[] = [...waitingRef.current];
    const stroke = strokeRef.current;
    if (stroke) shown.push({ kind: 'stroke', points: stroke.points, width: stroke.width / xy(s)[0], colour: stroke.colour });
    if (shapeRef.current) shown.push({ kind: 'shape', shape: shapeRef.current.shape });
    return shown;
  }, [xy]);

  return {
    /** Paint is on. */
    on,
    open,
    close,
    /** The picture to draw the map with: the one being painted, while there is one for the map on screen and it is still the map's. */
    source: surface && map && surface.mapId === map.id && !stale ? surface.canvas : null,
    /** Picture pixels to a map pixel across: a text box is shown as tall as it is painted. */
    scale: surface && map ? surface.canvas.width / (map.width * map.gridSize) : 1,
    /** Paint is on, or holds paint not saved over the map's picture: the page lets go of its own decoded picture meanwhile. */
    holdsPicture: surface !== null && !stale && (on || unsaved),
    /** Paint not saved is held over a picture changed elsewhere: Paint stays offered, to ask about it. */
    stranded,
    /** The question about it is open. */
    asking,
    answer,
    tool,
    key,
    inProgress,
    settings,
    setSettings,
    /** The line of text being written, and its box's actions. */
    textBox,
    setTextDraft,
    commitText,
    cancelText: closeText,
    /** Whether a text box is open now, for the canvas, which keeps the focus off the map while it is. */
    textOpen: () => textRef.current !== null,
    undo,
    redo,
    save,
    /** A save is under way. */
    saving,
    canUndo: surface?.history.canUndo() ?? false,
    canRedo: surface?.history.canRedo() ?? false,
    /** Paint on the map that is not saved. */
    unsaved,
  };
}

export type PaintSurface = ReturnType<typeof usePaintSurface>;

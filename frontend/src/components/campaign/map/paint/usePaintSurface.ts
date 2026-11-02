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
// What is painted and not saved is kept as a draft in the browser
// (paintDrafts.ts): the tiles each change touches, written at least every
// ten seconds, at once when the page is hidden, and as the picture is let
// go of with paint not saved; offered back when Paint opens on the map
// again, and cleared by Save and by Discard.
//
// Paint not saved is asked about before anything takes it off the screen
// (usePaintGuards.ts): isUnsaved, whenSaved and discard are for that. A map
// that leaves the screen without asking (deleted from elsewhere, or the
// viewer no longer the DM) leaves the painting behind as `leftover`, kept
// as a draft and offered as a picture to download.
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
import { createPaintHistory, PAINT_TILE, type PaintBox, type PaintHistory, type PaintHistoryCounts, type PaintStep, type TileRect } from './paintHistory';
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
import { savePaint, PNG_NOT_MADE } from './savePaint';
import { saveBlob } from '@/utils/download';
import { pictureIsDrawn, type MapPictureKind } from './mapPicture';
import { pictureToPng } from './blankPicture';
import { extractAssetId } from '@/utils/assetUrl';
import {
  DRAFT_INTERVAL_MS, DRAFT_LOOKUP_MS, DRAFTS_UNAVAILABLE, draftKey, draftsFailedMessage, keepDraftAside, newestDraft, packDraftTiles, paintTab, putDraftTiles,
  draftTileBox, type DraftHeader, type DraftStore, type DraftTile, type PaintTab, type PictureSize,
} from './paintDrafts';

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
   * The second colour, which the eraser paints: the
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
  /** The map's name as Paint opened, for the questions about it. */
  mapName: string;
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
  /** The tiles painted since the picture was made or last saved, by `column,row`. */
  changed: Map<string, TileRect>;
  /**
   * Those tiles as the picture saved had them, packed, each kept as a change
   * first reached it: what a draft leaves out, so it holds only the paint.
   */
  asSaved: Map<string, Uint8Array<ArrayBuffer>>;
  /** Of those, the ones changed since the draft was last written. */
  unwritten: Map<string, TileRect>;
  /** The next draft write begins the draft anew, dropping any tiles kept from before. */
  draftFresh: boolean;
  /** Another tab's draft this canvas was restored from, dropped once this tab's own has been written. */
  takenFrom: string | null;
  /** This tab's draft of the map is this canvas's, written by it or restored from: set by its first write. */
  ownsDraft: boolean;
}

/** Paint not saved on a map that left the screen without asking, until the DM says what to do with it. */
export interface PaintLeftover {
  mapId: string;
  mapName: string;
  /** The map is no longer on screen, or the viewer is no longer the DM. */
  reason: 'map' | 'not-dm';
  canvas: HTMLCanvasElement;
}

/** How Paint opens: on the picture as it is, or with a draft's tiles, of a picture `size` in size, put back. */
type OpenWith = 'fresh' | { draft: DraftTile[]; from: string; size: PictureSize };

/** A draft offered back as Paint opens, and whether it was painted on another picture than the map's now. */
export interface DraftOffer {
  header: DraftHeader;
  older: boolean;
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
  map: Pick<CampaignMap, 'id' | 'name' | 'width' | 'height' | 'gridSize' | 'imageUrl'> | null;
  campaignId: string | undefined;
  /** Told of a save: the map as pointed at its new picture, and the picture. */
  onSaved: (map: CampaignMap, picture: Asset) => void;
  /** Told of the map as Save read it, when it differs from the page's: the page shows that one. */
  onMapRead: (map: CampaignMap) => void;
  /**
   * The picture drawn for it, with the address it was loaded from: null for
   * a map with none, and while the page has let go of it (holdsPicture).
   * Paint opens only on one at the map's own address, never on the picture
   * before it, still drawn while a new one loads or after it failed.
   */
  picture: { image: HTMLImageElement; url: string } | null;
  /** What the map's picture is (mapPicture.ts): Paint is offered on a drawn one, and starts blank on none or one gone. */
  pictureKind: MapPictureKind;
  /** The picture at the map's own address failed to load. */
  pictureFailed: boolean;
  isDM: boolean;
  mapControls: MapControls;
  markDirty: (...layers: MapLayer[]) => void;
  /** Tells the DM why Paint did not open, or a save failed. */
  refuse: (message: string) => void;
  /** Tells the DM something to bear in mind, such as that no draft can be kept. */
  warn?: (message: string) => void;
  /**
   * Where drafts are kept; null in a browser that keeps none, which is said
   * once. Left out, no draft is kept and nothing is said.
   */
  drafts?: DraftStore | null;
  /** The signed-in user, whose drafts they are. */
  userId?: string;
  /** This tab, as drafts tell tabs apart; the page's own unless given. */
  tab?: PaintTab;
  make?: MakeCanvas;
}

const stillPoint = (a: PaintPoint | undefined, b: PaintPoint) => !!a && a[0] === b[0] && a[1] === b[1];

export function usePaintSurface(options: PaintSurfaceOptions) {
  const { map, picture, pictureKind, pictureFailed, campaignId, onSaved, onMapRead, isDM, mapControls, markDirty, refuse, warn, drafts, userId, tab, make } = options;
  // What Paint opens on: the picture at the map's own address, once it has
  // loaded, so a save never writes the picture before it, still drawn while a
  // new one loads or after it failed, over the new one. A map with no
  // picture, or one gone from the server, starts blank. Nothing else opens,
  // and Paint is offered where it opens (offered, below).
  const startsBlank = pictureKind === 'none' || pictureKind === 'gone';
  const ownPicture = !startsBlank && picture !== null && !!map?.imageUrl && picture.url === map.imageUrl ? picture : null;
  const opensOn = startsBlank || (pictureKind === 'drawn' && ownPicture !== null);
  /** The map's own picture is drawn again, or has failed to load, or the map has none: nothing is loading. */
  const pictureSettled = !map?.imageUrl || ownPicture !== null || pictureFailed;
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
  /** The save under way, which a question about leaving waits for. */
  const saveRun = useRef<Promise<boolean> | null>(null);
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

  // ---- Drafts ----
  const draftsRef = useRef(drafts);
  const userIdRef = useRef(userId);
  const campaignIdRef = useRef(campaignId);
  const warnRef = useRef(warn);
  const tabRef = useRef(tab ?? paintTab());
  useEffect(() => {
    draftsRef.current = drafts;
    userIdRef.current = userId;
    campaignIdRef.current = campaignId;
    warnRef.current = warn;
  });
  /** Every read and write of the store, one after another, so a write never lands after the remove that follows it. */
  const draftChain = useRef<Promise<unknown>>(Promise.resolve());
  /** A write has failed, or the store did not answer: no more are tried while the page is open. */
  const draftsOff = useRef(false);
  /** What the DM is told of it, once there is paint to keep. */
  const noDraftsWhy = useRef(DRAFTS_UNAVAILABLE);
  const toldNoDrafts = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Say once that this browser keeps no drafts. */
  const tellNoDrafts = useCallback(() => {
    if (toldNoDrafts.current) return;
    toldNoDrafts.current = true;
    warnRef.current?.(noDraftsWhy.current);
  }, []);
  /**
   * Run `job` on the store after everything before it. A failure turns
   * drafts off for the page; the DM is told once there is paint to keep.
   */
  const inDraftQueue = useCallback(<T,>(job: (store: DraftStore) => Promise<T>): Promise<T | undefined> => {
    const store = draftsRef.current;
    if (!store || draftsOff.current) return Promise.resolve(undefined);
    const run = draftChain.current.then(() => job(store));
    draftChain.current = run.catch((err: unknown) => {
      draftsOff.current = true;
      noDraftsWhy.current = draftsFailedMessage(err);
      console.warn('[paint] No draft can be kept:', errorSummary(err));
      const s = surfaceRef.current;
      if (s && s.revision !== s.saved) tellNoDrafts();
    });
    return run.catch(() => undefined);
  }, [tellNoDrafts]);
  /** This tab's draft of a map. */
  const keyOf = useCallback((mapId: string): string | null =>
    userIdRef.current && campaignIdRef.current ? draftKey(userIdRef.current, campaignIdRef.current, mapId, tabRef.current.id()) : null, []);
  /** The draft offered for the map on screen, as last looked for: by user, campaign and map. */
  const [found, setFound] = useState<{ key: string; header: DraftHeader | null } | null>(null);
  /** The draft offered no longer offered, once `key` is dropped. */
  const forgetFound = useCallback((key: string) => {
    setFound((now) => (now?.header?.key === key ? { key: now.key, header: null } : now));
  }, []);
  /** Canvases made, counted: a lookup that answers after one was made on its map is out of date. */
  const canvasesMade = useRef(0);
  /** The latest writeDraft, for the timer and the page going. */
  const writeDraftRef = useRef<(s: Surface | null) => void>(() => undefined);
  /** Write what is new to the draft within DRAFT_INTERVAL_MS. */
  const scheduleDraft = useCallback(() => {
    if (draftTimer.current !== null) return;
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      writeDraftRef.current(surfaceRef.current);
    }, DRAFT_INTERVAL_MS);
  }, []);
  /**
   * Write the tiles changed since the last write, packed off the picture
   * now. Nothing while all is saved; a browser that keeps no drafts is
   * told so once. A write that finds the draft gone writes the whole
   * painting again soon after; one that goes on from another tab's draft
   * drops that one once it has landed.
   */
  const writeDraft = useCallback((s: Surface | null) => {
    if (draftTimer.current !== null) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    if (!s || s.revision === s.saved || s.unwritten.size === 0 || draftsRef.current === undefined) return;
    if (draftsRef.current === null || draftsOff.current) {
      tellNoDrafts();
      return;
    }
    const key = keyOf(s.mapId);
    const user = userIdRef.current;
    const campaign = campaignIdRef.current;
    if (!key || !user || !campaign) return;
    let tiles: DraftTile[];
    try {
      tiles = packDraftTiles(s.ctx, [...s.unwritten.values()], (t) => s.asSaved.get(`${t.tx},${t.ty}`));
    } catch (err) {
      console.warn('[paint] Could not read the picture for its draft:', errorSummary(err));
      return;
    }
    s.unwritten.clear();
    const fresh = s.draftFresh;
    s.draftFresh = false;
    const takenFrom = s.takenFrom;
    s.takenFrom = null;
    const header: DraftHeader = {
      key, userId: user, campaignId: campaign, mapId: s.mapId, tabId: tabRef.current.id(), baseUrl: s.baseUrl,
      width: s.canvas.width, height: s.canvas.height, savedAt: Date.now(),
    };
    void inDraftQueue(async (store) => {
      // A canvas's first write goes over this tab's draft of the map only
      // when the canvas came from it. One it never saw (found after Paint
      // stopped waiting for it, or older than the draft restored) is kept
      // aside, and offered once nothing of this canvas is held.
      const first = !s.ownsDraft;
      s.ownsDraft = true;
      if (first && takenFrom !== key) {
        const unseen = (await store.list()).find((draft) => draft.key === key);
        if (unseen) {
          const aside = await keepDraftAside(store, unseen);
          const shown = `${user}|${campaign}|${s.mapId}`;
          setFound((now) => (now?.key === shown ? { key: shown, header: aside } : now));
        }
      }
      const whole = await store.put(header, tiles, fresh);
      if (takenFrom && takenFrom !== key) {
        await store.remove(takenFrom);
        forgetFound(takenFrom);
      }
      if (!whole && surfaceRef.current === s) {
        for (const [at, tile] of s.changed) s.unwritten.set(at, tile);
        s.draftFresh = true;
        scheduleDraft();
      }
    });
  }, [inDraftQueue, tellNoDrafts, keyOf, scheduleDraft, forgetFound]);
  useEffect(() => {
    writeDraftRef.current = writeDraft;
  }, [writeDraft]);
  /** Tiles a change has just painted: in the draft within DRAFT_INTERVAL_MS. */
  const touched = useCallback((s: Surface, tiles: readonly TileRect[]) => {
    for (const tile of tiles) {
      const at = `${tile.tx},${tile.ty}`;
      s.changed.set(at, tile);
      s.unwritten.set(at, tile);
    }
    if (draftsRef.current === null || draftsOff.current) tellNoDrafts();
    scheduleDraft();
  }, [scheduleDraft, tellNoDrafts]);
  /** This tab's draft of a map dropped, as Save and Discard do. */
  const clearDraft = useCallback((mapId: string) => {
    const key = keyOf(mapId);
    if (!key) return;
    forgetFound(key);
    void inDraftQueue((store) => store.remove(key));
  }, [inDraftQueue, keyOf, forgetFound]);
  /** Another draft dropped, as Discard it does to the one offered. */
  const dropDraft = useCallback((key: string) => {
    forgetFound(key);
    void inDraftQueue((store) => store.remove(key));
  }, [inDraftQueue, forgetFound]);
  /**
   * The drafts of what a canvas holds dropped, as Save and Discard do: this
   * tab's, and the closed tab's it was restored from, if its own has not
   * been written yet to drop that one.
   */
  const clearDrafts = useCallback((s: Surface) => {
    clearDraft(s.mapId);
    if (s.takenFrom) dropDraft(s.takenFrom);
    s.takenFrom = null;
  }, [clearDraft, dropDraft]);
  // The newest draft of the map on screen, this tab's or a closed tab's,
  // looked for as it is shown to the DM. A press of Paint waits for it at
  // most DRAFT_LOOKUP_MS, so Paint is never held up; one found later, behind
  // a large write still under way for instance, is offered at the next press
  // while no canvas has been made on the map since (a canvas made meanwhile
  // keeps such a draft aside as it first writes, and that is offered). A
  // store that takes as long to answer the lookup itself, once its turn has
  // come, does not answer at all: drafts are off for the page.
  const mapIdShown = map?.id ?? null;
  const lookupKey = mapIdShown && isDM && userId && campaignId && drafts ? `${userId}|${campaignId}|${mapIdShown}` : null;
  useEffect(() => {
    if (!lookupKey || !mapIdShown || !userId || !campaignId) return undefined;
    let live = true;
    const madeBefore = canvasesMade.current;
    const waited = setTimeout(() => {
      setFound((now) => (now?.key === lookupKey ? now : { key: lookupKey, header: null }));
    }, DRAFT_LOOKUP_MS);
    const where = { userId, campaignId, mapId: mapIdShown };
    void inDraftQueue(async (store) => {
      let stuck: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          newestDraft(store, tabRef.current, where),
          new Promise<'late'>((resolve) => { stuck = setTimeout(() => resolve('late'), DRAFT_LOOKUP_MS); }),
        ]);
      } finally {
        clearTimeout(stuck);
      }
    }).then((header) => {
      clearTimeout(waited);
      if (header === 'late') {
        console.warn('[paint] The draft store did not answer; no draft is kept on this page.');
        draftsOff.current = true;
      }
      if (!live || canvasesMade.current !== madeBefore) return;
      setFound({ key: lookupKey, header: header === 'late' ? null : header ?? null });
    });
    return () => {
      live = false;
      clearTimeout(waited);
    };
  }, [lookupKey, mapIdShown, userId, campaignId, inDraftQueue]);
  /** Whether the map on screen's draft has been looked for: Paint opens once it has. */
  const draftKnown = lookupKey === null || found?.key === lookupKey;
  const draftFound = lookupKey !== null && found?.key === lookupKey ? found.header : null;
  /** The draft being offered back, while the question is open. */
  const [offer, setOffer] = useState<DraftOffer | null>(null);

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

  const [leftover, setLeftover] = useState<PaintLeftover | null>(null);
  /**
   * Let go of everything but the picture, which stays as `leftover` for the
   * DM to download or discard: its map left the screen without asking.
   */
  const strand = useCallback((s: Surface, reason: PaintLeftover['reason']) => {
    textRef.current = null;
    setTextBox(null);
    (strokeRef.current ?? shapeRef.current)?.step.drop();
    strokeRef.current = null;
    shapeRef.current = null;
    s.history.clear();
    s.store.dispose();
    show(null);
    waitingRef.current = [];
    setLeftover((before) => {
      if (before) toRelease.current.push(before.canvas);
      return { mapId: s.mapId, mapName: s.mapName, reason, canvas: s.canvas };
    });
    markDirty('terrain', 'overlay');
  }, [show, markDirty]);

  /**
   * Open Paint on the map on screen, at its squares times its grid size
   * (held to the drawn-map size rule), whatever its picture's own size: a
   * new drawn map's picture is one pixel a square. The picture is drawn in
   * stretched to that size, or a map with none starts blank.
   */
  const open = useCallback((how?: OpenWith): boolean => {
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
    if (!opensOn) return false;
    const size = drawnPictureSize(map.width, map.height, map.gridSize);
    // A draft of this map kept from before is offered back first; until it
    // has been looked for, Paint waits (the page opens it once it has).
    if (how === undefined && !(held && held.mapId === map.id)) {
      if (!draftKnown) {
        usePaintStore.getState().openWhenShown(map.id);
        return false;
      }
      if (draftFound) {
        const older = draftFound.baseUrl !== (map.imageUrl ?? '') || !size.fits || draftFound.width !== size.width || draftFound.height !== size.height;
        setOffer({ header: draftFound, older });
        return false;
      }
    }
    if (held) dispose();
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
    if (ownPicture) {
      ctx.drawImage(ownPicture.image, 0, 0, width, height);
    } else {
      ctx.fillStyle = DRAWN_MAP_BACKGROUND;
      ctx.fillRect(0, 0, width, height);
    }
    // Each tile as the picture saved had it, as a change first reaches it:
    // every change keeps its tiles before it is made, the fill's included.
    const remember = (tile: TileRect, kept: KeptTile): KeptTile => {
      const at = `${tile.tx},${tile.ty}`;
      const into = made?.asSaved;
      if (into && kept.packed && !into.has(at)) into.set(at, kept.packed);
      return kept;
    };
    const tileStore = createCanvasTileStore(ctx);
    const store: CanvasTileStore = {
      ...tileStore,
      capture: (tile) => remember(tile, tileStore.capture(tile)),
      keep: (tile, pixels) => remember(tile, tileStore.keep(tile, pixels)),
    };
    // The eraser's colour: the picture's own, read off its top-left pixel.
    const second = readColour(ctx, 0, 0) ?? DRAWN_MAP_BACKGROUND;
    setSettings((prev) => ({ ...prev, second }));
    let made: Surface | null = null;
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
      onTouched: (tiles) => {
        if (made) touched(made, tiles);
      },
    });
    const surface: Surface = {
      mapId: map.id, mapName: map.name, canvas, ctx, history, store, revision: 0, saved: 0,
      // The address of the pixels drawn in; a map started blank, its own.
      baseUrl: ownPicture ? ownPicture.url : map.imageUrl ?? '',
      savingAssetId: null,
      changed: new Map(),
      asSaved: new Map(),
      unwritten: new Map(),
      // A draft restored is written again as this tab's own, whole, and the
      // one it came from dropped once that has landed. A draft left from
      // before and not restored is not mixed into this one.
      draftFresh: true,
      takenFrom: how !== undefined && how !== 'fresh' ? how.from : null,
      ownsDraft: false,
    };
    made = surface;
    canvasesMade.current += 1;
    show(surface);
    // A draft's painting, put back over the picture as one change, which
    // Undo takes back: paint not saved, in the draft as the tiles it reached.
    if (how !== undefined && how !== 'fresh') {
      const step = history.begin();
      for (const tile of how.draft) {
        const box = draftTileBox(tile, how.size, { width, height });
        if (box) step.cover(box);
      }
      // A history just made has no undo under way: the change lands at once.
      let put = 0;
      void step.land(() => {
        put = putDraftTiles(ctx, how.draft, how.size, { width, height }, make);
        if (put > 0) surface.revision += 1;
      });
      // Nothing of the draft could be read: nothing to undo, or to keep.
      if (put === 0) {
        history.clear();
        surface.changed.clear();
        surface.unwritten.clear();
      }
    }
    setOn(true);
    onRef.current = true;
    markDirty('terrain', 'overlay');
    return true;
  }, [map, isDM, opensOn, ownPicture, refuse, make, dispose, show, bump, markDirty, touched, draftKnown, draftFound]);

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
      writeDraft(s);
      if (unsavedOf(s)) strand(s, isDM ? 'map' : 'not-dm');
      else dispose();
      setOn(false);
      onRef.current = false;
    } else if (!s && on && !isDM) {
      setOn(false);
      onRef.current = false;
    }
  }, [mapId, isDM, on, dispose, writeDraft, strand]);
  // A draft offered for a map no longer on screen, or to a viewer no longer
  // the DM, is no longer asked about: its answer would act on nothing.
  useEffect(() => {
    setOffer((offered) => (offered && (offered.header.mapId !== mapId || !isDM) ? null : offered));
  }, [mapId, isDM]);
  // And when the map goes from the page.
  const leftoverRef = useRef(leftover);
  useEffect(() => {
    leftoverRef.current = leftover;
  }, [leftover]);
  const disposeRef = useRef(dispose);
  useEffect(() => {
    disposeRef.current = dispose;
  }, [dispose]);
  useEffect(() => () => {
    writeDraftRef.current(surfaceRef.current);
    if (draftTimer.current !== null) clearTimeout(draftTimer.current);
    disposeRef.current();
    if (leftoverRef.current) releaseCanvas(leftoverRef.current.canvas);
    for (const canvas of toRelease.current) releaseCanvas(canvas);
    toRelease.current = [];
  }, []);
  // The pixels of a canvas let go of, once this render no longer draws with it.
  const drawnCanvas = surface?.canvas ?? null;
  const leftoverCanvas = leftover?.canvas ?? null;
  useEffect(() => {
    if (toRelease.current.length === 0) return;
    toRelease.current = toRelease.current.filter((canvas) => {
      if (canvas === drawnCanvas || canvas === leftoverCanvas) return true;
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
  // The page hidden (another tab or app, a phone's screen off) may not come
  // back: what is new goes into the draft at once.
  useEffect(() => {
    const now = () => writeDraft(surfaceRef.current);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', now);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', now);
    };
  }, [writeDraft]);
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
  const saveNow = useCallback(async (overwrite: boolean): Promise<boolean> => {
    const s = surfaceRef.current;
    if (!s || !map || !campaignId || savingRef.current || s.mapId !== map.id) return false;
    savingRef.current = true;
    setSaving(true);
    // The tiles painted until the picture is taken go with this save, and
    // come back if it fails; those painted while it is under way stay for
    // the draft after it.
    let taken: { changed: Map<string, TileRect>; unwritten: Map<string, TileRect>; asSaved: Map<string, Uint8Array<ArrayBuffer>> } | null = null;
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
        return false;
      }
      const asOf = s.revision;
      // The picture is taken for the PNG now (savePaint makes it first, at
      // once): a tile changed from here on is kept as it is in the picture
      // saved, so a draft after the save holds only what was painted since.
      taken = { changed: s.changed, unwritten: s.unwritten, asSaved: s.asSaved };
      s.changed = new Map();
      s.asSaved = new Map();
      s.unwritten = new Map();
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
      taken = null;
      if (surfaceRef.current === s) {
        s.saved = asOf;
        s.baseUrl = saved.imageUrl ?? '';
        bump();
      }
      // The draft was of the picture before; what was painted during the
      // save begins a new one, on the picture saved.
      clearDrafts(s);
      s.draftFresh = true;
      if (s.changed.size > 0) touched(s, [...s.changed.values()]);
      setAsking(false);
      onSaved(saved, asset);
      return true;
    } catch (err) {
      if (taken) {
        for (const [at, tile] of taken.changed) s.changed.set(at, tile);
        for (const [at, tile] of taken.unwritten) s.unwritten.set(at, tile);
        // Nothing was saved: the tiles as kept before the save stand.
        for (const [at, packed] of taken.asSaved) s.asSaved.set(at, packed);
      }
      refuse(err instanceof DrawnPictureRefused ? err.message : apiErrorMessage(err) || 'Could not save the picture. Try again.');
      return false;
    } finally {
      s.savingAssetId = null;
      savingRef.current = false;
      setSaving(false);
    }
  }, [map, campaignId, bump, onSaved, onMapRead, refuse, clearDrafts, touched]);
  /** Save, answering whether it saved; pressed again while one is under way, that one's answer. */
  const save = useCallback((overwrite = false): Promise<boolean> => {
    if (savingRef.current && saveRun.current) return saveRun.current;
    const run = saveNow(overwrite);
    saveRun.current = run;
    void run.finally(() => {
      if (saveRun.current === run) saveRun.current = null;
    });
    return run;
  }, [saveNow]);

  /** Drop what is painted and not saved, with its draft: the picture as saved shows again. */
  const discard = useCallback(() => {
    const s = surfaceRef.current;
    if (!s) return;
    clearDrafts(s);
    setAsking(false);
    setOn(false);
    onRef.current = false;
    dispose();
  }, [clearDrafts, dispose]);

  /** Hand the browser the picture `canvas` holds now as a PNG, named after its map; false when no PNG could be made. */
  const savePicture = useCallback(async (canvas: HTMLCanvasElement, mapName: string): Promise<boolean> => {
    const png = await pictureToPng(canvas);
    if (!png) {
      refuse(PNG_NOT_MADE);
      return false;
    }
    saveBlob(`${mapName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Painting'}.png`, png);
    return true;
  }, [refuse]);

  /**
   * Download the picture being painted, as it is now, painted or not: the
   * way to keep paint that cannot be saved (a picture over the server's
   * limit, the campaign gone, a sign-in that must change first).
   */
  const download = useCallback(async () => {
    const s = surfaceRef.current;
    if (s) await savePicture(s.canvas, mapRef.current?.id === s.mapId ? mapRef.current.name : s.mapName);
  }, [savePicture]);

  /** The painting left behind by a map gone without asking: downloaded as a PNG, then let go of. */
  const downloadLeftover = useCallback(async () => {
    const left = leftoverRef.current;
    if (!left || !(await savePicture(left.canvas, left.mapName))) return;
    setLeftover(null);
    toRelease.current.push(left.canvas);
  }, [savePicture]);
  /** The painting left behind, let go of with its draft. */
  const discardLeftover = useCallback(() => {
    const left = leftoverRef.current;
    if (!left) return;
    clearDraft(left.mapId);
    setLeftover(null);
    toRelease.current.push(left.canvas);
  }, [clearDraft]);

  /** The DM's answer about paint not saved over a picture changed elsewhere. */
  const answer = useCallback((choice: 'save' | 'discard' | 'later') => {
    setAsking(false);
    if (choice === 'save') void save(true);
    else if (choice === 'discard') {
      const s = surfaceRef.current;
      if (s) clearDrafts(s);
      dispose();
    }
  }, [save, dispose, clearDrafts]);

  /**
   * The DM's answer to the draft offered back: Restore opens Paint with its
   * tiles put back, Discard drops it and opens Paint on the picture as it
   * is, and Not now leaves both as they are.
   */
  const answerOffer = useCallback(async (choice: 'restore' | 'discard' | 'later') => {
    const offered = offer;
    setOffer(null);
    if (!offered || choice === 'later' || !map || map.id !== offered.header.mapId) return;
    if (choice === 'discard') {
      dropDraft(offered.header.key);
      open('fresh');
      return;
    }
    const tiles = await inDraftQueue((store) => store.tiles(offered.header.key));
    if (!tiles) {
      refuse('Your draft could not be read from this browser.');
      return;
    }
    open({ draft: tiles, from: offered.header.key, size: { width: offered.header.width, height: offered.header.height } });
  }, [offer, map, dropDraft, open, inDraftQueue, refuse]);

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

  const source = surface && map && surface.mapId === map.id && !stale ? surface.canvas : null;

  return {
    /** Paint is on. */
    on,
    open,
    close,
    /** The picture to draw the map with: the one being painted, while there is one for the map on screen and it is still the map's. */
    source,
    /** Picture pixels to a map pixel across: a text box is shown as tall as it is painted. */
    scale: surface && map ? surface.canvas.width / (map.width * map.gridSize) : 1,
    /** Paint is on, or holds paint not saved over the map's picture: the page lets go of its own decoded picture meanwhile. */
    holdsPicture: surface !== null && !stale && (on || unsaved),
    /** Paint not saved is held over a picture changed elsewhere: Paint stays offered, to ask about it. */
    stranded,
    /**
     * Paint is offered to the DM, and open() opens: on the map's own picture,
     * or blank, or on the canvas held for the map; or to ask about paint held
     * over a picture changed elsewhere.
     */
    offered: isDM && map !== null && (stranded || source !== null || opensOn),
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
    /** Paint not saved now, read as it is, for a question asked after an await. */
    isUnsaved: () => unsavedOf(surfaceRef.current),
    /** Settles once a save under way has, at once with none. */
    whenSaved: (): Promise<unknown> => saveRun.current ?? Promise.resolve(),
    discard,
    download,
    /** Paint not saved left behind by a map gone without asking, and what the DM may do with it. */
    leftover,
    downloadLeftover,
    discardLeftover,
    /** The draft of the map on screen has been looked for, so Paint can open. */
    ready: draftKnown,
    /** A draft offered back as Paint opens, while the question is open, and the DM's answer to it. */
    offer,
    answerOffer,
  };
}

export type PaintSurface = ReturnType<typeof usePaintSurface>;

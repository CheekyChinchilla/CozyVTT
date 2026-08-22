// ============================================
// Map Canvas Component
// HTML Canvas-based map viewer with zoom/pan controls
// ============================================

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Palette, Ghost, Ruler, Zap } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore, useTokenList, useCurrentTurnTokenId, useMapPeekTokenId } from '@/stores/gameStore';
import { useMapControls } from '@/hooks/useMapControls';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type {
  Token,
  TokenMoveStartEvent,
  TokenMoveEvent,
  TokenMoveEndEvent,
  TokenMovedEvent,
  Map as CampaignMap,
  SpiritLayerToggledBroadcast,
  SpiritLayerTokenToggledBroadcast,
  VibeUpdatedBroadcast,
  Character,
  MapPingedBroadcast,
} from '@/types';
import { TokenLayer, TokenType } from '@/types';
import type { WallSegment, FogState, WallType, LightSource } from '@/types/walls';
import { douglasPeucker, edgeSnapPoints } from '@/utils/geometry';
import {
  drawMapImage,
  drawSpiritLayer,
  drawGrid,
  drawFog,
  drawTokens,
  drawDynamicLighting,
  drawLightIcons,
  drawWalls,
  drawWallDrawOverlay,
  drawSplitPreview,
  drawEraseOverlay,
  drawBrushOverlay,
  drawPolygonOverlay,
  drawRuler,
  drawAoEOverlay,
  drawFogSelection,
  drawPings,
  PING_DURATION_MS,
  type ActivePing,
  type Viewport,
} from './map/layers';
import { createVisionCache, type VisionSource } from './map/vision';
import { fogRectFromDrag, fogCellsInRect } from './map/fogSelection';
import { useTokenAnimation, useFogRevealAnimation, useCanvasTicker, pulsePhaseAt } from './map/useMapAnimations';
import { playerColor } from '@/utils/playerColor';
import { useRenderLoop, type MapLayer } from './map/useRenderLoop';
import api from '@/services/api';
import CharacterSheetViewerModal from '@/components/character/CharacterSheetViewerModal';
import CharacterRollPicker from '@/components/campaign/CharacterRollPicker';
import NpcRollPicker from '@/components/campaign/NpcRollPicker';
import AtmosphereOverlay from '@/components/campaign/AtmosphereOverlay';
import DmFogControls, { type FogToolMode } from '@/components/campaign/DmFogControls';
import DmWallControls, { type WallToolMode } from '@/components/campaign/DmWallControls';
import DmLightControls, { type LightToolMode, type LightPlacementDefaults } from '@/components/campaign/DmLightControls';
import DmToolPanelContainer from '@/components/campaign/DmToolPanelContainer';
import { useWallHistory } from '@/hooks/useWallHistory';
import Toast, { useToast } from '@/components/Toast';
import Button from '@/components/ui/Button';
import '@/styles/spirit-effects.css';

/** Returns the accent color for the spirit layer style string. Used for spirit token ring. */
function getSpiritAccentColor(style: string | null | undefined): string {
  if (!style) return '#9370DB';
  if (style.startsWith('custom:')) {
    const rest = style.slice(7);
    const lastColon = rest.lastIndexOf(':');
    return lastColon !== -1 ? rest.slice(0, lastColon) : rest;
  }
  if (style === 'ethereal') return '#c8deff';
  if (style === 'shadow') return '#9b6dcc';
  if (style === 'dream') return '#d4a0f0';
  return '#9370DB'; // wispy default = spirit-purple
}

type AoEShape = 'sphere' | 'cylinder' | 'cone' | 'line' | 'cube';

interface AoEConfig {
  shape: AoEShape;
  sizeFt: number;
  widthFt?: number; // line only, default 5
}

interface MapCanvasProps {
  onEditToken?: (token: Token) => void;
}

export default function MapCanvas({ onEditToken }: MapCanvasProps) {
  const { currentMap, setCurrentMap, userRole, campaign, updateCampaignSpiritLayer, dmViewBothPlanes, playerSpiritVisible, setPlayerSpiritVisible, activeVibeEffect, updateVibe, activeAtmosphereEffect, characterHpCache } = useCampaign();
  // Live token state comes from the game store, not the campaign context —
  // socket handlers write there directly (outside React), and this
  // subscription is what re-renders the canvas per token change.
  const tokens = useTokenList();
  // Whose turn it is, for the active-combatant ring. Narrow selector: this
  // changes on turn advance only, not when a combatant's HP ticks.
  const currentTurnTokenId = useCurrentTurnTokenId();
  // Token being pointed at from the initiative tracker. Null while the map is
  // the one pointing — the blue hover outline already marks that case.
  const peekTokenId = useMapPeekTokenId();
  const prefersReducedMotion = useReducedMotion();
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const isDM = userRole === 'DM';
  // Three stacked canvases. `canvasRef` is the TOP canvas — it
  // receives all pointer input and holds the overlay draw layer; terrain and
  // tokens sit beneath it. All three are the same size and share one world
  // transform, so their composite is pixel-identical to the old single canvas.
  const canvasRef = useRef<HTMLCanvasElement>(null);        // overlay layer + input
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null); // map image, grid, fog, spirit
  const tokenCanvasRef = useRef<HTMLCanvasElement>(null);   // tokens + drag ghost
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);           // wraps the 3 canvases; CSS-transformed during pan
  // One vision-polygon cache for this map instance.
  const visionCacheRef = useRef(createVisionCache());
  // Lazily-created AudioContext for spirit layer transition sound
  const audioCtxRef = useRef<AudioContext | null>(null);

  // State
  const [showGrid, setShowGrid] = useState(true);
  const [gridColor, setGridColor] = useState<'black' | 'white'>('black');
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Spirit layer image
  const [spiritLayerImage, setSpiritLayerImage] = useState<HTMLImageElement | null>(null);
  // Fade-in transition state for spirit layer toggle
  const [spiritLayerOpacity, setSpiritLayerOpacity] = useState(1);

  // Token state
  const [tokenImages, setTokenImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [draggedToken, setDraggedToken] = useState<Token | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [hoverToken, setHoverToken] = useState<Token | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    token: Token;
    x: number;
    y: number;
  } | null>(null);

  // Door context menu state (right-click on a door segment)
  const [doorContextMenu, setDoorContextMenu] = useState<{
    door: WallSegment;
    x: number; // viewport x
    y: number; // viewport y
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isMovingTokenLayer, setIsMovingTokenLayer] = useState(false);
  const [contextMenuMoveToMapOpen, setContextMenuMoveToMapOpen] = useState(false);
  const [isMoveToMapLoading, setIsMoveToMapLoading] = useState(false);

  // Character sheet viewer state
  const [viewingCharacter, setViewingCharacter] = useState<Character | null>(null);

  // Roll picker (right-click token → Roll...)
  const [rollPicker, setRollPicker] = useState<{ characterId: string; x: number; y: number } | null>(null);
  const [npcRollPicker, setNpcRollPicker] = useState<{ tokenId: string; x: number; y: number } | null>(null);

  // DM-only: toggle whether spirit-layer tokens are drawn on canvas
  const [dmShowSpiritTokens, setDmShowSpiritTokens] = useState(true);

  // Ruler tool
  const [showRuler, setShowRuler] = useState(false);
  const [rulerOrigin, setRulerOrigin] = useState<{ x: number; y: number } | null>(null);
  const [rulerColor, setRulerColor] = useState<'amber' | 'purple' | 'black'>('amber');

  // AoE tool
  const [showAoE, setShowAoE] = useState(false);
  const [aoeConfig, setAoEConfig] = useState<AoEConfig>({ shape: 'sphere', sizeFt: 20 });
  const [aoeOrigin, setAoEOrigin] = useState<{ x: number; y: number } | null>(null);

  // Latest-ref to the per-layer draw dispatcher — assigned right after the
  // draw callbacks are defined below. The render loop and the animation hooks
  // call the newest closure through it.
  const drawLayerRef = useRef<(layer: MapLayer) => void>(() => {});
  const { markDirty } = useRenderLoop(drawLayerRef);

  // Walls & Fog of War state — wall segments use undo/redo history hook
  const { walls: wallSegments, push: pushWallHistory, replace: replaceWallHistory, undo: undoWalls, redo: redoWalls, canUndo: canUndoWalls, canRedo: canRedoWalls } = useWallHistory([]);
  const [fogState, setFogState] = useState<FogState | null>(null);
  // Player view: list of revealed fog cell indices (derived from server fog:cells event).
  // null = fog data not received yet (show everything); Set = fog active (show only revealed cells).
  const [revealedCells, setRevealedCells] = useState<Set<number> | null>(null);
  // Fog reveal animation: per-cell opacity (1 = just revealed, 0 = fully faded in)
  const revealOpacityRef = useFogRevealAnimation(() => markDirty('terrain'), fogState, revealedCells);
  // Cache invalidation flag for the wall layer.
  const wallCacheValidRef = useRef(false);

  // Wall tool state (DM only)
  const [wallMode, setWallMode] = useState<WallToolMode>(null);
  const [wallType, setWallType] = useState<import('@/types/walls').WallType>('wall');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToEndpoint, setSnapToEndpoint] = useState(false);
  // Radius (in map-space pixels) within which a point snaps to an existing endpoint
  const ENDPOINT_SNAP_RADIUS = 16;
  const [wallInProgress, setWallInProgress] = useState<{ x: number; y: number }[]>([]); // current polyline points
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const [hoveredDoorId, setHoveredDoorId] = useState<string | null>(null); // for pointer cursor in pan mode
  const [wallColor, setWallColor] = useState('#f97316'); // default orange
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [splitHoverPoint, setSplitHoverPoint] = useState<{ x: number; y: number; wallId: string } | null>(null);
  const wallEraseBrushActiveRef = useRef(false);
  const wallErasedIdsRef = useRef<Set<string>>(new Set());
  // Polygon drawing mode state
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  /** Screen-space radius within which clicking the first polygon point closes the shape. */
  const POLYGON_CLOSE_RADIUS = 14;
  // Right-mouse button panning while a wall tool is active (left-click is reserved for tools)
  const rightPanActiveRef = useRef(false);
  const WALL_ERASE_RADIUS = 24; // map-space pixels
  // Brush wall-painting mode state
  const [brushSize, setBrushSize] = useState(20);
  const wallBrushActiveRef = useRef(false);
  const wallBrushPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const wallDragEndpointRef = useRef<{
    targets: Array<{ segId: string; end: 'start' | 'end' }>;
    point: { x: number; y: number };
    preDragState: WallSegment[] | null;
    hasDragged: boolean;
  } | null>(null);
  const [nearEndpoint, setNearEndpoint] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<{ x: number; y: number } | null>(null);
  const { toast, showToast, hideToast } = useToast();
  /** DM "Preview player view" toggle — when true, DM sees lighting as players do. */
  const [dmPreviewPlayerView, setDmPreviewPlayerView] = useState(false);

  // Light source state
  const [lightSources, setLightSources] = useState<LightSource[]>([]);
  const lightSourcesRef = useRef<LightSource[]>([]);
  useEffect(() => { lightSourcesRef.current = lightSources; }, [lightSources]);
  const [lightMode, setLightMode] = useState<LightToolMode>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [lightPlacementDefaults, setLightPlacementDefaults] = useState<LightPlacementDefaults>({
    brightRadius: 4, dimRadius: 8, color: '#ffcc66',
  });
  // Drag-to-move state for lights in select mode
  const draggingLightRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

  // Fog selection tool state (DM only)
  const [fogMode, setFogMode] = useState<FogToolMode>(null);
  // Fog selection drag: anchor is fixed on mousedown, current follows the
  // cursor. Both in map pixels — the fog raster is top-left origin like map
  // pixels, so the box never touches the bottom-left grid convention.
  const fogDragAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const [fogDragCurrent, setFogDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Token socket handlers read/write live token state synchronously via
  // useGameStore.getState() — no stale-closure ref bookkeeping needed.

  // Always-current wall segments ref — socket handlers registered with [socket, currentMap?.id]
  // deps would otherwise close over stale wallSegments from registration time.
  const wallSegmentsRef = useRef<WallSegment[]>([]);
  useEffect(() => { wallSegmentsRef.current = wallSegments; }, [wallSegments]);

  // Cached offscreen canvas for dynamic lighting compositing.
  // Recreated only when map dimensions change; prevents ~5MB alloc per render frame.
  const lightingOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const lightCoverageOffscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Raw map-pixel position from last mousemove — ghost line uses this when snap is off.
  // screenToGrid() quantises to integer grid coords, so hoverCoords can't be used for free-draw.
  const hoverMapPxRef = useRef<{ x: number; y: number } | null>(null);

  // Ref to detect changes across renders without adding to dep arrays (for spirit transition)
  const prevPlayerSpiritVisibleRef = useRef(false);

  // Fade transition state when switching maps
  const [isFading, setIsFading] = useState(false);

  // Track which map we've already auto-fitted, to avoid re-fitting on window resize
  const lastFittedMapIdRef = useRef<string | null>(null);

  // Animation state for smooth token movement (rAF tween loop in the hook).
  // A tween moves tokens → repaint the tokens layer, plus the overlay when
  // dynamic lighting is on (the viewer's vision follows the moving token).
  const { animatingTokens, setAnimatingTokens } = useTokenAnimation(() => {
    markDirty('tokens');
    if (currentMap?.lightingEnabled) markDirty('overlay');
  });

  // Turn-highlight pulse. Runs only while a combatant is actually acting, and
  // not at all under reduced motion — in which case the ring is still drawn,
  // just held at mid-breath.
  useCanvasTicker(
    currentTurnTokenId !== null && !prefersReducedMotion,
    () => markDirty('tokens')
  );

  // Live map pings. Transient and map-local, so they stay component state
  // rather than going in the game store — nothing outside the canvas reads them.
  const [pings, setPings] = useState<ActivePing[]>([]);

  // Ping animation repaints the overlay layer (where they're drawn) and keeps
  // running under reduced motion: the rings hold still but still need to fade.
  useCanvasTicker(pings.length > 0, () => markDirty('overlay'));

  // Map controls (only initialize if we have a map)
  const mapControls = useMapControls({
    gridSize: currentMap?.gridSize || 50,
    mapWidth: currentMap?.width || 20,
    mapHeight: currentMap?.height || 20,
    minZoom: 0.1, // Allow large maps to fully fit
    maxZoom: 3,
  });

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Safely check if socket is connected and can emit events
   */
  const canEmit = (): boolean => {
    return socket !== null && socket !== undefined && socket.getSocket() !== null;
  };

  /**
   * Point-to-line-segment distance (for door/wall hover hit testing).
   */
  const distToSegment = (px: number, py: number, seg: WallSegment): number => {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - seg.x1, py - seg.y1);
    const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
    return Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy));
  };

  /**
   * Returns the closest point (and parameter t in [0,1]) on a segment to (px, py).
   */
  const closestPointOnSegment = (px: number, py: number, seg: WallSegment): { x: number; y: number; t: number } => {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: seg.x1, y: seg.y1, t: 0 };
    const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
    return { x: seg.x1 + t * dx, y: seg.y1 + t * dy, t };
  };

  /**
   * Check if a point lies on any wall segment (within threshold).
   * Returns the segment and the projected point, or null.
   */
  const findWallAtPoint = (px: number, py: number, threshold: number): { seg: WallSegment; point: { x: number; y: number; t: number } } | null => {
    for (const seg of wallSegments) {
      if (seg.type !== 'wall') continue; // only snap to plain walls
      const d = distToSegment(px, py, seg);
      if (d <= threshold) {
        const cp = closestPointOnSegment(px, py, seg);
        return { seg, point: cp };
      }
    }
    return null;
  };

  /**
   * Replace a section of an existing wall with a door/window segment.
   * Given two points on the same wall, splits the wall into up to 3 pieces:
   *   wallA (original type) | newSeg (door/window) | wallB (original type)
   * If a point is near an endpoint of the wall, that stub is omitted.
   * Returns the new segments to add and the wall IDs to remove, or null if not applicable.
   */
  const buildWallReplace = (
    pt1: { x: number; y: number; t: number },
    pt2: { x: number; y: number; t: number },
    wall: WallSegment,
    newType: WallType,
  ): { remove: string[]; add: WallSegment[] } | null => {
    // Ensure t1 < t2 along the wall
    const [tA, tB] = pt1.t < pt2.t ? [pt1, pt2] : [pt2, pt1];

    const MIN_STUB = 5; // minimum stub length in px to keep (otherwise merge into door endpoint)
    const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);

    const result: WallSegment[] = [];

    // Stub A: from wall start to door start
    const stubALen = tA.t * wallLen;
    if (stubALen >= MIN_STUB) {
      result.push({
        id: crypto.randomUUID(),
        x1: wall.x1, y1: wall.y1,
        x2: Math.round(tA.x), y2: Math.round(tA.y),
        type: wall.type,
      });
    }

    // The door/window segment itself
    result.push({
      id: crypto.randomUUID(),
      x1: Math.round(tA.x), y1: Math.round(tA.y),
      x2: Math.round(tB.x), y2: Math.round(tB.y),
      type: newType,
    });

    // Stub B: from door end to wall end
    const stubBLen = (1 - tB.t) * wallLen;
    if (stubBLen >= MIN_STUB) {
      result.push({
        id: crypto.randomUUID(),
        x1: Math.round(tB.x), y1: Math.round(tB.y),
        x2: wall.x2, y2: wall.y2,
        type: wall.type,
      });
    }

    return { remove: [wall.id], add: result };
  };

  /**
   * Snap a map-pixel coordinate to the nearest grid intersection if snapToGrid is enabled.
   */
  const snapPoint = (mapPx: { x: number; y: number }): { x: number; y: number } => {
    if (currentMap && snapToGrid) {
      const gs = currentMap.gridSize;
      return {
        x: Math.round(mapPx.x / gs) * gs,
        y: Math.round(mapPx.y / gs) * gs,
      };
    }
    if (snapToEndpoint) {
      // Find the nearest existing segment endpoint within the snap radius.
      const r = ENDPOINT_SNAP_RADIUS / mapControls.zoom;
      let bestDist = r;
      let best: { x: number; y: number } | null = null;
      for (const seg of wallSegments) {
        for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
          const d = Math.hypot(pt.x - mapPx.x, pt.y - mapPx.y);
          if (d < bestDist) { bestDist = d; best = pt; }
        }
      }
      if (best) return best;
    }
    return mapPx;
  };

  /**
   * Apply a set of fog cells: optimistic local update plus one server op.
   *
   * A rectangle drag produces exactly one call here, which is why the old
   * pending-cells buffer and its 80ms flush interval are gone — those existed
   * only to batch the continuous stream a brush stroke produced.
   */
  const applyFogCells = useCallback((cells: number[]) => {
    if (!currentMap || !fogMode || cells.length === 0) return;

    const reveal = fogMode === 'fog-reveal';
    const operation = { op: reveal ? 'reveal' : 'hide', cells } as const;

    setFogState((prev) => {
      if (!prev) return prev;
      const revealed = [...prev.revealed];
      for (const idx of cells) {
        if (idx >= 0 && idx < revealed.length) revealed[idx] = reveal;
      }
      return { ...prev, revealed };
    });

    socket?.getSocket()?.emit('fog:operation', { mapId: currentMap.id, operation });
  }, [currentMap, fogMode, socket]);

  /** Finish a fog drag: compute the snapped rectangle once and apply it. */
  const commitFogDrag = useCallback((endX: number, endY: number) => {
    const anchor = fogDragAnchorRef.current;
    fogDragAnchorRef.current = null;
    setFogDragCurrent(null);
    if (!anchor || !fogState) return;

    const rect = fogRectFromDrag(fogState, anchor.x, anchor.y, endX, endY);
    if (!rect) return; // Entirely off the map
    applyFogCells(fogCellsInRect(fogState, rect));
  }, [fogState, applyFogCells]);

  /** Abandon a drag without changing anything (Escape, right-click, map change). */
  const cancelFogDrag = useCallback(() => {
    fogDragAnchorRef.current = null;
    setFogDragCurrent(null);
  }, []);

  // Helper: change a door's type and broadcast. Uses wallSegmentsRef to avoid stale closure
  // (changeDoorType is memoised with [currentMap, socket, replaceWallHistory] deps).
  const changeDoorType = useCallback((door: WallSegment, newType: WallType) => {
    if (!currentMap) return;
    const updated = { ...door, type: newType };
    replaceWallHistory(wallSegmentsRef.current.map(s => s.id === door.id ? updated : s));
    wallCacheValidRef.current = false;
    socket?.getSocket()?.emit('wall:update', { mapId: currentMap.id, segment: updated });
    setDoorContextMenu(null);
  }, [currentMap, socket, replaceWallHistory]);

  // Player's own token on the current map — used as ruler origin for non-DM users
  const myToken = useMemo(() => {
    if (isDM || !tokens || !user) return null;
    return tokens.find((t) => t.controlledBy === user.id) ?? null;
  }, [tokens, user, isDM]);

  // Effective ruler origin: players use their token position, DM uses clicked point
  const effectiveRulerOrigin = isDM ? rulerOrigin : (myToken ? myToken.position : null);

  const handleToggleRuler = useCallback(() => {
    setShowRuler((prev) => {
      if (prev) {
        setRulerOrigin(null);
      } else {
        setShowAoE(false);
        setAoEOrigin(null);
      }
      return !prev;
    });
  }, []);

  /**
   * Play a brief ethereal audio cue when the spirit layer is toggled.
   * Uses Web Audio API to synthesise a ghostly tone — no external file required.
   *
   * entering=true  → rising tone  (crossing into the spirit realm)
   * entering=false → falling tone (returning to the material plane)
   */
  const playEtherealTransition = useCallback((entering: boolean) => {
    try {
      // Create AudioContext lazily so it survives browser autoplay restrictions
      // (the toggle always happens after a user gesture, so the context can start)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Two slightly-detuned triangle oscillators produce a gentle ethereal "beating" wobble
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc1.type = 'triangle';
      osc2.type = 'triangle';

      // Lowpass filter softens the tone so it feels distant / ghostly
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.8;

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(filter);
      filter.connect(ctx.destination);

      const now = ctx.currentTime;
      const lo = 196;  // G3
      const hi = 392;  // G4 (one octave up)

      if (entering) {
        // Crossing into spirit realm — ascending, ethereal
        osc1.frequency.setValueAtTime(lo,      now);
        osc1.frequency.linearRampToValueAtTime(hi, now + 1.2);
        osc2.frequency.setValueAtTime(lo + 1,  now);   // 1 Hz detune → slow wobble
        osc2.frequency.linearRampToValueAtTime(hi + 1, now + 1.2);
      } else {
        // Returning to material plane — descending, fading
        osc1.frequency.setValueAtTime(hi,      now);
        osc1.frequency.linearRampToValueAtTime(lo, now + 1.2);
        osc2.frequency.setValueAtTime(hi + 1,  now);
        osc2.frequency.linearRampToValueAtTime(lo + 1, now + 1.2);
      }

      // Gentle fade-in → sustain → fade-out envelope (kept quiet — ambient, not jarring)
      gain.gain.setValueAtTime(0,    now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.5);
      gain.gain.setValueAtTime(0.07, now + 1.0);
      gain.gain.linearRampToValueAtTime(0,    now + 1.8);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.8);
      osc2.stop(now + 1.8);
    } catch {
      // Audio not available — silently degrade
    }
  }, []);

  // ============================================
  // Canvas Sizing
  // ============================================

  /**
   * Update canvas size to match container
   */
  const updateCanvasSize = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    setCanvasSize({ width: rect.width, height: rect.height });
  }, []);

  /**
   * Handle container/window resize.
   * The container also changes size WITHOUT a window resize when the
   * session layout panels are dragged or collapsed, so observe the
   * element directly; the window listener stays as a fallback.
   */
  useEffect(() => {
    updateCanvasSize();

    const handleResize = () => {
      updateCanvasSize();
    };

    window.addEventListener('resize', handleResize);

    const container = containerRef.current;
    const observer = new ResizeObserver(handleResize);
    if (container) observer.observe(container);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [updateCanvasSize]);

  // ============================================
  // Map Image Loading
  // ============================================

  /**
   * Load map image when currentMap changes
   */
  useEffect(() => {
    if (!currentMap?.imageUrl) {
      setMapImage(null);
      setImageLoaded(false);
      setImageError(null);
      return;
    }

    setImageLoaded(false);
    setImageError(null);

    const img = new Image();
    img.crossOrigin = 'anonymous'; // For CORS support

    img.onload = () => {
      setMapImage(img);
      setImageLoaded(true);
      setImageError(null);
    };

    img.onerror = () => {
      setImageError('Failed to load map image');
      setImageLoaded(false);
      setMapImage(null);
    };

    // Use the imageUrl directly - backend now returns full paths
    img.src = currentMap.imageUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [currentMap?.imageUrl]);

  // ============================================
  // Spirit Layer Image Loading
  // ============================================

  useEffect(() => {
    if (!currentMap?.spiritLayerUrl) {
      setSpiritLayerImage(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => setSpiritLayerImage(img);
    img.onerror = () => setSpiritLayerImage(null);
    img.src = currentMap.spiritLayerUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [currentMap?.spiritLayerUrl]);

  // ============================================
  // Auto-Fit: Center and fit map when a new map image finishes loading
  // ============================================

  useEffect(() => {
    // Only fit when image is ready, canvas is measured, and we haven't already fitted this map
    if (!imageLoaded || canvasSize.width === 0 || canvasSize.height === 0 || !currentMap?.id) return;
    if (lastFittedMapIdRef.current === currentMap.id) return;

    lastFittedMapIdRef.current = currentMap.id;
    mapControls.fitToScreen(canvasSize.width, canvasSize.height);
  }, [imageLoaded, currentMap?.id]);  
  // ^ Intentionally not including canvasSize/mapControls — we only want to fire once
  //   per map load, not on every resize. Users can use the Reset View button to re-fit.

  // ============================================
  // Token Image Loading
  // ============================================

  /**
   * Load token images when tokens change
   */
  useEffect(() => {
    console.log('[MapCanvas] Tokens changed:', tokens.length, 'tokens');

    const loadTokenImages = async () => {
      const newTokenImages = new Map<string, HTMLImageElement>();

      for (const token of tokens) {
        console.log('[MapCanvas] Processing token:', token.name, 'imageUrl:', token.imageUrl);
        if (!token.imageUrl) continue;

        // Check if already loaded
        if (tokenImages.has(token.id)) {
          newTokenImages.set(token.id, tokenImages.get(token.id)!);
          continue;
        }

        // Load new image
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve) => {
          img.onload = () => {
            console.log('[MapCanvas] ✅ Token image loaded:', token.name);
            newTokenImages.set(token.id, img);
            resolve();
          };
          img.onerror = (error) => {
            console.error(`[MapCanvas] ❌ Failed to load token image for ${token.name}:`, error);
            console.error(`[MapCanvas] Image URL was:`, img.src);
            resolve(); // Don't block on errors
          };
          // Use imageUrl directly - backend now returns full paths
          console.log('[MapCanvas] Loading token image from:', token.imageUrl);
          img.src = token.imageUrl;
        });
      }

      setTokenImages(newTokenImages);
    };

    loadTokenImages();
  }, [tokens]);

  // ============================================
  // WebSocket Event Listeners
  // ============================================

  /**
   * Listen for token.moved events from other clients
   */
  useEffect(() => {
    if (!socket) return;

    const handleTokenMoved = (event: TokenMovedEvent) => {
      // Read from the store (not a render closure) so rapid events that arrive
      // in the same macro-task all see the most recently mutated state.
      const store = useGameStore.getState();
      const token = store.tokens[event.tokenId];
      if (!token) return;

      // Start animation from current position to new position
      setAnimatingTokens((prev) => {
        const newMap = new Map(prev);
        newMap.set(event.tokenId, {
          fromX: token.position.x,
          fromY: token.position.y,
          toX: event.x,
          toY: event.y,
          startTime: Date.now(),
          duration: 200,
        });
        return newMap;
      });

      // Store writes are synchronous — subsequent handlers in the same
      // macro-task (e.g. token:appeared for NPCs) see the correct state.
      store.applyTokenMove(event.tokenId, { x: event.x, y: event.y });
    };

    // Listen for token moved events
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.on('token.moved', handleTokenMoved);
    }

    // Cleanup listener on unmount
    return () => {
      if (socketInstance) {
        socketInstance.off('token.moved', handleTokenMoved);
      }
    };
  }, [socket]); // handler reads/writes via the store, no reactive deps needed

  // ============================================
  // Map Change
  // Fade transition when currentMap changes +
  // WebSocket listener for remote map switches
  // ============================================

  // Trigger fade-out → fade-in when the active map changes.
  // Sync the prev-spirit ref so transition detection stays accurate.
  // playerSpiritVisible itself is set by loadCampaign (REST) or handleMapChanged (WS).
  useEffect(() => {
    setIsFading(true);
    prevPlayerSpiritVisibleRef.current = playerSpiritVisible;
    const t = setTimeout(() => setIsFading(false), 300);
    return () => clearTimeout(t);
  }, [currentMap?.id]);  

  // Listen for map.changed events broadcast by the DM
  useEffect(() => {
    if (!socket) return;
    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    const handleMapChanged = ({ mapData, spiritVisible: sv }: { mapId: string; mapData: CampaignMap; spiritVisible?: boolean }) => {
      setCurrentMap(mapData);
      useGameStore.getState().setTokens(mapData.tokens || []);

      // For non-DMs: track whether this player is personally in the spirit realm.
      // Play the ethereal audio cue if they are crossing in or out.
      if (userRole !== 'DM' && sv !== undefined) {
        const prev = prevPlayerSpiritVisibleRef.current;
        if (sv !== prev) {
          prevPlayerSpiritVisibleRef.current = sv;
          setPlayerSpiritVisible(sv);
          // Only play for individual crossings that aren't covered by the global toggle handler
          // (global toggle already plays via handleSpiritLayerToggled)
          if (!(campaign?.spiritLayerEnabled)) {
            playEtherealTransition(sv);
          }
        }
      }
    };

    socketInstance.on('map.changed', handleMapChanged);
    return () => {
      socketInstance.off('map.changed', handleMapChanged);
    };
  }, [socket, setCurrentMap]);

  // ============================================
  // Spirit Layer WebSocket Listeners
  // ============================================

  useEffect(() => {
    if (!socket) return;
    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    const handleSpiritLayerToggled = (data: SpiritLayerToggledBroadcast) => {
      // Play ethereal audio cue — ascending when entering, descending when leaving
      playEtherealTransition(data.visible);
      // Fade spirit layer in/out over 0.5 s then restore
      setSpiritLayerOpacity(0);
      setTimeout(() => {
        updateCampaignSpiritLayer(data.visible);
        setSpiritLayerOpacity(1);
      }, 500);
    };

    const handleSpiritTokenToggled = (data: SpiritLayerTokenToggledBroadcast) => {
      // Update the token's visible flag in the live token store
      useGameStore.getState().patchToken(data.tokenId, { visible: data.visible });
    };

    const handleSpiritStyleChanged = (data: { style: string }) => {
      // Update campaign.spiritLayerStyle for all clients in real time
      updateCampaignSpiritLayer(campaign?.spiritLayerEnabled ?? false, data.style);
    };

    socketInstance.on('spirit_layer.toggled', handleSpiritLayerToggled);
    socketInstance.on('spirit_layer.token.toggled', handleSpiritTokenToggled);
    socketInstance.on('spirit_layer.style_changed', handleSpiritStyleChanged);

    return () => {
      socketInstance.off('spirit_layer.toggled', handleSpiritLayerToggled);
      socketInstance.off('spirit_layer.token.toggled', handleSpiritTokenToggled);
      socketInstance.off('spirit_layer.style_changed', handleSpiritStyleChanged);
    };
  }, [socket, updateCampaignSpiritLayer, campaign?.spiritLayerEnabled, playEtherealTransition]);

  // ============================================
  // Vibe Tracker WebSocket Listener
  // ============================================

  useEffect(() => {
    if (!socket) return;
    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    const handleVibeUpdated = (data: VibeUpdatedBroadcast) => {
      updateVibe(data.period, data.hue, data.filter);
    };

    socketInstance.on('vibe.updated', handleVibeUpdated);
    return () => {
      socketInstance.off('vibe.updated', handleVibeUpdated);
    };
  }, [socket, updateVibe]);

  // ============================================
  // Load Walls & Fog on Map Change
  // ============================================
  useEffect(() => {
    if (!currentMap) {
      replaceWallHistory([]);
      setFogState(null);
      setRevealedCells(null);
      return;
    }

    // Load wall segments and light sources from the map response (included in GET /maps/:id)
    replaceWallHistory((currentMap.wallSegments as WallSegment[] | undefined) ?? []);
    setLightSources((currentMap.lights as LightSource[] | undefined) ?? []);

    // DMs: request full fog state; players: request revealed cells
    const socketInstance = socket?.getSocket();
    if (socketInstance) {
      socketInstance.emit('fog:request_state', { mapId: currentMap.id });
      socketInstance.emit('walls:request', { mapId: currentMap.id });
      socketInstance.emit('lights:request', { mapId: currentMap.id });
    }

    // Invalidate wall cache and offscreen lighting canvas when map changes
    wallCacheValidRef.current = false;
    lightingOffscreenRef.current = null;
    lightCoverageOffscreenRef.current = null;
  }, [currentMap?.id]);  

  // ============================================
  // Wall & Fog WebSocket Listeners
  // ============================================
  useEffect(() => {
    if (!socket) return;
    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    const handleWallAdded = (data: { mapId: string; segment: WallSegment }) => {
      // DM already applied the change optimistically before emitting; skip the echo to
      // avoid reverting local state with stale data from the closed-over wallSegments.
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      replaceWallHistory([...wallSegmentsRef.current, data.segment]);
      wallCacheValidRef.current = false;
    };

    const handleWallRemoved = (data: { mapId: string; segmentId: string }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      replaceWallHistory(wallSegmentsRef.current.filter((s) => s.id !== data.segmentId));
      wallCacheValidRef.current = false;
    };

    const handleWallUpdated = (data: { mapId: string; segment: WallSegment }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      replaceWallHistory(wallSegmentsRef.current.map((s) => s.id === data.segment.id ? data.segment : s));
      wallCacheValidRef.current = false;
    };

    const handleWallsReplaced = (data: { mapId: string; segments: WallSegment[] }) => {
      // DM's local undo/redo stack is already correct; echoing walls:replaced causes
      // a redundant re-render and can race with rapid pushes.
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      // Full canonical list from server — safe to use directly (no stale-closure risk)
      replaceWallHistory(data.segments);
      wallCacheValidRef.current = false;
    };

    const handleFogUpdated = (data: { mapId: string; fogState: FogState }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      // Track newly-revealed cells for fade animation
      setFogState((prev) => {
        if (prev) {
          data.fogState.revealed.forEach((revealed, i) => {
            if (revealed && !prev.revealed[i]) {
              revealOpacityRef.current.set(i, 1.0); // Start fade animation
            }
          });
        }
        return data.fogState;
      });
    };

    const handleFogCells = (data: { mapId: string; revealedCells: number[] }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      setRevealedCells((prev) => {
        const newSet = new Set<number>(data.revealedCells);
        // Animate newly revealed cells
        newSet.forEach((idx) => {
          if (!prev?.has(idx)) revealOpacityRef.current.set(idx, 1.0);
        });
        return newSet;
      });
    };

    const handleDmEditing = (_data: { mapId: string }) => {
      // Could show a transient indicator — handled by toolbar; canvas ignores for now
    };

    // Dynamic lighting: token entered this player's view (or moved while
    // visible). Store writes are synchronous, so if token:appeared fires for
    // multiple tokens in the same macro-task (server re-sync after player
    // move), each call builds on the previous result.
    const handleTokenAppeared = (data: { token: Token; mapId: string }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      useGameStore.getState().revealToken(data.token);
    };

    // Dynamic lighting: token left this player's view
    const handleTokenDisappeared = (data: { tokenId: string; mapId: string }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      useGameStore.getState().removeToken(data.tokenId);
    };

    // Dynamic lighting toggle broadcast from DM
    const handleLightingUpdated = (data: { mapId: string; lightingEnabled: boolean }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      setCurrentMap({ ...currentMap, lightingEnabled: data.lightingEnabled });
    };

    socketInstance.on('token:appeared', handleTokenAppeared);
    socketInstance.on('token:disappeared', handleTokenDisappeared);
    socketInstance.on('map:lighting:updated', handleLightingUpdated);

    // Light source events
    const handleLightAdded = (data: { mapId: string; light: LightSource }) => {
      if (isDM) return; // DM applied optimistically
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources((prev) => [...prev, data.light]);
    };
    const handleLightRemoved = (data: { mapId: string; lightId: string }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources((prev) => prev.filter((l) => l.id !== data.lightId));
    };
    const handleLightUpdated = (data: { mapId: string; light: LightSource }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources((prev) => prev.map((l) => l.id === data.light.id ? data.light : l));
    };
    const handleLightsReplaced = (data: { mapId: string; lights: LightSource[] }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources(data.lights);
    };

    socketInstance.on('wall:added', handleWallAdded);
    socketInstance.on('wall:removed', handleWallRemoved);
    socketInstance.on('wall:updated', handleWallUpdated);
    socketInstance.on('walls:replaced', handleWallsReplaced);
    socketInstance.on('fog:updated', handleFogUpdated);
    socketInstance.on('fog:cells', handleFogCells);
    socketInstance.on('dm:editing', handleDmEditing);
    socketInstance.on('light:added', handleLightAdded);
    socketInstance.on('light:removed', handleLightRemoved);
    socketInstance.on('light:updated', handleLightUpdated);
    socketInstance.on('lights:replaced', handleLightsReplaced);

    return () => {
      socketInstance.off('token:appeared', handleTokenAppeared);
      socketInstance.off('token:disappeared', handleTokenDisappeared);
      socketInstance.off('map:lighting:updated', handleLightingUpdated);
      socketInstance.off('wall:added', handleWallAdded);
      socketInstance.off('wall:removed', handleWallRemoved);
      socketInstance.off('wall:updated', handleWallUpdated);
      socketInstance.off('walls:replaced', handleWallsReplaced);
      socketInstance.off('fog:updated', handleFogUpdated);
      socketInstance.off('fog:cells', handleFogCells);
      socketInstance.off('dm:editing', handleDmEditing);
      socketInstance.off('light:added', handleLightAdded);
      socketInstance.off('light:removed', handleLightRemoved);
      socketInstance.off('light:updated', handleLightUpdated);
      socketInstance.off('lights:replaced', handleLightsReplaced);
    };
  }, [socket, currentMap?.id]);  

  // ============================================
  // Map pings — receive, name, and expire
  // ============================================

  /**
   * Resolve a pinger's display name from state the client already holds — the
   * ping event carries only a user id. The campaign owner gets a DM membership
   * row on creation, so the roster covers everyone; an unresolved id just
   * draws the ping without a label rather than failing.
   */
  const resolvePingerName = useCallback((userId: string): string => {
    if (userId === user?.id) return user?.displayName ?? 'You';
    return campaign?.memberships?.find((m) => m.userId === userId)?.user?.displayName ?? '';
  }, [user?.id, user?.displayName, campaign?.memberships]);

  useEffect(() => {
    const socketInstance = socket?.getSocket();
    if (!socketInstance) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    const handlePinged = (data: MapPingedBroadcast) => {
      // Ignore pings for a map this client isn't looking at.
      if (!currentMap || data.mapId !== currentMap.id) return;

      const id = `${data.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ping: ActivePing = {
        id,
        x: data.x,
        y: data.y,
        name: resolvePingerName(data.userId),
        color: playerColor(data.userId),
        startedAt: Date.now(),
      };

      // Cap the list as a client-side backstop to the server's rate limiter.
      setPings((prev) => [...prev.slice(-19), ping]);
      timers.push(setTimeout(() => {
        setPings((prev) => prev.filter((p) => p.id !== id));
      }, PING_DURATION_MS));
    };

    socketInstance.on('map.pinged', handlePinged);
    return () => {
      socketInstance.off('map.pinged', handlePinged);
      timers.forEach(clearTimeout);
    };
  }, [socket, currentMap?.id, resolvePingerName]);

  // Switching maps drops any pings still in flight on the old one.
  useEffect(() => {
    setPings([]);
  }, [currentMap?.id]);

  // ============================================
  // Keyboard: Escape, Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo)
  // ============================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ── Tab: ping at the cursor ──────────────────────────────────────
      // Tab is the keyboard-navigation key and this listener is on `window`,
      // so it is only safe to claim under strict guards: the pointer must be
      // over the map, and focus must not be on anything the user could be
      // navigating from or typing into. Click around the map and Tab pings;
      // tab to any control and Tab keeps navigating as normal.
      if (e.key === 'Tab' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const at = hoverMapPxRef.current;
        if (!at || !currentMap) return;

        const el = document.activeElement as HTMLElement | null;
        const onFormControl =
          !!el &&
          (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName) ||
            el.isContentEditable);
        if (onFormControl) return;

        e.preventDefault();
        socket?.emitMapPing({ mapId: currentMap.id, x: at.x, y: at.y });
        return;
      }

      if (e.key === 'Escape') {
        // A fog box being dragged is abandoned before any other Escape action
        if (fogDragAnchorRef.current) {
          cancelFogDrag();
          return;
        }
        // Polygon mode: clear in-progress polygon first
        if (polygonPoints.length > 0) {
          setPolygonPoints([]);
          return;
        }
        if (wallInProgress.length > 0) {
          setWallInProgress([]);
        } else if (wallMode) {
          setWallMode(null);
        } else if (lightMode) {
          setLightMode(null);
          setSelectedLightId(null);
        }
        return;
      }

      // Only handle undo/redo for DM with active map
      if (!isDM || !currentMap) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // Polygon mode: Ctrl+Z removes last placed point (not a server undo)
        if (polygonPoints.length > 0) {
          setPolygonPoints((prev) => prev.slice(0, -1));
          return;
        }
        if (wallInProgress.length > 0) {
          // Cancel in-progress wall drawing first
          setWallInProgress([]);
          return;
        }
        const prev = undoWalls();
        if (prev !== null) {
          wallCacheValidRef.current = false;
          const socketInstance = socket?.getSocket();
          if (socketInstance) {
            socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: prev });
          }
        }
      } else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const next = redoWalls();
        if (next !== null) {
          wallCacheValidRef.current = false;
          const socketInstance = socket?.getSocket();
          if (socketInstance) {
            socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: next });
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wallMode, wallInProgress, polygonPoints, isDM, currentMap, undoWalls, redoWalls, socket]);  

  // ============================================
  // Close Polygon — commits all polygon edges as one wall history entry
  // ============================================
  const closePolygon = useCallback(() => {
    if (polygonPoints.length < 3 || !currentMap) {
      setPolygonPoints([]);
      return;
    }
    const newSegs: WallSegment[] = [];
    for (let i = 0; i < polygonPoints.length; i++) {
      const a = polygonPoints[i];
      const b = polygonPoints[(i + 1) % polygonPoints.length];
      newSegs.push({
        id: crypto.randomUUID(),
        x1: a.x, y1: a.y,
        x2: b.x, y2: b.y,
        type: wallType,
      });
    }
    const next = [...wallSegments, ...newSegs];
    pushWallHistory(next);
    wallCacheValidRef.current = false;
    setPolygonPoints([]);
    // Save to server
    const socketInstance = socket?.getSocket();
    if (socketInstance) {
      socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: next });
    }
  }, [polygonPoints, wallSegments, wallType, pushWallHistory, currentMap, socket]);

  // ============================================
  // Clear polygon when leaving polygon mode
  // ============================================
  useEffect(() => {
    if (wallMode !== 'wall-polygon') {
      setPolygonPoints([]);
    }
  }, [wallMode]);

  // Leaving fog mode, or switching maps, drops any drag in progress.
  useEffect(() => {
    cancelFogDrag();
  }, [fogMode, currentMap?.id, cancelFogDrag]);

  // ============================================
  // Canvas Rendering
  // ============================================

  /**
   * Draw the TERRAIN layer (bottom canvas): map image, grid, manual fog,
   * spirit imagery. Static during a token drag. The three layers stack
   * terrain → tokens → overlay, which reproduces the old single-canvas draw
   * order exactly (fog under spirit/tokens, darkness over tokens, overlays
   * on top) — do not change the split without a screenshot comparison.
   */
  const drawTerrain = useCallback(() => {
    const canvas = terrainCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If no map, show empty state
    if (!currentMap || !imageLoaded || !mapImage) {
      ctx.fillStyle = '#8b7d6b'; // stone-gray
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No map loaded', canvas.width / 2, canvas.height / 2);
      return;
    }

    ctx.save();
    ctx.translate(mapControls.panOffset.x, mapControls.panOffset.y);
    ctx.scale(mapControls.zoom, mapControls.zoom);

    const viewport: Viewport = {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    };

    const renderIsDM = userRole === 'DM';
    // isInSpiritRealm is true if the campaign-wide toggle is on OR this
    // specific non-DM player has personally crossed into the spirit realm.
    const spiritActive = campaign?.spiritLayerEnabled ?? false;
    const isInSpiritRealm = spiritActive || (userRole !== 'DM' && playerSpiritVisible);

    // 1. Map image (Material Plane)
    drawMapImage(ctx, {
      mapImage,
      spiritActive,
      isDM: renderIsDM,
      dmViewBothPlanes,
    }, viewport);

    // 2. Grid overlay
    if (showGrid) {
      drawGrid(ctx, { gridColor }, viewport);
    }

    // 3. Manual fog of war (rendered before spirit layer and tokens so they
    //    appear above fog)
    drawFog(ctx, {
      isDM: renderIsDM,
      fogState,
      revealedCells,
      revealOpacity: revealOpacityRef.current,
    }, viewport);

    // 4. Spirit layer image (the Ethereal Plane)
    if (spiritLayerImage) {
      drawSpiritLayer(ctx, {
        spiritLayerImage,
        spiritLayerOpacity,
        spiritActive,
        isInSpiritRealm,
        isDM: renderIsDM,
        dmViewBothPlanes,
      }, viewport);
    }

    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.panOffset, mapControls.zoom, userRole, campaign?.spiritLayerEnabled, playerSpiritVisible, dmViewBothPlanes, showGrid, gridColor, fogState, revealedCells, spiritLayerImage, spiritLayerOpacity]);

  /**
   * Draw the TOKENS layer (middle canvas): every token + the drag ghost.
   * The hot path — repaints each frame of a token drag. No raycasting here.
   */
  const drawTokensLayer = useCallback(() => {
    const canvas = tokenCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!currentMap || !imageLoaded || !mapImage) return;

    ctx.save();
    ctx.translate(mapControls.panOffset.x, mapControls.panOffset.y);
    ctx.scale(mapControls.zoom, mapControls.zoom);

    const viewport: Viewport = {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    };

    const renderIsDM = userRole === 'DM';
    // Ownership predicate — fog exemption
    const isOwnToken = (t: Token): boolean =>
      t.controlledBy === user?.id ||
      !!(t.characterId && campaign?.characters?.find((c) => c.id === t.characterId && c.userId === user?.id));

    // 5. Tokens (+ drag ghost)
    drawTokens(ctx, {
      tokens,
      tokenImages,
      animatingTokens,
      now: Date.now(),
      draggedToken,
      dragOffset,
      hoverCoords,
      hoverTokenId: hoverToken?.id ?? null,
      revealedCells,
      isDM: renderIsDM,
      dmShowSpiritTokens,
      dmViewBothPlanes,
      spiritAccentColor: getSpiritAccentColor(campaign?.spiritLayerStyle),
      characterHpCache,
      isOwnToken,
      currentTurnTokenId,
      // Held at mid-breath under reduced motion, where no pulse loop runs.
      pulsePhase: prefersReducedMotion ? 0.5 : pulsePhaseAt(Date.now()),
      peekTokenId,
    }, viewport);

    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.panOffset, mapControls.zoom, userRole, user?.id, campaign?.characters, campaign?.spiritLayerStyle, tokens, tokenImages, animatingTokens, draggedToken, dragOffset, hoverCoords, hoverToken, revealedCells, dmShowSpiritTokens, dmViewBothPlanes, characterHpCache, currentTurnTokenId, prefersReducedMotion, peekTokenId]);

  /**
   * Draw the OVERLAY layer (top canvas): dynamic-lighting darkness, DM light
   * icons, walls, DM tool previews, ruler/AoE, fog brush cursor. This is also
   * the pointer-input surface. Memoized vision raycasting lives here.
   */
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!currentMap || !imageLoaded || !mapImage) return;

    ctx.save();
    ctx.translate(mapControls.panOffset.x, mapControls.panOffset.y);
    ctx.scale(mapControls.zoom, mapControls.zoom);

    const viewport: Viewport = {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    };

    const renderIsDM = userRole === 'DM';
    // Ownership predicate — lighting vision sources
    const isOwnToken = (t: Token): boolean =>
      t.controlledBy === user?.id ||
      !!(t.characterId && campaign?.characters?.find((c) => c.id === t.characterId && c.userId === user?.id));

    // 6. Dynamic lighting — raycast visibility darkness over tokens.
    //    DM always sees all; "Preview player view" simulates player vision.
    //    The vision polygons also feed the walls layer's door LOS filter.
    const lightingEnabled = currentMap.lightingEnabled ?? false;
    let visPolygons: VisionSource[] = [];
    if (lightingEnabled) {
      const renderAsPlayer = !renderIsDM || dmPreviewPlayerView;
      if (renderAsPlayer) {
        const myTokens = tokens.filter((t) => {
          if (renderIsDM && dmPreviewPlayerView) return true; // DM preview: use all tokens
          return isOwnToken(t);
        });
        const enabledLights = lightSources.filter((l) => l.enabled);
        // Memoized: only sources whose position/radius changed —
        // or all sources when a wall was edited — actually recompute.
        const vision = visionCacheRef.current.compute(myTokens, enabledLights, wallSegments, viewport);
        visPolygons = vision.all;
        drawDynamicLighting(ctx, {
          myTokens,
          enabledLights,
          tokenVision: vision.tokenVision,
          lightVision: vision.lightVision,
          lightingCanvas: lightingOffscreenRef,
          coverageCanvas: lightCoverageOffscreenRef,
        }, viewport);
      }
      // DM (not in preview) sees everything — skip fog entirely
    }

    // 7. DM light source icons (visible in player preview too, so DM can edit)
    if (renderIsDM) {
      drawLightIcons(ctx, {
        lights: lightSources,
        selectedLightId,
        lightMode,
      }, viewport);
    }

    // 8. Wall segments — DM sees all (+ endpoint nodes while a wall tool is
    //    active); players see doors (LOS-filtered under dynamic lighting)
    drawWalls(ctx, {
      wallSegments,
      isDM: renderIsDM,
      wallColor,
      hoveredWallId,
      selectedWallId,
      hoveredDoorId,
      showEndpoints: wallMode !== null,
      dragEndpoint: wallDragEndpointRef.current?.point ?? null,
      selectedEndpoint,
      lightingEnabled,
      visPolygons,
    }, viewport);

    // 9. DM wall-tool overlays
    if (renderIsDM && wallMode === 'wall-draw' && wallInProgress.length > 0) {
      drawWallDrawOverlay(ctx, {
        wallInProgress,
        hoverMapPx: hoverMapPxRef.current,
        hoverCoords,
        wallType,
        snapPoint,
        findWallAtPoint,
      }, viewport);
    }
    if (renderIsDM && wallMode === 'wall-split' && splitHoverPoint) {
      drawSplitPreview(ctx, splitHoverPoint, viewport);
    }
    if (renderIsDM && wallMode === 'wall-erase') {
      drawEraseOverlay(ctx, {
        hoverMapPx: hoverMapPxRef.current,
        eraseRadius: WALL_ERASE_RADIUS,
        erasedIds: wallErasedIdsRef.current,
        wallSegments,
      }, viewport);
    }
    if (renderIsDM && wallMode === 'wall-brush') {
      drawBrushOverlay(ctx, {
        points: wallBrushPointsRef.current,
        brushSize,
        hoverMapPx: hoverMapPxRef.current,
      }, viewport);
    }
    if (renderIsDM && wallMode === 'wall-polygon' && polygonPoints.length > 0) {
      drawPolygonOverlay(ctx, {
        points: polygonPoints,
        hoverMapPx: hoverMapPxRef.current,
        closeRadius: POLYGON_CLOSE_RADIUS,
        snapPoint,
      }, viewport);
    }

    // 10. Measurement overlays
    if (showRuler && effectiveRulerOrigin && hoverCoords) {
      drawRuler(ctx, {
        origin: effectiveRulerOrigin,
        target: hoverCoords,
        color: rulerColor,
        feetPerSquare: currentMap.feetPerSquare ?? 5,
        diagonalRule: (currentMap.diagonalRule ?? 'flat') as 'flat' | 'alternating',
      }, viewport);
    }
    if (showAoE) {
      drawAoEOverlay(ctx, {
        config: aoeConfig,
        origin: aoeOrigin,
        hoverCoords,
        feetPerSquare: currentMap.feetPerSquare ?? 5,
      }, viewport);
    }

    // 11. Fog selection box — world space, so the snapped rectangle stays
    //     locked to the grid through pan and zoom.
    if (fogMode && isDM && fogState) {
      drawFogSelection(ctx, {
        mode: fogMode,
        fog: fogState,
        anchor: fogDragAnchorRef.current,
        cursor: fogDragCurrent,
      }, viewport);
    }

    // 12. Map pings — drawn last in world space, above the lighting darkness
    //     so a ping into an unlit corner is still visible. (The turn ring
    //     makes the opposite trade on purpose: it lives on the token layer
    //     so a hidden token's ring stays hidden.)
    if (pings.length > 0) {
      drawPings(ctx, { pings, now: Date.now(), reducedMotion: prefersReducedMotion }, viewport);
    }

    // Restore context state (back to screen-space)
    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.zoom, mapControls.panOffset, userRole, user?.id, campaign?.characters, tokens, dmPreviewPlayerView, lightSources, selectedLightId, lightMode, wallSegments, wallColor, hoveredWallId, selectedWallId, hoveredDoorId, wallMode, selectedEndpoint, wallInProgress, wallType, snapToGrid, brushSize, splitHoverPoint, polygonPoints, showRuler, rulerColor, effectiveRulerOrigin, showAoE, aoeConfig, aoeOrigin, hoverCoords, fogMode, isDM, fogState, fogDragCurrent, pings, prefersReducedMotion]);

  // ── Layer draw dispatch + dirty-flag scheduling ──────────
  // A single rAF coalesces every repaint request; only the dirty layers
  // redraw, at most once each per frame. Replaces the old
  // `useEffect(() => render())` + ~25 imperative `render()` calls.
  const drawLayer = useCallback((layer: MapLayer) => {
    if (layer === 'terrain') drawTerrain();
    else if (layer === 'tokens') drawTokensLayer();
    else drawOverlay();
  }, [drawTerrain, drawTokensLayer, drawOverlay]);
  drawLayerRef.current = drawLayer;

  // Structural changes (world transform, canvas size, map identity) repaint
  // every layer.
  useEffect(() => {
    markDirty('terrain', 'tokens', 'overlay');
  }, [markDirty, mapControls.zoom, mapControls.panOffset, canvasSize, currentMap, imageLoaded, mapImage]);

  // Terrain-only content.
  useEffect(() => {
    markDirty('terrain');
  }, [markDirty, showGrid, gridColor, fogState, revealedCells, spiritLayerImage, spiritLayerOpacity]);

  // Spirit flags affect the base/spirit images (terrain) and spirit-token
  // alpha (tokens).
  useEffect(() => {
    markDirty('terrain', 'tokens');
  }, [markDirty, campaign?.spiritLayerEnabled, campaign?.spiritLayerStyle, playerSpiritVisible, dmViewBothPlanes]);

  // Token visuals — the hot path. Under dynamic lighting a token move also
  // shifts the viewer's vision, so repaint the overlay (darkness) too.
  useEffect(() => {
    markDirty('tokens');
    if (currentMap?.lightingEnabled) markDirty('overlay');
  }, [markDirty, tokens, tokenImages, animatingTokens, hoverToken, characterHpCache, dmShowSpiritTokens, currentMap?.lightingEnabled, currentTurnTokenId, peekTokenId]);

  // Publish this map's own token hover so the initiative tracker can tint the
  // matching row — the other half of the cross-highlight.
  useEffect(() => {
    useGameStore.getState().setPeekToken(hoverToken?.id ?? null, 'map');
  }, [hoverToken]);

  // Cursor position drives the token drag ghost (tokens) and, only when a
  // cursor-tracking overlay tool is active, its preview (overlay). Gating the
  // overlay keeps it static during a plain token drag — the win of layering.
  useEffect(() => {
    markDirty('tokens');
    if (wallMode || showRuler || showAoE || fogMode) markDirty('overlay');
  }, [markDirty, hoverCoords, draggedToken, dragOffset, wallMode, showRuler, showAoE, fogMode]);

  // Overlay content — walls, lights, DM tools, measurement, pings, fog cursor.
  useEffect(() => {
    markDirty('overlay');
  }, [markDirty, wallSegments, wallMode, wallInProgress, hoveredWallId, selectedWallId, hoveredDoorId, splitHoverPoint, selectedEndpoint, wallType, snapToGrid, brushSize, lightSources, selectedLightId, lightMode, dmPreviewPlayerView, showRuler, rulerOrigin, rulerColor, effectiveRulerOrigin, showAoE, aoeConfig, aoeOrigin, fogMode, fogDragCurrent, fogState, pings]);

  // ============================================
  // Token Hit Testing
  // ============================================

  /**
   * Check if a grid coordinate is within a token's bounds
   */
  const getTokenAtPosition = useCallback(
    (gridX: number, gridY: number): Token | null => {
      if (!currentMap) return null;

      // Check tokens in reverse order (top to bottom in z-order)
      for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (!token.visible) continue;

        const tokenX = token.position.x;
        const tokenY = token.position.y;
        const tokenWidth = token.size.width;
        const tokenHeight = token.size.height;

        // Check if click is within token bounds
        if (
          gridX >= tokenX &&
          gridX < tokenX + tokenWidth &&
          gridY >= tokenY &&
          gridY < tokenY + tokenHeight
        ) {
          return token;
        }
      }

      return null;
    },
    [tokens, currentMap]
  );

  /**
   * Check if user can move a token (DM or owner only)
   */
  const canMoveToken = useCallback(
    (token: Token): boolean => {
      if (!campaign) return false;

      // DM can move any token (even when paused/inactive)
      if (userRole === 'DM') return true;

      // Players cannot move tokens when session is paused or inactive
      if (campaign.status === 'PAUSED' || campaign.status === 'INACTIVE') {
        return false;
      }

      // Player can move tokens they are assigned as controller (NPC tokens with controlledBy)
      if (token.controlledBy && token.controlledBy === user?.id) {
        return true;
      }

      // Player can only move their own character's token
      if (token.characterId) {
        // Find the character associated with this token
        const character = campaign.characters?.find((c) => c.id === token.characterId);
        if (character) {
          // Check if current user owns this character
          return character.userId === user?.id;
        }
      }

      return false;
    },
    [campaign, userRole, user?.id]
  );

  // ============================================
  // Mouse Event Handlers
  // ============================================

  /**
   * Handle mouse down (pick up token, place token, or pan map)
   */
  // Helper: convert screen coords to map-space pixel coords (not grid coords)
  const screenToMapPx = (screenX: number, screenY: number) => {
    return {
      x: (screenX - mapControls.panOffset.x) / mapControls.zoom,
      y: (screenY - mapControls.panOffset.y) / mapControls.zoom,
    };
  };

  // Helper: inverse of screenToMapPx — map-space pixel coords → screen coords
  const mapPxToScreen = (mx: number, my: number) => ({
    x: mx * mapControls.zoom + mapControls.panOffset.x,
    y: my * mapControls.zoom + mapControls.panOffset.y,
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !currentMap) return;

    // Right-button while a tool is active: start panning (left-click is reserved for tools).
    // In normal pan mode, right-click is the context menu — handled by handleContextMenu.
    if (e.button === 2 && (wallMode || fogMode || lightMode) && isDM) {
      cancelFogDrag(); // Panning away mid-drag must not reveal anything
      rightPanActiveRef.current = true;
      mapControls.startDrag(e);
      return;
    }

    if (e.button !== 0) return; // Only left click for everything else

    // Get grid coordinates of click
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = mapControls.screenToGrid({ x: screenX, y: screenY });

    // Wall-draw mode: place a point (or finish polyline on double-click)
    if (wallMode === 'wall-draw' && isDM) {
      const mapPx = screenToMapPx(screenX, screenY);
      const snapped = snapPoint(mapPx);

      if (e.detail >= 2) {
        // Double-click: finish polyline without adding a duplicate final point
        if (wallInProgress.length >= 2) {
          // The last clicked point was already added on the first click of this double-click;
          // just end the polyline
        }
        setWallInProgress([]);
        return;
      }

      if (wallInProgress.length === 0) {
        // For door/window types, snap the starting point to an existing wall if close
        let startPt = snapped;
        if (wallType !== 'wall') {
          const snapThreshold = 14 / mapControls.zoom;
          const wallHit = findWallAtPoint(snapped.x, snapped.y, snapThreshold);
          if (wallHit) {
            startPt = { x: Math.round(wallHit.point.x), y: Math.round(wallHit.point.y) };
          }
        }
        setWallInProgress([startPt]);
        return;
      }

      // Add new segment from last point to this point
      const prevPt = wallInProgress[wallInProgress.length - 1];

      // ── Snap-to-wall replacement for doors/windows ──
      // When drawing a non-wall type, check if both endpoints lie on the same wall.
      // If so, replace that wall section instead of just overlaying.
      const isDoorOrWindow = wallType !== 'wall';
      if (isDoorOrWindow) {
        const snapThreshold = 14 / mapControls.zoom;
        const hitA = findWallAtPoint(prevPt.x, prevPt.y, snapThreshold);
        const hitB = findWallAtPoint(snapped.x, snapped.y, snapThreshold);

        if (hitA && hitB && hitA.seg.id === hitB.seg.id) {
          // Both points land on the same wall — do a replace
          const replace = buildWallReplace(hitA.point, hitB.point, hitA.seg, wallType);
          if (replace) {
            const newSegs = wallSegments.filter((s) => !replace.remove.includes(s.id)).concat(replace.add);
            pushWallHistory(newSegs);
            wallCacheValidRef.current = false;

            const socketInstance = socket?.getSocket();
            if (socketInstance && currentMap) {
              for (const id of replace.remove) {
                socketInstance.emit('wall:remove', { mapId: currentMap.id, segmentId: id });
              }
              for (const seg of replace.add) {
                socketInstance.emit('wall:add', { mapId: currentMap.id, segment: seg });
              }
            }

            // End the polyline after placing a door/window
            setWallInProgress([]);
            return;
          }
        }
      }

      // Default: just add the segment normally
      const newSeg: WallSegment = {
        id: crypto.randomUUID(),
        x1: prevPt.x, y1: prevPt.y,
        x2: snapped.x, y2: snapped.y,
        type: wallType,
      };

      // Optimistic local add (push to undo history)
      pushWallHistory([...wallSegments, newSeg]);
      wallCacheValidRef.current = false;

      // Emit to server
      const socketInstance = socket?.getSocket();
      if (socketInstance && currentMap) {
        socketInstance.emit('wall:add', { mapId: currentMap.id, segment: newSeg });
      }

      setWallInProgress((prev) => [...prev, snapped]);
      return;
    }

    // Wall-polygon mode: place corners; close on click-near-first-point or double-click
    if (wallMode === 'wall-polygon' && isDM) {
      const mapPx = screenToMapPx(screenX, screenY);
      const snapped = snapPoint(mapPx);

      if (e.detail >= 2) {
        // Double-click closes the polygon
        closePolygon();
        return;
      }

      // Check if clicking near the first point (close the polygon)
      if (polygonPoints.length >= 3) {
        const firstPt = polygonPoints[0];
        const firstScreen = mapPxToScreen(firstPt.x, firstPt.y);
        const distToFirst = Math.hypot(e.clientX - firstScreen.x, e.clientY - firstScreen.y);
        if (distToFirst <= POLYGON_CLOSE_RADIUS) {
          closePolygon();
          return;
        }
      }

      setPolygonPoints((prev) => [...prev, snapped]);
      return;
    }

    // Wall-select mode: click near an endpoint to start dragging, or click a wall to select it
    if (wallMode === 'wall-select' && isDM) {
      const mapPx = screenToMapPx(screenX, screenY);
      // Check for endpoint hit first (drag-to-move)
      const epHitRadius = 10 / mapControls.zoom;
      let bestEpDist = epHitRadius;
      let bestEpPoint: { x: number; y: number } | null = null;
      for (const seg of wallSegments) {
        for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
          const d = Math.hypot(pt.x - mapPx.x, pt.y - mapPx.y);
          if (d < bestEpDist) { bestEpDist = d; bestEpPoint = pt; }
        }
      }
      if (bestEpPoint) {
        const targets: Array<{ segId: string; end: 'start' | 'end' }> = [];
        for (const seg of wallSegments) {
          if (Math.round(seg.x1) === Math.round(bestEpPoint.x) && Math.round(seg.y1) === Math.round(bestEpPoint.y)) {
            targets.push({ segId: seg.id, end: 'start' });
          }
          if (Math.round(seg.x2) === Math.round(bestEpPoint.x) && Math.round(seg.y2) === Math.round(bestEpPoint.y)) {
            targets.push({ segId: seg.id, end: 'end' });
          }
        }
        if (targets.length > 0) {
          wallDragEndpointRef.current = { targets, point: { ...bestEpPoint }, preDragState: [...wallSegments], hasDragged: false };
          return;
        }
      }
      // No endpoint hit — fall through to segment selection
      setSelectedEndpoint(null);
      const hitThreshold = 12 / mapControls.zoom;
      const hit = wallSegments.find((s) => distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold);
      setSelectedWallId(hit?.id ?? null);
      return;
    }

    // Wall-split mode: click to split segment at the closest point
    if (wallMode === 'wall-split' && isDM) {
      const mapPx = screenToMapPx(screenX, screenY);
      const hitThreshold = 14 / mapControls.zoom;
      const hit = wallSegments.find((s) => distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold);
      if (hit) {
        const cp = closestPointOnSegment(mapPx.x, mapPx.y, hit);
        // Reject if the split point is too close to an endpoint (less than 10px from either end)
        const dA = Math.hypot(cp.x - hit.x1, cp.y - hit.y1);
        const dB = Math.hypot(cp.x - hit.x2, cp.y - hit.y2);
        if (dA < 10 || dB < 10) return;
        const segA: WallSegment = { id: crypto.randomUUID(), x1: hit.x1, y1: hit.y1, x2: cp.x, y2: cp.y, type: hit.type };
        const segB: WallSegment = { id: crypto.randomUUID(), x1: cp.x, y1: cp.y, x2: hit.x2, y2: hit.y2, type: hit.type };
        const newSegs = wallSegments.filter((s) => s.id !== hit.id).concat(segA, segB);
        pushWallHistory(newSegs);
        wallCacheValidRef.current = false;
        const socketInstance = socket?.getSocket();
        if (socketInstance && currentMap) {
          socketInstance.emit('wall:remove', { mapId: currentMap.id, segmentId: hit.id });
          socketInstance.emit('wall:add', { mapId: currentMap.id, segment: segA });
          socketInstance.emit('wall:add', { mapId: currentMap.id, segment: segB });
        }
      }
      return;
    }

    // Wall-erase mode: start erasing brush
    if (wallMode === 'wall-erase' && isDM) {
      wallEraseBrushActiveRef.current = true;
      wallErasedIdsRef.current = new Set();
      const mapPx = screenToMapPx(screenX, screenY);
      const r = WALL_ERASE_RADIUS / mapControls.zoom;
      wallSegments.forEach((s) => {
        if (distToSegment(mapPx.x, mapPx.y, s) <= r) wallErasedIdsRef.current.add(s.id);
      });
      markDirty('overlay');
      return;
    }

    // Wall-brush mode: start painting
    if (wallMode === 'wall-brush' && isDM) {
      wallBrushActiveRef.current = true;
      const mapPx = screenToMapPx(screenX, screenY);
      const snapped = snapPoint(mapPx);
      wallBrushPointsRef.current = [{ x: snapped.x, y: snapped.y }];
      markDirty('overlay');
      return;
    }

    // Light tool: place or select/drag
    if (lightMode && isDM) {
      const mapPx = screenToMapPx(screenX, screenY);
      if (lightMode === 'light-place') {
        const newLight: LightSource = {
          id: crypto.randomUUID(),
          x: Math.round(mapPx.x),
          y: Math.round(mapPx.y),
          brightRadius: lightPlacementDefaults.brightRadius,
          dimRadius: lightPlacementDefaults.dimRadius,
          color: lightPlacementDefaults.color,
          enabled: true,
        };
        setLightSources((prev) => [...prev, newLight]);
        setSelectedLightId(newLight.id);
        const socketInstance = socket?.getSocket();
        if (socketInstance && currentMap) {
          socketInstance.emit('light:add', { mapId: currentMap.id, light: newLight });
        }
        return;
      }
      if (lightMode === 'light-select') {
        const hitR = 16 / mapControls.zoom;
        let closest: LightSource | null = null;
        let closestDist = Infinity;
        for (const l of lightSources) {
          const dx = mapPx.x - l.x;
          const dy = mapPx.y - l.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= hitR && d < closestDist) { closest = l; closestDist = d; }
        }
        if (closest) {
          setSelectedLightId(closest.id);
          // Start drag-to-move
          draggingLightRef.current = { id: closest.id, startX: mapPx.x, startY: mapPx.y };
        } else {
          setSelectedLightId(null);
        }
        return;
      }
    }

    // Door interaction: click near a door segment to toggle open/closed (all roles)
    if (!wallMode && !fogMode && !lightMode) {
      const mapPx = screenToMapPx(screenX, screenY);
      const hitThreshold = 12 / mapControls.zoom;
      const door = wallSegments.find(
        (s) => (s.type === 'door-closed' || s.type === 'door-open' || s.type === 'door-locked') &&
               distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold
      );
      if (door) {
        if (door.type === 'door-locked') {
          showToast('This door is locked.', 'info');
          return;
        }
        const newType = door.type === 'door-closed' ? 'door-open' : 'door-closed';
        const updated = { ...door, type: newType } as WallSegment;
        replaceWallHistory(wallSegments.map((s) => s.id === door.id ? updated : s));
        wallCacheValidRef.current = false;
        const socketInstance = socket?.getSocket();
        if (socketInstance && currentMap) {
          socketInstance.emit('wall:update', { mapId: currentMap.id, segment: updated });
        }
        return;
      }
    }

    // Fog selection: anchor the box on mousedown
    if (fogMode && isDM && fogState) {
      e.preventDefault(); // Prevent native drag — keeps mousemove firing during the drag
      const mapPx = screenToMapPx(screenX, screenY);
      fogDragAnchorRef.current = mapPx;
      setFogDragCurrent(mapPx);
      return;
    }

    // If ruler is active and user is DM, set ruler origin on click
    if (showRuler && isDM) {
      setRulerOrigin(gridCoords);
      return;
    }

    // AoE tool: click to set/move origin
    if (showAoE) {
      setAoEOrigin(gridCoords);
      return;
    }

    // If we're already holding a token, place it on this click
    if (draggedToken && dragOffset) {
      // Finalize token position (snap to grid)
      const finalX = Math.max(0, Math.min(gridCoords.x - dragOffset.x, currentMap.width - draggedToken.size.width));
      const finalY = Math.max(0, Math.min(gridCoords.y - dragOffset.y, currentMap.height - draggedToken.size.height));

      // Emit token.move.end event
      if (canEmit() && currentMap.id) {
        const event: TokenMoveEndEvent = {
          tokenId: draggedToken.id,
          mapId: currentMap.id,
          x: Math.floor(finalX),
          y: Math.floor(finalY),
        };
        socket!.emitTokenMoveEnd(event);
      } else {
        console.warn('⚠️ Cannot emit token.move.end - socket not connected');
      }

      // Update local token position
      useGameStore.getState().applyTokenMove(draggedToken.id, {
        x: Math.floor(finalX),
        y: Math.floor(finalY),
      });

      // Clear drag state
      setDraggedToken(null);
      setDragOffset(null);
      console.log('✅ Token placed, state cleared');
      return;
    }

    // Check if clicked on a token to pick it up
    const token = getTokenAtPosition(gridCoords.x, gridCoords.y);
    console.log('🔍 Token at click position:', token?.name || 'none');

    if (token && canMoveToken(token)) {
      // Pick up token — disable ruler if it was active
      if (showRuler) {
        setShowRuler(false);
        setRulerOrigin(null);
      }
      console.log('👆 Picking up token:', token.name);
      setDraggedToken(token);
      setDragOffset({
        x: gridCoords.x - token.position.x,
        y: gridCoords.y - token.position.y,
      });

      // Emit token.move.start event
      if (canEmit() && currentMap.id) {
        const event: TokenMoveStartEvent = {
          tokenId: token.id,
          mapId: currentMap.id,
        };
        socket!.emitTokenMoveStart(event);
      } else {
        console.warn('⚠️ Cannot emit token.move.start - socket not connected');
      }
    } else if (!draggedToken) {
      // Only start panning if we're not holding a token
      mapControls.startDrag(e);
    }
  };

  // Throttle token move events to 60fps (~16ms)
  const lastMoveEmitRef = useRef<number>(0);
  const MOVE_THROTTLE_MS = 16;

  /**
   * Handle mouse move (pan + hover coordinates + token drag)
   */
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !currentMap) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = mapControls.screenToGrid({ x: screenX, y: screenY });

    // Track raw map-px position (unquantised) for accurate ghost line in free-draw mode
    hoverMapPxRef.current = screenToMapPx(screenX, screenY);

    // Update hover coordinates
    if (mapControls.isWithinBounds(gridCoords)) {
      setHoverCoords(gridCoords);
    } else {
      setHoverCoords(null);
    }

    // Wall-select mode: drag endpoint or update hover
    if (wallMode === 'wall-select' && isDM) {
      if (rightPanActiveRef.current) { mapControls.handleDrag(e); markDirty('terrain', 'tokens', 'overlay'); return; }
      const mapPx = screenToMapPx(screenX, screenY);
      // Drag endpoint in progress
      if (wallDragEndpointRef.current && (e.buttons & 1)) {
        const snapped = snapPoint(mapPx);
        if (!wallDragEndpointRef.current.hasDragged) {
          const orig = wallDragEndpointRef.current.point;
          if (Math.hypot(snapped.x - orig.x, snapped.y - orig.y) > 2 / mapControls.zoom) {
            wallDragEndpointRef.current.hasDragged = true;
          }
        }
        if (!wallDragEndpointRef.current.hasDragged) { markDirty('overlay'); return; }
        wallDragEndpointRef.current.point = { x: snapped.x, y: snapped.y };
        const { targets, point } = wallDragEndpointRef.current;
        const targetSet = new Map(targets.map((t) => [`${t.segId}:${t.end}`, t]));
        const updated = wallSegments.map((s) => {
          const startKey = `${s.id}:start`;
          const endKey = `${s.id}:end`;
          let seg = s;
          if (targetSet.has(startKey)) seg = { ...seg, x1: Math.round(point.x), y1: Math.round(point.y) };
          if (targetSet.has(endKey)) seg = { ...seg, x2: Math.round(point.x), y2: Math.round(point.y) };
          return seg;
        });
        replaceWallHistory(updated);
        wallCacheValidRef.current = false;
        markDirty('overlay');
        return;
      }
      // Check endpoint proximity for cursor
      const epHitRadius = 10 / mapControls.zoom;
      let isNearEp = false;
      for (const seg of wallSegments) {
        for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
          if (Math.hypot(pt.x - mapPx.x, pt.y - mapPx.y) < epHitRadius) { isNearEp = true; break; }
        }
        if (isNearEp) break;
      }
      setNearEndpoint(isNearEp);
      // Normal hover highlight
      const hitThreshold = 12 / mapControls.zoom;
      const hit = wallSegments.find((s) => distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold);
      setHoveredWallId(hit?.id ?? null);
      markDirty('overlay');
      return;
    }

    // Wall-split mode: update split hover point
    if (wallMode === 'wall-split' && isDM) {
      if (rightPanActiveRef.current) mapControls.handleDrag(e);
      const mapPx = screenToMapPx(screenX, screenY);
      const hitThreshold = 14 / mapControls.zoom;
      const hit = wallSegments.find((s) => distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold);
      if (hit) {
        const cp = closestPointOnSegment(mapPx.x, mapPx.y, hit);
        setSplitHoverPoint({ x: cp.x, y: cp.y, wallId: hit.id });
      } else {
        setSplitHoverPoint(null);
      }
      markDirty('overlay');
      return;
    }

    // Wall-erase mode: continue erasing while left mouse button held; pan on right
    if (wallMode === 'wall-erase' && isDM) {
      if (rightPanActiveRef.current) {
        mapControls.handleDrag(e);
      } else if (wallEraseBrushActiveRef.current) {
        const mapPx = screenToMapPx(screenX, screenY);
        const r = WALL_ERASE_RADIUS / mapControls.zoom;
        wallSegments.forEach((s) => {
          if (distToSegment(mapPx.x, mapPx.y, s) <= r) wallErasedIdsRef.current.add(s.id);
        });
      }
      markDirty('overlay');
      return;
    }

    // Wall-brush mode: continue painting stroke
    if (wallMode === 'wall-brush' && isDM) {
      if (rightPanActiveRef.current) {
        mapControls.handleDrag(e);
      } else if (wallBrushActiveRef.current) {
        const mapPx = screenToMapPx(screenX, screenY);
        const snapped = snapPoint(mapPx);
        const pts = wallBrushPointsRef.current;
        const last = pts[pts.length - 1];
        if (last && Math.hypot(snapped.x - last.x, snapped.y - last.y) >= 3) {
          pts.push({ x: snapped.x, y: snapped.y });
        }
      }
      markDirty('overlay');
      return;
    }

    // Wall-polygon mode: handle right-pan; re-render for ghost line update
    if (wallMode === 'wall-polygon' && isDM) {
      if (rightPanActiveRef.current) mapControls.handleDrag(e);
      markDirty('overlay');
      return;
    }

    // Wall-draw mode: just re-render for ghost line update (cursor moves)
    if (wallMode === 'wall-draw' && isDM) {
      if (rightPanActiveRef.current) mapControls.handleDrag(e);
      markDirty('overlay');
      return;
    }

    // Light mode: handle right-pan and drag-to-move
    if (lightMode && isDM) {
      if (rightPanActiveRef.current) mapControls.handleDrag(e);
      // Drag-to-move: update light position in real time
      if (draggingLightRef.current && (e.buttons & 1)) {
        const mapPx = screenToMapPx(screenX, screenY);
        const dragId = draggingLightRef.current.id;
        setLightSources((prev) => prev.map((l) =>
          l.id === dragId ? { ...l, x: Math.round(mapPx.x), y: Math.round(mapPx.y) } : l
        ));
        markDirty('overlay');
      }
      return;
    }

    // Door hover detection in pan mode (all roles) — changes cursor to pointer
    if (!wallMode && !fogMode && !draggedToken) {
      const mapPx = screenToMapPx(screenX, screenY);
      const hitThreshold = 12 / mapControls.zoom;
      const door = wallSegments.find(
        (s) => (s.type === 'door-closed' || s.type === 'door-open' || s.type === 'door-locked') &&
               distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold
      );
      const newHoveredDoorId = door?.id ?? null;
      if (newHoveredDoorId !== hoveredDoorId) {
        setHoveredDoorId(newHoveredDoorId);
        markDirty('overlay');
      }
    }

    // Fog selection: track the cursor. Also runs with no button held, so the
    // idle single-cell outline follows the mouse before a drag starts.
    if (fogMode && isDM && fogState) {
      setFogDragCurrent(screenToMapPx(screenX, screenY));
      markDirty('overlay');
      return;
    }

    // Handle token dragging
    if (draggedToken && dragOffset) {
      // Calculate new token position (snapped to grid)
      const newX = Math.max(0, Math.min(gridCoords.x - dragOffset.x, currentMap.width - draggedToken.size.width));
      const newY = Math.max(0, Math.min(gridCoords.y - dragOffset.y, currentMap.height - draggedToken.size.height));

      // Throttle move events to 60fps
      const now = Date.now();
      if (canEmit() && currentMap.id && now - lastMoveEmitRef.current >= MOVE_THROTTLE_MS) {
        const event: TokenMoveEvent = {
          tokenId: draggedToken.id,
          mapId: currentMap.id,
          x: Math.floor(newX),
          y: Math.floor(newY),
        };
        socket!.emitTokenMove(event);
        lastMoveEmitRef.current = now;
      }

      // Ghost follows the cursor — tokens layer only.
      markDirty('tokens');
    } else {
      // Handle map panning
      mapControls.handleDrag(e);

      // Update hover token
      const token = getTokenAtPosition(gridCoords.x, gridCoords.y);
      setHoverToken(token);

      // Pan moves the whole scene → repaint every layer.
      if (mapControls.isDragging) {
        markDirty('terrain', 'tokens', 'overlay');
      }
    }
  };

  /**
   * Handle mouse up (stop map panning)
   * Note: Token placement is handled in handleMouseDown on second click
   */
  const handleMouseUp = (e?: React.MouseEvent<HTMLCanvasElement>) => {
    // Release right-button pan
    if (e?.button === 2) {
      rightPanActiveRef.current = false;
      mapControls.stopDrag();
      return;
    }
    // Commit wall endpoint drag or select endpoint for merge
    if (wallDragEndpointRef.current) {
      const { hasDragged, preDragState: preDrag, point } = wallDragEndpointRef.current;
      wallDragEndpointRef.current = null;
      if (hasDragged) {
        const finalSegments = wallSegments;
        if (preDrag) replaceWallHistory(preDrag);
        pushWallHistory(finalSegments);
        wallCacheValidRef.current = false;
        const socketInstance = socket?.getSocket();
        if (socketInstance && currentMap) {
          socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: finalSegments });
        }
        setSelectedEndpoint(null);
      } else {
        if (preDrag) replaceWallHistory(preDrag);
        setSelectedEndpoint({ x: Math.round(point.x), y: Math.round(point.y) });
        setSelectedWallId(null);
      }
    }
    // Commit light drag-to-move
    if (draggingLightRef.current) {
      const dragId = draggingLightRef.current.id;
      draggingLightRef.current = null;
      const movedLight = lightSourcesRef.current.find((l) => l.id === dragId);
      if (movedLight) {
        const socketInstance = socket?.getSocket();
        if (socketInstance && currentMap) {
          socketInstance.emit('light:update', { mapId: currentMap.id, light: movedLight });
        }
      }
    }
    // Commit the fog selection box on mouse release — one operation per drag.
    if (fogMode && fogDragAnchorRef.current) {
      const end = fogDragCurrent ?? fogDragAnchorRef.current;
      commitFogDrag(end.x, end.y);
    }
    // Commit wall erase brush
    if (wallMode === 'wall-erase' && wallEraseBrushActiveRef.current) {
      wallEraseBrushActiveRef.current = false;
      const erased = wallErasedIdsRef.current;
      if (erased.size > 0) {
        const newSegs = wallSegments.filter((s) => !erased.has(s.id));
        pushWallHistory(newSegs);
        wallCacheValidRef.current = false;
        const socketInstance = socket?.getSocket();
        if (socketInstance && currentMap) {
          socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: newSegs });
        }
        wallErasedIdsRef.current = new Set();
        markDirty('overlay');
      }
    }
    // Commit wall brush stroke → simplify to wall segments
    if (wallMode === 'wall-brush' && wallBrushActiveRef.current) {
      wallBrushActiveRef.current = false;
      const rawPoints = wallBrushPointsRef.current;
      wallBrushPointsRef.current = [];

      if (rawPoints.length >= 2 && currentMap) {
        const gridPx = currentMap.gridSize ?? 50;
        const epsilon = gridPx * 0.4;
        let simplified = douglasPeucker(rawPoints, epsilon);
        if (!snapToGrid && mapImage && simplified.length >= 2) {
          simplified = edgeSnapPoints(simplified, mapImage, gridPx * 0.6);
        }
        if (simplified.length >= 2) {
          const newSegs: WallSegment[] = [];
          for (let i = 0; i < simplified.length - 1; i++) {
            const a = simplified[i]!;
            const b = simplified[i + 1]!;
            newSegs.push({
              id: crypto.randomUUID(),
              x1: Math.round(a.x), y1: Math.round(a.y),
              x2: Math.round(b.x), y2: Math.round(b.y),
              type: wallType,
            });
          }
          const next = [...wallSegments, ...newSegs];
          pushWallHistory(next);
          wallCacheValidRef.current = false;
          const socketInstance = socket?.getSocket();
          if (socketInstance) {
            socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: next });
          }
        }
      }
      markDirty('overlay');
    }
    // Stop map panning
    mapControls.stopDrag();
  };

  /**
   * Handle mouse leave (stop pan, clear hover, cancel token drag)
   */
  const handleMouseLeave = () => {
    // Cancel token drag if in progress
    if (draggedToken) {
      setDraggedToken(null);
      setDragOffset(null);
    }

    // Stop map panning
    mapControls.stopDrag();

    // Clear hover state
    setHoverCoords(null);
    setHoverToken(null);
    setHoveredDoorId(null);
    hoverMapPxRef.current = null;
  };

  /**
   * Drag-from-roster: allow drop onto map canvas
   */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  /**
   * Drag-from-roster: receive character token drop and place on map
   */
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!campaign?.id || !currentMap || userRole !== 'DM' || !canvasRef.current) return;

    let dragData: { type?: string; characterId?: string; name?: string; imageUrl?: string; userId?: string };
    try {
      dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }
    if (dragData?.type !== 'character-token' || !dragData.imageUrl) return;

    // Convert screen position to map grid coordinates
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = mapControls.screenToGrid({ x: screenX, y: screenY });

    const position = {
      x: Math.max(0, Math.min(Math.floor(gridCoords.x), currentMap.width - 1)),
      y: Math.max(0, Math.min(Math.floor(gridCoords.y), currentMap.height - 1)),
    };

    // Place on spirit layer if DM is in single-plane spirit view; otherwise material
    const targetLayer = (!dmViewBothPlanes && (campaign?.spiritLayerEnabled ?? false))
      ? TokenLayer.SPIRIT
      : TokenLayer.TOKEN;

    try {
      const result = await api.addToken(campaign.id, currentMap.id, {
        characterId: dragData.characterId ?? null,
        name: dragData.name ?? 'Token',
        imageUrl: dragData.imageUrl,
        position,
        size: { width: 1, height: 1 },
        layer: targetLayer,
        visible: true,
        controlledBy: dragData.userId ?? null,
        // Explicitly mark as player token so TokenRoster categorises it correctly.
        // Without this, the backend defaults to 'npc'.
        type: TokenType.PLAYER,
      });
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(currentMap.id);
    } catch (err) {
      console.error('[MapCanvas] Failed to place token from roster drag:', err);
    }
  };

  /**
   * Handle right-click (context menu)
   * Cancels any picked-up token before showing menu
   */
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current || !currentMap) return;
    // Right-button was used for panning in wall mode — don't open any context menu
    if (wallMode && isDM) return;

    // Always close any open door context menu first
    setDoorContextMenu(null);

    // Cancel any picked-up token (right-click cancels movement)
    if (draggedToken) {
      setDraggedToken(null);
      setDragOffset(null);
    }

    // Get grid + screen coordinates of click
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = mapControls.screenToGrid({ x: screenX, y: screenY });

    // Check tokens first — they sit on a higher visual layer than doors
    const token = getTokenAtPosition(gridCoords.x, gridCoords.y);
    if (token) {
      setContextMenu({ token, x: e.clientX, y: e.clientY });
      return;
    }
    setContextMenu(null);

    // Door hit-test: right-click opens the full door state menu (only in pan mode)
    if (!wallMode && !fogMode) {
      const mapPx = screenToMapPx(screenX, screenY);
      const hitThreshold = 12 / mapControls.zoom;
      const door = wallSegments.find(
        (s) => (s.type === 'door-closed' || s.type === 'door-open' || s.type === 'door-locked') &&
               distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold
      );
      if (door) {
        setDoorContextMenu({ door, x: e.clientX, y: e.clientY });
      }
    }
  };

  /**
   * Handle mouse wheel (zoom)
   */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mapControls.handleWheel(e, rect);
    },
    [mapControls]
  );

  /**
   * Attach wheel event listener
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  /**
   * Close context menu when clicking elsewhere
   */
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setContextMenuMoveToMapOpen(false);
    };
    if (!contextMenu) return;
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Close door context menu on any left-click outside it
  useEffect(() => {
    if (!doorContextMenu) return;
    const handleClick = () => setDoorContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [doorContextMenu]);

  // After context menu renders, adjust position so it doesn't overflow the viewport
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setContextMenuPos(null);
      return;
    }
    const rect = contextMenuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const adjustedX = contextMenu.x + rect.width > vw ? Math.max(0, contextMenu.x - rect.width) : contextMenu.x;
    const adjustedY = contextMenu.y + rect.height > vh ? Math.max(0, contextMenu.y - rect.height) : contextMenu.y;
    setContextMenuPos({ x: adjustedX, y: adjustedY });
  }, [contextMenu]);

  // (Token tween + fog reveal rAF loops live in ./map/useMapAnimations)

  // ============================================
  // Render
  // ============================================

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-parchment"
      style={{ opacity: isFading ? 0 : 1, transition: 'opacity 0.3s ease' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Three stacked canvases. The vibe CSS filter is applied to
          the wrapper so it tints the composite of all three, matching the old
          single-canvas behaviour. The wrapper is also the CSS-transform target
          for pan gestures. Only the top canvas takes input. */}
      <div
        ref={layersRef}
        className="absolute inset-0"
        style={{
          filter: activeVibeEffect?.filter ?? undefined,
          transition: 'filter 3s ease',
        }}
      >
        <canvas
          ref={terrainCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 pointer-events-none"
        />
        <canvas
          ref={tokenCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 pointer-events-none"
        />
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className={`absolute inset-0 ${
            draggedToken ? 'cursor-grabbing' :
            wallMode === 'wall-draw' ? 'cursor-crosshair' :
            wallMode === 'wall-polygon' ? 'cursor-crosshair' :
            wallMode === 'wall-split' ? (splitHoverPoint ? 'cursor-pointer' : 'cursor-crosshair') :
            wallMode === 'wall-erase' ? 'cursor-cell' :
            wallMode === 'wall-brush' ? 'cursor-crosshair' :
            wallMode === 'wall-select' ? (wallDragEndpointRef.current ? 'cursor-grabbing' : nearEndpoint ? 'cursor-grab' : hoveredWallId ? 'cursor-pointer' : 'cursor-default') :
            lightMode === 'light-place' ? 'cursor-crosshair' :
            lightMode === 'light-select' ? (draggingLightRef.current ? 'cursor-grabbing' : 'cursor-pointer') :
            (hoverToken || hoveredDoorId) ? 'cursor-pointer' :
            'cursor-move'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* Vibe hue tint overlay — color tint layered on top of canvas */}
      {activeVibeEffect && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: activeVibeEffect.hue,
            opacity: 0.12,
            mixBlendMode: 'multiply',
            transition: 'background-color 3s ease, opacity 3s ease',
          }}
        />
      )}

      {/* Atmosphere particle overlay */}
      <AtmosphereOverlay effect={activeAtmosphereEffect} />

      {/* Spirit Layer CSS overlay — atmospheric effect of the Ethereal Plane */}
      {currentMap?.spiritLayerUrl && spiritLayerImage && (
        (() => {
          const isDM = userRole === 'DM';
          const spiritActive = campaign?.spiritLayerEnabled ?? false;
          // Non-DM players are in spirit realm if globally enabled OR their personal token is there
          const playerEffectivelyInSpirit = spiritActive || playerSpiritVisible;
          // Show overlay only when spirit realm is actually visible to this viewer
          if (!isDM && !playerEffectivelyInSpirit) return null;
          // DM in single-plane material view: no overlay (they're not perceiving the spirit realm)
          if (isDM && !dmViewBothPlanes && !spiritActive) return null;

          const rawStyle = campaign?.spiritLayerStyle ?? 'wispy';
          let overlayClass = 'spirit-overlay-wispy';
          let inlineStyle: React.CSSProperties = {};

          if (rawStyle === 'ethereal') overlayClass = 'spirit-overlay-ethereal';
          else if (rawStyle === 'shadow') overlayClass = 'spirit-overlay-shadow';
          else if (rawStyle === 'dream') overlayClass = 'spirit-overlay-dream';
          else if (rawStyle.startsWith('custom:')) {
            // Format: "custom:#hexcolor:effectId" (effectId optional, legacy = wispy)
            const rest = rawStyle.slice(7);
            const lastColon = rest.lastIndexOf(':');
            const customColor  = lastColon !== -1 ? rest.slice(0, lastColon) : rest;
            const customEffect = lastColon !== -1 ? rest.slice(lastColon + 1) : 'wispy';
            const validEffects = ['wispy', 'ethereal', 'shadow', 'dream'];
            const effectClass  = validEffects.includes(customEffect) ? customEffect : 'wispy';
            // Apply the chosen effect class for its animations + ::before/::after particles/shimmer.
            // The inline background overrides the named class's base colour with the custom hue.
            overlayClass = `spirit-overlay-${effectClass}`;
            inlineStyle = {
              background: `${customColor}44`, // custom hue at ~27% alpha as base tint
            };
          }

          // When DM views spirit realm that's hidden from most players, reduce overlay intensity
          // Full opacity when fully active (global toggle or personal crossover)
          const overlayOpacity = (!isDM && !spiritActive && playerSpiritVisible)
            ? 1.0   // player's own token is in spirit realm — full immersion
            : (!spiritActive ? 0.4 : 1.0); // DM hint view vs full view

          return (
            <>
              <div
                className={`spirit-layer-overlay ${overlayClass}`}
                style={{
                  opacity: spiritLayerOpacity * overlayOpacity,
                  transition: 'opacity 0.5s ease',
                  ...inlineStyle,
                }}
              />
              {/* DM-only indicator: red dashed border shows spirit realm is hidden from players */}
              {/* Only shown in dual-plane mode where the ghost overlay is visible */}
              {isDM && !spiritActive && dmViewBothPlanes && (
                <div className="spirit-layer-hidden-indicator" title="Spirit realm hidden from players" />
              )}
            </>
          );
        })()
      )}

      {/* Spirit Realm indicator — shown to players when in spirit realm (global or personal) */}
      {userRole !== 'DM' && ((campaign?.spiritLayerEnabled ?? false) || playerSpiritVisible) && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-cozy bg-spirit-purple/20 border border-spirit-purple/40 backdrop-blur-sm animate-pulse-soft">
          <Ghost className="w-3.5 h-3.5 text-spirit-purple" />
          <span className="text-xs font-semibold text-spirit-purple">Spirit Realm</span>
        </div>
      )}

      {/* Toolbar - Glassmorphism */}
      <div className="absolute top-4 left-4 glass-panel p-2 flex items-center gap-2 bg-parchment/90 backdrop-blur-sm">
        {/* Zoom Out */}
        <Button
          onClick={mapControls.zoomOut}
          disabled={mapControls.zoom <= mapControls.minZoom}
          variant="secondary" className="p-2"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>

        {/* Zoom Level Display */}
        <span className="text-xs text-stone-gray font-mono min-w-[4rem] text-center">
          {Math.round(mapControls.zoom * 100)}%
        </span>

        {/* Zoom In */}
        <Button
          onClick={mapControls.zoomIn}
          disabled={mapControls.zoom >= mapControls.maxZoom}
          variant="secondary" className="p-2"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>

        {/* Divider */}
        <div className="w-px h-6 bg-moss-green/20" />

        {/* Reset View — fit and center the map in the canvas */}
        <Button
          onClick={() => mapControls.fitToScreen(canvasSize.width, canvasSize.height)}
          variant="secondary" className="p-2"
          title="Fit to Screen"
        >
          <Maximize2 className="w-4 h-4" />
        </Button>

        {/* Toggle Grid */}
        <Button
          onClick={() => setShowGrid((prev) => !prev)}
          variant="secondary" className={`p-2 ${showGrid ? 'bg-moss-green/20' : ''}`}
          title="Toggle Grid"
        >
          <Grid3x3 className="w-4 h-4" />
        </Button>

        {/* Grid Color Toggle (only show if grid is enabled) */}
        {showGrid && (
          <Button
            onClick={() => setGridColor((prev) => (prev === 'black' ? 'white' : 'black'))}
            variant="secondary" className="p-2"
            title={`Grid Color: ${gridColor === 'black' ? 'Black' : 'White'}`}
          >
            <Palette className="w-4 h-4" />
          </Button>
        )}

        {/* Toggle Ruler */}
        {currentMap && (
          <>
            <div className="w-px h-6 bg-moss-green/20" />
            <Button
              onClick={handleToggleRuler}
              variant="secondary" className={`p-2 ${showRuler ? 'bg-moss-green/20' : ''}`}
              title="Ruler — measure distance"
            >
              <Ruler className={`w-4 h-4 ${showRuler ? 'text-brand-ink' : ''}`} />
            </Button>
            {showRuler && (
              <Button
                onClick={() => setRulerColor((prev) => prev === 'amber' ? 'purple' : prev === 'purple' ? 'black' : 'amber')}
                variant="secondary" className="p-2"
                title={`Ruler color: ${rulerColor === 'amber' ? 'Amber' : rulerColor === 'purple' ? 'Purple' : 'Black'}`}
              >
                <Palette className={`w-4 h-4 ${rulerColor === 'purple' ? 'text-spirit-purple' : rulerColor === 'black' ? 'text-stone-gray' : 'text-warm-amber'}`} />
              </Button>
            )}

            {/* Toggle AoE tool */}
            <Button
              onClick={() => {
              setShowAoE((prev) => {
              if (!prev) {
              setShowRuler(false);
              setRulerOrigin(null);
              } else {
              setAoEOrigin(null);
              }
              return !prev;
              });
              }}
              variant="secondary" className={`p-2 ${showAoE ? 'bg-moss-green/20' : ''}`}
              title="AoE Shape — area of effect overlay"
            >
              <Zap className={`w-4 h-4 ${showAoE ? 'text-brand-ink' : ''}`} />
            </Button>
          </>
        )}

        {/* DM-only: toggle spirit layer token visibility */}
        {userRole === 'DM' && (
          <>
            <div className="w-px h-6 bg-moss-green/20" />
            <Button
              onClick={() => setDmShowSpiritTokens((prev) => !prev)}
              variant="secondary" className={`p-2 ${dmShowSpiritTokens ? 'bg-spirit-purple/15' : ''}`}
              title={dmShowSpiritTokens ? 'Hiding spirit tokens (click to show)' : 'Spirit tokens hidden — click to show'}
            >
              <Ghost className={`w-4 h-4 ${dmShowSpiritTokens ? 'text-spirit-purple' : 'text-stone-gray/40'}`} />
            </Button>
          </>
        )}
      </div>

      {/* DM Tool Panels — draggable container with stacked panels */}
      {userRole === 'DM' && currentMap && (
        <DmToolPanelContainer containerRef={containerRef}>
          <DmFogControls
            fogMode={fogMode}
            onFogModeChange={(mode) => {
              setFogMode(mode);
              // Deactivate wall/light tools when switching to fog tool
              if (mode) {
                setWallMode(null);
                setLightMode(null);
                setSelectedLightId(null);
                setSelectedWallId(null);
              }
            }}
            onRevealAll={() => {
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('fog:operation', { mapId: currentMap.id, operation: { op: 'reveal_all' } });
              }
              setFogState((prev) => prev ? { ...prev, revealed: new Array(prev.revealed.length).fill(true) } : prev);
            }}
            onHideAll={() => {
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('fog:operation', { mapId: currentMap.id, operation: { op: 'hide_all' } });
              }
              setFogState((prev) => prev ? { ...prev, revealed: new Array(prev.revealed.length).fill(false) } : prev);
            }}
          />
          <DmWallControls
            wallMode={wallMode}
            onWallModeChange={(mode) => {
              setWallMode(mode);
              if (mode !== 'wall-select') { setSelectedWallId(null); setSelectedEndpoint(null); wallDragEndpointRef.current = null; setNearEndpoint(false); }
              if (mode !== 'wall-split') setSplitHoverPoint(null);
              if (mode !== 'wall-erase') { wallEraseBrushActiveRef.current = false; wallErasedIdsRef.current = new Set(); }
              if (mode !== 'wall-brush') { wallBrushActiveRef.current = false; wallBrushPointsRef.current = []; }
              if (mode !== 'wall-polygon') setPolygonPoints([]);
              // Deactivate fog/light tools when switching to wall tool
              if (mode) { setFogMode(null); setLightMode(null); setSelectedLightId(null); }
            }}
            onCollapse={() => {
              setWallMode(null);
              setSelectedWallId(null);
              setSelectedEndpoint(null);
              wallDragEndpointRef.current = null;
              setNearEndpoint(false);
              setSplitHoverPoint(null);
              wallEraseBrushActiveRef.current = false;
              wallErasedIdsRef.current = new Set();
              wallBrushActiveRef.current = false;
              wallBrushPointsRef.current = [];
              setWallInProgress([]);
              setPolygonPoints([]);
            }}
            wallType={wallType}
            onWallTypeChange={setWallType}
            snapToGrid={snapToGrid}
            onSnapToGridChange={(v) => { setSnapToGrid(v); if (v) setSnapToEndpoint(false); }}
            snapToEndpoint={snapToEndpoint}
            onSnapToEndpointChange={setSnapToEndpoint}
            wallCount={wallSegments.length}
            onClearAll={() => {
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: [] });
              }
              pushWallHistory([]);
            }}
            canUndo={canUndoWalls}
            canRedo={canRedoWalls}
            onUndo={() => {
              const prev = undoWalls();
              if (prev !== null) {
                wallCacheValidRef.current = false;
                const socketInstance = socket?.getSocket();
                if (socketInstance && currentMap) {
                  socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: prev });
                }
              }
            }}
            onRedo={() => {
              const next = redoWalls();
              if (next !== null) {
                wallCacheValidRef.current = false;
                const socketInstance = socket?.getSocket();
                if (socketInstance && currentMap) {
                  socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: next });
                }
              }
            }}
            wallColor={wallColor}
            onWallColorChange={setWallColor}
            selectedSegmentType={selectedWallId ? wallSegments.find((s) => s.id === selectedWallId)?.type ?? null : null}
            onSelectedTypeChange={(newType) => {
              if (!selectedWallId || !currentMap) return;
              const updated = wallSegments.map((s) => s.id === selectedWallId ? { ...s, type: newType } : s);
              pushWallHistory(updated);
              wallCacheValidRef.current = false;
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                const seg = updated.find((s) => s.id === selectedWallId);
                if (seg) socketInstance.emit('wall:update', { mapId: currentMap.id, segment: seg });
              }
            }}
            onDeleteSelected={() => {
              if (!selectedWallId || !currentMap) return;
              const newSegs = wallSegments.filter((s) => s.id !== selectedWallId);
              pushWallHistory(newSegs);
              wallCacheValidRef.current = false;
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                socketInstance.emit('wall:remove', { mapId: currentMap.id, segmentId: selectedWallId });
              }
              setSelectedWallId(null);
            }}
            selectedEndpoint={wallMode === 'wall-select' && selectedEndpoint ? (() => {
              const ep = selectedEndpoint;
              let count = 0;
              let type: WallType | null = null;
              let sameType = true;
              for (const seg of wallSegments) {
                const atStart = Math.round(seg.x1) === ep.x && Math.round(seg.y1) === ep.y;
                const atEnd = Math.round(seg.x2) === ep.x && Math.round(seg.y2) === ep.y;
                if (atStart || atEnd) {
                  count++;
                  if (type === null) type = seg.type;
                  else if (seg.type !== type) sameType = false;
                }
              }
              return count === 2 && sameType ? ep : null;
            })() : null}
            onMergeEndpoint={() => {
              if (!selectedEndpoint || !currentMap) return;
              const ep = selectedEndpoint;
              const touching: Array<{ seg: WallSegment; end: 'start' | 'end' }> = [];
              for (const seg of wallSegments) {
                if (Math.round(seg.x1) === ep.x && Math.round(seg.y1) === ep.y) touching.push({ seg, end: 'start' });
                if (Math.round(seg.x2) === ep.x && Math.round(seg.y2) === ep.y) touching.push({ seg, end: 'end' });
              }
              if (touching.length !== 2) return;
              const [a, b] = touching;
              if (a!.seg.type !== b!.seg.type) return;
              const keepA = a!.end === 'start' ? { x: a!.seg.x2, y: a!.seg.y2 } : { x: a!.seg.x1, y: a!.seg.y1 };
              const keepB = b!.end === 'start' ? { x: b!.seg.x2, y: b!.seg.y2 } : { x: b!.seg.x1, y: b!.seg.y1 };
              const merged: WallSegment = {
                id: crypto.randomUUID(),
                x1: Math.round(keepA.x), y1: Math.round(keepA.y),
                x2: Math.round(keepB.x), y2: Math.round(keepB.y),
                type: a!.seg.type,
              };
              const removeIds = new Set([a!.seg.id, b!.seg.id]);
              const newSegs = wallSegments.filter((s) => !removeIds.has(s.id)).concat(merged);
              pushWallHistory(newSegs);
              wallCacheValidRef.current = false;
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: newSegs });
              }
              setSelectedEndpoint(null);
            }}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
          />
          <DmLightControls
            lightMode={lightMode}
            onLightModeChange={(mode) => {
              setLightMode(mode);
              if (mode !== 'light-select') setSelectedLightId(null);
              // Deactivate wall/fog tools when switching to light tool
              if (mode) { setWallMode(null); setFogMode(null); }
            }}
            onCollapse={() => {
              setLightMode(null);
              setSelectedLightId(null);
            }}
            lightCount={lightSources.length}
            onClearAll={() => {
              setLightSources([]);
              setSelectedLightId(null);
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('lights:replace', { mapId: currentMap.id, lights: [] });
              }
            }}
            selectedLight={selectedLightId ? lightSources.find((l) => l.id === selectedLightId) ?? null : null}
            onSelectedLightChange={(updated) => {
              setLightSources((prev) => prev.map((l) => l.id === updated.id ? updated : l));
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('light:update', { mapId: currentMap.id, light: updated });
              }
            }}
            onDeleteSelected={() => {
              if (!selectedLightId || !currentMap) return;
              setLightSources((prev) => prev.filter((l) => l.id !== selectedLightId));
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                socketInstance.emit('light:remove', { mapId: currentMap.id, lightId: selectedLightId });
              }
              setSelectedLightId(null);
            }}
            lightingEnabled={currentMap.lightingEnabled ?? false}
            placementDefaults={lightPlacementDefaults}
            onDefaultsChange={setLightPlacementDefaults}
          />
        </DmToolPanelContainer>
      )}

      {/* DM Preview Player View — shown when dynamic lighting is enabled */}
      {userRole === 'DM' && currentMap?.lightingEnabled && (
        <div className="absolute bottom-20 right-2 z-30">
          <button
            onClick={() => setDmPreviewPlayerView((prev) => !prev)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              dmPreviewPlayerView
                ? 'bg-info/30 text-info-ink border-info/50'
                // ink/paper invert together, so this stays a legible contrast
                // chip over the map on both light and dark themes
                : 'bg-ink/85 text-paper border-ink/40 hover:bg-ink'
            }`}
            title={dmPreviewPlayerView ? 'Back to DM view (see all)' : 'Preview how players see this map with dynamic lighting'}
            aria-label="Toggle DM player view preview"
          >
            {dmPreviewPlayerView ? '👁 DM View' : '🎭 Preview Player View'}
          </button>
        </div>
      )}

      {/* Ruler hint for players with no token */}
      {showRuler && !isDM && !myToken && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/60 text-warm-amber text-xs px-3 py-1.5 rounded-full pointer-events-none">
          Place your character token on the map to use the ruler
        </div>
      )}

      {/* AoE panel */}
      {showAoE && currentMap && (
        <div className="absolute top-12 left-2 z-10 p-3 space-y-3 w-52 shadow-xl rounded-xl border border-moss-green/30 bg-parchment/95 backdrop-blur-sm">
          <p className="text-xs font-semibold text-brand-ink">AoE Shape</p>

          {/* Shape selector */}
          <div className="flex flex-wrap gap-1.5">
            {(['sphere', 'cone', 'line', 'cube'] as AoEShape[]).map((shape) => (
              <button
                key={shape}
                onClick={() => setAoEConfig((prev) => ({ ...prev, shape }))}
                className={`text-xs px-2 py-1 rounded border transition-colors capitalize ${
                  aoeConfig.shape === shape
                    ? 'bg-moss-green/20 border-moss-green/60 text-brand-ink font-medium'
                    : 'border-stone-gray/30 text-stone-gray hover:border-moss-green/40 hover:text-brand-ink'
                }`}
              >
                {shape === 'sphere' ? 'Circle' : shape.charAt(0).toUpperCase() + shape.slice(1)}
              </button>
            ))}
          </div>

          {/* Size input */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-gray">
              {aoeConfig.shape === 'sphere' ? 'Radius' : 'Length'} (ft)
            </label>
            <input
              type="number"
              min={5}
              max={500}
              step={5}
              value={aoeConfig.sizeFt}
              onChange={(e) => setAoEConfig((prev) => ({ ...prev, sizeFt: Math.max(5, parseInt(e.target.value) || 5) }))}
              className="w-full input-cozy text-sm py-1"
            />
          </div>

          {/* Width input (line only) */}
          {aoeConfig.shape === 'line' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-gray">Width (ft)</label>
              <input
                type="number"
                min={5}
                max={100}
                step={5}
                value={aoeConfig.widthFt ?? 5}
                onChange={(e) => setAoEConfig((prev) => ({ ...prev, widthFt: Math.max(5, parseInt(e.target.value) || 5) }))}
                className="w-full input-cozy text-sm py-1"
              />
            </div>
          )}

          {/* Quick-size presets */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-stone-gray">Presets</p>
            <div className="flex flex-wrap gap-1">
              {[10, 15, 20, 30, 60].map((ft) => (
                <button
                  key={ft}
                  onClick={() => setAoEConfig((prev) => ({ ...prev, sizeFt: ft }))}
                  className="text-xs px-1.5 py-0.5 rounded bg-moss-green/10 hover:bg-moss-green/20 text-brand-ink border border-moss-green/20 transition-colors"
                >
                  {ft} ft
                </button>
              ))}
            </div>
          </div>

          {/* Clear origin */}
          {aoeOrigin && (
            <button
              onClick={() => setAoEOrigin(null)}
              className="text-xs text-stone-gray hover:text-danger-ink transition-colors"
            >
              × Clear placement
            </button>
          )}

          <p className="text-xs text-stone-gray/70">
            {aoeOrigin ? 'Click map to reposition' : 'Click map to place shape'}
          </p>
        </div>
      )}

      {/* Hover Coordinates */}
      {hoverCoords && !hoverToken && (
        <div className="absolute bottom-4 left-4 glass-panel px-3 py-1.5 bg-parchment/90 backdrop-blur-sm">
          <span className="text-xs text-stone-gray font-mono font-semibold">
            ({hoverCoords.x}, {hoverCoords.y})
          </span>
        </div>
      )}

      {/* Hover Token Name */}
      {hoverToken && hoverCoords && (
        <div className="absolute bottom-4 left-4 glass-panel px-3 py-1.5 bg-parchment/90 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-ink font-semibold">
              {hoverToken.name}
            </span>
            <span className="text-xs text-stone-gray font-mono">
              ({hoverCoords.x}, {hoverCoords.y})
            </span>
          </div>
          {!canMoveToken(hoverToken) && (
            <span className="text-[10px] text-warm-gray">
              (Locked)
            </span>
          )}
        </div>
      )}

      {/* Image Loading State */}
      {currentMap && !imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-moss-green/30 border-t-moss-green rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-stone-gray">Loading map...</p>
          </div>
        </div>
      )}

      {/* Image Error State */}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80">
          <div className="glass-panel p-4 text-center">
            <p className="text-sm text-danger-ink mb-2">{imageError}</p>
            <p className="text-xs text-stone-gray">Check map image URL</p>
          </div>
        </div>
      )}

      {/* No Map State */}
      {!currentMap && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Grid3x3 className="w-12 h-12 text-brand-ink/30 mx-auto mb-3" />
            <p className="text-sm text-warm-gray mb-2">No map loaded</p>
            <p className="text-xs text-stone-gray/70">
              Upload a map to get started
            </p>
          </div>
        </div>
      )}

      {/* Token Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 glass-panel bg-parchment/95 backdrop-blur-sm border border-moss-green/20 shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${contextMenuPos ? contextMenuPos.x : contextMenu.x}px`,
            top: `${contextMenuPos ? contextMenuPos.y : contextMenu.y}px`,
            visibility: contextMenuPos ? 'visible' : 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.token.characterId && (
            <>
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={async () => {
                  const characterId = contextMenu.token.characterId!;
                  setContextMenu(null);
                  try {
                    const { character } = await api.getCharacter(characterId);
                    setViewingCharacter(character);
                  } catch (err) {
                    console.error('Failed to load character sheet:', err);
                  }
                }}
              >
                View Character Sheet
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={() => {
                  const { characterId, x, y } = { characterId: contextMenu.token.characterId!, x: contextMenu.x, y: contextMenu.y };
                  setContextMenu(null);
                  setRollPicker({ characterId, x, y });
                }}
              >
                Roll...
              </button>
            </>
          )}

          {userRole === 'DM' && (() => {
            const cmToken = contextMenu.token;
            const cmType = cmToken.type ?? (cmToken.characterId ? TokenType.PLAYER : TokenType.NPC);
            const isObject = cmType === TokenType.OBJECT;
            const isNpcOrObject = cmType === TokenType.NPC || cmType === TokenType.OBJECT;
            return (
            <>
              {/* Roll... — NPC tokens only (player tokens have their own Roll above) */}
              {cmType === TokenType.NPC && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={() => {
                    const tokenId = cmToken.id;
                    const x = contextMenu.x;
                    const y = contextMenu.y;
                    setContextMenu(null);
                    setNpcRollPicker({ tokenId, x, y });
                  }}
                >
                  Roll...
                </button>
              )}

              {/* Edit Token — NPC and Object tokens */}
              {isNpcOrObject && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-brand-ink font-medium hover:bg-moss-green/10 transition-colors"
                  onClick={() => {
                    setContextMenu(null);
                    onEditToken?.(cmToken);
                  }}
                >
                  Edit Token
                </button>
              )}

              {/* Add to Initiative — DM only */}
              {currentMap && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-warm-amber hover:bg-warm-amber/10 transition-colors"
                  onClick={() => {
                    const token = contextMenu.token;
                    setContextMenu(null);
                    socket?.emitInitiativeAdd({ tokenId: token.id, mapId: currentMap.id });
                  }}
                >
                  Add to Initiative
                </button>
              )}

              {/* Duplicate Token — all types, DM only */}
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={async () => {
                  if (!campaign?.id || !currentMap?.id) return;
                  const token = contextMenu.token;
                  setContextMenu(null);
                  try {
                    // Place copy 1 cell offset, clamped to map bounds
                    const newX = Math.min(token.position.x + 1, currentMap.width - token.size.width);
                    const newY = Math.min(token.position.y + 1, currentMap.height - token.size.height);
                    // Reset HP to full for the copy
                    const freshHp = token.hp ? { current: token.hp.max, max: token.hp.max, temp: 0 } : null;
                    const result = await api.addToken(campaign.id, currentMap.id, {
                      name: token.name,
                      imageUrl: token.imageUrl,
                      position: { x: newX, y: newY },
                      size: token.size,
                      layer: token.layer,
                      visible: token.visible,
                      controlledBy: token.controlledBy,
                      type: token.type,
                      disposition: token.disposition,
                      hp: freshHp,
                      showHpBar: token.showHpBar,
                      notes: token.notes,
                      initiative: token.initiative,
                      conditions: [],
                    });
                    useGameStore.getState().addToken(result.token);
                    socket?.emitMapChange(currentMap.id);
                  } catch (err) {
                    console.error('Failed to duplicate token:', err);
                  }
                }}
              >
                Duplicate Token
              </button>

              {/* Save as Template — DM only */}
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={async () => {
                  if (!campaign?.id) return;
                  const token = contextMenu.token;
                  setContextMenu(null);
                  try {
                    await api.saveTokenAsTemplate(campaign.id, {
                      name: token.name,
                      imageUrl: token.imageUrl || null,
                      type: token.type,
                      disposition: token.disposition,
                      displayMode: token.displayMode || 'pog',
                      size: token.size,
                      notes: token.notes || null,
                      hp: token.hp || null,
                      showHpBar: token.showHpBar,
                      statBlock: token.statBlock || null,
                      sightRadius: token.sightRadius ?? null,
                    });
                  } catch (err) {
                    console.error('Failed to save token as template:', err);
                  }
                }}
              >
                Save as Template
              </button>

              {/* Visibility toggle — Object tokens: Reveal/Hide */}
              {isObject && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={async () => {
                    if (!campaign?.id || !currentMap?.id) return;
                    const token = contextMenu.token;
                    setContextMenu(null);
                    try {
                      await api.updateToken(campaign.id, currentMap.id, token.id, { visible: !token.visible });
                      useGameStore.getState().patchToken(token.id, { visible: !token.visible });
                      socket?.emitMapChange(currentMap.id);
                    } catch (err) {
                      console.error('Failed to toggle object visibility:', err);
                    }
                  }}
                >
                  {cmToken.visible ? 'Hide from Players' : 'Reveal to Players'}
                </button>
              )}

              {/* Spirit Realm toggle — Player and NPC tokens only (not Objects) */}
              {!isObject && (
                contextMenu.token.layer === TokenLayer.TOKEN ? (
                  <button
                    disabled={isMovingTokenLayer}
                    className="w-full px-4 py-2 text-left text-sm text-spirit-purple hover:bg-spirit-purple/10 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      if (!campaign?.id || !currentMap?.id) return;
                      setIsMovingTokenLayer(true);
                      const token = contextMenu.token;
                      setContextMenu(null);
                      try {
                        await api.updateToken(campaign.id, currentMap.id, token.id, { layer: TokenLayer.SPIRIT });
                        useGameStore.getState().patchToken(token.id, { layer: TokenLayer.SPIRIT });
                        socket?.emitMapChange(currentMap.id);
                      } catch (err) {
                        console.error('Failed to move token to spirit realm:', err);
                      } finally {
                        setIsMovingTokenLayer(false);
                      }
                    }}
                  >
                    {isMovingTokenLayer ? 'Moving…' : 'Send to Spirit Realm'}
                  </button>
                ) : (
                  <button
                    disabled={isMovingTokenLayer}
                    className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      if (!campaign?.id || !currentMap?.id) return;
                      setIsMovingTokenLayer(true);
                      const token = contextMenu.token;
                      setContextMenu(null);
                      try {
                        await api.updateToken(campaign.id, currentMap.id, token.id, { layer: TokenLayer.TOKEN });
                        useGameStore.getState().patchToken(token.id, { layer: TokenLayer.TOKEN });
                        socket?.emitMapChange(currentMap.id);
                      } catch (err) {
                        console.error('Failed to return token to material plane:', err);
                      } finally {
                        setIsMovingTokenLayer(false);
                      }
                    }}
                  >
                    {isMovingTokenLayer ? 'Moving…' : 'Return to Material Plane'}
                  </button>
                )
              )}

              <div className="h-px bg-moss-green/20 my-1" />

              {/* Move to another map */}
              {(campaign?.maps ?? []).filter((m) => m.id !== currentMap?.id).length > 0 && (
                <div>
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-warm-amber hover:bg-warm-amber/10 transition-colors flex items-center justify-between"
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextMenuMoveToMapOpen(!contextMenuMoveToMapOpen);
                    }}
                  >
                    <span>Move to Map…</span>
                    <span className="text-xs opacity-60">▶</span>
                  </button>
                  {contextMenuMoveToMapOpen && (
                    <div className="bg-parchment/80 border-t border-moss-green/10 px-2 py-1 space-y-0.5">
                      {isMoveToMapLoading ? (
                        <p className="text-xs text-stone-gray px-2 py-1">Moving…</p>
                      ) : (
                        (campaign?.maps ?? [])
                          .filter((m) => m.id !== currentMap?.id)
                          .map((targetMap) => (
                            <button
                              key={targetMap.id}
                              className="w-full px-2 py-1.5 text-left text-xs text-charcoal hover:bg-moss-green/10 rounded transition-colors"
                              onClick={async () => {
                                if (!campaign?.id || !currentMap?.id) return;
                                const token = contextMenu.token;
                                setContextMenu(null);
                                setContextMenuMoveToMapOpen(false);
                                setIsMoveToMapLoading(true);
                                try {
                                  const position = {
                                    x: Math.min(token.position.x, targetMap.width - token.size.width),
                                    y: Math.min(token.position.y, targetMap.height - token.size.height),
                                  };
                                  await api.addToken(campaign.id, targetMap.id, {
                                    name: token.name,
                                    imageUrl: token.imageUrl,
                                    position,
                                    size: token.size,
                                    layer: token.layer,
                                    visible: token.visible,
                                    controlledBy: token.controlledBy,
                                  });
                                  await api.deleteToken(campaign.id, currentMap.id, token.id);
                                  useGameStore.getState().removeToken(token.id);
                                  socket?.emitMapChange(currentMap.id);
                                  socket?.emitMapChange(targetMap.id);
                                } catch (err) {
                                  console.error('Failed to move token to map:', err);
                                } finally {
                                  setIsMoveToMapLoading(false);
                                }
                              }}
                            >
                              {targetMap.name}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="h-px bg-moss-green/20 my-1" />

              <button
                className="w-full px-4 py-2 text-left text-sm text-danger-ink hover:bg-danger/10 transition-colors"
                onClick={async () => {
                  if (!campaign?.id || !currentMap?.id) return;
                  const token = contextMenu.token;
                  setContextMenu(null);
                  try {
                    await api.deleteToken(campaign.id, currentMap.id, token.id);
                    useGameStore.getState().removeToken(token.id);
                    socket?.emitMapChange(currentMap.id);
                  } catch (err) {
                    console.error('Failed to remove token:', err);
                  }
                }}
              >
                Remove from Map
              </button>
            </>
            );
          })()}
        </div>
      )}

      {/* Character Sheet Viewer (opened from token context menu) */}
      {viewingCharacter && campaign && (() => {
        const membership = campaign.memberships?.find((m) => m.userId === user?.id);
        if (!membership) return null;
        return (
          <CharacterSheetViewerModal
            character={viewingCharacter}
            campaignId={campaign.id}
            membership={membership}
            onClose={() => setViewingCharacter(null)}
          />
        );
      })()}

      {/* Roll Picker (opened from token context menu) */}
      {rollPicker && (
        <CharacterRollPicker
          characterId={rollPicker.characterId}
          anchorX={rollPicker.x}
          anchorY={rollPicker.y}
          onRoll={(expression, purpose) => socket?.emitDiceRoll({ expression, purpose })}
          onClose={() => setRollPicker(null)}
        />
      )}

      {/* NPC Roll Picker (DM-only, opened from token context menu) */}
      {npcRollPicker && (() => {
        const npcToken = tokens.find((t) => t.id === npcRollPicker.tokenId);
        if (!npcToken) return null;
        return (
          <NpcRollPicker
            token={npcToken}
            gameSystem={campaign?.gameSystem ?? 'DND_5E'}
            anchorX={npcRollPicker.x}
            anchorY={npcRollPicker.y}
            onRoll={(expression, purpose) => socket?.emitDiceRoll({ expression, purpose })}
            onClose={() => setNpcRollPicker(null)}
          />
        );
      })()}

      {/* Door Context Menu — right-click on a door segment */}
      {doorContextMenu && (
        <div
          className="fixed z-50 glass-panel bg-parchment/95 backdrop-blur-sm border border-moss-green/20 shadow-lg py-1 min-w-[160px]"
          style={{ left: `${doorContextMenu.x}px`, top: `${doorContextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — door type label */}
          <p className="px-4 py-1.5 text-xs font-semibold text-stone-gray/70 border-b border-moss-green/10 select-none">
            {doorContextMenu.door.type === 'door-closed' ? '🚪 Closed Door' :
             doorContextMenu.door.type === 'door-open'   ? '🚪 Open Door'   :
                                                            '🔒 Locked Door'}
          </p>

          {/* Open — available when door is closed */}
          {doorContextMenu.door.type === 'door-closed' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-open')}
            >
              Open Door
            </button>
          )}

          {/* Close — available when door is open */}
          {doorContextMenu.door.type === 'door-open' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-closed')}
            >
              Close Door
            </button>
          )}

          {/* Lock — DM only, available when door is open or closed */}
          {isDM && doorContextMenu.door.type !== 'door-locked' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-danger-ink hover:bg-danger/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-locked')}
            >
              Lock Door
            </button>
          )}

          {/* Unlock — DM only, available when door is locked */}
          {isDM && doorContextMenu.door.type === 'door-locked' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-closed')}
            >
              Unlock Door
            </button>
          )}

          {/* Players see informational text when a door is locked */}
          {!isDM && doorContextMenu.door.type === 'door-locked' && (
            <p className="px-4 py-2 text-sm text-stone-gray/70 italic select-none">
              This door is locked.
            </p>
          )}
        </div>
      )}

      {/* Toast notifications (e.g., locked door message) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <Toast
          show={toast.show}
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      </div>
    </div>
  );
}
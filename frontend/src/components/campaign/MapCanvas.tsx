// ============================================
// Map Canvas Component
// HTML Canvas-based map viewer with zoom/pan controls
// ============================================

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Palette, Ghost, Ruler, Zap } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMapControls } from '@/hooks/useMapControls';
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
} from '@/types';
import { TokenLayer, TokenType, TokenDisposition } from '@/types';
import type { WallSegment, FogState, WallType, LightSource } from '@/types/walls';
import { computeVisibility, isPointVisible, type VisibilityPolygon } from '@/utils/raycasting';
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

/**
 * Calculate grid distance in feet between two positions.
 * flat: Chebyshev — every diagonal costs the same as a straight move (D&D 5e)
 * alternating: every second diagonal costs 10 ft instead of 5 ft (PF2e)
 */
function calcGridDistance(
  dx: number,
  dy: number,
  feetPerSquare: number,
  diagonalRule: 'flat' | 'alternating'
): number {
  if (diagonalRule === 'alternating') {
    const diag = Math.min(dx, dy);
    const straight = Math.max(dx, dy) - diag;
    const diagCost = diag * 5 + Math.floor(diag / 2) * 5;
    return diagCost + straight * feetPerSquare;
  }
  return Math.max(dx, dy) * feetPerSquare;
}

function douglasPeucker(points: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let maxIdx = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lenSq = dx * dx + dy * dy;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    let d: number;
    if (lenSq === 0) {
      d = Math.hypot(p.x - first.x, p.y - first.y);
    } else {
      const t = Math.max(0, Math.min(1, ((p.x - first.x) * dx + (p.y - first.y) * dy) / lenSq));
      d = Math.hypot(p.x - (first.x + t * dx), p.y - (first.y + t * dy));
    }
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
  const right = douglasPeucker(points.slice(maxIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

/**
 * Refine DP-simplified points by snapping each toward the nearest strong edge
 * in the map image. Uses Sobel gradient magnitude in a local search window.
 * Only the interior points are refined; first and last are kept as-is to preserve
 * the overall trace start/end.
 */
function edgeSnapPoints(
  points: Array<{ x: number; y: number }>,
  mapImage: HTMLImageElement,
  searchRadius: number,
): Array<{ x: number; y: number }> {
  if (points.length < 2) return points;
  const imgW = mapImage.naturalWidth;
  const imgH = mapImage.naturalHeight;
  if (imgW === 0 || imgH === 0) return points;

  const r = Math.ceil(searchRadius);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of points) {
    minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
  }
  const roiX = Math.max(0, Math.floor(minX) - r - 1);
  const roiY = Math.max(0, Math.floor(minY) - r - 1);
  const roiW = Math.min(imgW, Math.ceil(maxX) + r + 2) - roiX;
  const roiH = Math.min(imgH, Math.ceil(maxY) + r + 2) - roiY;
  if (roiW <= 0 || roiH <= 0) return points;

  const offscreen = document.createElement('canvas');
  offscreen.width = roiW;
  offscreen.height = roiH;
  const octx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!octx) return points;
  octx.drawImage(mapImage, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH);
  const imgData = octx.getImageData(0, 0, roiW, roiH).data;

  const gray = (px: number, py: number) => {
    const lx = px - roiX;
    const ly = py - roiY;
    if (lx < 0 || lx >= roiW || ly < 0 || ly >= roiH) return 128;
    const i = (ly * roiW + lx) * 4;
    return imgData[i]! * 0.299 + imgData[i + 1]! * 0.587 + imgData[i + 2]! * 0.114;
  };

  const result = [...points];
  for (let pi = 0; pi < points.length; pi++) {
    const pt = points[pi]!;
    const cx = Math.round(pt.x);
    const cy = Math.round(pt.y);
    const x0 = Math.max(roiX + 1, cx - r);
    const y0 = Math.max(roiY + 1, cy - r);
    const x1 = Math.min(roiX + roiW - 2, cx + r);
    const y1 = Math.min(roiY + roiH - 2, cy + r);
    if (x1 <= x0 || y1 <= y0) continue;

    let bestGrad = 0;
    let bestX = cx;
    let bestY = cy;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.hypot(px - cx, py - cy);
        if (dist > r) continue;
        const gx = gray(px + 1, py) - gray(px - 1, py);
        const gy = gray(px, py + 1) - gray(px, py - 1);
        const mag = Math.sqrt(gx * gx + gy * gy);
        const score = mag * (1 - dist / (r + 1) * 0.3);
        if (score > bestGrad) {
          bestGrad = score;
          bestX = px;
          bestY = py;
        }
      }
    }
    if (bestGrad > 30) {
      result[pi] = { x: bestX, y: bestY };
    }
  }
  return result;
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
  const { currentMap, tokens, updateTokens, setCurrentMap, userRole, campaign, updateCampaignSpiritLayer, dmViewBothPlanes, playerSpiritVisible, setPlayerSpiritVisible, activeVibeEffect, updateVibe, activeAtmosphereEffect, characterHpCache } = useCampaign();
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const isDM = userRole === 'DM';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Walls & Fog of War state — wall segments use undo/redo history hook
  const { walls: wallSegments, push: pushWallHistory, replace: replaceWallHistory, undo: undoWalls, redo: redoWalls, canUndo: canUndoWalls, canRedo: canRedoWalls } = useWallHistory([]);
  const [fogState, setFogState] = useState<FogState | null>(null);
  // Player view: list of revealed fog cell indices (derived from server fog:cells event).
  // null = fog data not received yet (show everything); Set = fog active (show only revealed cells).
  const [revealedCells, setRevealedCells] = useState<Set<number> | null>(null);
  // Fog reveal animation: per-cell opacity (1 = just revealed, 0 = fully faded in)
  const revealOpacityRef = useRef<Map<number, number>>(new Map());
  // Cache invalidation flag for wall layer (unused in Phase 1; used in Phase 3 perf optimization)
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

  // Fog brush tool state (DM only)
  const [fogMode, setFogMode] = useState<FogToolMode>(null);
  const [brushRadius, setBrushRadius] = useState(64); // map-space pixels
  const fogPendingCellsRef = useRef<Set<number>>(new Set());
  const fogFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always-current tokens ref — used by socket handlers that have stale deps
  const tokensRef = useRef<Token[]>(tokens);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

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

  // Animation state for smooth token movement
  const [animatingTokens, setAnimatingTokens] = useState<Map<string, {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startTime: number;
    duration: number;
  }>>(new Map());

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
   * Return all fog cell indices whose center falls within brushRadius of (mapX, mapY).
   */
  const getCellsUnderBrush = (mapX: number, mapY: number, fog: FogState): number[] => {
    const { fogCols, fogRows, cellPx } = fog;
    const r = brushRadius;
    const cells: number[] = [];
    const minCol = Math.max(0, Math.floor((mapX - r) / cellPx));
    const maxCol = Math.min(fogCols - 1, Math.floor((mapX + r) / cellPx));
    const minRow = Math.max(0, Math.floor((mapY - r) / cellPx));
    const maxRow = Math.min(fogRows - 1, Math.floor((mapY + r) / cellPx));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cx = (col + 0.5) * cellPx;
        const cy = (row + 0.5) * cellPx;
        if ((cx - mapX) ** 2 + (cy - mapY) ** 2 <= r * r) {
          cells.push(row * fogCols + col);
        }
      }
    }
    return cells;
  };

  /**
   * Flush pending fog cells to the server and apply optimistically.
   */
  const flushFogBrush = useCallback(() => {
    if (!currentMap || !fogMode || fogPendingCellsRef.current.size === 0) return;
    const cells = Array.from(fogPendingCellsRef.current);
    fogPendingCellsRef.current.clear();

    const operation = { op: fogMode === 'fog-reveal' ? 'reveal' : 'hide' as const, cells };

    // Optimistic update
    setFogState((prev) => {
      if (!prev) return prev;
      const revealed = [...prev.revealed];
      for (const idx of cells) {
        if (idx >= 0 && idx < revealed.length) {
          revealed[idx] = fogMode === 'fog-reveal';
        }
      }
      return { ...prev, revealed };
    });

    // Emit to server
    const socketInstance = socket?.getSocket();
    if (socketInstance && currentMap) {
      socketInstance.emit('fog:operation', { mapId: currentMap.id, operation });
    }
  }, [currentMap, fogMode, socket]);

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
   * Handle window resize
   */
  useEffect(() => {
    updateCanvasSize();

    const handleResize = () => {
      updateCanvasSize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
  }, [imageLoaded, currentMap?.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
      // Use tokensRef (not the stale tokens closure) so rapid events that arrive before
      // React re-renders all see the most recently mutated list, not the version from
      // the last render cycle.
      const curr = tokensRef.current;
      const token = curr.find((t) => t.id === event.tokenId);
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

      // Update token position — sync ref immediately so subsequent handlers in the
      // same macro-task (e.g. token:appeared for NPCs) see the correct list.
      const next = curr.map((t) =>
        t.id === event.tokenId ? { ...t, position: { x: event.x, y: event.y } } : t
      );
      tokensRef.current = next;
      updateTokens(next);
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
  }, [socket, updateTokens]); // tokensRef is stable — no need for tokens in deps

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
  }, [currentMap?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for map.changed events broadcast by the DM
  useEffect(() => {
    if (!socket) return;
    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    const handleMapChanged = ({ mapData, spiritVisible: sv }: { mapId: string; mapData: CampaignMap; spiritVisible?: boolean }) => {
      setCurrentMap(mapData);
      updateTokens(mapData.tokens || []);

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
  }, [socket, setCurrentMap, updateTokens]);

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
      // Update the token's visible flag in the local token list
      updateTokens(
        tokens.map((t) =>
          t.id === data.tokenId ? { ...t, visible: data.visible } : t
        )
      );
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
  }, [socket, tokens, updateTokens, updateCampaignSpiritLayer, campaign?.spiritLayerEnabled, playEtherealTransition]);

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
  }, [currentMap?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Dynamic lighting: token entered this player's view (or moved while visible).
    // Sync tokensRef immediately so if token:appeared fires for multiple tokens in the
    // same macro-task (server re-sync after player move), each call builds on the
    // previous result rather than all reading the same pre-render snapshot.
    const handleTokenAppeared = (data: { token: Token; mapId: string }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      const curr = tokensRef.current;
      const exists = curr.find((t) => t.id === data.token.id);
      const next = exists
        ? curr.map((t) => t.id === data.token.id ? { ...t, position: data.token.position } : t)
        : [...curr, data.token];
      tokensRef.current = next;
      updateTokens(next);
    };

    // Dynamic lighting: token left this player's view
    const handleTokenDisappeared = (data: { tokenId: string; mapId: string }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      const next = tokensRef.current.filter((t) => t.id !== data.tokenId);
      tokensRef.current = next;
      updateTokens(next);
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
  }, [socket, currentMap?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // Keyboard: Escape, Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo)
  // ============================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [wallMode, wallInProgress, polygonPoints, isDM, currentMap, undoWalls, redoWalls, socket]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ============================================
  // Fog Brush Flush Timer
  // Batches cell updates and sends every 80ms
  // ============================================
  useEffect(() => {
    if (!fogMode) {
      if (fogFlushTimerRef.current) {
        clearInterval(fogFlushTimerRef.current);
        fogFlushTimerRef.current = null;
      }
      fogPendingCellsRef.current.clear();
      return;
    }

    fogFlushTimerRef.current = setInterval(flushFogBrush, 80);
    return () => {
      if (fogFlushTimerRef.current) {
        clearInterval(fogFlushTimerRef.current);
        fogFlushTimerRef.current = null;
      }
    };
  }, [fogMode, flushFogBrush]);

  // ============================================
  // Canvas Rendering
  // ============================================

  /**
   * Render the canvas
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas — leave it transparent so the themed container background
    // (bg-parchment, which tracks --color-bg-surface) shows through wherever
    // the map image and its overlays aren't drawn. Painting a hardcoded fill
    // here would clobber the theme on every frame.
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

    // Save context state
    ctx.save();

    // Apply pan offset
    ctx.translate(mapControls.panOffset.x, mapControls.panOffset.y);

    // Apply zoom
    ctx.scale(mapControls.zoom, mapControls.zoom);

    // Calculate map dimensions in pixels
    const mapWidthPx = currentMap.width * currentMap.gridSize;
    const mapHeightPx = currentMap.height * currentMap.gridSize;

    // Draw map image (Material Plane)
    // Skip when DM is in single-plane mode and the spirit realm is currently active —
    // in that case only the spirit layer image will be drawn below.
    // isInSpiritRealm is true if the campaign-wide toggle is on OR this specific
    // non-DM player has personally crossed into the spirit realm.
    const spiritActive = campaign?.spiritLayerEnabled ?? false;
    const isInSpiritRealm = spiritActive || (userRole !== 'DM' && playerSpiritVisible);
    const dmSinglePlaneSpirit = userRole === 'DM' && !dmViewBothPlanes && spiritActive;
    if (!dmSinglePlaneSpirit) {
      ctx.drawImage(mapImage, 0, 0, mapWidthPx, mapHeightPx);
    }

    // Draw grid overlay if enabled
    if (showGrid) {
      // Use selected grid color (black or white)
      ctx.strokeStyle = gridColor === 'black' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2 / mapControls.zoom; // Thicker lines, constant width regardless of zoom

      // Vertical lines
      for (let x = 0; x <= currentMap.width; x++) {
        const xPos = x * currentMap.gridSize;
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, mapHeightPx);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = 0; y <= currentMap.height; y++) {
        const yPos = y * currentMap.gridSize;
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(mapWidthPx, yPos);
        ctx.stroke();
      }
    }

    // ============================================
    // Draw Fog of War (Phase 1)
    // Rendered before spirit layer and tokens so they appear above fog.
    // DM sees semi-transparent fog; players see fully opaque fog on hidden cells.
    // ============================================
    const renderIsDM = userRole === 'DM'; // use userRole directly to avoid block-scope shadow issues

    // Draw fog for DM (using full fogState)
    if (renderIsDM && fogState) {
      const { fogCols, fogRows, cellPx, revealed } = fogState;
      ctx.save();
      ctx.fillStyle = 'rgba(15, 12, 25, 0.55)'; // deep dark purple, semi-transparent for DM
      for (let row = 0; row < fogRows; row++) {
        for (let col = 0; col < fogCols; col++) {
          const idx = row * fogCols + col;
          if (!revealed[idx]) {
            const fadeOpacity = revealOpacityRef.current.get(idx);
            if (fadeOpacity !== undefined) {
              ctx.fillStyle = `rgba(15, 12, 25, ${0.55 * fadeOpacity})`;
              ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
              ctx.fillStyle = 'rgba(15, 12, 25, 0.55)';
            } else {
              ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
            }
          }
        }
      }
      ctx.restore();
    }

    // Draw fog for players (using revealedCells index set)
    // Fog cells are one-per-grid-square so they align with the visible grid.
    // When revealedCells is null, fog data hasn't been received yet — skip fog rendering.
    if (!renderIsDM && revealedCells) {
      const cellPx = currentMap.gridSize;
      const fogCols = currentMap.width;
      const fogRows = currentMap.height;
      ctx.save();
      for (let row = 0; row < fogRows; row++) {
        for (let col = 0; col < fogCols; col++) {
          const idx = row * fogCols + col;
          if (!revealedCells.has(idx)) {
            const fadeOpacity = revealOpacityRef.current.get(idx);
            ctx.fillStyle = fadeOpacity !== undefined
              ? `rgba(15, 12, 25, ${0.95 * fadeOpacity})`
              : 'rgba(15, 12, 25, 0.95)';
            ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
          }
        }
      }
      ctx.restore();
    }

    // ============================================
    // Draw Spirit Layer image (the Ethereal Plane)
    //
    // Rendering model:
    //   Base map always shown first (the Material Plane).
    //   Spirit layer image overlaid on top:
    //     - DM (spirit hidden from players): ghostly overlay at low alpha
    //       so DM can see the spirit realm but it's clearly non-active
    //     - DM (spirit visible to players): spirit realm at medium-high
    //       alpha — DM sees both planes simultaneously
    //     - Players (spiritLayerEnabled = true): near-full alpha —
    //       the spirit realm is their primary reality; the material
    //       world shows through as a ghostly echo beneath
    // ============================================
    if (spiritLayerImage) {
      const isDM = userRole === 'DM';
      // spiritActive already computed above for the base map skip

      let alpha = 0;
      if (isDM && !dmViewBothPlanes) {
        // Single-plane mode: DM sees only the active plane at full fidelity
        // When spirit is active the base map was skipped, so draw spirit at full opacity
        alpha = spiritActive ? 1.0 : 0;
      } else if (isDM && !spiritActive) {
        // Dual-plane mode, spirit realm hidden from players:
        // Show as a ghostly hint so DM can still manage spirit tokens
        alpha = 0.32;
      } else if (isDM && spiritActive) {
        // Dual-plane mode, spirit realm active:
        // Medium-high so DM sees both planes simultaneously
        alpha = 0.72;
      } else if (!isDM && isInSpiritRealm) {
        // Player in spirit realm (global toggle OR personal token crossing) —
        // this is their primary visual reality; near-full alpha so spirit dominates
        alpha = 0.88;
      }

      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha * spiritLayerOpacity;
        ctx.drawImage(spiritLayerImage, 0, 0, mapWidthPx, mapHeightPx);
        ctx.restore();
      }
    }

    // Draw tokens
    const isDM = userRole === 'DM';
    const spiritAccentColor = getSpiritAccentColor(campaign?.spiritLayerStyle);

    for (const token of tokens) {
      // Non-DM clients: skip hidden tokens (server already filters, this is a safeguard)
      if (!token.visible && !isDM) continue;

      // Non-DM clients: skip tokens whose center is in a fogged (unrevealed) cell.
      // This prevents players from seeing NPC tokens through the fog overlay.
      // Exception: players always see their OWN tokens (you know where you are).
      // revealedCells === null means fog data hasn't been received yet — show everything.
      if (!isDM && revealedCells) {
        const isMyToken = token.controlledBy === user?.id ||
          (token.characterId && campaign?.characters?.find((c) => c.id === token.characterId && c.userId === user?.id));
        if (!isMyToken) {
          const fogCols = currentMap.width;
          // Token grid Y is bottom-left origin; fog grid is top-left origin
          const fogRow = currentMap.height - 1 - Math.floor(token.position.y + (token.size.height - 1) / 2);
          const fogCol = Math.floor(token.position.x + (token.size.width - 1) / 2);
          const fogIdx = fogRow * fogCols + fogCol;
          if (!revealedCells.has(fogIdx)) continue;
        }
      }

      // DM: skip spirit tokens if the DM has hidden them from view
      if (isDM && !dmShowSpiritTokens && token.layer === TokenLayer.SPIRIT) continue;

      const tokenImg = tokenImages.get(token.id);

      // Skip dragged token (will be drawn separately as ghost)
      if (draggedToken?.id === token.id) continue;

      // Check if token is animating
      const animation = animatingTokens.get(token.id);
      let posX = token.position.x;
      let posY = token.position.y;

      if (animation) {
        const elapsed = Date.now() - animation.startTime;
        const progress = Math.min(elapsed / animation.duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        posX = animation.fromX + (animation.toX - animation.fromX) * eased;
        posY = animation.fromY + (animation.toY - animation.fromY) * eased;
      }

      // Convert grid coordinates to world coordinates.
      // position is the bottom-left grid cell; the token extends upward in grid-Y,
      // so its top-left pixel corresponds to grid row (posY + height - 1).
      const tokenX = posX * currentMap.gridSize;
      const tokenY = (currentMap.height - posY - token.size.height) * currentMap.gridSize;

      const tokenWidth = token.size.width * currentMap.gridSize;
      const tokenHeight = token.size.height * currentMap.gridSize;

      // Token display mode (default: pog)
      const displayMode = token.displayMode || 'pog';
      const centerX = tokenX + tokenWidth / 2;
      const centerY = tokenY + tokenHeight / 2;
      const radius = Math.min(tokenWidth, tokenHeight) / 2;

      // Hidden tokens shown to DM at 50% opacity
      const isHiddenFromPlayers = !token.visible;

      ctx.save();
      if (isHiddenFromPlayers && isDM) {
        ctx.globalAlpha = 0.5;
      }
      // Spirit tokens seen by DM get a reduced alpha so they don't overwhelm material tokens
      if (isDM && token.layer === TokenLayer.SPIRIT) {
        ctx.globalAlpha = dmViewBothPlanes ? 0.80 : 1.0;
      }

      if (tokenImg) {
        // === DRAW TOKEN IMAGE ===
        if (displayMode === 'full-art') {
          // Full-art: rectangular, no clipping — shows full image with alpha transparency
          const cornerRadius = Math.max(3, 3 / mapControls.zoom);
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(tokenX, tokenY, tokenWidth, tokenHeight, cornerRadius);
          } else {
            ctx.rect(tokenX, tokenY, tokenWidth, tokenHeight);
          }
          ctx.clip();
          ctx.drawImage(tokenImg, tokenX, tokenY, tokenWidth, tokenHeight);
        } else {
          // Pog and Top-down: circular clip
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(tokenImg, tokenX, tokenY, tokenWidth, tokenHeight);
        }
      } else {
        // === PLACEHOLDER ICON (colored-letter circle) ===
        const effectiveTypeForColor = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
        const placeholderBg =
          effectiveTypeForColor === TokenType.PLAYER ? '#3b82f6' :
          token.disposition === TokenDisposition.HOSTILE  ? '#ef4444' :
          token.disposition === TokenDisposition.FRIENDLY ? '#2dd4bf' :
          token.disposition === TokenDisposition.NEUTRAL  ? '#fbbf24' :
                                                            '#78716c'; // object / default stone

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = placeholderBg;
        ctx.fill();

        // Draw initial letter
        const initial = (token.name || '?').charAt(0).toUpperCase();
        const fontSize = Math.max(12, radius * 1.0);
        ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(initial, centerX, centerY + fontSize * 0.04);
      }
      ctx.restore();

      // Draw spirit-layer ring for DM (dashed accent-colored outline)
      if (isDM && token.layer === TokenLayer.SPIRIT) {
        ctx.strokeStyle = spiritAccentColor;
        ctx.lineWidth = 3 / mapControls.zoom;
        ctx.setLineDash([5 / mapControls.zoom, 3 / mapControls.zoom]);
        ctx.beginPath();
        if (displayMode === 'full-art') {
          const cornerRadius = Math.max(3, 3 / mapControls.zoom);
          if (ctx.roundRect) {
            ctx.roundRect(tokenX - 3 / mapControls.zoom, tokenY - 3 / mapControls.zoom, tokenWidth + 6 / mapControls.zoom, tokenHeight + 6 / mapControls.zoom, cornerRadius);
          } else {
            ctx.rect(tokenX - 3 / mapControls.zoom, tokenY - 3 / mapControls.zoom, tokenWidth + 6 / mapControls.zoom, tokenHeight + 6 / mapControls.zoom);
          }
        } else {
          ctx.arc(centerX, centerY, radius + 3 / mapControls.zoom, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Disposition ring (NPC tokens) — pog mode gets a solid ring, top-down gets a subtle ring, full-art gets a bottom border stripe
      const effectiveType = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
      if (effectiveType === TokenType.NPC && token.disposition) {
        const ringColor =
          token.disposition === TokenDisposition.HOSTILE  ? '#ef4444' :
          token.disposition === TokenDisposition.FRIENDLY ? '#2dd4bf' :
                                                            '#fbbf24'; // neutral = amber
        if (displayMode === 'full-art') {
          // Bottom border stripe for full-art tokens
          const stripeH = Math.max(3, 3 / mapControls.zoom);
          ctx.fillStyle = ringColor;
          ctx.fillRect(tokenX, tokenY + tokenHeight - stripeH, tokenWidth, stripeH);
        } else if (displayMode === 'pog') {
          // Thick solid ring for pog
          const ringWidth = Math.max(3, 3 / mapControls.zoom);
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = ringWidth;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + ringWidth / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Top-down: subtle thin ring
          const ringWidth = Math.max(1.5, 1.5 / mapControls.zoom);
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = ringWidth;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + ringWidth / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }

      // HP bar — NPC tokens use token.hp (DM-controlled visibility);
      // player tokens always show HP sourced from the character HP cache.
      const playerHp = token.characterId ? (characterHpCache[token.characterId] ?? null) : null;
      const hpSource = playerHp ?? (token.hp && token.hp.max > 0 && (isDM || token.showHpBar) ? token.hp : null);
      if (hpSource) {
        const pct = Math.max(0, Math.min(1, hpSource.current / hpSource.max));
        const barW = displayMode === 'full-art' ? tokenWidth : radius * 2;
        const barH = Math.max(4, Math.round(5 / mapControls.zoom));
        const barX = displayMode === 'full-art' ? tokenX : centerX - radius;
        const barY = (displayMode === 'full-art' ? tokenY + tokenHeight : centerY + radius) + Math.round(3 / mapControls.zoom);

        // Background track
        ctx.fillStyle = 'rgba(15, 15, 15, 0.8)';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(barX, barY, barW, barH, 2 / mapControls.zoom);
        } else {
          ctx.rect(barX, barY, barW, barH);
        }
        ctx.fill();

        // HP fill
        const hpColor = pct >= 0.75 ? '#22c55e'
                      : pct >= 0.50 ? '#84cc16'
                      : pct >= 0.25 ? '#f59e0b'
                      :               '#ef4444';
        if (pct > 0) {
          ctx.fillStyle = hpColor;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(barX, barY, Math.max(2 / mapControls.zoom, barW * pct), barH, 2 / mapControls.zoom);
          } else {
            ctx.rect(barX, barY, Math.max(2 / mapControls.zoom, barW * pct), barH);
          }
          ctx.fill();
        }

        // Temp HP overlay (light blue)
        if (hpSource.temp > 0) {
          const tempPct = Math.min(1, hpSource.temp / hpSource.max);
          ctx.fillStyle = 'rgba(147, 197, 253, 0.75)';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(barX + barW * (1 - tempPct), barY, barW * tempPct, barH, 2 / mapControls.zoom);
          } else {
            ctx.rect(barX + barW * (1 - tempPct), barY, barW * tempPct, barH);
          }
          ctx.fill();
        }
      }

      // Hidden token indicator (DM-only small red dot)
      if (isHiddenFromPlayers && isDM) {
        const dotRadius = Math.max(4, 4 / mapControls.zoom);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.beginPath();
        if (displayMode === 'full-art') {
          ctx.arc(tokenX + tokenWidth - dotRadius * 2, tokenY + dotRadius * 2, dotRadius, 0, Math.PI * 2);
        } else {
          ctx.arc(centerX + radius * 0.6, centerY - radius * 0.6, dotRadius, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // Draw hover border
      if (hoverToken?.id === token.id) {
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 3 / mapControls.zoom;
        ctx.beginPath();
        if (displayMode === 'full-art') {
          const cornerRadius = Math.max(3, 3 / mapControls.zoom);
          if (ctx.roundRect) {
            ctx.roundRect(tokenX - 2 / mapControls.zoom, tokenY - 2 / mapControls.zoom, tokenWidth + 4 / mapControls.zoom, tokenHeight + 4 / mapControls.zoom, cornerRadius);
          } else {
            ctx.rect(tokenX - 2 / mapControls.zoom, tokenY - 2 / mapControls.zoom, tokenWidth + 4 / mapControls.zoom, tokenHeight + 4 / mapControls.zoom);
          }
        } else {
          ctx.arc(centerX, centerY, radius + 2 / mapControls.zoom, 0, Math.PI * 2);
        }
        ctx.stroke();
      }

      // Condition indicator badges — small colored dots along the top of the token
      if (token.conditions && token.conditions.length > 0) {
        const condCount = token.conditions.length;
        const badgeR = Math.max(5, 5 / mapControls.zoom);
        const gap = badgeR * 2.4;
        const totalW = condCount * gap - (gap - badgeR * 2);
        const startX = centerX - totalW / 2 + badgeR;
        const badgeY = displayMode === 'full-art'
          ? tokenY - badgeR - 2 / mapControls.zoom
          : centerY - radius - badgeR - 2 / mapControls.zoom;

        for (let ci = 0; ci < condCount; ci++) {
          const bx = startX + ci * gap;
          // Condition badge: amber circle with white first letter
          ctx.beginPath();
          ctx.arc(bx, badgeY, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = 0.5 / mapControls.zoom;
          ctx.stroke();

          // First letter
          const condLetter = token.conditions[ci].charAt(0).toUpperCase();
          const condFontSize = Math.max(7, badgeR * 1.2);
          ctx.font = `bold ${condFontSize}px 'Inter', system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(condLetter, bx, badgeY + condFontSize * 0.03);
        }
      }
    }

    // Draw dragged token as ghost
    if (draggedToken && dragOffset && hoverCoords) {
      const tokenImg = tokenImages.get(draggedToken.id);
      // Ghost position = cursor cell minus the pickup offset, so whichever cell of
      // the token was clicked stays anchored under the cursor during drag.
      const maxPosX = currentMap.width - draggedToken.size.width;
      const maxPosY = currentMap.height - draggedToken.size.height;
      const ghostPosX = Math.max(0, Math.min(maxPosX, hoverCoords.x - dragOffset.x));
      const ghostPosY = Math.max(0, Math.min(maxPosY, hoverCoords.y - dragOffset.y));
      const ghostX = ghostPosX * currentMap.gridSize;
      const ghostY = (currentMap.height - ghostPosY - draggedToken.size.height) * currentMap.gridSize;

      const ghostW = draggedToken.size.width * currentMap.gridSize;
      const ghostH = draggedToken.size.height * currentMap.gridSize;
      const ghostCX = ghostX + ghostW / 2;
      const ghostCY = ghostY + ghostH / 2;
      const ghostR = Math.min(ghostW, ghostH) / 2;
      const ghostDisplayMode = draggedToken.displayMode || 'pog';

      ctx.save();
      ctx.globalAlpha = 0.6;

      if (tokenImg) {
        if (ghostDisplayMode === 'full-art') {
          const cr = Math.max(3, 3 / mapControls.zoom);
          ctx.beginPath();
          if (ctx.roundRect) { ctx.roundRect(ghostX, ghostY, ghostW, ghostH, cr); } else { ctx.rect(ghostX, ghostY, ghostW, ghostH); }
          ctx.clip();
          ctx.drawImage(tokenImg, ghostX, ghostY, ghostW, ghostH);
        } else {
          ctx.beginPath();
          ctx.arc(ghostCX, ghostCY, ghostR, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(tokenImg, ghostX, ghostY, ghostW, ghostH);
        }
      } else {
        // Ghost placeholder
        const effectiveTypeForColor = draggedToken.type ?? (draggedToken.characterId ? TokenType.PLAYER : TokenType.NPC);
        const placeholderBg =
          effectiveTypeForColor === TokenType.PLAYER ? '#3b82f6' :
          draggedToken.disposition === TokenDisposition.HOSTILE  ? '#ef4444' :
          draggedToken.disposition === TokenDisposition.FRIENDLY ? '#2dd4bf' :
          draggedToken.disposition === TokenDisposition.NEUTRAL  ? '#fbbf24' : '#78716c';
        ctx.beginPath();
        ctx.arc(ghostCX, ghostCY, ghostR, 0, Math.PI * 2);
        ctx.fillStyle = placeholderBg;
        ctx.fill();
        const initial = (draggedToken.name || '?').charAt(0).toUpperCase();
        const fontSize = Math.max(12, ghostR * 1.0);
        ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(initial, ghostCX, ghostCY + fontSize * 0.04);
      }

      ctx.restore();
    }


    // Pre-compute player visibility polygons — shared by the fog overlay (below) and door
    // filtering (in the wall segment block). Avoids computing each polygon twice per frame.
    // Each entry stores the token center so door checks can nudge the test point toward
    // the viewer: closed doors lie ON the polygon boundary, making a raw midpoint test
    // unreliable — shifting 2px inward places it safely inside the visible area.
    const lightingEnabled = currentMap.lightingEnabled ?? false;
    const playerVisPolygons: Array<{ poly: VisibilityPolygon; cx: number; cy: number }> = [];

    // ============================================
    // Dynamic Lighting (Phase 3) — raycasting visibility polygon
    // Replaces the manual fog layer when currentMap.lightingEnabled = true.
    // DM always sees all; "Preview player view" simulates player vision for DM.
    // ============================================
    if (lightingEnabled) {
      // Determine whether to render as player: actual player, or DM in preview mode
      const renderAsPlayer = !renderIsDM || dmPreviewPlayerView;
      if (renderAsPlayer) {
        // Collect tokens this viewer controls
        const myTokens = tokens.filter((t) => {
          if (renderIsDM && dmPreviewPlayerView) return true; // DM preview: use all tokens
          return t.controlledBy === user?.id || (t.characterId && campaign?.characters?.find((c) => c.id === t.characterId && c.userId === user?.id));
        });

        const mapWidthPxLighting = currentMap.width * currentMap.gridSize;
        const mapHeightPxLighting = currentMap.height * currentMap.gridSize;

        const enabledLights = lightSources.filter((l) => l.enabled);
        if (myTokens.length === 0 && enabledLights.length === 0) {
          // No tokens and no lights → full darkness
          ctx.save();
          ctx.fillStyle = 'rgba(15, 12, 25, 1)';
          ctx.fillRect(0, 0, mapWidthPxLighting, mapHeightPxLighting);
          ctx.restore();
        } else {
          // Reuse or recreate the offscreen canvas only when map dimensions change.
          // Allocating a new canvas every frame (~5 MB for a 20×20 map) causes GC jank.
          if (
            !lightingOffscreenRef.current ||
            lightingOffscreenRef.current.width !== mapWidthPxLighting ||
            lightingOffscreenRef.current.height !== mapHeightPxLighting
          ) {
            lightingOffscreenRef.current = document.createElement('canvas');
            lightingOffscreenRef.current.width = mapWidthPxLighting;
            lightingOffscreenRef.current.height = mapHeightPxLighting;
          }
          const offscreen = lightingOffscreenRef.current;
          const offCtx = offscreen.getContext('2d')!;
          // Must clear before reuse — persists between frames
          offCtx.clearRect(0, 0, mapWidthPxLighting, mapHeightPxLighting);

          // ── Light coverage offscreen ────────────────────────────────────
          // Builds a per-pixel "light intensity" map where:
          //   alpha 1.0 → fully bright (no fog)
          //   alpha 0.5 → dim (half-fog tint)
          //   alpha 0.0 → dark
          // Token vision and bright zones contribute alpha 1.0; dim zones
          // contribute alpha 0.5. Alphas sum via 'lighter' compositing and
          // are clamped at 1.0 by the canvas — so two overlapping dim zones
          // (0.5 + 0.5) automatically become bright. This is the
          // "dim overlap → bright" house rule.
          if (
            !lightCoverageOffscreenRef.current ||
            lightCoverageOffscreenRef.current.width !== mapWidthPxLighting ||
            lightCoverageOffscreenRef.current.height !== mapHeightPxLighting
          ) {
            lightCoverageOffscreenRef.current = document.createElement('canvas');
            lightCoverageOffscreenRef.current.width = mapWidthPxLighting;
            lightCoverageOffscreenRef.current.height = mapHeightPxLighting;
          }
          const coverage = lightCoverageOffscreenRef.current;
          const covCtx = coverage.getContext('2d')!;
          covCtx.clearRect(0, 0, mapWidthPxLighting, mapHeightPxLighting);
          covCtx.globalCompositeOperation = 'lighter';
          covCtx.fillStyle = 'rgba(255, 255, 255, 1)';

          // Token vision → bright (alpha 1.0) within the visibility polygon.
          // Token grid coords use Y=0 at bottom; canvas pixel coords use Y=0 at top.
          for (const token of myTokens) {
            const tokenCenterX = (token.position.x + token.size.width / 2) * currentMap.gridSize;
            const tokenCenterY = (currentMap.height - token.position.y - token.size.height / 2) * currentMap.gridSize;
            const radiusPx = (token.sightRadius ?? 0) * currentMap.gridSize;
            const poly = computeVisibility(
              { x: tokenCenterX, y: tokenCenterY },
              wallSegments,
              mapWidthPxLighting,
              mapHeightPxLighting,
              radiusPx
            );
            playerVisPolygons.push({ poly, cx: tokenCenterX, cy: tokenCenterY });
            if (poly.points.length >= 3) {
              covCtx.beginPath();
              covCtx.moveTo(poly.points[0].x, poly.points[0].y);
              for (let i = 1; i < poly.points.length; i++) {
                covCtx.lineTo(poly.points[i].x, poly.points[i].y);
              }
              covCtx.closePath();
              covCtx.fill();
            }
          }

          // Light sources → clipped to visibility polygon for wall shadows.
          // Within the polygon: dim circle at α 0.5, bright circle adds another α 0.5
          // on top (via 'lighter') so bright = 1.0. Two dim zones from different
          // lights also sum to 1.0, naturally implementing dim-overlap-bright.
          for (const light of enabledLights) {
            const dimRadiusPx    = light.dimRadius    * currentMap.gridSize;
            const brightRadiusPx = light.brightRadius * currentMap.gridSize;
            const poly = computeVisibility(
              { x: light.x, y: light.y },
              wallSegments,
              mapWidthPxLighting,
              mapHeightPxLighting,
              dimRadiusPx
            );
            playerVisPolygons.push({ poly, cx: light.x, cy: light.y });
            if (poly.points.length < 3) continue;

            covCtx.save();
            // Clip to the (wall-shadowed) visibility polygon
            covCtx.beginPath();
            covCtx.moveTo(poly.points[0].x, poly.points[0].y);
            for (let i = 1; i < poly.points.length; i++) {
              covCtx.lineTo(poly.points[i].x, poly.points[i].y);
            }
            covCtx.closePath();
            covCtx.clip();

            // Dim disc — alpha 0.5
            if (dimRadiusPx > 0) {
              covCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
              covCtx.beginPath();
              covCtx.arc(light.x, light.y, dimRadiusPx, 0, Math.PI * 2);
              covCtx.fill();
            }
            // Bright disc — adds another alpha 0.5 (becoming 1.0 inside)
            if (brightRadiusPx > 0) {
              covCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
              covCtx.beginPath();
              covCtx.arc(light.x, light.y, brightRadiusPx, 0, Math.PI * 2);
              covCtx.fill();
            }
            covCtx.restore();
          }
          covCtx.globalCompositeOperation = 'source-over';

          // ── Build fog with coverage subtracted ──────────────────────────
          // Fill fog at full opacity, then erase by the coverage alpha.
          offCtx.fillStyle = 'rgba(15, 12, 25, 0.95)';
          offCtx.fillRect(0, 0, mapWidthPxLighting, mapHeightPxLighting);
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
          for (const token of myTokens) {
            const cx = (token.position.x + token.size.width / 2) * currentMap.gridSize;
            const cy = (currentMap.height - token.position.y - token.size.height / 2) * currentMap.gridSize;
            const glowR = Math.max(
              currentMap.gridSize * 2,
              (token.sightRadius ?? 3) * currentMap.gridSize * 0.25
            );
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
            glow.addColorStop(0, 'rgba(255, 200, 100, 0.10)');
            glow.addColorStop(1, 'rgba(255, 200, 100, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
            ctx.fill();
          }

          // Two-zone light source glow: bright inner ring + dim outer ring.
          // Bright zone: strong warm glow. Dim zone: faint half-opacity glow.
          // Where two dim zones overlap the additive compositing naturally
          // produces bright-equivalent intensity.
          ctx.globalCompositeOperation = 'lighter';
          for (const light of enabledLights) {
            const brightPx = light.brightRadius * currentMap.gridSize;
            const dimPx = light.dimRadius * currentMap.gridSize;
            const r = parseInt(light.color.slice(1, 3), 16);
            const g = parseInt(light.color.slice(3, 5), 16);
            const b = parseInt(light.color.slice(5, 7), 16);

            // Bright zone glow (inner)
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

            // Dim zone glow (outer ring, half intensity)
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
          ctx.restore();
        }
      }
      // DM (not in preview) sees everything — skip fog entirely
    }

    // DM light source icons — visible to DM always (including player preview, so DM can still edit)
    if (renderIsDM) {
      ctx.save();
      for (const light of lightSources) {
        const isSelected = selectedLightId === light.id;

        // Draw bright + dim radius circles when in select mode or selected
        if (isSelected || lightMode === 'light-select') {
          const enabledColor = light.enabled;
          ctx.save();
          ctx.lineWidth = 1 / mapControls.zoom;
          // Dim radius (outer, dashed)
          ctx.setLineDash([4 / mapControls.zoom, 4 / mapControls.zoom]);
          ctx.beginPath();
          ctx.arc(light.x, light.y, light.dimRadius * currentMap.gridSize, 0, Math.PI * 2);
          ctx.strokeStyle = enabledColor ? light.color + '33' : 'rgba(100, 100, 100, 0.2)';
          ctx.stroke();
          // Bright radius (inner, solid)
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(light.x, light.y, light.brightRadius * currentMap.gridSize, 0, Math.PI * 2);
          ctx.strokeStyle = enabledColor ? light.color + '55' : 'rgba(100, 100, 100, 0.3)';
          ctx.stroke();
          ctx.restore();
        }

        // Light icon circle
        const iconR = 8 / mapControls.zoom;
        ctx.beginPath();
        ctx.arc(light.x, light.y, iconR, 0, Math.PI * 2);
        ctx.fillStyle = light.enabled ? light.color : '#666666';
        ctx.globalAlpha = light.enabled ? 0.85 : 0.5;
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0,0,0,0.6)';
        ctx.lineWidth = (isSelected ? 2 : 1) / mapControls.zoom;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Small "disabled" X indicator
        if (!light.enabled) {
          const xLen = 4 / mapControls.zoom;
          ctx.beginPath();
          ctx.moveTo(light.x - xLen, light.y - xLen);
          ctx.lineTo(light.x + xLen, light.y + xLen);
          ctx.moveTo(light.x + xLen, light.y - xLen);
          ctx.lineTo(light.x - xLen, light.y + xLen);
          ctx.strokeStyle = 'rgba(255,100,100,0.8)';
          ctx.lineWidth = 1.5 / mapControls.zoom;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Draw wall segments — DM sees all; players see only doors (interactive)
    {
      // Convert hex wall color to rgba helper
      const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      };

      const drawWallSeg = (seg: WallSegment, isHovered = false, isPending = false) => {
        // Thicker lines (4px base) — walls need to be clearly visible over map imagery
        ctx.lineWidth = (isHovered ? 7 : 4) / mapControls.zoom;
        if (isPending) {
          ctx.strokeStyle = 'rgba(253, 230, 138, 0.85)'; // amber-100 dashed = pending
          ctx.setLineDash([5 / mapControls.zoom, 5 / mapControls.zoom]);
        } else {
          ctx.setLineDash([]);
          // Use DM-selected color for walls; fixed colors for doors/windows (functional indicators)
          switch (seg.type) {
            case 'wall':        ctx.strokeStyle = hexToRgba(wallColor, isHovered ? 1 : 0.9); break;
            case 'door-closed': ctx.strokeStyle = isHovered ? 'rgba(196, 181, 253, 1)' : 'rgba(167, 139, 250, 0.9)'; break;
            case 'door-open':   ctx.strokeStyle = isHovered ? 'rgba(187, 247, 208, 1)' : 'rgba(134, 239, 172, 0.9)'; break;
            case 'door-locked': ctx.strokeStyle = isHovered ? 'rgba(252, 165, 165, 1)' : 'rgba(239, 68, 68, 0.9)'; break;
            case 'window':      ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)'; break;
          }
          if (seg.type === 'door-open')  ctx.setLineDash([6 / mapControls.zoom, 4 / mapControls.zoom]);
          if (seg.type === 'window')     ctx.setLineDash([2 / mapControls.zoom, 3 / mapControls.zoom]);
        }
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Door center indicator (filled circle = closed, arc = open, lock symbol = locked)
        if ((seg.type === 'door-closed' || seg.type === 'door-open' || seg.type === 'door-locked') && !isPending) {
          const mx = (seg.x1 + seg.x2) / 2;
          const my = (seg.y1 + seg.y2) / 2;
          if (seg.type === 'door-closed') {
            ctx.fillStyle = isHovered ? 'rgba(196, 181, 253, 1)' : 'rgba(167, 139, 250, 0.9)';
            ctx.beginPath();
            ctx.arc(mx, my, 5 / mapControls.zoom, 0, Math.PI * 2);
            ctx.fill();
          } else if (seg.type === 'door-locked') {
            // locked: filled red circle with a small cross
            ctx.fillStyle = isHovered ? 'rgba(252, 165, 165, 1)' : 'rgba(239, 68, 68, 0.9)';
            ctx.beginPath();
            ctx.arc(mx, my, 5 / mapControls.zoom, 0, Math.PI * 2);
            ctx.fill();
            const sz = 2.5 / mapControls.zoom;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5 / mapControls.zoom;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(mx - sz, my - sz); ctx.lineTo(mx + sz, my + sz);
            ctx.moveTo(mx + sz, my - sz); ctx.lineTo(mx - sz, my + sz);
            ctx.stroke();
          } else {
            // open door: small arc showing swing
            ctx.strokeStyle = isHovered ? 'rgba(187, 247, 208, 1)' : 'rgba(134, 239, 172, 0.9)';
            ctx.lineWidth = 2 / mapControls.zoom;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(mx, my, 6 / mapControls.zoom, 0, Math.PI);
            ctx.stroke();
          }
        }
      };

      ctx.save();
      ctx.lineCap = 'round';

      if (renderIsDM) {
        // DM sees all walls
        for (const seg of wallSegments) {
          drawWallSeg(seg, seg.id === hoveredWallId || seg.id === selectedWallId);
        }
        // Endpoint/junction nodes — shown whenever a wall tool is active.
        // White dot = dangling endpoint; larger yellow dot = junction (≥2 segments share the point).
        if (wallMode !== null) {
          const endpointMap = new Map<string, { x: number; y: number; count: number }>();
          for (const seg of wallSegments) {
            for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
              const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
              const existing = endpointMap.get(key);
              if (existing) {
                existing.count++;
              } else {
                endpointMap.set(key, { x: pt.x, y: pt.y, count: 1 });
              }
            }
          }
          ctx.save();
          const dragPt = wallDragEndpointRef.current?.point;
          const selEp = selectedEndpoint;
          for (const { x, y, count } of endpointMap.values()) {
            const isJunction = count >= 2;
            const isDragging = dragPt && Math.abs(x - Math.round(dragPt.x)) < 1 && Math.abs(y - Math.round(dragPt.y)) < 1;
            const isSelected = selEp && Math.abs(x - selEp.x) < 1 && Math.abs(y - selEp.y) < 1;
            const radius = (isDragging || isSelected ? 6 : isJunction ? 4.5 : 3) / mapControls.zoom;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isDragging ? 'rgba(56, 189, 248, 0.95)' : isSelected ? 'rgba(56, 189, 248, 0.9)' : isJunction ? 'rgba(253, 224, 71, 0.9)' : 'rgba(255,255,255,0.6)';
            ctx.strokeStyle = isDragging || isSelected ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)';
            ctx.lineWidth = (isDragging || isSelected ? 2 : 1) / mapControls.zoom;
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      } else {
        // Players see door segments within line-of-sight only.
        // When dynamic lighting is off, all doors are always visible.
        for (const seg of wallSegments) {
          if (seg.type === 'door-closed' || seg.type === 'door-open' || seg.type === 'door-locked') {
            if (lightingEnabled && playerVisPolygons.length > 0) {
              const midX = (seg.x1 + seg.x2) / 2;
              const midY = (seg.y1 + seg.y2) / 2;
              // Closed doors lie exactly ON the visibility polygon boundary — a raw midpoint
              // test is unreliable. Nudge 2px toward the token so the test point is safely
              // inside the visible area (between the viewer and the door face).
              const inSight = playerVisPolygons.some(({ poly, cx, cy }) => {
                const dx = cx - midX;
                const dy = cy - midY;
                const dist = Math.hypot(dx, dy) || 1;
                return isPointVisible(
                  { x: midX + (dx / dist) * 2, y: midY + (dy / dist) * 2 },
                  { x: 0, y: 0 },
                  poly
                );
              });
              if (!inSight) continue;
            }
            drawWallSeg(seg, seg.id === hoveredDoorId);
          }
        }
        // When dynamic lighting is OFF, also render wall/window segments so players
        // can understand the terrain. When lighting is ON, the darkness is the wall indicator.
        if (!currentMap.lightingEnabled) {
          for (const seg of wallSegments) {
            if (seg.type === 'wall' || seg.type === 'window') {
              drawWallSeg(seg, false);
            }
          }
        }
      }

      ctx.restore();
    }

    // Draw in-progress polyline (wall-draw mode, DM only)
    if (renderIsDM && wallMode === 'wall-draw' && wallInProgress.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 / mapControls.zoom;
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.7)';

      // Draw the placed line segments
      if (wallInProgress.length > 1) {
        ctx.beginPath();
        ctx.moveTo(wallInProgress[0].x, wallInProgress[0].y);
        for (let i = 1; i < wallInProgress.length; i++) {
          ctx.lineTo(wallInProgress[i].x, wallInProgress[i].y);
        }
        ctx.stroke();
      }

      // Draw vertex dots
      ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
      for (const pt of wallInProgress) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / mapControls.zoom, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ghost line: last placed point to current cursor (map-space).
      // Use hoverMapPxRef (raw map-px) rather than hoverCoords (grid-quantised) so that
      // when snap-to-grid is disabled the ghost line truly tracks the cursor freely.
      if (hoverCoords && wallInProgress.length > 0) {
        const lastPt = wallInProgress[wallInProgress.length - 1];
        const rawPx = hoverMapPxRef.current;
        if (rawPx) {
          const endpoint = snapPoint(rawPx);
          ctx.setLineDash([5 / mapControls.zoom, 5 / mapControls.zoom]);
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
          ctx.beginPath();
          ctx.moveTo(lastPt.x, lastPt.y);
          ctx.lineTo(endpoint.x, endpoint.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Snap-to-wall indicator: when drawing a door/window, show a green dot
          // if the cursor is near an existing wall segment
          if (wallType !== 'wall') {
            const snapThreshold = 14 / mapControls.zoom;
            const cursorHit = findWallAtPoint(endpoint.x, endpoint.y, snapThreshold);
            if (cursorHit) {
              ctx.fillStyle = 'rgba(74, 222, 128, 0.9)';
              ctx.beginPath();
              ctx.arc(cursorHit.point.x, cursorHit.point.y, 5 / mapControls.zoom, 0, Math.PI * 2);
              ctx.fill();
              // Also highlight the starting point if it's on the same wall
              const startHit = findWallAtPoint(lastPt.x, lastPt.y, snapThreshold);
              if (startHit && startHit.seg.id === cursorHit.seg.id) {
                ctx.fillStyle = 'rgba(74, 222, 128, 0.9)';
                ctx.beginPath();
                ctx.arc(startHit.point.x, startHit.point.y, 5 / mapControls.zoom, 0, Math.PI * 2);
                ctx.fill();
                // Draw the replacement preview as a colored line
                ctx.strokeStyle = wallType === 'window' ? 'rgba(96, 165, 250, 0.7)' : 'rgba(167, 139, 250, 0.7)';
                ctx.lineWidth = 3 / mapControls.zoom;
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

    // Split mode: draw the preview dot at the split hover point
    if (renderIsDM && wallMode === 'wall-split' && splitHoverPoint) {
      ctx.save();
      ctx.fillStyle = 'rgba(253, 224, 71, 0.9)'; // yellow
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / mapControls.zoom;
      ctx.beginPath();
      ctx.arc(splitHoverPoint.x, splitHoverPoint.y, 5 / mapControls.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Erase mode: draw brush circle at hover position
    if (renderIsDM && wallMode === 'wall-erase' && hoverMapPxRef.current) {
      const mapPx = hoverMapPxRef.current;
      const r = WALL_ERASE_RADIUS / mapControls.zoom;
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.lineWidth = 1.5 / mapControls.zoom;
      ctx.setLineDash([3 / mapControls.zoom, 3 / mapControls.zoom]);
      ctx.beginPath();
      ctx.arc(mapPx.x, mapPx.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Erase mode: highlight walls marked for deletion
    if (renderIsDM && wallMode === 'wall-erase' && wallErasedIdsRef.current.size > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.lineWidth = 5 / mapControls.zoom;
      ctx.setLineDash([4 / mapControls.zoom, 3 / mapControls.zoom]);
      for (const seg of wallSegments) {
        if (wallErasedIdsRef.current.has(seg.id)) {
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Brush mode: stroke preview + cursor ─────────────────────────────────
    if (renderIsDM && wallMode === 'wall-brush') {
      const pts = wallBrushPointsRef.current;
      // Draw the painted stroke trail
      if (pts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.6)';
        ctx.lineWidth = brushSize;
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
      // Draw brush cursor circle at hover position
      if (hoverMapPxRef.current) {
        const mapPx = hoverMapPxRef.current;
        ctx.save();
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.7)';
        ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
        ctx.lineWidth = 1.5 / mapControls.zoom;
        ctx.setLineDash([3 / mapControls.zoom, 3 / mapControls.zoom]);
        ctx.beginPath();
        ctx.arc(mapPx.x, mapPx.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // ── Polygon in progress (DM wall-polygon mode) ─────────────────────────
    if (renderIsDM && wallMode === 'wall-polygon' && polygonPoints.length > 0) {
      ctx.save();

      // Draw placed edges (dashed amber)
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2 / mapControls.zoom;
      ctx.setLineDash([6 / mapControls.zoom, 3 / mapControls.zoom]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
      for (let i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw placed point dots (white)
      ctx.fillStyle = '#ffffff';
      for (const pt of polygonPoints) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / mapControls.zoom, 0, Math.PI * 2);
        ctx.fill();
      }

      // First point: green "close target" circle when 3+ points placed
      if (polygonPoints.length >= 3) {
        const first = polygonPoints[0];
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2 / mapControls.zoom;
        ctx.beginPath();
        ctx.arc(first.x, first.y, POLYGON_CLOSE_RADIUS / mapControls.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ghost line from last placed point to cursor
      if (hoverMapPxRef.current) {
        const last = polygonPoints[polygonPoints.length - 1];
        const endpoint = snapPoint(hoverMapPxRef.current);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 1.5 / mapControls.zoom;
        ctx.setLineDash([4 / mapControls.zoom, 4 / mapControls.zoom]);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(endpoint.x, endpoint.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    // ── Ruler overlay ────────────────────────────────────────────────────────
    if (showRuler && effectiveRulerOrigin && hoverCoords && currentMap) {
      const gs = currentMap.gridSize;
      const mh = currentMap.height;

      // Convert grid coords to world pixel coords (token-center convention)
      const x0 = effectiveRulerOrigin.x * gs + gs / 2;
      const y0 = (mh - 1 - effectiveRulerOrigin.y) * gs + gs / 2;
      const x1 = hoverCoords.x * gs + gs / 2;
      const y1 = (mh - 1 - hoverCoords.y) * gs + gs / 2;

      const dx = Math.abs(hoverCoords.x - effectiveRulerOrigin.x);
      const dy = Math.abs(hoverCoords.y - effectiveRulerOrigin.y);
      const squares = Math.max(dx, dy);
      const feet = calcGridDistance(
        dx, dy,
        currentMap.feetPerSquare ?? 5,
        (currentMap.diagonalRule ?? 'flat') as 'flat' | 'alternating'
      );

      const rulerLineColor = rulerColor === 'purple' ? 'rgba(168, 85, 247, 0.9)' : rulerColor === 'black' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(251, 191, 36, 0.9)';
      const rulerPillColor = rulerColor === 'black' ? 'rgba(255, 255, 255, 0.88)' : 'rgba(0, 0, 0, 0.65)';
      const rulerTextColor = rulerColor === 'purple' ? 'rgba(216, 180, 254, 1)' : rulerColor === 'black' ? 'rgba(0, 0, 0, 1)' : 'rgba(251, 220, 100, 1)';

      ctx.save();

      // Dashed line
      ctx.setLineDash([8 / mapControls.zoom, 4 / mapControls.zoom]);
      ctx.strokeStyle = rulerLineColor;
      ctx.lineWidth = 2 / mapControls.zoom;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // Dot at origin
      ctx.setLineDash([]);
      ctx.fillStyle = rulerLineColor;
      ctx.beginPath();
      ctx.arc(x0, y0, 5 / mapControls.zoom, 0, Math.PI * 2);
      ctx.fill();

      // Distance label near cursor
      if (feet > 0) {
        const label = `${feet} ft  (${squares} sq)`;
        const fontSize = Math.max(11, 13 / mapControls.zoom);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textBaseline = 'bottom';

        const pad = 4 / mapControls.zoom;
        const textW = ctx.measureText(label).width;
        const boxX = x1 + 10 / mapControls.zoom;
        const boxY = y1 - 4 / mapControls.zoom;

        // Background pill
        ctx.fillStyle = rulerPillColor;
        try {
          ctx.beginPath();
          ctx.roundRect(boxX - pad, boxY - fontSize - pad, textW + pad * 2, fontSize + pad * 2, 4 / mapControls.zoom);
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

    // ── AoE Shape Overlay ────────────────────────────────────────────────────
    if (showAoE && currentMap) {
      const gs = currentMap.gridSize;
      const fps = currentMap.feetPerSquare ?? 5;
      const mh = currentMap.height;

      const origin = aoeOrigin ?? hoverCoords;
      if (origin) {
        const ox = origin.x * gs + gs / 2;
        const oy = (mh - 1 - origin.y) * gs + gs / 2;

        let angle = 0;
        if (hoverCoords && aoeOrigin) {
          const mx = hoverCoords.x * gs + gs / 2;
          const my = (mh - 1 - hoverCoords.y) * gs + gs / 2;
          angle = Math.atan2(my - oy, mx - ox);
        }

        const sizeInPx = (aoeConfig.sizeFt / fps) * gs;
        const widthInPx = ((aoeConfig.widthFt ?? 5) / fps) * gs;

        ctx.save();
        ctx.fillStyle = 'rgba(147, 51, 234, 0.25)';
        ctx.strokeStyle = 'rgba(147, 51, 234, 0.8)';
        ctx.lineWidth = 2 / mapControls.zoom;

        ctx.beginPath();

        switch (aoeConfig.shape) {
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
        const label = aoeConfig.shape === 'line'
          ? `${aoeConfig.sizeFt} ft × ${aoeConfig.widthFt ?? 5} ft`
          : `${aoeConfig.sizeFt} ft`;
        const fontSize = Math.max(10, 12 / mapControls.zoom);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        const tw = ctx.measureText(label).width;
        const pad = 4 / mapControls.zoom;
        ctx.fillRect(ox - tw / 2 - pad, oy - fontSize * 2 - pad, tw + pad * 2, fontSize + pad * 2);
        ctx.fillStyle = 'rgba(216, 180, 254, 1)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, ox, oy - fontSize - 2 / mapControls.zoom);
        ctx.textAlign = 'start';

        ctx.restore();
      }
    }

    // Restore context state (back to screen-space)
    ctx.restore();

    // Draw fog brush cursor in screen-space (zoom-invariant)
    if (fogMode && hoverCoords) {
      const screenX = hoverCoords.x * mapControls.zoom * currentMap.gridSize + mapControls.panOffset.x;
      const screenY = (currentMap.height - 1 - hoverCoords.y) * mapControls.zoom * currentMap.gridSize + mapControls.panOffset.y;
      const screenRadius = brushRadius * mapControls.zoom;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to screen-space
      ctx.strokeStyle = fogMode === 'fog-reveal' ? 'rgba(163, 230, 53, 0.8)' : 'rgba(249, 115, 22, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }, [currentMap, mapImage, imageLoaded, showGrid, gridColor, mapControls.zoom, mapControls.panOffset, tokens, tokenImages, draggedToken, dragOffset, hoverCoords, hoverToken, animatingTokens, spiritLayerImage, spiritLayerOpacity, userRole, campaign?.spiritLayerEnabled, campaign?.spiritLayerStyle, dmViewBothPlanes, dmShowSpiritTokens, playerSpiritVisible, showRuler, rulerOrigin, rulerColor, effectiveRulerOrigin, showAoE, aoeConfig, aoeOrigin, fogState, revealedCells, wallSegments, fogMode, brushRadius, wallMode, wallInProgress, hoveredWallId, hoveredDoorId, snapToGrid, dmPreviewPlayerView, splitHoverPoint, selectedWallId, selectedEndpoint, polygonPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Render on every relevant state change
   */
  useEffect(() => {
    render();
  }, [render]);

  /**
   * Re-render when canvas size changes (window resize)
   */
  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      render();
    }
  }, [canvasSize, render]);

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
      render();
      return;
    }

    // Wall-brush mode: start painting
    if (wallMode === 'wall-brush' && isDM) {
      wallBrushActiveRef.current = true;
      const mapPx = screenToMapPx(screenX, screenY);
      const snapped = snapPoint(mapPx);
      wallBrushPointsRef.current = [{ x: snapped.x, y: snapped.y }];
      render();
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

    // Fog brush mode: begin painting on mousedown
    if (fogMode && isDM && fogState) {
      e.preventDefault(); // Prevent native drag — keeps mousemove firing during paint stroke
      const mapPx = screenToMapPx(screenX, screenY);
      const cells = getCellsUnderBrush(mapPx.x, mapPx.y, fogState);
      cells.forEach((c) => fogPendingCellsRef.current.add(c));
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
      const updatedTokens = tokens.map((t) =>
        t.id === draggedToken.id
          ? { ...t, position: { x: Math.floor(finalX), y: Math.floor(finalY) } }
          : t
      );
      updateTokens(updatedTokens);

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
      if (rightPanActiveRef.current) { mapControls.handleDrag(e); render(); return; }
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
        if (!wallDragEndpointRef.current.hasDragged) { render(); return; }
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
        render();
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
      render();
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
      render();
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
      render();
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
      render();
      return;
    }

    // Wall-polygon mode: handle right-pan; re-render for ghost line update
    if (wallMode === 'wall-polygon' && isDM) {
      if (rightPanActiveRef.current) mapControls.handleDrag(e);
      render();
      return;
    }

    // Wall-draw mode: just re-render for ghost line update (cursor moves)
    if (wallMode === 'wall-draw' && isDM) {
      if (rightPanActiveRef.current) mapControls.handleDrag(e);
      render();
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
        render();
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
        render();
      }
    }

    // Fog brush: collect cells while mouse button is held (e.buttons & 1 = left button)
    if (fogMode && isDM && fogState && (e.buttons & 1)) {
      const mapPx = screenToMapPx(screenX, screenY);
      const cells = getCellsUnderBrush(mapPx.x, mapPx.y, fogState);
      cells.forEach((c) => fogPendingCellsRef.current.add(c));
      render();
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

      // Trigger re-render for ghost image
      render();
    } else {
      // Handle map panning
      mapControls.handleDrag(e);

      // Update hover token
      const token = getTokenAtPosition(gridCoords.x, gridCoords.y);
      setHoverToken(token);

      // Trigger re-render if panning
      if (mapControls.isDragging) {
        render();
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
    // Flush fog brush immediately on mouse release
    if (fogMode && fogPendingCellsRef.current.size > 0) {
      flushFogBrush();
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
        render();
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
      render();
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
      updateTokens([...tokens, result.token]);
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

  /**
   * Animation loop for smooth token movement
   */
  useEffect(() => {
    if (animatingTokens.size === 0) return;

    let animationFrameId: number;

    const animate = () => {
      const now = Date.now();
      const updatedAnimations = new Map(animatingTokens);
      let needsUpdate = false;

      for (const [tokenId, animation] of updatedAnimations.entries()) {
        const elapsed = now - animation.startTime;
        if (elapsed >= animation.duration) {
          // Animation complete
          updatedAnimations.delete(tokenId);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        setAnimatingTokens(updatedAnimations);
      }

      // Trigger render for animation
      render();

      // Continue animation loop if there are still animating tokens
      if (updatedAnimations.size > 0) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [animatingTokens, render]);

  // ============================================
  // Fog Reveal Animation Loop
  // Decays per-cell reveal opacity over ~400ms and triggers re-renders
  // ============================================
  useEffect(() => {
    if (revealOpacityRef.current.size === 0) return;

    let animationFrameId: number;

    const animateFog = () => {
      let hasActive = false;
      revealOpacityRef.current.forEach((opacity, idx) => {
        const next = opacity - 0.042; // ~400ms to fully fade at 60fps
        if (next <= 0) {
          revealOpacityRef.current.delete(idx);
        } else {
          revealOpacityRef.current.set(idx, next);
          hasActive = true;
        }
      });

      render();

      if (hasActive) {
        animationFrameId = requestAnimationFrame(animateFog);
      }
    };

    animationFrameId = requestAnimationFrame(animateFog);
    return () => { cancelAnimationFrame(animationFrameId); };
  }, [fogState, revealedCells, render]); // re-subscribe when fog changes

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
      {/* Canvas — vibe CSS filter applied directly so it affects the rendered map */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className={
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
        }
        style={{
          filter: activeVibeEffect?.filter ?? undefined,
          transition: 'filter 3s ease',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />

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
        <button
          onClick={mapControls.zoomOut}
          disabled={mapControls.zoom <= mapControls.minZoom}
          className="btn-secondary p-2"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom Level Display */}
        <span className="text-xs text-stone-gray font-mono min-w-[4rem] text-center">
          {Math.round(mapControls.zoom * 100)}%
        </span>

        {/* Zoom In */}
        <button
          onClick={mapControls.zoomIn}
          disabled={mapControls.zoom >= mapControls.maxZoom}
          className="btn-secondary p-2"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-moss-green/20" />

        {/* Reset View — fit and center the map in the canvas */}
        <button
          onClick={() => mapControls.fitToScreen(canvasSize.width, canvasSize.height)}
          className="btn-secondary p-2"
          title="Fit to Screen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Toggle Grid */}
        <button
          onClick={() => setShowGrid((prev) => !prev)}
          className={`btn-secondary p-2 ${showGrid ? 'bg-moss-green/20' : ''}`}
          title="Toggle Grid"
        >
          <Grid3x3 className="w-4 h-4" />
        </button>

        {/* Grid Color Toggle (only show if grid is enabled) */}
        {showGrid && (
          <button
            onClick={() => setGridColor((prev) => (prev === 'black' ? 'white' : 'black'))}
            className="btn-secondary p-2"
            title={`Grid Color: ${gridColor === 'black' ? 'Black' : 'White'}`}
          >
            <Palette className="w-4 h-4" />
          </button>
        )}

        {/* Toggle Ruler */}
        {currentMap && (
          <>
            <div className="w-px h-6 bg-moss-green/20" />
            <button
              onClick={handleToggleRuler}
              className={`btn-secondary p-2 ${showRuler ? 'bg-moss-green/20' : ''}`}
              title="Ruler — measure distance"
            >
              <Ruler className={`w-4 h-4 ${showRuler ? 'text-moss-green' : ''}`} />
            </button>
            {showRuler && (
              <button
                onClick={() => setRulerColor((prev) => prev === 'amber' ? 'purple' : prev === 'purple' ? 'black' : 'amber')}
                className="btn-secondary p-2"
                title={`Ruler color: ${rulerColor === 'amber' ? 'Amber' : rulerColor === 'purple' ? 'Purple' : 'Black'}`}
              >
                <Palette className={`w-4 h-4 ${rulerColor === 'purple' ? 'text-spirit-purple' : rulerColor === 'black' ? 'text-stone-gray' : 'text-warm-amber'}`} />
              </button>
            )}

            {/* Toggle AoE tool */}
            <button
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
              className={`btn-secondary p-2 ${showAoE ? 'bg-moss-green/20' : ''}`}
              title="AoE Shape — area of effect overlay"
            >
              <Zap className={`w-4 h-4 ${showAoE ? 'text-moss-green' : ''}`} />
            </button>
          </>
        )}

        {/* DM-only: toggle spirit layer token visibility */}
        {userRole === 'DM' && (
          <>
            <div className="w-px h-6 bg-moss-green/20" />
            <button
              onClick={() => setDmShowSpiritTokens((prev) => !prev)}
              className={`btn-secondary p-2 ${dmShowSpiritTokens ? 'bg-spirit-purple/15' : ''}`}
              title={dmShowSpiritTokens ? 'Hiding spirit tokens (click to show)' : 'Spirit tokens hidden — click to show'}
            >
              <Ghost className={`w-4 h-4 ${dmShowSpiritTokens ? 'text-spirit-purple' : 'text-stone-gray/40'}`} />
            </button>
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
            brushRadius={brushRadius}
            onBrushRadiusChange={setBrushRadius}
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
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                : 'bg-stone-800/90 text-stone-300 border-stone-600/50 hover:bg-stone-700/90'
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
          <p className="text-xs font-semibold text-moss-green">AoE Shape</p>

          {/* Shape selector */}
          <div className="flex flex-wrap gap-1.5">
            {(['sphere', 'cone', 'line', 'cube'] as AoEShape[]).map((shape) => (
              <button
                key={shape}
                onClick={() => setAoEConfig((prev) => ({ ...prev, shape }))}
                className={`text-xs px-2 py-1 rounded border transition-colors capitalize ${
                  aoeConfig.shape === shape
                    ? 'bg-moss-green/20 border-moss-green/60 text-moss-green font-medium'
                    : 'border-stone-gray/30 text-stone-gray hover:border-moss-green/40 hover:text-moss-green'
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
                  className="text-xs px-1.5 py-0.5 rounded bg-moss-green/10 hover:bg-moss-green/20 text-moss-green border border-moss-green/20 transition-colors"
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
              className="text-xs text-stone-gray hover:text-red-500 transition-colors"
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
            <span className="text-xs text-moss-green font-semibold">
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
            <p className="text-sm text-red-600 mb-2">{imageError}</p>
            <p className="text-xs text-stone-gray">Check map image URL</p>
          </div>
        </div>
      )}

      {/* No Map State */}
      {!currentMap && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Grid3x3 className="w-12 h-12 text-moss-green/30 mx-auto mb-3" />
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
                  className="w-full px-4 py-2 text-left text-sm text-moss-green font-medium hover:bg-moss-green/10 transition-colors"
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
                    updateTokens([...tokens, result.token]);
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
                      updateTokens(tokens.map((t) => t.id === token.id ? { ...t, visible: !token.visible } : t));
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
                        updateTokens(tokens.map((t) => t.id === token.id ? { ...t, layer: TokenLayer.SPIRIT } : t));
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
                    className="w-full px-4 py-2 text-left text-sm text-moss-green hover:bg-moss-green/10 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      if (!campaign?.id || !currentMap?.id) return;
                      setIsMovingTokenLayer(true);
                      const token = contextMenu.token;
                      setContextMenu(null);
                      try {
                        await api.updateToken(campaign.id, currentMap.id, token.id, { layer: TokenLayer.TOKEN });
                        updateTokens(tokens.map((t) => t.id === token.id ? { ...t, layer: TokenLayer.TOKEN } : t));
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
                                  updateTokens(tokens.filter((t) => t.id !== token.id));
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
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-500/10 transition-colors"
                onClick={async () => {
                  if (!campaign?.id || !currentMap?.id) return;
                  const token = contextMenu.token;
                  setContextMenu(null);
                  try {
                    await api.deleteToken(campaign.id, currentMap.id, token.id);
                    updateTokens(tokens.filter((t) => t.id !== token.id));
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
              className="w-full px-4 py-2 text-left text-sm text-moss-green hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-open')}
            >
              Open Door
            </button>
          )}

          {/* Close — available when door is open */}
          {doorContextMenu.door.type === 'door-open' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-moss-green hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-closed')}
            >
              Close Door
            </button>
          )}

          {/* Lock — DM only, available when door is open or closed */}
          {isDM && doorContextMenu.door.type !== 'door-locked' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-locked')}
            >
              Lock Door
            </button>
          )}

          {/* Unlock — DM only, available when door is locked */}
          {isDM && doorContextMenu.door.type === 'door-locked' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-moss-green hover:bg-moss-green/10 transition-colors"
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

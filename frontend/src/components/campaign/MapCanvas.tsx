// ============================================
// Map Canvas Component
// HTML Canvas-based map viewer with zoom/pan controls
// ============================================

import { useEffect, useEffectEvent, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Palette, Ghost, Ruler, Zap } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { canRollAsCharacter } from '@/services/permissions';
import { useTableRoll } from '@/hooks/useTableRoll';
import { useGameStore, useTokenList, useCurrentTurnTokenId, useMapPeekTokenId, useTokenInitiative, useCharacterHp } from '@/stores/gameStore';
import { useMapControls } from '@/hooks/useMapControls';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type {
  Token,
  TokenMoveStartEvent,
  TokenMoveEvent,
  TokenMoveEndEvent,
  TokenMovedEvent,
  CampaignMap,
  SpiritLayerToggledBroadcast,
  SpiritLayerTokenToggledBroadcast,
  VibeUpdatedBroadcast,
  Character,
  MapPingedBroadcast,
} from '@/types';
import { GameSystem, TokenLayer, TokenType } from '@/types';
import type { WallSegment, FogState, WallType, LightSource } from '@/types/walls';
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
  drawWallSelection,
  drawFogSelection,
  drawPings,
  PING_DURATION_MS,
  type ActivePing,
  type AoEShape,
  type Viewport,
} from './map/layers';
import { createVisionCache } from './map/vision';
import { pickTokenAt, pickMovableTokenAt, blockingTokensAt, visibleTokenHp } from './map/tokenHitTest';
import { cachedTokenImage, placeholderColor } from './map/layers/drawTokens';
import { revealedSetFromFogState } from './map/fogSelection';
import { exploredCellsFromCoverage, diffNew } from './map/exploration';
import { useFogTool } from './map/tools/useFogTool';
import { useLightTool } from './map/tools/useLightTool';
import { useMeasureTools } from './map/tools/useMeasureTools';
import { useDoorTool } from './map/tools/useDoorTool';
import { useWallTool } from './map/tools/useWallTool';
import type { MapTool, PointerAt } from './map/tools/types';
import {
  previewOwnFor, previewControlsFor, previewMemoryUser, previewOptions, defaultPreviewSelection, reconcilePreviewSelection, previewPlane,
  encodePreviewSelection, decodePreviewSelection, type PreviewSelection,
  previewTokens,
} from './map/previewSelection';
import { useExploredMemory } from './map/useExploredMemory';
import { useFogStateRequest } from './map/useFogStateRequest';
import { useWallLightRequest } from './map/useWallLightRequest';
import { releaseHeldToken } from './map/tokenHold';
import type { DoorViewer } from './map/doorAccess';
import { fogCellIndex, gridXToFogCol, gridYToFogRow } from './map/coords';
import { isTypingInto } from './map/typingTarget';
import { createOwnEdits } from './map/ownEdits';
import mapService from '@/services/map.service';
import { isHexColor, isSafeVibeFilter, parseSpiritStyle } from '@/utils/styleAllowlists';
import { isSeen, type Viewer, type Lit, type InsideFn } from '@/utils/visibilityRule';
import { isPointVisible } from '@/utils/raycasting';

/** A player's revealed set before the server has answered: nothing revealed. */
const EMPTY_REVEALED: ReadonlySet<number> & Set<number> = new Set<number>();
import { useTokenAnimation, useFogRevealAnimation, useCanvasTicker, pulsePhaseAt } from './map/useMapAnimations';
import { playerColor } from '@/utils/playerColor';
import { characterTokenRequest, readCharacterTokenDrag } from '@/utils/characterTokenDrag';
import { controlsToken } from '@/utils/tokenOwnership';
import { dmTokenControls } from '@/utils/dmTokenMenu';
import { tokenCopyRequest, clampTokenPosition, copyController } from '@/utils/tokenCopy';
import { apiErrorMessage, errorSummary } from '@/utils/errors';
import { useRenderLoop, type MapLayer } from './map/useRenderLoop';
import api from '@/services/api';
import CharacterSheetViewerModal from '@/components/character/CharacterSheetViewerModal';
import CharacterRollPicker from '@/components/campaign/CharacterRollPicker';
import NpcRollPicker from '@/components/campaign/NpcRollPicker';
import RemoveTokenDialog from '@/components/campaign/RemoveTokenDialog';
import { tokenDisplayName, tokenPublicName, characterRollPublicName } from '@/utils/tokenDisplayName';
import { setTokenFlag } from '@/utils/tokenFlags';
import AtmosphereOverlay from '@/components/campaign/AtmosphereOverlay';
import DmFogControls, { type FogToolMode } from '@/components/campaign/DmFogControls';
import DmWallControls, { type WallToolMode } from '@/components/campaign/DmWallControls';
import DmLightControls, { type LightToolMode } from '@/components/campaign/DmLightControls';
import DmToolPanelContainer from '@/components/campaign/DmToolPanelContainer';
import { useWallHistory } from '@/hooks/useWallHistory';
import Toast, { useToast } from '@/components/Toast';
import Button from '@/components/ui/Button';
import '@/styles/spirit-effects.css';
import { mapImageState } from './map/mapImageState';
import { useTokenImages } from './map/useTokenImages';

/** Returns the accent color for the spirit layer style string. Used for spirit token ring. */
function getSpiritAccentColor(style: string | null | undefined): string {
  const { effect, customColor } = parseSpiritStyle(style);
  if (customColor) return customColor;
  if (effect === 'ethereal') return '#c8deff';
  if (effect === 'shadow') return '#9b6dcc';
  if (effect === 'dream') return '#d4a0f0';
  return '#9370DB'; // wispy default = spirit-purple
}

/** The DM's editing tool, from the wall, fog or light panel. */
type DmTool =
  | { kind: 'wall'; mode: NonNullable<WallToolMode> }
  | { kind: 'fog'; mode: NonNullable<FogToolMode> }
  | { kind: 'light'; mode: NonNullable<LightToolMode> };

interface MapCanvasProps {
  onEditToken?: (token: Token) => void;
}

export default function MapCanvas({ onEditToken }: MapCanvasProps) {
  const { currentMap, setCurrentMap, userRole, campaign, updateCampaignSpiritLayer, dmViewBothPlanes, playerSpiritVisible, setPlayerSpiritVisible, activeVibeEffect, updateVibe, activeAtmosphereEffect } = useCampaign();
  const characterHpCache = useCharacterHp();
  // Live token state comes from the game store, not the campaign context —
  // socket handlers write there directly (outside React), and this
  // subscription is what re-renders the canvas per token change.
  const tokens = useTokenList();
  const heldAt = useGameStore((s) => s.heldAt);
  // Whose turn it is, for the active-combatant ring. Narrow selector: this
  // changes on turn advance only, not when a combatant's HP ticks.
  const currentTurnTokenId = useCurrentTurnTokenId();
  // Token being pointed at from the initiative tracker. Null while the map is
  // the one pointing — the blue hover outline already marks that case.
  const peekTokenId = useMapPeekTokenId();
  const prefersReducedMotion = useReducedMotion();
  // joinedEpoch is 0 until this connection has authenticated into the campaign,
  // and a new number after each rejoin. Anything that asks the server for map
  // state watches it, because a request sent before the campaign is joined is
  // dropped unanswered.
  const { socket, joinedEpoch } = useWebSocket();
  const tableRoll = useTableRoll(socket);
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
  // Lazily-created AudioContext for spirit layer transition sound, closed
  // with the map so a map opened again does not leave the old one running.
  const audioCtxRef = useRef<AudioContext | null>(null);
  useEffect(() => () => {
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  // State
  const [showGrid, setShowGrid] = useState(true);
  const [gridColor, setGridColor] = useState<'black' | 'white'>('black');
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageState = mapImageState(currentMap, imageLoaded, imageError);

  // Spirit layer image
  const [spiritLayerImage, setSpiritLayerImage] = useState<HTMLImageElement | null>(null);
  // Fade-in transition state for spirit layer toggle
  const [spiritLayerOpacity, setSpiritLayerOpacity] = useState(1);

  // Token state
  // Token pictures by token id, as they load (map/useTokenImages.ts).
  const tokenImages = useTokenImages(tokens);
  const [draggedToken, setDraggedToken] = useState<Token | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [hoverToken, setHoverToken] = useState<Token | null>(null);
  /** Initiative of the token being pointed at — for the details panel. */
  const hoverInitiative = useTokenInitiative(hoverToken?.id ?? null);

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
  // The token whose Remove from Map is waiting for confirmation.
  const [removingToken, setRemovingToken] = useState<Token | null>(null);
  const [isMoveToMapLoading, setIsMoveToMapLoading] = useState(false);

  // Character sheet viewer state
  // The sheet opened from a token's menu, with the token it was opened from.
  const [viewingSheet, setViewingSheet] = useState<{ character: Character; tokenId: string } | null>(null);

  // Roll picker (right-click token → Roll...). Carries the token as well as the
  // character because initiative belongs to the token on the map, not to the
  // sheet — the same character could be represented by more than one token.
  const [rollPicker, setRollPicker] = useState<
    { characterId: string; tokenId: string; canRollInitiative: boolean; x: number; y: number } | null
  >(null);
  const [npcRollPicker, setNpcRollPicker] = useState<{ tokenId: string; x: number; y: number } | null>(null);

  // DM-only: toggle whether spirit-layer tokens are drawn on canvas
  const [dmShowSpiritTokens, setDmShowSpiritTokens] = useState(true);

  // Latest-ref to the per-layer draw dispatcher — assigned right after the
  // draw callbacks are defined below. The render loop and the animation hooks
  // call the newest closure through it.
  const drawLayerRef = useRef<(layer: MapLayer) => void>(() => {});
  const { markDirty } = useRenderLoop(drawLayerRef);

  // The ruler and the AoE template (map/tools/useMeasureTools.ts).
  const {
    tool: measuring, track: trackMeasure,
    showRuler, showAoE, handleToggleRuler, handleToggleAoE, putRulerAway,
    rulerOrigin, rulerColor, setRulerColor,
    aoeConfig, setAoEConfig, aoeAnchor, setAoEAnchor, aoeAltHeldRef, aoeAimRef,
  } = useMeasureTools({ isDM, markDirty });

  // Walls & Fog of War state — wall segments use undo/redo history hook
  const { walls: wallSegments, push: pushWallHistory, replace: replaceWallHistory, reset: resetWallHistory, carry: carryWallHistory, undo: undoWalls, redo: redoWalls, canUndo: canUndoWalls, canRedo: canRedoWalls } = useWallHistory([]);
  // Every wall and light edit this page sends carries an id, so the server's
  // echo of it can be told from anyone else's change (map/ownEdits.ts).
  const [ownEdits] = useState(() => createOwnEdits());
  const [fogState, setFogState] = useState<FogState | null>(null);
  // Player view: list of revealed fog cell indices (derived from server fog:cells event).
  // null = fog data not received yet (show everything); Set = fog active (show only revealed cells).
  const [revealedCells, setRevealedCells] = useState<Set<number> | null>(null);
  // Fog reveal animation: per-cell opacity (1 = just revealed, 0 = fully faded in)
  // Fog reveal fade. The DM's fog is drawn on the terrain layer and anyone
  // else's, a preview included, on the overlay, so each frame repaints that.
  const revealOpacityRef = useFogRevealAnimation(
    () => markDirty(isDM && !previewing ? 'terrain' : 'overlay'),
    fogState,
    revealedCells
  );

  // Tokens this viewer controls, by the server's definition (utils/tokenOwnership.ts).
  const isOwnToken = useCallback((t: Token): boolean => controlsToken(t, user?.id, userRole), [user?.id, userRole]);

  // Whether manual fog applies on this map. Absent on an older payload means
  // on, matching the column default. When fog is on and the player's revealed
  // set has not arrived yet, everything is fogged: over-fogging for a moment
  // beats flashing the whole map before the server answers. When fog is off,
  // every consumer sees `null`, which has always meant "no fog".
  const fogEnabled = currentMap?.fogEnabled ?? true;
  const effectiveRevealedCells = useMemo<Set<number> | null>(
    () => (fogEnabled ? revealedCells ?? EMPTY_REVEALED : null),
    [fogEnabled, revealedCells]
  );
  const effectiveFogState = fogEnabled ? fogState : null;

  // The DM's editing tool: one wall, fog or light mode at a time. Each
  // setter below sets its own kind, or clears the tool only when it is of its
  // kind, so putting one panel's tool away leaves another panel's alone.
  const [dmTool, setDmTool] = useState<DmTool | null>(null);
  const wallMode: WallToolMode = dmTool?.kind === 'wall' ? dmTool.mode : null;
  const fogMode: FogToolMode = dmTool?.kind === 'fog' ? dmTool.mode : null;
  const lightMode: LightToolMode = dmTool?.kind === 'light' ? dmTool.mode : null;
  const setWallMode = useCallback((mode: WallToolMode) => {
    setDmTool((prev) => (mode ? { kind: 'wall', mode } : prev?.kind === 'wall' ? null : prev));
  }, []);
  const setFogMode = useCallback((mode: FogToolMode) => {
    setDmTool((prev) => (mode ? { kind: 'fog', mode } : prev?.kind === 'fog' ? null : prev));
  }, []);
  const setLightMode = useCallback((mode: LightToolMode) => {
    setDmTool((prev) => (mode ? { kind: 'light', mode } : prev?.kind === 'light' ? null : prev));
  }, []);

  // The fog boxes (map/tools/useFogTool.ts).
  const { tool: fogTool, fogDragAnchorRef, fogDragCurrent, cancelFogDrag } = useFogTool({
    isDM, mapId: currentMap?.id, fogMode, fogState, setFogState, socket, markDirty,
  });

  // Right-mouse button panning while a DM tool is active (left-click is reserved for tools)
  const rightPanActiveRef = useRef(false);
  const { toast, showToast, hideToast } = useToast();
  /** DM "Preview player view" toggle — when true, DM sees lighting as players do. */
  const [dmPreviewPlayerView, setDmPreviewPlayerView] = useState(false);
  const [previewSelection, setPreviewSelection] = useState<PreviewSelection | null>(null);

  // Player Preview: the DM's canvas drawn through chosen eyes, a player's, one
  // token's, or the whole party's. Those tokens supply the vision, the fog
  // comes from the grid the DM already holds, and the same visibility rule
  // decides what is drawn.
  const previewing = isDM && dmPreviewPlayerView && previewSelection !== null;
  // The plane the previewed viewer is on, by the server's rule: a player whose
  // token has crossed to the spirit layer is sent that plane and sees through
  // that token, so the preview draws the spirit realm as their screen does.
  const previewedPlane = useMemo(
    () => previewPlane(previewSelection, tokens, campaign?.spiritLayerEnabled ?? false),
    [previewSelection, tokens, campaign?.spiritLayerEnabled]
  );
  const previewOwn = useMemo(() => previewOwnFor(previewSelection, previewedPlane), [previewSelection, previewedPlane]);
  // Whose tokens the preview shows whole; differs from sight only for the party.
  const previewControls = useMemo(() => previewControlsFor(previewSelection), [previewSelection]);
  const viewerOwn = previewing ? previewOwn : isOwnToken;
  const previewChoices = useMemo(
    () => previewOptions(campaign?.memberships ?? [], tokens),
    [campaign?.memberships, tokens]
  );
  // A token preview whose token left the map (a switch, a deletion) falls
  // back to the default choice, so the preview never runs with no viewer.
  useEffect(() => {
    if (!previewSelection) return;
    const kept = reconcilePreviewSelection(previewSelection, campaign?.memberships ?? [], tokens);
    if (kept !== previewSelection) setPreviewSelection(kept);
  }, [previewSelection, campaign?.memberships, tokens]);
  const previewRevealed = useMemo<Set<number> | null>(
    () => (previewing && fogEnabled ? revealedSetFromFogState(fogState) : null),
    [previewing, fogEnabled, fogState]
  );
  const viewerRevealed = previewing ? previewRevealed : effectiveRevealedCells;

  // The cells the viewer's own tokens stand on, by the same rule the token
  // layer and hit testing use to decide which cell a token is in. Player fog
  // on the overlay leaves these clear, so you can always see where you stand.
  const ownTokenCells = useMemo<Set<number>>(() => {
    const cells = new Set<number>();
    if (!currentMap || !viewerRevealed) return cells;
    for (const t of tokens) {
      if (!viewerOwn(t)) continue;
      const fogRow = gridYToFogRow(t.position.y, t.size.height, currentMap.height);
      const fogCol = gridXToFogCol(t.position.x, t.size.width);
      cells.add(fogCellIndex(fogCol, fogRow, { fogCols: currentMap.width }));
    }
    return cells;
  }, [currentMap, viewerRevealed, tokens, viewerOwn]);

  // Light source state
  const [lightSources, setLightSources] = useState<LightSource[]>([]);
  const lightSourcesRef = useRef<LightSource[]>([]);
  useEffect(() => { lightSourcesRef.current = lightSources; }, [lightSources]);

  // Always-current wall segments ref — socket handlers registered with [socket, currentMap?.id]
  // deps would otherwise close over stale wallSegments from registration time.
  const wallSegmentsRef = useRef<WallSegment[]>([]);
  useEffect(() => { wallSegmentsRef.current = wallSegments; }, [wallSegments]);

  // Cached offscreen canvas for dynamic lighting compositing.
  // Recreated only when map dimensions change; prevents ~5MB alloc per render frame.
  const lightingOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const lightCoverageOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  // Light coverage is built here first so it can be intersected with the
  // viewer's line of sight before joining the coverage mask.
  const lightOnlyOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  // Explored memory pass: two screen-sized scratch canvases, allocated on first use.
  const memoryMaskOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const memoryOffscreenRef = useRef<HTMLCanvasElement | null>(null);

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

  // The light tools (map/tools/useLightTool.ts).
  const {
    tool: lightTool,
    selectedLightId, setSelectedLightId,
    lightPlacementDefaults, setLightPlacementDefaults,
    draggingLightRef,
  } = useLightTool({
    isDM, previewing, mapId: currentMap?.id, lightMode, setLightMode, lightSources, setLightSources, lightSourcesRef,
    socket, ownEdits, mapControls, rightPanActiveRef, markDirty,
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

  // Put a held token back where it was picked up. The per-frame moves told
  // every other client where the cursor went; without this release they keep
  // showing the last cursor position until the token next moves.
  const cancelHold = () => {
    if (draggedToken && currentMap && canEmit()) {
      socket!.emitTokenMove(releaseHeldToken(draggedToken, heldOnMapRef.current ?? currentMap.id));
    }
    setDraggedToken(null);
    setDragOffset(null);
  };
  // The map a held token was picked up on, which is where it goes back to if
  // the map changes while it is held.
  const heldOnMapRef = useRef<string | null>(null);
  const releaseHoldOnMapSwitch = useEffectEvent(() => {
    if (draggedToken) cancelHold();
  });
  useEffect(() => {
    releaseHoldOnMapSwitch();
  }, [currentMap?.id]);

  // The wall tools, with the wall selection (map/tools/useWallTool.ts).
  const {
    tool: wallTool, selectKey: wallSelectKey, undoKey: wallUndoKey, redoKey: wallRedoKey, panel: wallPanel,
    wallType, wallColor, snapToGrid, brushSize, snapPoint, findWallAtPoint,
    wallInProgress, polygonPoints, splitHoverPoint, hoveredWallId, nearEndpoint,
    wallErasedIdsRef, wallBrushPointsRef, WALL_ERASE_RADIUS, POLYGON_CLOSE_RADIUS,
    selectedWallIds, setSelectedWallIds, wallMarquee, wallDragEndpointRef, selectedEndpoint,
    carryIntoDrags,
  } = useWallTool({
    isDM, currentMap, wallMode, setWallMode, wallSegments,
    pushWallHistory, replaceWallHistory, undoWalls, redoWalls, canUndoWalls, canRedoWalls,
    socket, ownEdits, mapControls, rightPanActiveRef, mapImage, markDirty,
  });

  // Player's own token on the current map — used as ruler origin for non-DM users
  const myToken = useMemo(() => {
    if (isDM || !tokens || !user) return null;
    return tokens.find((t) => controlsToken(t, user.id, userRole)) ?? null;
  }, [tokens, user, isDM, userRole]);

  // Effective ruler origin: players use their token position, DM uses clicked point
  const effectiveRulerOrigin = isDM ? rulerOrigin : (myToken ? myToken.position : null);


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
    // Users can use the Reset View button to fit again.
    // TODO(play): a picture that loads while the canvas still measures 0x0
    // never fits, since the size is not a dependency; lastFittedMapIdRef
    // already limits the fit to once per map, so the size can be added.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapControls is a new object each render; lastFittedMapIdRef keeps the fit to once per map
  }, [imageLoaded, currentMap?.id]);

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
      // Glide from where it is drawn, which is where it is held while someone
      // carries it.
      const from = store.heldAt[event.tokenId] ?? token.position;

      // Start animation from current position to new position
      setAnimatingTokens((prev) => {
        const newMap = new Map(prev);
        newMap.set(event.tokenId, {
          fromX: from.x,
          fromY: from.y,
          toX: event.x,
          toY: event.y,
          startTime: Date.now(),
          duration: 200,
        });
        return newMap;
      });

      // Store writes are synchronous — subsequent handlers in the same
      // macro-task (e.g. token:appeared for NPCs) see the correct state. A
      // drag frame only moves where the token is drawn; sight, lighting and
      // explored memory follow it when it is put down.
      store.receiveTokenMove(event.tokenId, { x: event.x, y: event.y }, event.dragging === true);
    };

    // Listen for token moved events.
    //
    // Subscribe through the client rather than the raw io instance: the client
    // keeps a registry and re-attaches on reconnect. Binding to `getSocket()`
    // directly meant this listener died with the socket it was attached to,
    // and since `socket` here is the stable singleton the effect never re-ran
    // to rebind — so remote token movement silently stopped arriving after any
    // reconnect until the page was reloaded.
    socket.onTokenMoved(handleTokenMoved);

    // Cleanup listener on unmount
    return () => {
      socket.off('token.moved', handleTokenMoved);
    };
  }, [socket, setAnimatingTokens]); // handler reads/writes via the store

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per map switch; the spirit flag is only read then
  }, [currentMap?.id]);

  // Listen for map.changed events broadcast by the DM.
  //
  // Through the client, never the raw socket: the client rebuilds its socket
  // on a manual reconnect and re-attaches only what was registered with it.
  // Bound to `getSocket()` this listener died with the first socket, so after
  // the browser came back online a player never received another map change,
  // and with it the DM's Hide or Obscure.
  //
  // The handler is registered once, so it reads the role and the campaign's
  // spirit flag through refs: either can change without a reload, as in a DM
  // handover, and a former DM kept skipping the spirit-realm update below
  // while a new DM heard the crossing sound.
  const userRoleRef = useRef(userRole);
  userRoleRef.current = userRole;
  const spiritLayerEnabledRef = useRef(campaign?.spiritLayerEnabled);
  spiritLayerEnabledRef.current = campaign?.spiritLayerEnabled;
  useEffect(() => {
    if (!socket) return;

    const handleMapChanged = ({ mapData, spiritVisible: sv }: { mapId: string; mapData: CampaignMap; spiritVisible?: boolean }) => {
      setCurrentMap(mapData);
      useGameStore.getState().setTokens(mapData.tokens || []);

      // For non-DMs: track whether this player is personally in the spirit realm.
      // Play the ethereal audio cue if they are crossing in or out.
      if (userRoleRef.current !== 'DM' && sv !== undefined) {
        const prev = prevPlayerSpiritVisibleRef.current;
        if (sv !== prev) {
          prevPlayerSpiritVisibleRef.current = sv;
          setPlayerSpiritVisible(sv);
          // Only play for individual crossings that aren't covered by the global toggle handler
          // (global toggle already plays via handleSpiritLayerToggled)
          if (!spiritLayerEnabledRef.current) {
            playEtherealTransition(sv);
          }
        }
      }
    };

    socket.onMapChanged(handleMapChanged);
    return () => {
      socket.off('map.changed', handleMapChanged);
    };
  }, [socket, setCurrentMap, setPlayerSpiritVisible, playEtherealTransition]);

  // ============================================
  // Spirit Layer WebSocket Listeners
  // ============================================

  useEffect(() => {
    if (!socket) return;

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

    // Through the client's own table, so these survive a rebuilt socket.
    socket.onSpiritLayerToggled(handleSpiritLayerToggled);
    socket.onSpiritLayerTokenToggled(handleSpiritTokenToggled);
    socket.onSpiritLayerStyleChanged(handleSpiritStyleChanged);

    return () => {
      socket.off('spirit_layer.toggled', handleSpiritLayerToggled);
      socket.off('spirit_layer.token.toggled', handleSpiritTokenToggled);
      socket.off('spirit_layer.style_changed', handleSpiritStyleChanged);
    };
  }, [socket, updateCampaignSpiritLayer, campaign?.spiritLayerEnabled, playEtherealTransition]);

  // ============================================
  // Vibe Tracker WebSocket Listener
  // ============================================

  useEffect(() => {
    if (!socket) return;

    const handleVibeUpdated = (data: VibeUpdatedBroadcast) => {
      updateVibe(data.period, data.hue, data.filter);
    };

    // Through the client's own table, so this survives a rebuilt socket.
    socket.onVibeUpdated(handleVibeUpdated);
    return () => {
      socket.off('vibe.updated', handleVibeUpdated);
    };
  }, [socket, updateVibe]);

  // ============================================
  // Load Walls & Fog on Map Change
  // ============================================
  useEffect(() => {
    // A fresh undo history per map: one carried over from the previous map
    // would undo the new map's walls into the old map's.
    if (!currentMap) {
      resetWallHistory([]);
      setFogState(null);
      setRevealedCells(null);
      return;
    }

    // Load wall segments and light sources from the map response (included in GET /maps/:id)
    resetWallHistory((currentMap.wallSegments as WallSegment[] | undefined) ?? []);
    setLightSources((currentMap.lights as LightSource[] | undefined) ?? []);

    // Drop the offscreen lighting canvases when the map changes
    lightingOffscreenRef.current = null;
    lightCoverageOffscreenRef.current = null;
    lightOnlyOffscreenRef.current = null;
    // A change to the same map's walls or lights arrives through the socket;
    // loading them here again would wipe the DM's undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per map switch
  }, [currentMap?.id]);

  // The stored walls and lights are asked for once the campaign is joined,
  // and again after each rejoin, so a change missed while disconnected
  // arrives. The answers carry no operation id and are applied like any
  // other change.
  useWallLightRequest(socket, currentMap?.id, joinedEpoch);

  // Fog state is requested whenever the map changes or fog is switched on for
  // it (DMs get the full grid, players their revealed cells), once the socket
  // can be answered and again after a reconnect. Off: nothing to ask for.
  useFogStateRequest(socket, currentMap?.id, fogEnabled, joinedEpoch);

  // Explored memory: the cells this viewer's vision has covered on this map,
  // as the server remembers them. Whose memory depends on whose eyes: a
  // player's own, or the player the DM is previewing as; the DM's own view
  // explores as nobody.
  const explorationEnabled = currentMap?.explorationEnabled ?? true;
  const exploringAs = previewing ? previewMemoryUser(previewSelection, tokens, campaign?.memberships ?? []) : (isDM ? null : user?.id ?? null);
  const { exploredCells, addExplored } = useExploredMemory(
    socket,
    currentMap?.id,
    explorationEnabled && (currentMap?.lightingEnabled ?? false),
    exploringAs,
    joinedEpoch
  );
  const exploredScratchRef = useRef<HTMLCanvasElement | null>(null);
  const lastExploredReportRef = useRef(0);
  // The remembered cells as a raster, one pixel per grid square, rebuilt only
  // when the set changes; the lighting layer scales it to the map.
  const exploredWidth = currentMap?.width;
  const exploredHeight = currentMap?.height;
  const exploredRaster = useMemo<HTMLCanvasElement | null>(() => {
    if (exploredWidth === undefined || exploredHeight === undefined || !exploredCells || exploredCells.size === 0) return null;
    const raster = document.createElement('canvas');
    raster.width = exploredWidth;
    raster.height = exploredHeight;
    const rctx = raster.getContext('2d');
    if (!rctx) return null;
    const img = rctx.createImageData(raster.width, raster.height);
    for (const idx of exploredCells) {
      if (idx >= 0 && idx < raster.width * raster.height) img.data[idx * 4 + 3] = 255;
    }
    rctx.putImageData(img, 0, 0);
    return raster;
  }, [exploredCells, exploredWidth, exploredHeight]);

  // ============================================
  // Wall & Fog WebSocket Listeners
  // ============================================
  // These listeners, and the pings' below, read only which map is open.
  const currentMapId = currentMap?.id;
  useEffect(() => {
    if (!socket) return;
    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    // Wall and light changes from the server. Each is applied unless it is
    // the echo of this page's own edit, which is drawn already: the DM's page
    // too, so a player's door toggle or a change made through the API reaches
    // it. They are carried into the whole undo history, so the DM's undo does
    // not put back what someone else changed. The role plays no part, so a
    // DM handover without a reload changes nothing here. A wall drag in
    // progress takes them too, so its drop does not put them back.
    const carryIncoming = (change: (walls: WallSegment[]) => WallSegment[]) => {
      carryWallHistory(change);
      carryIntoDrags(change);
    };
    const handleWallAdded = (data: { mapId: string; segment: WallSegment; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      carryIncoming((walls) => walls.some((s) => s.id === data.segment.id)
        ? walls.map((s) => s.id === data.segment.id ? data.segment : s)
        : [...walls, data.segment]);
    };

    const handleWallRemoved = (data: { mapId: string; segmentId: string; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      carryIncoming((walls) => walls.filter((s) => s.id !== data.segmentId));
    };

    const handleWallUpdated = (data: { mapId: string; segment: WallSegment; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      carryIncoming((walls) => walls.map((s) => s.id === data.segment.id ? data.segment : s));
    };

    const handleWallsReplaced = (data: { mapId: string; segments: WallSegment[]; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      // The full stored list, from another page, the API or walls:request.
      carryIncoming(() => data.segments);
    };

    const handleFogUpdated = (data: { mapId: string; fogState: FogState }) => {
      if (!currentMapId || data.mapId !== currentMapId) return;
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
      if (!currentMapId || data.mapId !== currentMapId) return;
      setRevealedCells((prev) => {
        const newSet = new Set<number>(data.revealedCells);
        // Animate newly revealed cells
        newSet.forEach((idx) => {
          if (!prev?.has(idx)) revealOpacityRef.current.set(idx, 1.0);
        });
        return newSet;
      });
    };

    // Dynamic lighting: token entered this player's view (or moved while
    // visible). Store writes are synchronous, so if token:appeared fires for
    // multiple tokens in the same macro-task (server re-sync after player
    // move), each call builds on the previous result.
    const handleTokenAppeared = (data: { token: Token; mapId: string }) => {
      if (!currentMapId || data.mapId !== currentMapId) return;
      useGameStore.getState().revealToken(data.token);
    };

    // Dynamic lighting: token left this player's view
    const handleTokenDisappeared = (data: { tokenId: string; mapId: string }) => {
      if (!currentMapId || data.mapId !== currentMapId) return;
      useGameStore.getState().removeToken(data.tokenId);
    };

    // Dynamic lighting toggle broadcast from DM
    // Every per-map flag arrives on one event, so a DM changing any of them
    // in Edit Map or a control panel reaches every client at once.
    // Only the flags change, on the map as it is now: spreading the map this
    // listener captured put back a picture or grid size edited since.
    const handleSettingsUpdated = (data: { mapId: string; lightingEnabled: boolean; fogEnabled: boolean; globalIllumination: boolean; explorationEnabled: boolean }) => {
      setCurrentMap((latest) => latest && latest.id === data.mapId
        ? {
          ...latest,
          lightingEnabled: data.lightingEnabled,
          fogEnabled: data.fogEnabled,
          globalIllumination: data.globalIllumination,
          explorationEnabled: data.explorationEnabled,
        }
        : latest);
    };

    socketInstance.on('token:appeared', handleTokenAppeared);
    socketInstance.on('token:disappeared', handleTokenDisappeared);
    socketInstance.on('map:settings:updated', handleSettingsUpdated);

    // Light source events, applied unless they echo this page's own edit,
    // as for walls above.
    const handleLightAdded = (data: { mapId: string; light: LightSource; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      setLightSources((prev) => prev.some((l) => l.id === data.light.id)
        ? prev.map((l) => l.id === data.light.id ? data.light : l)
        : [...prev, data.light]);
    };
    const handleLightRemoved = (data: { mapId: string; lightId: string; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      setLightSources((prev) => prev.filter((l) => l.id !== data.lightId));
    };
    const handleLightUpdated = (data: { mapId: string; light: LightSource; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      setLightSources((prev) => prev.map((l) => l.id === data.light.id ? data.light : l));
    };
    const handleLightsReplaced = (data: { mapId: string; lights: LightSource[]; opId?: string }) => {
      if (ownEdits.isOwn(data)) return;
      if (!currentMapId || data.mapId !== currentMapId) return;
      setLightSources(data.lights);
    };

    socketInstance.on('wall:added', handleWallAdded);
    socketInstance.on('wall:removed', handleWallRemoved);
    socketInstance.on('wall:updated', handleWallUpdated);
    socketInstance.on('walls:replaced', handleWallsReplaced);
    socketInstance.on('fog:updated', handleFogUpdated);
    socketInstance.on('fog:cells', handleFogCells);
    socketInstance.on('light:added', handleLightAdded);
    socketInstance.on('light:removed', handleLightRemoved);
    socketInstance.on('light:updated', handleLightUpdated);
    socketInstance.on('lights:replaced', handleLightsReplaced);

    return () => {
      socketInstance.off('token:appeared', handleTokenAppeared);
      socketInstance.off('token:disappeared', handleTokenDisappeared);
      socketInstance.off('map:settings:updated', handleSettingsUpdated);
      socketInstance.off('wall:added', handleWallAdded);
      socketInstance.off('wall:removed', handleWallRemoved);
      socketInstance.off('wall:updated', handleWallUpdated);
      socketInstance.off('walls:replaced', handleWallsReplaced);
      socketInstance.off('fog:updated', handleFogUpdated);
      socketInstance.off('fog:cells', handleFogCells);
      socketInstance.off('light:added', handleLightAdded);
      socketInstance.off('light:removed', handleLightRemoved);
      socketInstance.off('light:updated', handleLightUpdated);
      socketInstance.off('lights:replaced', handleLightsReplaced);
    };
  }, [socket, currentMapId, joinedEpoch, ownEdits, setCurrentMap, carryWallHistory, carryIntoDrags, revealOpacityRef]);

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
    if (!socket) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    const handlePinged = (data: MapPingedBroadcast) => {
      // Ignore pings for a map this client isn't looking at.
      if (!currentMapId || data.mapId !== currentMapId) return;

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

    // Through the client's table, not the socket.io instance: a rebuilt
    // socket after a reconnect gets the listener back only this way.
    socket.onMapPinged(handlePinged);
    return () => {
      socket.off('map.pinged', handlePinged);
      timers.forEach(clearTimeout);
    };
  }, [socket, currentMapId, resolvePingerName]);

  // Switching maps drops any pings still in flight on the old one.
  useEffect(() => {
    setPings([]);
  }, [currentMap?.id]);

  // ============================================
  // Keyboard: Escape, Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo)
  // ============================================
  // The listener is added once and reads the tools as they are at the key
  // press, so a tool chosen since is the one Escape asks.
  const onMapKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // A key typed into a text box, a note or a dialog is left to it: none
    // of the shortcuts below apply.
    if (isTypingInto(e.target) || isTypingInto(document.activeElement)) return;

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
      // A held token is put back first: it is the most transient thing.
      if (draggedToken) {
        cancelHold();
        return;
      }
      // Each press lets go of one thing, asking the tools in this order. The
      // measuring tools come last on purpose: the AoE template is not
      // mutually exclusive with the wall and light tools, so it can sit armed
      // while a wall is half-drawn. Esc has to cancel the more transient
      // thing first, or it would quietly close the template instead.
      for (const tool of [fogTool, wallTool, lightTool, measuring]) {
        if (tool.escape?.()) return;
      }
      return;
    }

    // Only handle undo/redo for DM with active map
    if (!isDM || !currentMap) return;

    const isCtrl = e.ctrlKey || e.metaKey;

    if (wallSelectKey(e)) return;

    if (isCtrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      wallUndoKey();
    } else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      wallRedoKey();
    }
  });
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => onMapKeyDown(e);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ============================================
  // Canvas Rendering
  // ============================================

  /**
   * The visibility rule's inputs for a set of viewer tokens on this map, from
   * the memoized raycasts. The token layer (what to draw in preview), the
   * lighting layer and the door filter all ask this, so they cannot disagree.
   */
  const ruleFor = useCallback((myTokens: readonly Token[], viewport: Viewport) => {
    const enabledLights = lightSources.filter((l) => l.enabled);
    const globalIllumination = currentMap?.globalIllumination ?? true;
    const vision = visionCacheRef.current.compute(myTokens, enabledLights, wallSegments, viewport, { globalIllumination });
    const viewers: Viewer[] = myTokens.map((t, i) => ({
      cx: vision.tokenSight[i].cx,
      cy: vision.tokenSight[i].cy,
      sight: vision.tokenSight[i].poly,
      darkvisionPx: (t.sightRadius ?? 0) * viewport.gridSize,
      selfPx: (Math.max(t.size.width, t.size.height) / 2) * viewport.gridSize,
    }));
    const lits: Lit[] = enabledLights.map((l, i) => ({
      cx: l.x,
      cy: l.y,
      reach: vision.lightVision[i].poly,
      brightPx: l.brightRadius * viewport.gridSize,
      dimPx: l.dimRadius * viewport.gridSize,
    }));
    const inside: InsideFn = (p, poly) => poly.points.length >= 3 && isPointVisible(p, poly);
    // Closed doors lie exactly on a sight polygon's boundary, so each viewer
    // tests the point nudged 2px toward itself, as the door filter always has.
    const canSee = (x: number, y: number) => viewers.some((v) => {
      const dx = v.cx - x;
      const dy = v.cy - y;
      const d = Math.hypot(dx, dy) || 1;
      return isSeen({ x: x + (dx / d) * 2, y: y + (dy / d) * 2 }, [v], lits, globalIllumination, inside);
    });
    return { vision, enabledLights, globalIllumination, canSee };
  }, [lightSources, wallSegments, currentMap?.globalIllumination]);

  /**
   * Who is asking which doors the map offers (doorAccess.ts): the viewer's
   * role, and on a lit map what their own tokens can see, by the rule the
   * walls layer shows doors by.
   */
  const doorViewer = useCallback((): DoorViewer => {
    const lightingEnabled = currentMap?.lightingEnabled ?? false;
    // Manual fog as this player has it: the squares their screen shows.
    const fog = currentMap && !isDM && effectiveRevealedCells
      ? {
          grid: { fogCols: currentMap.width, fogRows: currentMap.height, cellPx: currentMap.gridSize },
          isRevealed: (cell: number) => effectiveRevealedCells.has(cell),
        }
      : null;
    if (!currentMap || !lightingEnabled || isDM) return { role: userRole, lightingEnabled, canSee: () => true, fog };
    const viewport: Viewport = {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    };
    return { role: userRole, lightingEnabled, canSee: ruleFor(tokens.filter(viewerOwn), viewport).canSee, fog };
  }, [currentMap, isDM, userRole, mapControls.zoom, mapControls.panOffset, ruleFor, tokens, viewerOwn, effectiveRevealedCells]);

  // Doors with no wall, fog or light tool up (map/tools/useDoorTool.ts).
  const { tool: doorTool, doorAt, setDoorType, hoveredDoorId, setHoveredDoorId } = useDoorTool({
    mapId: currentMap?.id, wallSegments, doorViewer, zoom: mapControls.zoom,
    wallMode, fogMode, lightMode, holdingToken: draggedToken !== null,
    tokenTakesClick: ({ gridCoords }) => draggedToken !== null || getMovableTokenAtPosition(gridCoords.x, gridCoords.y) !== null,
    carryWallHistory, socket, ownEdits, showToast, markDirty,
  });

  // A choice from the door menu: the door changed, the menu closed.
  const changeDoorType = useCallback((door: WallSegment, newType: WallType) => {
    setDoorType(door, newType);
    setDoorContextMenu(null);
  }, [setDoorType]);

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

    const renderIsDM = isDM && !previewing;
    // isInSpiritRealm is true if the campaign-wide toggle is on OR this
    // specific non-DM player has personally crossed into the spirit realm. A
    // preview is in it when the previewed viewer is.
    const spiritActive = campaign?.spiritLayerEnabled ?? false;
    const isInSpiritRealm = previewing
      ? previewedPlane === 'spirit'
      : spiritActive || (userRole !== 'DM' && playerSpiritVisible);

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

    // 3. The DM's translucent fog, under the spirit layer and tokens so they
    //    stay visible through it. A player's fog is opaque and has to cover
    //    walls, doors and light glows too, so it is drawn on the overlay.
    if (renderIsDM) {
      drawFog(ctx, {
        isDM: true,
        fogState: effectiveFogState,
        revealedCells: null,
        revealOpacity: revealOpacityRef.current,
      }, viewport);
    }

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
  }, [currentMap, imageLoaded, mapImage, mapControls.panOffset, mapControls.zoom, userRole, campaign?.spiritLayerEnabled, playerSpiritVisible, dmViewBothPlanes, showGrid, gridColor, effectiveFogState, previewing, previewedPlane, spiritLayerImage, spiritLayerOpacity, isDM, revealOpacityRef]);

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

    const renderIsDM = isDM && !previewing;

    // In Player Preview only the tokens that player would have are drawn:
    // their own, and what the visibility rule says they see. Hidden and
    // off-plane tokens, which the server never sends a player, are dropped.
    let drawn = tokens;
    if (previewing) {
      const rule = (currentMap.lightingEnabled ?? false) ? ruleFor(tokens.filter(viewerOwn), viewport) : null;
      drawn = previewTokens(tokens, viewerOwn, previewControls, rule?.canSee ?? null, viewport, previewedPlane);
    }

    // 5. Tokens (+ drag ghost)
    drawTokens(ctx, {
      tokens: drawn,
      tokenImages,
      animatingTokens,
      heldAt,
      now: Date.now(),
      // In a preview the ghost is the token as the viewer is sent it, or
      // nothing when the viewer would not have it at all.
      draggedToken: previewing ? (drawn.find((t) => t.id === draggedToken?.id) ?? null) : draggedToken,
      dragOffset,
      hoverCoords,
      hoverTokenId: hoverToken?.id ?? null,
      revealedCells: viewerRevealed,
      isDM: renderIsDM,
      dmShowSpiritTokens,
      dmViewBothPlanes,
      spiritAccentColor: getSpiritAccentColor(campaign?.spiritLayerStyle),
      characterHpCache,
      isOwnToken: viewerOwn,
      currentTurnTokenId,
      // Held at mid-breath under reduced motion, where no pulse loop runs.
      pulsePhase: prefersReducedMotion ? 0.5 : pulsePhaseAt(Date.now()),
      peekTokenId,
    }, viewport);

    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.panOffset, mapControls.zoom, campaign?.spiritLayerStyle, tokens, tokenImages, animatingTokens, heldAt, draggedToken, dragOffset, hoverCoords, hoverToken, viewerRevealed, viewerOwn, previewing, previewedPlane, ruleFor, dmShowSpiritTokens, dmViewBothPlanes, characterHpCache, currentTurnTokenId, prefersReducedMotion, peekTokenId, isDM, previewControls]);

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

    const renderIsDM = isDM && !previewing;

    // 6. Dynamic lighting — raycast visibility darkness over tokens.
    //    DM always sees all; "Preview player view" simulates player vision.
    //    The vision polygons also feed the walls layer's door LOS filter.
    const lightingEnabled = currentMap.lightingEnabled ?? false;
    // Whether this viewer can make out a point, by the shared visibility rule.
    // Everything is seen until lighting says otherwise.
    let canSee: (x: number, y: number) => boolean = () => true;
    if (lightingEnabled && !renderIsDM) {
      const myTokens = tokens.filter(viewerOwn);
      const rule = ruleFor(myTokens, viewport);
      canSee = rule.canSee;
      drawDynamicLighting(ctx, {
        myTokens,
        enabledLights: rule.enabledLights,
        tokenVision: rule.vision.tokenVision,
        tokenSight: rule.vision.tokenSight,
        lightVision: rule.vision.lightVision,
        globalIllumination: rule.globalIllumination,
        lightingCanvas: lightingOffscreenRef,
        coverageCanvas: lightCoverageOffscreenRef,
        lightCanvas: lightOnlyOffscreenRef,
        explored: explorationEnabled ? exploredRaster : null,
        terrainCanvas: terrainCanvasRef.current,
        memoryMaskCanvas: memoryMaskOffscreenRef,
        memoryCanvas: memoryOffscreenRef,
      }, viewport);

      // Report what this viewer has just seen, at most every 300 ms, from the
      // coverage mask just built, to whoever's memory this is: the player's
      // own, or the player the DM is previewing. A preview writes too, so a
      // token the DM moves for an absent player still remembers its ground.
      // The party and an uncontrolled token explore as nobody, and write
      // nothing.
      const now = Date.now();
      if (exploringAs !== null && explorationEnabled && exploredCells !== null && lightCoverageOffscreenRef.current
        && now - lastExploredReportRef.current >= 300) {
        lastExploredReportRef.current = now;
        const seen = exploredCellsFromCoverage(lightCoverageOffscreenRef.current, currentMap.width, currentMap.height, exploredScratchRef);
        const fresh = seen ? diffNew(exploredCells, seen) : [];
        if (fresh.length > 0) {
          addExplored(fresh);
          socket?.getSocket()?.emit('exploration:reveal', { mapId: currentMap.id, cells: fresh, userId: exploringAs });
        }
      }
    }

    // 7. DM light source markers, in the DM's own view only: a preview is a
    //    player's view, and a marker would give away every light on the map
    if (isDM) {
      drawLightIcons(ctx, {
        lights: lightSources,
        selectedLightId,
        lightMode,
        isDM: renderIsDM,
      }, viewport);
    }

    // 8. Wall segments — DM sees all (+ endpoint nodes while a wall tool is
    //    active); players see doors (LOS-filtered under dynamic lighting)
    drawWalls(ctx, {
      wallSegments,
      isDM: renderIsDM,
      wallColor,
      hoveredWallId,
      selectedWallIds,
      hoveredDoorId,
      showEndpoints: wallMode !== null,
      dragEndpoint: wallDragEndpointRef.current?.point ?? null,
      selectedEndpoint,
      lightingEnabled,
      canSee,
    }, viewport);

    // 9. DM wall-tool overlays
    if (isDM && wallMode === 'wall-draw' && wallInProgress.length > 0) {
      drawWallDrawOverlay(ctx, {
        wallInProgress,
        hoverMapPx: hoverMapPxRef.current,
        hoverCoords,
        wallType,
        snapPoint,
        findWallAtPoint,
      }, viewport);
    }
    if (isDM && wallMode === 'wall-split' && splitHoverPoint) {
      drawSplitPreview(ctx, splitHoverPoint, viewport);
    }
    if (isDM && wallMode === 'wall-erase') {
      drawEraseOverlay(ctx, {
        hoverMapPx: hoverMapPxRef.current,
        eraseRadius: WALL_ERASE_RADIUS,
        erasedIds: wallErasedIdsRef.current,
        wallSegments,
      }, viewport);
    }
    if (isDM && wallMode === 'wall-brush') {
      drawBrushOverlay(ctx, {
        points: wallBrushPointsRef.current,
        brushSize,
        hoverMapPx: hoverMapPxRef.current,
      }, viewport);
    }
    if (isDM && wallMode === 'wall-polygon' && polygonPoints.length > 0) {
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
        anchor: aoeAnchor,
        // Only offer the cursor as a stand-in anchor while it is actually over
        // the map — hoverCoords is the bounds-checked one. Without this an
        // un-pinned template draws out in the margin beside the map, which the
        // old grid-coordinate anchor ruled out for free.
        hoverMapPx: hoverCoords ? hoverMapPxRef.current : null,
        // Not bounds-checked: aiming a pinned template at something off the
        // edge of the map is legitimate.
        aimMapPx: aoeAimRef.current,
        hoverExact: aoeAltHeldRef.current,
        feetPerSquare: currentMap.feetPerSquare ?? 5,
        coneRule: campaign?.gameSystem === GameSystem.PATHFINDER_2E ? 'quarter-circle' : 'width-equals-distance',
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

    // 11b. Wall selection — the dragged box and a ring around what is held,
    //      so a gathered selection reads as one thing before it is moved.
    if (wallMode === 'wall-select' && isDM) {
      drawWallSelection(ctx, viewport, {
        marquee: wallMarquee,
        selectedWallIds,
        wallSegments,
      });
    }

    // 12. Map pings — drawn last in world space, above the lighting darkness
    //     so a ping into an unlit corner is still visible. (The turn ring
    //     makes the opposite trade on purpose: it lives on the token layer
    //     so a hidden token's ring stays hidden.)
    // Manual fog for a player covers everything drawn so far on this layer
    // and the layers beneath: artwork, tokens, walls, doors and light glows.
    // Nothing under an unrevealed cell shows, except the cells the player's
    // own tokens stand on. Pings stay above it: a ping is a deliberate
    // signal from someone at the table, not a discovery.
    if (!renderIsDM) {
      drawFog(ctx, {
        isDM: false,
        fogState: null,
        revealedCells: viewerRevealed,
        exemptCells: ownTokenCells,
        revealOpacity: revealOpacityRef.current,
      }, viewport);
    }

    if (pings.length > 0) {
      drawPings(ctx, { pings, now: Date.now(), reducedMotion: prefersReducedMotion }, viewport);
    }

    // Restore context state (back to screen-space)
    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.zoom, mapControls.panOffset, campaign?.gameSystem, tokens, lightSources, selectedLightId, lightMode, wallSegments, wallColor, hoveredWallId, selectedWallIds, hoveredDoorId, wallMode, selectedEndpoint, wallInProgress, wallType, brushSize, splitHoverPoint, polygonPoints, showRuler, rulerColor, effectiveRulerOrigin, showAoE, aoeConfig, aoeAnchor, hoverCoords, fogMode, isDM, fogState, viewerRevealed, viewerOwn, previewing, ruleFor, ownTokenCells, explorationEnabled, exploringAs, exploredCells, exploredRaster, socket, fogDragCurrent, wallMarquee, pings, prefersReducedMotion, POLYGON_CLOSE_RADIUS, WALL_ERASE_RADIUS, addExplored, aoeAimRef, aoeAltHeldRef, findWallAtPoint, fogDragAnchorRef, revealOpacityRef, snapPoint, wallBrushPointsRef, wallDragEndpointRef, wallErasedIdsRef]);

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
  }, [markDirty, showGrid, gridColor, effectiveFogState, previewing, previewedPlane, spiritLayerImage, spiritLayerOpacity]);

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
  }, [markDirty, tokens, tokenImages, animatingTokens, hoverToken, characterHpCache, dmShowSpiritTokens, currentMap?.lightingEnabled, currentTurnTokenId, peekTokenId, previewing, previewSelection]);

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
  }, [markDirty, wallSegments, wallMode, wallInProgress, hoveredWallId, selectedWallIds, hoveredDoorId, splitHoverPoint, selectedEndpoint, wallType, snapToGrid, brushSize, lightSources, selectedLightId, lightMode, dmPreviewPlayerView, showRuler, rulerOrigin, rulerColor, effectiveRulerOrigin, showAoE, aoeConfig, aoeAnchor, fogMode, fogDragCurrent, fogState, viewerRevealed, previewing, ownTokenCells, exploredRaster, pings]);

  // ============================================
  // Token Hit Testing
  // ============================================

  /**
   * Whether this user owns or controls a token.
   *
   * Used for the fog exemption (you always see your own token), as a lighting
   * vision source, and by the visibility context below. It was written out
   * twice, identically, in two draw callbacks; one definition now.
   */
  /**
   * What this viewer can see — the same rule the token layer draws by.
   *
   * Hit testing used to ignore fog entirely, so hovering unrevealed dark named
   * whatever was standing there. The panel and the canvas now agree.
   */
  const tokenView = useMemo(
    () => ({
      isDM: userRole === 'DM',
      revealedCells: effectiveRevealedCells,
      isOwnToken,
      dmShowSpiritTokens,
      mapWidth: currentMap?.width ?? 0,
      mapHeight: currentMap?.height ?? 0,
    }),
    [userRole, effectiveRevealedCells, isOwnToken, dmShowSpiritTokens, currentMap?.width, currentMap?.height]
  );

  /**
   * Check if a grid coordinate is within a token's bounds
   */
  /**
   * The token the hover panel may name. In a preview that is only what the
   * preview draws, by the same shown-token rule and the previewed fog: the
   * DM's own lookup would name a hidden, unlit or fogged creature to a table
   * watching the projector.
   */
  const getHoverTokenAt = useCallback(
    (gridX: number, gridY: number): Token | null => {
      if (!currentMap) return null;
      if (!previewing) return pickTokenAt(tokens, gridX, gridY, tokenView);
      const viewport: Viewport = {
        zoom: mapControls.zoom,
        panOffset: mapControls.panOffset,
        gridSize: currentMap.gridSize,
        mapWidth: currentMap.width,
        mapHeight: currentMap.height,
      };
      const rule = (currentMap.lightingEnabled ?? false) ? ruleFor(tokens.filter(viewerOwn), viewport) : null;
      const shown = previewTokens(tokens, viewerOwn, previewControls, rule?.canSee ?? null, viewport, previewedPlane);
      return pickTokenAt(shown, gridX, gridY, {
        isDM: false,
        revealedCells: viewerRevealed,
        isOwnToken: viewerOwn,
        dmShowSpiritTokens,
        mapWidth: currentMap.width,
        mapHeight: currentMap.height,
      });
    },
    [tokens, currentMap, tokenView, previewing, previewedPlane, mapControls.zoom, mapControls.panOffset, ruleFor, viewerOwn, viewerRevealed, dmShowSpiritTokens, previewControls]
  );

  const getTokenAtPosition = useCallback(
    (gridX: number, gridY: number): Token | null => {
      if (!currentMap) return null;
      return pickTokenAt(tokens, gridX, gridY, tokenView);
    },
    [tokens, currentMap, tokenView]
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

      // A player moves the tokens they control, the same rule the server
      // applies to the move; a character binding alone is not control, and a
      // spectator controls nothing.
      return controlsToken(token, user?.id, userRole);
    },
    [campaign, userRole, user?.id]
  );

  /**
   * The topmost token on a cell that this user is allowed to move.
   *
   * Distinct from `getTokenAtPosition`, which answers "what is drawn here" and
   * is what hovering and the context menu want. Picking a token up has to look
   * further down the stack: an NPC sharing the square is drawn on top of it, and
   * stopping at that NPC left a player unable to pick up their own token at all.
   */
  const getMovableTokenAtPosition = useCallback(
    (gridX: number, gridY: number): Token | null => {
      if (!currentMap) return null;
      return pickMovableTokenAt(tokens, gridX, gridY, canMoveToken, tokenView);
    },
    [tokens, currentMap, canMoveToken, tokenView]
  );

  // ============================================
  // Mouse Event Handlers
  // ============================================

  // Helper: convert screen coords to map-space pixel coords (not grid coords)
  const screenToMapPx = (screenX: number, screenY: number) => {
    return {
      x: (screenX - mapControls.panOffset.x) / mapControls.zoom,
      y: (screenY - mapControls.panOffset.y) / mapControls.zoom,
    };
  };

  // Throttle token move events to 60fps (~16ms)
  const lastMoveEmitRef = useRef<number>(0);
  const MOVE_THROTTLE_MS = 16;

  /**
   * Tokens and panning, when no other tool took the event: a click picks a
   * token up or puts the held one down, and a drag on empty ground pans.
   */
  const tokenTool: MapTool = {
    down({ e, gridCoords }: PointerAt) {
      if (!currentMap) return false;
        // If we're already holding a token, place it on this click
        if (draggedToken && dragOffset) {
          // Finalize token position (snap to grid)
          const finalX = Math.max(0, Math.min(gridCoords.x - dragOffset.x, currentMap.width - draggedToken.size.width));
          const finalY = Math.max(0, Math.min(gridCoords.y - dragOffset.y, currentMap.height - draggedToken.size.height));

          // Two creatures do not share a square. The Basic Rules are blunt about it
          // (p. 74, "Moving Around Other Creatures"): "whether a creature is a
          // friend or an enemy, you can't willingly end your move in its space."
          // A token at zero hit points is treated as no longer holding its space,
          // so a body can be stood on — that part is a house rule, not something
          // the rulebook spells out.
          //
          // The DM is exempt. Stacking tokens on purpose — a rider on a mount, a
          // swarm, scenery being arranged — is ordinary DM work, and refusing it
          // would be an obstacle rather than a rule.
          //
          // Checked here on the client and nowhere else, deliberately: see
          // `blockingTokensAt`, which explains why enforcing this server-side would
          // turn a refused move into a way to find hidden creatures.
          if (userRole !== 'DM') {
            const blockedBy = blockingTokensAt(
              tokens,
              draggedToken,
              { x: Math.floor(finalX), y: Math.floor(finalY) },
              characterHpCache
            );
            if (blockedBy.length > 0) {
              showToast(`${tokenDisplayName(blockedBy[0])} is already standing there.`, 'info');
              cancelHold();
              markDirty('tokens');
              return true;
            }
          }

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
          return true;
        }

        // Check if clicked on a token to pick it up.
        //
        // Deliberately looks past tokens this user cannot move rather than stopping
        // at whatever is drawn on top: a player standing on the same square as an
        // NPC could otherwise never pick their own token up again.
        const token = getMovableTokenAtPosition(gridCoords.x, gridCoords.y);
        console.log('🔍 Movable token at click position:', token?.name || 'none');

        if (token) {
          // Pick up token — disable ruler if it was active
          if (showRuler) putRulerAway();
          console.log('👆 Picking up token:', token.name);
          heldOnMapRef.current = currentMap.id;
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
      return true;
    },
    move({ e, gridCoords }: PointerAt) {
      if (!currentMap) return false;
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

          // Keep the hover panel honest while dragging. It used to be updated only
          // in the branch below, so a held token left the last name it happened to
          // read sitting beside live coordinates — "Brave Fighter (12, 8)" while
          // the cursor was over something else entirely. Reading the square under
          // the cursor also shows what you are about to land on.
          setHoverToken(getHoverTokenAt(gridCoords.x, gridCoords.y));

          // Ghost follows the cursor — tokens layer only.
          markDirty('tokens');
        } else {
          // Handle map panning
          mapControls.handleDrag(e);

          // Update hover token
          const token = getHoverTokenAt(gridCoords.x, gridCoords.y);
          setHoverToken(token);

          // Pan moves the whole scene → repaint every layer.
          if (mapControls.isDragging) {
            markDirty('terrain', 'tokens', 'overlay');
          }
        }
      return true;
    },
  };

  /**
   * The tools a click or a move is offered to, in this order, until one takes
   * it: a DM tool first, then doors, the fog boxes, the measuring tools, and
   * tokens and panning last. The order is what decides a click when two tools
   * are up at once. On mouse up each finishes what it holds, in the same order.
   */
  const pointerTools: MapTool[] = [wallTool, lightTool, doorTool, fogTool, measuring, tokenTool];

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
    const at: PointerAt = { e, screenX, screenY, mapPx: screenToMapPx(screenX, screenY), gridCoords };

    for (const tool of pointerTools) {
      if (tool.down?.(at)) return;
    }
  };

  /**
   * Handle mouse move (pan + hover coordinates + token drag)
   */
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !currentMap) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = mapControls.screenToGrid({ x: screenX, y: screenY });
    const at: PointerAt = { e, screenX, screenY, mapPx: screenToMapPx(screenX, screenY), gridCoords };

    // Track raw map-px position (unquantised) for accurate ghost line in free-draw mode
    hoverMapPxRef.current = at.mapPx;

    trackMeasure(at);

    // Update hover coordinates
    // Only when the pointer reaches another square: a new object on every
    // pixel of movement re-rendered the whole canvas.
    if (mapControls.isWithinBounds(gridCoords)) {
      setHoverCoords((prev) => (prev && prev.x === gridCoords.x && prev.y === gridCoords.y ? prev : gridCoords));
    } else {
      setHoverCoords(null);
    }

    for (const tool of pointerTools) {
      if (tool.move?.(at)) return;
    }
  };

  /**
   * Handle mouse up (stop map panning)
   * Note: a held token is put down by the token tool's mouse down, on the second click
   */
  const handleMouseUp = (e?: { button: number }) => {
    // Release right-button pan
    if (e?.button === 2) {
      rightPanActiveRef.current = false;
      mapControls.stopDrag();
      return;
    }
    for (const tool of pointerTools) tool.up?.();
    // Stop map panning
    mapControls.stopDrag();
  };

  // A button let go outside the canvas never reaches its onMouseUp, which left
  // an erase or brush stroke, a box, a drag or a right-button pan going. The
  // window hears every release; one over the canvas is the canvas's own.
  const handleMouseUpRef = useRef(handleMouseUp);
  handleMouseUpRef.current = handleMouseUp;
  useEffect(() => {
    const onWindowMouseUp = (e: MouseEvent) => {
      if (e.target === canvasRef.current) return;
      handleMouseUpRef.current(e);
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => window.removeEventListener('mouseup', onWindowMouseUp);
  }, []);

  /**
   * Handle mouse leave (stop pan, clear hover, cancel token drag)
   */
  const handleMouseLeave = () => {
    // Cancel token drag if in progress
    if (draggedToken) cancelHold();

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

    const dragData = readCharacterTokenDrag(e.dataTransfer.getData('text/plain'));
    if (!dragData) return;

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
      const result = await api.addToken(
        campaign.id,
        currentMap.id,
        characterTokenRequest(dragData, position, targetLayer),
      );
      useGameStore.getState().addToken(result.token);
    } catch (err) {
      showToast(apiErrorMessage(err) || `Could not place ${dragData.name} on the map`, 'error');
    }
  };

  /**
   * Handle right-click (context menu)
   * Cancels any picked-up token before showing menu
   */
  /**
   * Whether initiative may be rolled for a token from the map menu.
   *
   * Two conditions: the token is already in the initiative order, and the
   * viewer is either the DM or the token's controller. Rolling is how you take
   * part in a fight the DM has already put you in — it is not a way to add
   * yourself to one, which is why being in the order is required rather than
   * implied.
   *
   * The combat snapshot is read imperatively instead of subscribed to: this
   * component deliberately avoids re-rendering the canvas when a combatant's HP
   * ticks (see `useCurrentTurnTokenId`), and the answer is only needed at the
   * moment of a right-click.
   */
  /**
   * Whether this viewer may roll a token's character sheet.
   *
   * Keyed on who owns the *character*, not on token.controlledBy: the rolls
   * come from the sheet, and the roster and sheet viewer offer the same menu
   * with no token in hand. One rule, three callers — see services/permissions.
   */
  /** Whether a character is one of this campaign's, as the campaign was loaded. */
  const campaignHasCharacter = (characterId: string): boolean =>
    campaign?.characters?.some((c) => c.id === characterId) ?? false;

  const canRollForToken = (token: Token): boolean => {
    if (!user || !token.characterId) return false;
    const character = campaign?.characters?.find((c) => c.id === token.characterId);
    if (!character) return false;
    const membership = campaign?.memberships?.find((m) => m.userId === user.id);
    return canRollAsCharacter(user, character, membership);
  };

  /**
   * Whether the token menu offers this viewer anything. The DM always has the
   * token actions; anyone else has only the character's sheet and rolls, so a
   * creature or an object would open an empty box.
   */
  const tokenMenuHasItems = (token: Token): boolean =>
    isDM || (!!token.characterId && (campaignHasCharacter(token.characterId) || canRollForToken(token)));

  const canRollInitiativeFor = (token: Token): boolean => {
    const combat = useGameStore.getState().combat;
    if (!combat.combatants.some((c) => c.tokenId === token.id)) return false;
    if (isDM) return true;
    // Once combat is under way a re-roll re-sorts the order and can skip a
    // turn, so that is the DM's call; and a spectator controls no token. The
    // server enforces both.
    if (combat.active) return false;
    return controlsToken(token, user?.id, userRole);
  };

  /**
   * Roll initiative for a token, sending the result to the tracker rather than
   * only to the dice log.
   *
   * No dice expression is sent. The server works out what initiative means for
   * this combatant from its character sheet or stat block — it is the only side
   * holding either, and some systems do not roll at all. That also means this
   * and the tracker's own die button cannot disagree.
   */
  const rollInitiativeForToken = (tokenId: string) => {
    if (!socket || !currentMap) return;
    const token = tokens.find((t) => t.id === tokenId);
    socket.emitInitiativeRoll({
      tokenId,
      mapId: currentMap.id,
      characterName: token ? tokenPublicName(token) : undefined,
    });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current || !currentMap) return;
    // The right button pans while a wall, fog or light tool is up, so no menu
    // opens: some browsers send this event as the button goes down, before
    // any drag, so a drag cannot be told from a click here.
    if ((wallMode || fogMode || lightMode) && isDM) return;

    // Always close any open door context menu first
    setDoorContextMenu(null);

    // Cancel any picked-up token (right-click cancels movement)
    if (draggedToken) cancelHold();

    // Get grid + screen coordinates of click
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = mapControls.screenToGrid({ x: screenX, y: screenY });

    // Check tokens first — they sit on a higher visual layer than doors. A
    // token whose menu would be empty for this viewer is passed over.
    const token = getTokenAtPosition(gridCoords.x, gridCoords.y);
    if (token && tokenMenuHasItems(token)) {
      setContextMenu({ token, x: e.clientX, y: e.clientY });
      return;
    }
    setContextMenu(null);

    // Door hit-test: right-click opens the full door state menu (only in pan
    // mode), for a door the map offers this viewer
    if (!wallMode && !fogMode) {
      const door = doorAt(screenToMapPx(screenX, screenY));
      if (door) {
        setDoorContextMenu({ door, x: e.clientX, y: e.clientY });
      }
    }
  };

  /**
   * Handle mouse wheel (zoom)
   */
  // On the hook's own handler, which keeps its identity: the controls object
  // is new each render, and the listener went off and on again with it.
  const wheelZoom = mapControls.handleWheel;
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      wheelZoom(e, rect);
    },
    [wheelZoom]
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
          // Re-checked here as well as on the server: a filter is CSS.
          filter: activeVibeEffect && isSafeVibeFilter(activeVibeEffect.filter) ? activeVibeEffect.filter : undefined,
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
            backgroundColor: isHexColor(activeVibeEffect.hue) ? activeVibeEffect.hue : undefined,
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
          // A preview shows the overlay as the previewed viewer sees it.
          const isDM = userRole === 'DM' && !previewing;
          const spiritActive = campaign?.spiritLayerEnabled ?? false;
          // Non-DM players are in spirit realm if globally enabled OR their personal token is there
          const playerSpiritPersonal = previewing ? previewedPlane === 'spirit' : playerSpiritVisible;
          const playerEffectivelyInSpirit = spiritActive || playerSpiritPersonal;
          // Show overlay only when spirit realm is actually visible to this viewer
          if (!isDM && !playerEffectivelyInSpirit) return null;
          // DM in single-plane material view: no overlay (they're not perceiving the spirit realm)
          if (isDM && !dmViewBothPlanes && !spiritActive) return null;

          // The style is validated on both write paths and re-checked here:
          // anything outside the allowlist reads as plain wispy.
          const { effect, customColor } = parseSpiritStyle(campaign?.spiritLayerStyle);
          // The named class carries the animations and ::before/::after particles;
          // a custom colour only overrides its base tint.
          const overlayClass = `spirit-overlay-${effect}`;
          const inlineStyle: React.CSSProperties = customColor
            ? { background: `${customColor}44` } // custom hue at ~27% alpha as base tint
            : {};

          // When DM views spirit realm that's hidden from most players, reduce overlay intensity
          // Full opacity when fully active (global toggle or personal crossover)
          const overlayOpacity = (!isDM && !spiritActive && playerSpiritPersonal)
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
      {(previewing
        ? previewedPlane === 'spirit'
        : userRole !== 'DM' && ((campaign?.spiritLayerEnabled ?? false) || playerSpiritVisible)) && (
        // An opaque backing under the tint, as the zoom panel has, so the
        // words read over any map.
        <div className="absolute top-4 right-4 z-10 rounded-cozy bg-parchment animate-pulse-soft">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-cozy bg-spirit-purple/20 border border-spirit-purple/40">
            <Ghost className="w-3.5 h-3.5 text-spirit-ink" />
            <span className="text-xs font-semibold text-spirit-ink">Spirit Realm</span>
          </div>
        </div>
      )}

      {/* Toolbar - Glassmorphism */}
      <div className="absolute top-4 left-4 glass-panel p-2 flex items-center gap-2 bg-parchment/90 backdrop-blur-xs">
        {/* Zoom Out */}
        <Button
          onClick={() => mapControls.zoomOut({ x: canvasSize.width / 2, y: canvasSize.height / 2 })}
          disabled={mapControls.zoom <= mapControls.minZoom}
          variant="secondary" className="p-2"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>

        {/* Zoom Level Display */}
        <span className="text-xs text-stone-gray font-mono min-w-16 text-center">
          {Math.round(mapControls.zoom * 100)}%
        </span>

        {/* Zoom In */}
        <Button
          onClick={() => mapControls.zoomIn({ x: canvasSize.width / 2, y: canvasSize.height / 2 })}
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
                <Palette className={`w-4 h-4 ${rulerColor === 'purple' ? 'text-spirit-ink' : rulerColor === 'black' ? 'text-stone-gray' : 'text-accent-ink'}`} />
              </Button>
            )}

            {/* Toggle AoE tool */}
            <Button
              onClick={handleToggleAoE}
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
              title={dmShowSpiritTokens ? 'Spirit tokens shown, click to hide' : 'Spirit tokens hidden — click to show'}
            >
              <Ghost className={`w-4 h-4 ${dmShowSpiritTokens ? 'text-spirit-ink' : 'text-stone-gray/40'}`} />
            </Button>
          </>
        )}
      </div>

      {/* DM Tool Panels — draggable container with stacked panels */}
      {userRole === 'DM' && currentMap && (
        <DmToolPanelContainer containerRef={containerRef}>
          <DmFogControls
            fogMode={fogMode}
            fogEnabled={fogEnabled}
            onResetExploration={(currentMap.lightingEnabled ?? false) && explorationEnabled
              ? () => { socket?.getSocket()?.emit('exploration:reset', { mapId: currentMap.id }); }
              : undefined}
            onFogEnabledChange={async (enabled) => {
              if (!campaign || !currentMap) return;
              // Shown at once; the settings broadcast confirms it for every
              // client, this one included. Put back if the save fails.
              const before = currentMap;
              setCurrentMap({ ...currentMap, fogEnabled: enabled });
              if (!enabled) { setFogMode(null); cancelFogDrag(); }
              try {
                await mapService.updateMap(campaign.id, currentMap.id, { fogEnabled: enabled });
              } catch (err) {
                // Say why: a map stored larger than the size limits is
                // refused fog, and the box would otherwise just untick.
                setCurrentMap(before);
                showToast(apiErrorMessage(err) || 'Could not change fog of war for this map', 'error');
              }
            }}
            onCollapse={() => {
              setFogMode(null);
              cancelFogDrag();
            }}
            onFogModeChange={(mode) => {
              setFogMode(mode);
              // Deactivate wall/light tools when switching to fog tool
              if (mode) {
                setWallMode(null);
                setLightMode(null);
                setSelectedLightId(null);
                setSelectedWallIds(new Set());
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
            {...wallPanel}
            onWallModeChange={(mode) => {
              wallPanel.onWallModeChange(mode);
              // Deactivate fog/light tools when switching to wall tool
              if (mode) { setFogMode(null); setLightMode(null); setSelectedLightId(null); }
            }}
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
                socketInstance.emit('lights:replace', ownEdits.tag({ mapId: currentMap.id, lights: [] }));
              }
            }}
            selectedLight={selectedLightId ? lightSources.find((l) => l.id === selectedLightId) ?? null : null}
            onSelectedLightChange={(updated) => {
              setLightSources((prev) => prev.map((l) => l.id === updated.id ? updated : l));
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('light:update', ownEdits.tag({ mapId: currentMap.id, light: updated }));
              }
            }}
            onDeleteSelected={() => {
              if (!selectedLightId || !currentMap) return;
              setLightSources((prev) => prev.filter((l) => l.id !== selectedLightId));
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                socketInstance.emit('light:remove', ownEdits.tag({ mapId: currentMap.id, lightId: selectedLightId }));
              }
              setSelectedLightId(null);
            }}
            lightingEnabled={currentMap.lightingEnabled ?? false}
            globalIllumination={currentMap.globalIllumination ?? true}
            onGlobalIlluminationChange={async (on) => {
              if (!campaign) return;
              const before = currentMap;
              setCurrentMap({ ...currentMap, globalIllumination: on });
              try {
                await mapService.updateMap(campaign.id, currentMap.id, { globalIllumination: on });
              } catch (err) {
                setCurrentMap(before);
                showToast(apiErrorMessage(err) || 'Could not change Global Illumination', 'error');
              }
            }}
            placementDefaults={lightPlacementDefaults}
            onDefaultsChange={setLightPlacementDefaults}
          />
        </DmToolPanelContainer>
      )}

      {/* DM Preview Player View — offered while dynamic lighting or fog is
         on, and kept while a preview is on, so turning both off mid-preview
         still leaves the way back to the DM's view. */}
      {userRole === 'DM' && (dmPreviewPlayerView || (currentMap?.lightingEnabled ?? false) || fogEnabled) && (
        <div className="absolute bottom-20 right-2 z-30 flex items-center gap-1">
          {dmPreviewPlayerView && (
            <select
              value={previewSelection ? encodePreviewSelection(previewSelection) : ''}
              onChange={(e) => setPreviewSelection(decodePreviewSelection(e.target.value))}
              aria-label="Player or token to preview as"
              className="px-2 py-1.5 rounded-sm text-xs bg-ink/85 text-paper border border-ink/40"
            >
              {previewChoices.length === 0 && <option value="">Nothing to preview</option>}
              {(['players', 'tokens'] as const).map((group) => {
                const entries = previewChoices.filter((o) => o.group === group);
                if (entries.length === 0) return null;
                return (
                  <optgroup key={group} label={group === 'players' ? 'Players' : 'Tokens'}>
                    {entries.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                );
              })}
            </select>
          )}
          <button
            onClick={() => {
              const next = !dmPreviewPlayerView;
              if (next && previewSelection === null) setPreviewSelection(defaultPreviewSelection(campaign?.memberships ?? [], tokens));
              setDmPreviewPlayerView(next);
            }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              dmPreviewPlayerView
                ? 'bg-info/30 text-info-ink border-info/50'
                // ink/paper invert together, so this stays a legible contrast
                // chip over the map on both light and dark themes
                : 'bg-ink/85 text-paper border-ink/40 hover:bg-ink'
            }`}
            title={dmPreviewPlayerView ? 'Back to DM view (see all)' : 'Preview this map as one of your players sees it'}
            aria-label="Toggle DM player view preview"
          >
            {dmPreviewPlayerView ? '👁 DM View' : '🎭 Preview Player View'}
          </button>
        </div>
      )}

      {/* Ruler hint for players with no token */}
      {showRuler && !isDM && !myToken && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
          Place your character token on the map to use the ruler
        </div>
      )}

      {/* AoE panel */}
      {showAoE && currentMap && (
        <div className="absolute top-12 left-2 z-10 p-3 space-y-3 w-52 shadow-xl rounded-xl border border-moss-green/30 bg-parchment/95 backdrop-blur-xs">
          <p className="text-xs font-semibold text-brand-ink">AoE Shape</p>

          {/* Shape selector */}
          <div className="flex flex-wrap gap-1.5">
            {(['sphere', 'cone', 'line', 'cube'] as AoEShape[]).map((shape) => (
              <button
                key={shape}
                onClick={() => setAoEConfig((prev) => ({ ...prev, shape }))}
                className={`text-xs px-2 py-1 rounded border transition-colors capitalize ${
                  aoeConfig.shape === shape
                    ? 'bg-moss-green/15 border-moss-green/60 text-brand-ink font-medium'
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
                  className="text-xs px-1.5 py-0.5 rounded-sm bg-moss-green/10 hover:bg-moss-green/15 text-brand-ink border border-moss-green/20 transition-colors"
                >
                  {ft} ft
                </button>
              ))}
            </div>
          </div>

          {/* Clear the anchor */}
          {aoeAnchor && (
            <button
              onClick={() => setAoEAnchor(null)}
              className="text-xs text-stone-gray hover:text-danger-ink transition-colors"
            >
              × Clear placement
            </button>
          )}

          <p className="text-xs text-stone-gray/70">
            {aoeAnchor ? 'Click map to reposition' : 'Click map to place shape'}
          </p>
          {/* Cone and line pivot about the square you click, so most of the
              time you want them on your token. Alt is the escape hatch for an
              effect cast at a distance — a wall of fire, say. */}
          {(aoeConfig.shape === 'cone' || aoeConfig.shape === 'line') && (
            <p className="text-xs text-stone-gray/70">
              {aoeAnchor
                ? 'Move the cursor to aim it around that square'
                : 'Alt+click to place it freely, off the grid'}
            </p>
          )}
        </div>
      )}

      {/* Hover Coordinates */}
      {hoverCoords && !hoverToken && (
        <div className="absolute bottom-4 left-4 glass-panel px-3 py-1.5 bg-parchment/90 backdrop-blur-xs">
          <span className="text-xs text-stone-gray font-mono font-semibold">
            ({hoverCoords.x}, {hoverCoords.y})
          </span>
        </div>
      )}

      {/* Hover Token Name.

          Conditions are listed here in full, for everyone rather than the DM
          alone. The badges drawn on the token are only two letters each, which
          is enough to tell them apart at a glance but not to learn them — and a
          player who cannot read what is afflicting a creature cannot play
          around it. */}
      {hoverToken && hoverCoords && (() => {
        // Only what this viewer may see. A player token follows its character
        // sheet, which every campaign member can already read; an NPC's own hit
        // points are the DM's to reveal, so they appear only once the HP bar is
        // turned on. Same rule the bar on the token itself draws by.
        const hp = visibleTokenHp(hoverToken, characterHpCache, isDM && !previewing);
        const image = cachedTokenImage(hoverToken, tokenImages);
        const conditions = hoverToken.conditions ?? [];
        // `undefined` means "not in the turn order" — the row is left out
        // rather than shown blank. `null` means it is, but nothing has rolled.
        const inTurnOrder = hoverInitiative !== undefined;

        /** One labelled row. The labels line up, so the panel reads as a list. */
        const Row = ({ label, children }: { label: string; children: ReactNode }) => (
          <div className="flex items-baseline gap-2">
            <span className="w-19 shrink-0 text-[11px] uppercase tracking-wide text-warm-gray">
              {label}
            </span>
            <span className="min-w-0 text-sm text-brand-ink">{children}</span>
          </div>
        );

        return (
          <div className="absolute bottom-4 left-4 glass-panel px-4 py-3 bg-parchment/95 backdrop-blur-xs w-88 max-w-[calc(100%-2rem)] shadow-lg">
            <div className="flex items-start gap-3.5">
              {/* Large enough to actually recognise the art. On the map a token
                  is often only a few dozen pixels at play zoom, which is what
                  made "token images are hard to see" a real complaint. */}
              {image ? (
                <img
                  src={image.src}
                  alt=""
                  className="w-18 h-18 rounded-cozy object-cover border-2 border-warm-amber/50 shrink-0"
                />
              ) : (
                <div
                  className="w-18 h-18 rounded-cozy border-2 border-warm-amber/50 shrink-0 flex items-center justify-center text-2xl font-semibold text-white"
                  style={{ backgroundColor: placeholderColor(hoverToken) }}
                  aria-hidden="true"
                >
                  {(hoverToken.name || '?').charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-brand-ink truncate">
                    {tokenDisplayName(hoverToken)}
                  </span>
                  <span className="text-xs text-stone-gray font-mono shrink-0">
                    ({hoverCoords.x}, {hoverCoords.y})
                  </span>
                </div>

                <div className="space-y-1">
                  {hp && (
                    <Row label="HP">
                      <span className="font-mono">
                        {hp.current}/{hp.max}
                        {hp.temp > 0 && <span className="text-info-ink"> +{hp.temp}</span>}
                      </span>
                    </Row>
                  )}

                  {conditions.length > 0 && (
                    <Row label="Conditions">
                      <span className="flex flex-wrap gap-1">
                        {conditions.map((condition) => (
                          <span
                            key={condition}
                            className="px-1.5 py-0.5 rounded-cozy bg-warm-amber/20 border border-warm-amber/40 text-[11px] font-medium text-brand-ink capitalize"
                          >
                            {condition}
                          </span>
                        ))}
                      </span>
                    </Row>
                  )}

                  {inTurnOrder && (
                    <Row label="Initiative">
                      <span className="font-mono">
                        {hoverInitiative === null ? '—' : hoverInitiative}
                      </span>
                    </Row>
                  )}
                </div>

                {!canMoveToken(hoverToken) && (
                  <div className="mt-1.5 text-[11px] text-warm-gray italic">
                    Not yours to move
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Image Loading State */}
      {imageState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-moss-green/30 border-t-moss-green rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-stone-gray">Loading map...</p>
          </div>
        </div>
      )}

      {/* No Picture State: an imported map whose picture the export left out */}
      {imageState === 'missing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80">
          <div className="glass-panel p-4 text-center max-w-sm">
            <p className="text-sm text-brand-ink mb-1">This map has no picture.</p>
            <p className="text-xs text-stone-gray">
              {isDM
                ? 'Choose one in Edit Map; its walls, tokens and fog are kept.'
                : 'The DM has to choose one before the map can be shown.'}
            </p>
          </div>
        </div>
      )}

      {/* Image Error State */}
      {imageState === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80">
          <div className="glass-panel p-4 text-center">
            <p className="text-sm text-danger-ink mb-2">{imageError}</p>
            <p className="text-xs text-stone-gray">Check map image URL</p>
          </div>
        </div>
      )}

      {/* No Map State */}
      {imageState === 'none' && (
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

      {/* Token Context Menu.

          `flex flex-col` is what actually makes this fit its content, and it
          has to be paired with `w-max`. A <button> is inline-block by default,
          so in plain block layout every item shared one inline formatting
          context and the menu's max-content width came out as the *sum* of all
          the labels laid end to end — measured at 935px for an eleven-item
          menu, which is why it stretched most of the way across the screen.
          The items only looked stacked because `w-full` pushed each onto its
          own line. In a flex column they are real block-level items, so
          max-content is the *widest* label instead of the total.

          `max-w` is now only a guard against one very long label (a map name
          in the Move to Map submenu), not the thing doing the sizing. */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 glass-panel bg-parchment/95 backdrop-blur-xs border border-moss-green/20 shadow-lg py-1 flex flex-col w-max min-w-[160px] max-w-[18rem]"
          style={{
            left: `${contextMenuPos ? contextMenuPos.x : contextMenu.x}px`,
            top: `${contextMenuPos ? contextMenuPos.y : contextMenu.y}px`,
            visibility: contextMenuPos ? 'visible' : 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.token.characterId && (
            <>
              {/* Only for a character of this campaign, which every member
                  may read, and whose campaign is the one the sheet is opened
                  in, so it is shown Edit by this campaign's role. A token
                  keeps its character after the character leaves. */}
              {campaignHasCharacter(contextMenu.token.characterId) && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={async () => {
                    const characterId = contextMenu.token.characterId!;
                    const tokenId = contextMenu.token.id;
                    setContextMenu(null);
                    try {
                      const { character } = await api.getCharacter(characterId);
                      setViewingSheet({ character, tokenId });
                    } catch (err) {
                      console.error('Failed to load character sheet:', errorSummary(err));
                      showToast(apiErrorMessage(err) || 'Could not open that character sheet.', 'error');
                    }
                  }}
                >
                  View Character Sheet
                </button>
              )}
              {canRollForToken(contextMenu.token) && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={() => {
                    const token = contextMenu.token;
                    const picker = {
                      characterId: token.characterId!,
                      tokenId: token.id,
                      canRollInitiative: canRollInitiativeFor(token),
                      x: contextMenu.x,
                      y: contextMenu.y,
                    };
                    setContextMenu(null);
                    setRollPicker(picker);
                  }}
                >
                  Roll...
                </button>
              )}
            </>
          )}

          {userRole === 'DM' && (() => {
            const cmToken = contextMenu.token;
            const cmType = cmToken.type ?? (cmToken.characterId ? TokenType.PLAYER : TokenType.NPC);
            const controls = dmTokenControls(cmType);
            return (
            <>
              {/* Roll... — NPC tokens only. The `characterId` check is what
                  actually enforces "player tokens have their own Roll above":
                  a token can be typed NPC *and* still be bound to a character
                  (a companion, or a PC the DM re-typed), and that combination
                  rendered this entry a second time. */}
              {cmType === TokenType.NPC && !cmToken.characterId && (
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

              {/* Edit Token — every token type. The editor shows a player token
                  its name, image, darkvision and controller; the NPC-only
                  sections stay hidden. */}
              {(
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
                  className="w-full px-4 py-2 text-left text-sm text-accent-ink hover:bg-warm-amber/10 transition-colors"
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
                    // Place the copy one cell along, clamped to the map
                    const position = clampTokenPosition(
                      { x: token.position.x + 1, y: token.position.y + 1 },
                      token.size,
                      currentMap
                    );
                    const result = await api.addToken(campaign.id, currentMap.id, {
                      ...tokenCopyRequest(token, position),
                      // A copy starts fresh and belongs to nobody's character:
                      // two tokens on one sheet would follow the same hit
                      // points and both count as that player's own.
                      characterId: null,
                      controlledBy: copyController(token.controlledBy, campaign?.memberships),
                      hp: token.hp ? { current: token.hp.max, max: token.hp.max, temp: 0 } : null,
                      conditions: [],
                    });
                    useGameStore.getState().addToken(result.token);
                  } catch (err) {
                    // A copy is a new token, so an older one whose fields predate
                    // validation is refused: say which, so the DM can fix it in Edit Token.
                    showToast(apiErrorMessage(err) || 'Failed to duplicate the token', 'error');
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
                    showToast(`Saved ${tokenDisplayName(token)} as a template`, 'success');
                  } catch (err) {
                    showToast(apiErrorMessage(err) || 'Could not save the token as a template', 'error');
                  }
                }}
              >
                Save as Template
              </button>

              {/* Hide from / Reveal to players — every token; see utils/dmTokenMenu.ts */}
              {controls.hide && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={async () => {
                    if (!campaign?.id || !currentMap?.id) return;
                    const token = contextMenu.token;
                    setContextMenu(null);
                    try {
                      await setTokenFlag(campaign.id, currentMap.id, token, 'visible', !token.visible);
                    } catch (err) {
                      showToast(apiErrorMessage(err) || (token.visible ? 'Could not hide the token from players' : 'Could not show the token to players'), 'error');
                    }
                  }}
                >
                  {cmToken.visible ? 'Hide from Players' : 'Reveal to Players'}
                </button>
              )}

              {/* Obscure / Reveal identity — every token; see utils/dmTokenMenu.ts */}
              {controls.obscure && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={async () => {
                    if (!campaign?.id || !currentMap?.id) return;
                    const token = contextMenu.token;
                    setContextMenu(null);
                    try {
                      await setTokenFlag(campaign.id, currentMap.id, token, 'obscured', !token.obscured);
                    } catch (err) {
                      showToast(apiErrorMessage(err) || (token.obscured ? "Could not reveal the token's identity" : "Could not obscure the token's identity"), 'error');
                    }
                  }}
                >
                  {cmToken.obscured ? 'Reveal Identity' : 'Obscure Identity'}
                </button>
              )}

              {/* Spirit Realm toggle — creatures cross planes, scenery does not */}
              {controls.crossPlanes && (
                contextMenu.token.layer === TokenLayer.TOKEN ? (
                  <button
                    disabled={isMovingTokenLayer}
                    className="w-full px-4 py-2 text-left text-sm text-spirit-ink hover:bg-spirit-purple/10 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      if (!campaign?.id || !currentMap?.id) return;
                      setIsMovingTokenLayer(true);
                      const token = contextMenu.token;
                      setContextMenu(null);
                      try {
                        await api.updateToken(campaign.id, currentMap.id, token.id, { layer: TokenLayer.SPIRIT });
                        useGameStore.getState().patchToken(token.id, { layer: TokenLayer.SPIRIT });
                      } catch (err) {
                        showToast(apiErrorMessage(err) || 'Could not send the token to the spirit realm', 'error');
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
                      } catch (err) {
                        showToast(apiErrorMessage(err) || 'Could not return the token to the material plane', 'error');
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
                    className="w-full px-4 py-2 text-left text-sm text-accent-ink hover:bg-warm-amber/10 transition-colors flex items-center justify-between"
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
                              className="w-full px-2 py-1.5 text-left text-xs text-charcoal hover:bg-moss-green/10 rounded-sm transition-colors"
                              onClick={async () => {
                                if (!campaign?.id || !currentMap?.id) return;
                                const token = contextMenu.token;
                                setContextMenu(null);
                                setContextMenuMoveToMapOpen(false);
                                setIsMoveToMapLoading(true);
                                try {
                                  // One request: the server moves the token as it is and
                                  // tells everyone on this map itself.
                                  await api.moveTokens(campaign.id, currentMap.id, [token.id], targetMap.id);
                                  useGameStore.getState().removeToken(token.id);
                                } catch (err) {
                                  showToast(apiErrorMessage(err) || 'Failed to move the token to that map', 'error');
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

              {/* Asks first, through the same dialog as the Token Roster. */}
              <button
                className="w-full px-4 py-2 text-left text-sm text-danger-ink hover:bg-danger/10 transition-colors"
                onClick={() => {
                  setRemovingToken(contextMenu.token);
                  setContextMenu(null);
                }}
              >
                Remove from Map
              </button>
            </>
            );
          })()}
        </div>
      )}

      <RemoveTokenDialog
        token={removingToken}
        onCancel={() => setRemovingToken(null)}
        onConfirm={async () => {
          const token = removingToken;
          setRemovingToken(null);
          if (!token || !campaign?.id || !currentMap?.id) return;
          try {
            await api.deleteToken(campaign.id, currentMap.id, token.id);
            useGameStore.getState().removeToken(token.id);
          } catch (err) {
            showToast(apiErrorMessage(err) || 'Failed to remove the token', 'error');
          }
        }}
      />

      {/* Character Sheet Viewer (opened from token context menu) */}
      {viewingSheet && campaign && (() => {
        const membership = campaign.memberships?.find((m) => m.userId === user?.id);
        if (!membership) return null;
        return (
          <CharacterSheetViewerModal
            character={viewingSheet.character}
            campaignId={campaign.id}
            membership={membership}
            // Rolls from it reach the whole table, as from Roll... below.
            publicName={characterRollPublicName(tokens.find((t) => t.id === viewingSheet.tokenId), user?.id)}
            onClose={() => setViewingSheet(null)}
          />
        );
      })()}

      {/* Roll Picker (opened from token context menu) */}
      {rollPicker && (
        <CharacterRollPicker
          characterId={rollPicker.characterId}
          onSpendHitDie={(index) =>
            socket?.emitHitDiceSpend({ characterId: rollPicker.characterId, index })
          }
          anchorX={rollPicker.x}
          anchorY={rollPicker.y}
          // The dice log goes to the whole table, so an obscured token's
          // rolls are filed under the name everyone may see.
          publicName={characterRollPublicName(tokens.find((t) => t.id === rollPicker.tokenId), user?.id)}
          onRoll={(expression, purpose, characterName) =>
            tableRoll({ expression, purpose, characterName })
          }
          // Only offered when this token is already in the initiative order and
          // this viewer may roll for it — the DM for anyone, a player for a
          // token they control. The server checks the same thing.
          onRollInitiative={
            rollPicker.canRollInitiative
              ? () => rollInitiativeForToken(rollPicker.tokenId)
              : undefined
          }
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
            onRoll={(expression, purpose, characterName) =>
            tableRoll({ expression, purpose, characterName })
          }
            onClose={() => setNpcRollPicker(null)}
          />
        );
      })()}

      {/* Door Context Menu — right-click on a door segment.
          Same flex-column sizing as the token menu above; see the note there. */}
      {doorContextMenu && (
        <div
          className="fixed z-50 glass-panel bg-parchment/95 backdrop-blur-xs border border-moss-green/20 shadow-lg py-1 flex flex-col w-max min-w-[160px] max-w-[18rem]"
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

      {/* Toast notifications (locked door, a square already occupied).

          Rendered bare, exactly as every other caller does. It used to sit in a
          positioning wrapper, which broke it three ways at once: the wrapper's
          `-translate-x-1/2` is a transform, and a transform makes it the
          containing block for `position: fixed` descendants — so the toast
          anchored to a zero-width div at the bottom of the map instead of the
          viewport, `max-w-md` measured against that sliver and wrapped the text
          into an unreadable column, and `pointer-events-none` stopped the close
          button working. Toast already positions itself; it needs no help. */}
      <Toast
        show={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />
    </div>
  );
}
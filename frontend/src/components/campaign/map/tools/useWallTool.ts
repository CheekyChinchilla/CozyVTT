// ============================================
// The DM's wall tools: Draw, Polygon, Select, Split, Erase and Brush, with the
// wall panel they are chosen from, the undo keys and the wall selection
// (useWallSelection). The walls themselves, and their undo history, stay with
// MapCanvas, which draws them and keeps them in step with the server.
// ============================================

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CampaignMap } from '@/types';
import type { WallSegment, WallType } from '@/types/walls';
import type { WallToolMode, DmWallControlsProps } from '@/components/campaign/DmWallControls';
import { douglasPeucker, edgeSnapPoints } from '@/utils/geometry';
import { randomId } from '@/utils/uuid';
import { rectFromDrag, segmentsInRect } from '../mapSelection';
import { useWallSelection } from '../useWallSelection';
import { distToSegment, translateWallSegments, gridSquaresToPx } from '../mapGeometry';
import type { OwnEdits } from '../ownEdits';
import type { MapLayer } from '../useRenderLoop';
import type { MapControls, MapTool, PointerAt, ToolSocketSource } from './types';

interface UseWallToolArgs {
  isDM: boolean;
  currentMap: CampaignMap | null;
  wallMode: WallToolMode;
  setWallMode: (mode: WallToolMode) => void;
  wallSegments: WallSegment[];
  pushWallHistory: (walls: WallSegment[]) => void;
  replaceWallHistory: (walls: WallSegment[]) => void;
  undoWalls: () => WallSegment[] | null;
  redoWalls: () => WallSegment[] | null;
  canUndoWalls: boolean;
  canRedoWalls: boolean;
  socket: ToolSocketSource | null | undefined;
  ownEdits: OwnEdits;
  mapControls: MapControls;
  /** Set while the right button pans the map under a DM tool. */
  rightPanActiveRef: RefObject<boolean>;
  /** The map picture, which the brush snaps to edges in when grid snap is off. */
  mapImage: HTMLImageElement | null;
  markDirty: (...layers: MapLayer[]) => void;
}

export function useWallTool({
  isDM, currentMap, wallMode, setWallMode, wallSegments,
  pushWallHistory, replaceWallHistory, undoWalls, redoWalls, canUndoWalls, canRedoWalls,
  socket, ownEdits, mapControls, rightPanActiveRef, mapImage, markDirty,
}: UseWallToolArgs) {
  // Wall tool state (DM only)
  const [wallType, setWallType] = useState<WallType>('wall');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToEndpoint, setSnapToEndpoint] = useState(false);
  // Radius (in map-space pixels) within which a point snaps to an existing endpoint
  const ENDPOINT_SNAP_RADIUS = 16;
  const [wallInProgress, setWallInProgress] = useState<{ x: number; y: number }[]>([]); // current polyline points
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const [wallColor, setWallColor] = useState('#f97316'); // default orange
  const [splitHoverPoint, setSplitHoverPoint] = useState<{ x: number; y: number; wallId: string } | null>(null);
  const wallEraseBrushActiveRef = useRef(false);
  const wallErasedIdsRef = useRef<Set<string>>(new Set());
  // Polygon drawing mode state
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  /** Screen-space radius within which clicking the first polygon point closes the shape. */
  const POLYGON_CLOSE_RADIUS = 14;
  const WALL_ERASE_RADIUS = 24; // map-space pixels
  // Brush wall-painting mode state
  const [brushSize, setBrushSize] = useState(20);
  const wallBrushActiveRef = useRef(false);
  const wallBrushPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const [nearEndpoint, setNearEndpoint] = useState(false);

  /** Send the whole wall list to everyone, as undo and redo do. */
  const sendWalls = useCallback((segments: WallSegment[]) => {
    const socketInstance = socket?.getSocket();
    if (socketInstance && currentMap) {
      socketInstance.emit('walls:replace', ownEdits.tag({ mapId: currentMap.id, segments }));
    }
  }, [socket, currentMap, ownEdits]);

  /**
   * Send the whole wall list to everyone and add it to the undo stack.
   *
   * Bulk edits all go out this way: one message that replaces the array, which
   * is what the server validates and what "clear all" has always used.
   */
  const commitWalls = useCallback((next: WallSegment[]) => {
    pushWallHistory(next);
    sendWalls(next);
  }, [pushWallHistory, sendWalls]);

  const {
    selectedWallIds, setSelectedWallIds,
    wallMarquee, setWallMarquee, wallMarqueeRef,
    wallMoveRef,
    wallDragEndpointRef,
    selectedEndpoint, setSelectedEndpoint,
    moveSelectedWalls, deleteSelectedWalls, selectedSegmentType,
  } = useWallSelection({ wallSegments, commitWalls });

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
        id: randomId(),
        x1: wall.x1, y1: wall.y1,
        x2: Math.round(tA.x), y2: Math.round(tA.y),
        type: wall.type,
      });
    }

    // The door/window segment itself
    result.push({
      id: randomId(),
      x1: Math.round(tA.x), y1: Math.round(tA.y),
      x2: Math.round(tB.x), y2: Math.round(tB.y),
      type: newType,
    });

    // Stub B: from door end to wall end
    const stubBLen = (1 - tB.t) * wallLen;
    if (stubBLen >= MIN_STUB) {
      result.push({
        id: randomId(),
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

  /** Inverse of the canvas's screen-to-map conversion. */
  const mapPxToScreen = (mx: number, my: number) => ({
    x: mx * mapControls.zoom + mapControls.panOffset.x,
    y: my * mapControls.zoom + mapControls.panOffset.y,
  });

  // Close Polygon — commits all polygon edges as one wall history entry
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
        id: randomId(),
        x1: a.x, y1: a.y,
        x2: b.x, y2: b.y,
        type: wallType,
      });
    }
    setPolygonPoints([]);
    commitWalls([...wallSegments, ...newSegs]);
  }, [polygonPoints, wallSegments, wallType, currentMap, commitWalls]);

  // A new map starts with nothing half-drawn or held from the last one: a line
  // or polygon would join the old map's points to the new map's, and a
  // selection names walls the new map does not have.
  useEffect(() => {
    setWallInProgress([]);
    setPolygonPoints([]);
    setSelectedWallIds(new Set());
    setSelectedEndpoint(null);
    setWallMarquee(null);
    wallMarqueeRef.current = null;
    wallMoveRef.current = null;
    wallDragEndpointRef.current = null;
    setSplitHoverPoint(null);
    setHoveredWallId(null);
    wallEraseBrushActiveRef.current = false;
    wallErasedIdsRef.current = new Set();
    wallBrushActiveRef.current = false;
    wallBrushPointsRef.current = [];
  }, [currentMap?.id]);

  // Clear polygon when leaving polygon mode
  useEffect(() => {
    if (wallMode !== 'wall-polygon') {
      setPolygonPoints([]);
    }
  }, [wallMode]);

  /**
   * A change someone else made, carried into any drag in progress. A drag
   * previews from the walls as they were when it began and its drop puts that
   * back as the undo point, so without this a player's door toggle in the
   * middle of the DM's drag was undone for everyone.
   */
  const carryIntoDrags = (change: (walls: WallSegment[]) => WallSegment[]) => {
    if (wallMoveRef.current) wallMoveRef.current.preDragState = change(wallMoveRef.current.preDragState);
    const endpoint = wallDragEndpointRef.current;
    if (endpoint?.preDragState) endpoint.preDragState = change(endpoint.preDragState);
  };

  /** Step the walls back one edit, or forward again, and send the result. */
  const undoEdit = () => {
    const prev = undoWalls();
    if (prev !== null) sendWalls(prev);
  };
  const redoEdit = () => {
    const next = redoWalls();
    if (next !== null) sendWalls(next);
  };

  const tool: MapTool = {
    down({ e, mapPx, screenX, screenY }: PointerAt) {
      // Wall-draw mode: place a point (or finish polyline on double-click)
      if (wallMode === 'wall-draw' && isDM) {
        const snapped = snapPoint(mapPx);

        if (e.detail >= 2) {
          // Double-click: finish polyline without adding a duplicate final point
          if (wallInProgress.length >= 2) {
            // The last clicked point was already added on the first click of this double-click;
            // just end the polyline
          }
          setWallInProgress([]);
          return true;
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
          return true;
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

              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                for (const id of replace.remove) {
                  socketInstance.emit('wall:remove', ownEdits.tag({ mapId: currentMap.id, segmentId: id }));
                }
                for (const seg of replace.add) {
                  socketInstance.emit('wall:add', ownEdits.tag({ mapId: currentMap.id, segment: seg }));
                }
              }

              // End the polyline after placing a door/window
              setWallInProgress([]);
              return true;
            }
          }
        }

        // Default: just add the segment normally
        const newSeg: WallSegment = {
          id: randomId(),
          x1: prevPt.x, y1: prevPt.y,
          x2: snapped.x, y2: snapped.y,
          type: wallType,
        };

        // Optimistic local add (push to undo history)
        pushWallHistory([...wallSegments, newSeg]);

        // Emit to server
        const socketInstance = socket?.getSocket();
        if (socketInstance && currentMap) {
          socketInstance.emit('wall:add', ownEdits.tag({ mapId: currentMap.id, segment: newSeg }));
        }

        setWallInProgress((prev) => [...prev, snapped]);
        return true;
      }

      // Wall-polygon mode: place corners; close on click-near-first-point or double-click
      if (wallMode === 'wall-polygon' && isDM) {
        const snapped = snapPoint(mapPx);

        if (e.detail >= 2) {
          // Double-click closes the polygon
          closePolygon();
          return true;
        }

        // Check if clicking near the first point (close the polygon)
        if (polygonPoints.length >= 3) {
          const firstPt = polygonPoints[0];
          const firstScreen = mapPxToScreen(firstPt.x, firstPt.y);
          // Both in canvas pixels; the page position is somewhere else.
          const distToFirst = Math.hypot(screenX - firstScreen.x, screenY - firstScreen.y);
          if (distToFirst <= POLYGON_CLOSE_RADIUS) {
            closePolygon();
            return true;
          }
        }

        setPolygonPoints((prev) => [...prev, snapped]);
        return true;
      }

      // Wall-select mode: click near an endpoint to start dragging, or click a wall to select it
      if (wallMode === 'wall-select' && isDM) {
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
            return true;
          }
        }
        // No endpoint hit — fall through to segment selection
        setSelectedEndpoint(null);
        const hitThreshold = 12 / mapControls.zoom;
        const hit = wallSegments.find((s) => distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold);
        const additive = e.shiftKey;

        if (hit) {
          if (additive) {
            // Shift adds one, or takes it back out.
            setSelectedWallIds((prev) => {
              const next = new Set(prev);
              if (next.has(hit.id)) next.delete(hit.id);
              else next.add(hit.id);
              return next;
            });
            return true;
          }
          // Grabbing something already selected moves the whole selection;
          // grabbing anything else selects just that one, ready to be moved.
          const selection = selectedWallIds.has(hit.id) ? selectedWallIds : new Set([hit.id]);
          if (selection !== selectedWallIds) setSelectedWallIds(selection);
          wallMoveRef.current = {
            startX: mapPx.x,
            startY: mapPx.y,
            preDragState: [...wallSegments],
            hasDragged: false,
          };
          return true;
        }

        // Empty space: drag out a box. Shift keeps what was already selected.
        wallMarqueeRef.current = { startX: mapPx.x, startY: mapPx.y, additive };
        if (!additive) setSelectedWallIds(new Set());
        setWallMarquee(rectFromDrag(mapPx.x, mapPx.y, mapPx.x, mapPx.y));
        return true;
      }

      // Wall-split mode: click to split segment at the closest point
      if (wallMode === 'wall-split' && isDM) {
        const hitThreshold = 14 / mapControls.zoom;
        const hit = wallSegments.find((s) => distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold);
        if (hit) {
          const cp = closestPointOnSegment(mapPx.x, mapPx.y, hit);
          // Reject if the split point is too close to an endpoint (less than 10px from either end)
          const dA = Math.hypot(cp.x - hit.x1, cp.y - hit.y1);
          const dB = Math.hypot(cp.x - hit.x2, cp.y - hit.y2);
          if (dA < 10 || dB < 10) return true;
          const segA: WallSegment = { id: randomId(), x1: hit.x1, y1: hit.y1, x2: cp.x, y2: cp.y, type: hit.type };
          const segB: WallSegment = { id: randomId(), x1: cp.x, y1: cp.y, x2: hit.x2, y2: hit.y2, type: hit.type };
          const newSegs = wallSegments.filter((s) => s.id !== hit.id).concat(segA, segB);
          pushWallHistory(newSegs);
          const socketInstance = socket?.getSocket();
          if (socketInstance && currentMap) {
            socketInstance.emit('wall:remove', ownEdits.tag({ mapId: currentMap.id, segmentId: hit.id }));
            socketInstance.emit('wall:add', ownEdits.tag({ mapId: currentMap.id, segment: segA }));
            socketInstance.emit('wall:add', ownEdits.tag({ mapId: currentMap.id, segment: segB }));
          }
        }
        return true;
      }

      // Wall-erase mode: start erasing brush
      if (wallMode === 'wall-erase' && isDM) {
        wallEraseBrushActiveRef.current = true;
        wallErasedIdsRef.current = new Set();
        const r = WALL_ERASE_RADIUS / mapControls.zoom;
        wallSegments.forEach((s) => {
          if (distToSegment(mapPx.x, mapPx.y, s) <= r) wallErasedIdsRef.current.add(s.id);
        });
        markDirty('overlay');
        return true;
      }

      // Wall-brush mode: start painting
      if (wallMode === 'wall-brush' && isDM) {
        wallBrushActiveRef.current = true;
        const snapped = snapPoint(mapPx);
        wallBrushPointsRef.current = [{ x: snapped.x, y: snapped.y }];
        markDirty('overlay');
        return true;
      }
      return false;
    },
    move({ e, mapPx }: PointerAt) {
      // Wall-select mode: drag endpoint or update hover
      if (wallMode === 'wall-select' && isDM) {
        if (rightPanActiveRef.current) { mapControls.handleDrag(e); markDirty('terrain', 'tokens', 'overlay'); return true; }
        // Drag endpoint in progress
        if (wallDragEndpointRef.current && (e.buttons & 1)) {
          const snapped = snapPoint(mapPx);
          if (!wallDragEndpointRef.current.hasDragged) {
            const orig = wallDragEndpointRef.current.point;
            if (Math.hypot(snapped.x - orig.x, snapped.y - orig.y) > 2 / mapControls.zoom) {
              wallDragEndpointRef.current.hasDragged = true;
            }
          }
          if (!wallDragEndpointRef.current.hasDragged) { markDirty('overlay'); return true; }
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
          markDirty('overlay');
          return true;
        }
        // Dragging the selection to a new place
        if (wallMoveRef.current && (e.buttons & 1)) {
          const move = wallMoveRef.current;
          const dx = mapPx.x - move.startX;
          const dy = mapPx.y - move.startY;
          if (!move.hasDragged && Math.hypot(dx, dy) > 2 / mapControls.zoom) {
            move.hasDragged = true;
          }
          if (!move.hasDragged) { markDirty('overlay'); return true; }
          // Previewed against where the drag began, so the offset never
          // compounds. Changes from others reach preDragState (carryIntoDrags).
          const preview = move.preDragState.map((seg) =>
            selectedWallIds.has(seg.id) ? translateWallSegments([seg], dx, dy)[0] : seg
          );
          replaceWallHistory(preview);
          markDirty('overlay');
          return true;
        }

        // Dragging a box over empty space
        if (wallMarqueeRef.current && (e.buttons & 1)) {
          const { startX, startY } = wallMarqueeRef.current;
          setWallMarquee(rectFromDrag(startX, startY, mapPx.x, mapPx.y));
          markDirty('overlay');
          return true;
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
        return true;
      }

      // Wall-split mode: update split hover point
      if (wallMode === 'wall-split' && isDM) {
        if (rightPanActiveRef.current) mapControls.handleDrag(e);
        const hitThreshold = 14 / mapControls.zoom;
        const hit = wallSegments.find((s) => distToSegment(mapPx.x, mapPx.y, s) <= hitThreshold);
        if (hit) {
          const cp = closestPointOnSegment(mapPx.x, mapPx.y, hit);
          setSplitHoverPoint({ x: cp.x, y: cp.y, wallId: hit.id });
        } else {
          setSplitHoverPoint(null);
        }
        markDirty('overlay');
        return true;
      }

      // Wall-erase mode: continue erasing while left mouse button held; pan on right
      if (wallMode === 'wall-erase' && isDM) {
        if (rightPanActiveRef.current) {
          mapControls.handleDrag(e);
        } else if (wallEraseBrushActiveRef.current) {
          const r = WALL_ERASE_RADIUS / mapControls.zoom;
          wallSegments.forEach((s) => {
            if (distToSegment(mapPx.x, mapPx.y, s) <= r) wallErasedIdsRef.current.add(s.id);
          });
        }
        markDirty('overlay');
        return true;
      }

      // Wall-brush mode: continue painting stroke
      if (wallMode === 'wall-brush' && isDM) {
        if (rightPanActiveRef.current) {
          mapControls.handleDrag(e);
        } else if (wallBrushActiveRef.current) {
          const snapped = snapPoint(mapPx);
          const pts = wallBrushPointsRef.current;
          const last = pts[pts.length - 1];
          if (last && Math.hypot(snapped.x - last.x, snapped.y - last.y) >= 3) {
            pts.push({ x: snapped.x, y: snapped.y });
          }
        }
        markDirty('overlay');
        return true;
      }

      // Wall-polygon mode: handle right-pan; re-render for ghost line update
      if (wallMode === 'wall-polygon' && isDM) {
        if (rightPanActiveRef.current) mapControls.handleDrag(e);
        markDirty('overlay');
        return true;
      }

      // Wall-draw mode: just re-render for ghost line update (cursor moves)
      if (wallMode === 'wall-draw' && isDM) {
        if (rightPanActiveRef.current) mapControls.handleDrag(e);
        markDirty('overlay');
        return true;
      }
      return false;
    },
    up() {
      // Commit a move of the selection
      if (wallMoveRef.current) {
        const { hasDragged, preDragState: preDrag } = wallMoveRef.current;
        wallMoveRef.current = null;
        if (hasDragged) {
          const finalSegments = wallSegments;
          // Put the pre-drag state back on the stack, then the result, so undo
          // returns the walls where they started.
          replaceWallHistory(preDrag);
          commitWalls(finalSegments);
        }
      }

      // Settle the box, taking in everything it touched
      if (wallMarqueeRef.current) {
        const { additive } = wallMarqueeRef.current;
        const rect = wallMarquee;
        wallMarqueeRef.current = null;
        setWallMarquee(null);
        if (rect) {
          const caught = segmentsInRect(wallSegments, rect);
          setSelectedWallIds((prev) => (additive ? new Set([...prev, ...caught]) : caught));
        }
        markDirty('overlay');
      }

      // Commit wall endpoint drag or select endpoint for merge
      if (wallDragEndpointRef.current) {
        const { hasDragged, preDragState: preDrag, point } = wallDragEndpointRef.current;
        wallDragEndpointRef.current = null;
        if (hasDragged) {
          if (preDrag) replaceWallHistory(preDrag);
          commitWalls(wallSegments);
          setSelectedEndpoint(null);
        } else {
          if (preDrag) replaceWallHistory(preDrag);
          setSelectedEndpoint({ x: Math.round(point.x), y: Math.round(point.y) });
          setSelectedWallIds(new Set());
        }
      }

      // Commit wall erase brush
      if (wallMode === 'wall-erase' && wallEraseBrushActiveRef.current) {
        wallEraseBrushActiveRef.current = false;
        const erased = wallErasedIdsRef.current;
        if (erased.size > 0) {
          commitWalls(wallSegments.filter((s) => !erased.has(s.id)));
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
                id: randomId(),
                x1: Math.round(a.x), y1: Math.round(a.y),
                x2: Math.round(b.x), y2: Math.round(b.y),
                type: wallType,
              });
            }
            commitWalls([...wallSegments, ...newSegs]);
          }
        }
        markDirty('overlay');
      }
    },
    escape() {
      // Polygon mode: clear in-progress polygon first
      if (polygonPoints.length > 0) {
        setPolygonPoints([]);
        return true;
      }
      if (wallInProgress.length > 0) {
        setWallInProgress([]);
        return true;
      }
      if (wallMode === 'wall-select' && selectedWallIds.size > 0) {
        // Drop the selection before the tool, the same two-stage escape the
        // half-drawn wall above gets: letting go of what is held should not
        // also put the tool away.
        setSelectedWallIds(new Set());
        return true;
      }
      if (wallMode) {
        setWallMode(null);
        return true;
      }
      return false;
    },
  };

  /**
   * Wall selection keys, only while that tool is up so they do not steal
   * Ctrl+A or Delete from the rest of the page. True when the key was used.
   */
  const selectKey = (e: KeyboardEvent): boolean => {
    if (wallMode !== 'wall-select' || !currentMap) return false;
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelectedWallIds(new Set(wallSegments.map((seg) => seg.id)));
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWallIds.size > 0) {
      e.preventDefault();
      deleteSelectedWalls();
      return true;
    }
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = nudge[e.key];
    if (direction && selectedWallIds.size > 0) {
      e.preventDefault();
      // A whole grid square with Shift, otherwise a pixel at a time for
      // lining something up by eye.
      const step = e.shiftKey ? gridSquaresToPx(1, currentMap.gridSize) : 1;
      moveSelectedWalls(direction[0] * step, direction[1] * step);
      return true;
    }
    return false;
  };

  /** Ctrl+Z: the last polygon corner, then a half-drawn line, then an edit. */
  const undoKey = () => {
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
    undoEdit();
  };

  /** What the wall panel shows and does; MapCanvas adds what crosses tools. */
  const panel: DmWallControlsProps = {
    wallMode,
    onWallModeChange: (mode) => {
      setWallMode(mode);
      if (mode !== 'wall-select') { setSelectedWallIds(new Set()); setSelectedEndpoint(null); wallDragEndpointRef.current = null; setNearEndpoint(false); }
      if (mode !== 'wall-split') setSplitHoverPoint(null);
      if (mode !== 'wall-erase') { wallEraseBrushActiveRef.current = false; wallErasedIdsRef.current = new Set(); }
      if (mode !== 'wall-brush') { wallBrushActiveRef.current = false; wallBrushPointsRef.current = []; }
      if (mode !== 'wall-polygon') setPolygonPoints([]);
    },
    onCollapse: () => {
      setWallMode(null);
      setSelectedWallIds(new Set());
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
    },
    wallType,
    onWallTypeChange: setWallType,
    snapToGrid,
    onSnapToGridChange: (v) => { setSnapToGrid(v); if (v) setSnapToEndpoint(false); },
    snapToEndpoint,
    onSnapToEndpointChange: setSnapToEndpoint,
    wallCount: wallSegments.length,
    onClearAll: () => commitWalls([]),
    canUndo: canUndoWalls,
    canRedo: canRedoWalls,
    onUndo: undoEdit,
    onRedo: redoEdit,
    wallColor,
    onWallColorChange: setWallColor,
    selectedSegmentType,
    onSelectedTypeChange: (newType) => {
      if (selectedWallIds.size === 0 || !currentMap) return;
      // Applies to everything selected, so a boxful of walls can become
      // windows in one go.
      commitWalls(wallSegments.map((s) =>
        selectedWallIds.has(s.id) ? { ...s, type: newType } : s
      ));
    },
    onDeleteSelected: deleteSelectedWalls,
    selectedEndpoint: wallMode === 'wall-select' && selectedEndpoint ? (() => {
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
    })() : null,
    onMergeEndpoint: () => {
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
        id: randomId(),
        x1: Math.round(keepA.x), y1: Math.round(keepA.y),
        x2: Math.round(keepB.x), y2: Math.round(keepB.y),
        type: a!.seg.type,
      };
      const removeIds = new Set([a!.seg.id, b!.seg.id]);
      commitWalls(wallSegments.filter((s) => !removeIds.has(s.id)).concat(merged));
      setSelectedEndpoint(null);
    },
    brushSize,
    onBrushSizeChange: setBrushSize,
  };

  return {
    tool, selectKey, undoKey, redoKey: redoEdit, panel,
    commitWalls, carryIntoDrags,
    wallType, wallColor, snapToGrid, brushSize, snapPoint, findWallAtPoint,
    wallInProgress, polygonPoints, splitHoverPoint, hoveredWallId, nearEndpoint,
    wallErasedIdsRef, wallBrushPointsRef, WALL_ERASE_RADIUS, POLYGON_CLOSE_RADIUS,
    selectedWallIds, setSelectedWallIds, wallMarquee, wallDragEndpointRef, selectedEndpoint,
    deleteSelectedWalls, moveSelectedWalls,
  };
}

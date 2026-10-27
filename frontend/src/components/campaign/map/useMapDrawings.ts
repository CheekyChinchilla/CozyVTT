// ============================================
// The drawings on the map on screen, and the strokes on their way.
//
// The drawings are asked for once the campaign is joined, and again on each
// rejoin, map and change of role (`drawings:request`; a request sent before
// the join is dropped), and kept in the game store as the server's events
// change them. The server also sends the list by itself after Edit Map
// resizes the map and after a role change, which replaces what the page
// holds; a page whose role is not the DM's drops every drawing for the DM
// alone at once. Events for any map but the one on screen are ignored, and a
// map switch drops everything of the old map's.
//
// This page's own add is drawn at once, as `pending:<opId>`, and the stored
// drawing takes its place when the server echoes the `opId` (the echo comes
// before the answer) or answers with its id. A refused add is taken back,
// with the reason, and its preview is ended on every other screen. An erase
// or a clear is shown at once and, refused, put right from the server's list.
//
// The previews are not in the store: they change every frame. They are kept
// in a ref the overlay reads, and a ticker repaints and prunes them while any
// is shown (map/drawingPreviews.ts).
// ============================================

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { DoneAck } from '@/types';
import type {
  Drawing, DrawingAddAck, DrawingAddEvent, DrawingRemoveEvent, DrawingClearMineEvent, DrawingClearEvent, DrawingPreviewEvent,
  DrawingsRequestEvent, DrawingAddedBroadcast, DrawingRemovedBroadcast, DrawingsClearedBroadcast, DrawingPreviewedBroadcast,
  DrawingsStateBroadcast, NewDrawing, DrawingPreview,
} from '@/types/drawings';
import { useGameStore, useDrawings } from '@/stores/gameStore';
import { canEraseDrawing, drawingSentTo } from '@/utils/drawingRules';
import { randomId } from '@/utils/uuid';
import type { ActivePreview } from './layers/drawDrawings';
import type { MapLayer } from './useRenderLoop';
import { useCanvasTicker } from './useMapAnimations';
import { applyPreviewFrame, clearedBy, previewKey, prunePreviews } from './drawingPreviews';
import { watchLabelFonts } from './drawingGeometry';

/** The slice of the socket client the drawings need; the real one is services/socket.ts. */
export interface MapDrawingsSocket {
  addDrawing(data: DrawingAddEvent): Promise<DrawingAddAck>;
  removeDrawing(data: DrawingRemoveEvent): Promise<DoneAck>;
  clearMyDrawings(data: DrawingClearMineEvent): Promise<DoneAck>;
  clearDrawings(data: DrawingClearEvent): Promise<DoneAck>;
  sendDrawingPreview(data: DrawingPreviewEvent): void;
  requestDrawings(data: DrawingsRequestEvent): void;
  onDrawingAdded(cb: (data: DrawingAddedBroadcast) => void): void;
  onDrawingRemoved(cb: (data: DrawingRemovedBroadcast) => void): void;
  onDrawingsCleared(cb: (data: DrawingsClearedBroadcast) => void): void;
  onDrawingPreviewed(cb: (data: DrawingPreviewedBroadcast) => void): void;
  onDrawingsState(cb: (data: DrawingsStateBroadcast) => void): void;
  off(event: string, cb?: (data: never) => void): void;
}

export interface MapDrawingsOptions {
  socket: MapDrawingsSocket | null | undefined;
  mapId: string | undefined;
  /** 0 until the connection has joined the campaign, then a new number per join. */
  joinedEpoch: number;
  role: string | null | undefined;
  userId: string | undefined;
  markDirty: (...layers: MapLayer[]) => void;
  /** Says why the server refused something this page drew, erased or cleared. */
  onRefused: (message: string) => void;
}

export interface MapDrawings {
  /** The map's drawings as this member is sent them, in drawing order. */
  drawings: Drawing[];
  /** The strokes on their way and the laser pointers to show, by key. */
  previews: RefObject<Map<string, ActivePreview>>;
  /** Draw `drawing` on `mapId`; `previewId` is the stroke's preview it ends. */
  add(mapId: string, drawing: NewDrawing, previewId?: string): void;
  erase(drawing: Drawing): void;
  /** This member's own drawings on the map on screen. */
  clearMine(): void;
  /** Every drawing on the map on screen (the DM's). */
  clearAll(): void;
  /** One frame of this page's own stroke, for the other screens. */
  sendPreview(mapId: string, preview: DrawingPreview): void;
  /** Show one of this page's own previews among the others' (its laser's trail). */
  showPreview(preview: ActivePreview): void;
  dropPreview(key: string): void;
}

export function useMapDrawings({ socket, mapId, joinedEpoch, role, userId, markDirty, onRefused }: MapDrawingsOptions): MapDrawings {
  const drawings = useDrawings();
  const previews = useRef(new Map<string, ActivePreview>());
  const [previewsLive, setPreviewsLive] = useState(false);
  /** This page's adds on their way, by opId: the id they are drawn under until stored. */
  const pending = useRef(new Map<string, string>());
  /** What the handlers read, as of now: they are registered once. */
  const latest = useRef({ mapId, role, userId, onRefused });
  useLayoutEffect(() => {
    latest.current = { mapId, role, userId, onRefused };
  });

  // A map switch: nothing of the old map's stays, its strokes on their way included.
  useLayoutEffect(() => {
    const store = useGameStore.getState();
    if (store.drawingsMapId !== (mapId ?? null)) store.setDrawings(mapId ?? null, []);
    previews.current.clear();
    pending.current.clear();
    setPreviewsLive(false);
    markDirty('terrain', 'overlay');
  }, [mapId, markDirty]);

  // A font loading: every label is measured again as the map is next drawn.
  useEffect(() => watchLabelFonts(() => markDirty('terrain', 'overlay')), [markDirty]);

  // A page whose role may not have a drawing for the DM alone keeps none.
  useEffect(() => {
    if (role !== 'DM') useGameStore.getState().removeDrawings((d) => !drawingSentTo(role ?? undefined, d));
  }, [role]);

  // Asked for once joined, and on each rejoin, map and role.
  useEffect(() => {
    if (!socket || !mapId || !joinedEpoch) return;
    socket.requestDrawings({ mapId });
  }, [socket, mapId, joinedEpoch, role]);

  useEffect(() => {
    if (!socket) return;
    const onScreen = (id: string) => id === latest.current.mapId;
    const handleState = (data: DrawingsStateBroadcast) => {
      if (!onScreen(data.mapId)) return;
      const { role: viewer } = latest.current;
      // This page's own adds still on their way stay drawn.
      const stillOnTheirWay = new Set(pending.current.values());
      const ownOnTheirWay = useGameStore.getState().drawings.filter((d) => stillOnTheirWay.has(d.id));
      useGameStore.getState().setDrawings(data.mapId, [...data.drawings.filter((d) => drawingSentTo(viewer ?? undefined, d)), ...ownOnTheirWay]);
    };
    const handleAdded = (data: DrawingAddedBroadcast) => {
      if (!onScreen(data.mapId) || !drawingSentTo(latest.current.role ?? undefined, data.drawing)) return;
      const replacing = data.opId ? pending.current.get(data.opId) : undefined;
      if (data.opId && replacing) pending.current.delete(data.opId);
      useGameStore.getState().putDrawing(data.drawing, replacing);
      if (data.previewId && data.drawing.authorId && previews.current.delete(previewKey(data.drawing.authorId, data.previewId))) {
        markDirty('overlay');
      }
    };
    const handleRemoved = (data: DrawingRemovedBroadcast) => {
      if (onScreen(data.mapId)) useGameStore.getState().removeDrawing(data.drawingId);
    };
    const handleCleared = (data: DrawingsClearedBroadcast) => {
      if (!onScreen(data.mapId)) return;
      const { role: viewer, userId: me } = latest.current;
      useGameStore.getState().removeDrawings(clearedBy(data, { role: viewer, userId: me }));
    };
    const handlePreviewed = (data: DrawingPreviewedBroadcast) => {
      if (!onScreen(data.mapId)) return;
      applyPreviewFrame(previews.current, data.userId, data.preview, Date.now());
      if (previews.current.size > 0) setPreviewsLive(true);
      markDirty('overlay');
    };
    socket.onDrawingsState(handleState);
    socket.onDrawingAdded(handleAdded);
    socket.onDrawingRemoved(handleRemoved);
    socket.onDrawingsCleared(handleCleared);
    socket.onDrawingPreviewed(handlePreviewed);
    return () => {
      socket.off('drawings:state', handleState);
      socket.off('drawing:added', handleAdded);
      socket.off('drawing:removed', handleRemoved);
      socket.off('drawings:cleared', handleCleared);
      socket.off('drawing:previewed', handlePreviewed);
    };
  }, [socket, markDirty]);

  // While any preview shows: repaint, and let go of what has had its time.
  useCanvasTicker(previewsLive, () => {
    const left = prunePreviews(previews.current, Date.now());
    markDirty('overlay');
    if (!left) setPreviewsLive(false);
  });

  /** Put the map's list right from the server's, after a refusal. */
  const askAgain = useCallback((forMap: string) => {
    if (latest.current.mapId === forMap) socket?.requestDrawings({ mapId: forMap });
  }, [socket]);

  const add = useCallback((forMap: string, drawing: NewDrawing, previewId?: string) => {
    if (!socket) return;
    const { role: viewer, userId: me } = latest.current;
    const opId = randomId();
    const tempId = `pending:${opId}`;
    const shown: Drawing = {
      id: tempId,
      authorId: me ?? null,
      audience: viewer === 'DM' ? drawing.audience ?? 'ALL' : 'ALL',
      layer: drawing.layer ?? 'MARKUP',
      kind: drawing.kind,
      color: drawing.color,
      fillColor: drawing.fillColor ?? null,
      width: drawing.width,
      rotation: drawing.rotation ?? 0,
      sortKey: drawing.sortKey ?? 0,
      points: drawing.points,
      text: drawing.text ?? null,
      createdAt: new Date().toISOString(),
    };
    pending.current.set(opId, tempId);
    if (latest.current.mapId === forMap) useGameStore.getState().putDrawing(shown);
    void socket.addDrawing({ mapId: forMap, drawing, opId, ...(previewId ? { previewId } : {}) }).then((answer) => {
      const stillOnItsWay = pending.current.get(opId) === tempId;
      pending.current.delete(opId);
      if (answer.ok) {
        // No echo came first: the answer names the stored drawing.
        if (stillOnItsWay && latest.current.mapId === forMap) useGameStore.getState().putDrawing({ ...shown, id: answer.id }, tempId);
        return;
      }
      useGameStore.getState().removeDrawing(tempId);
      if (previewId) {
        socket.sendDrawingPreview({
          mapId: forMap,
          preview: { previewId, kind: drawing.kind, color: drawing.color, width: drawing.width, points: [], end: true },
        });
      }
      latest.current.onRefused(answer.error);
    });
  }, [socket]);

  const erase = useCallback((drawing: Drawing) => {
    const forMap = latest.current.mapId;
    if (!socket || !forMap || drawing.id.startsWith('pending:')) return;
    useGameStore.getState().removeDrawing(drawing.id);
    void socket.removeDrawing({ mapId: forMap, drawingId: drawing.id }).then((answer) => {
      if (answer.ok) return;
      // Put back, and the server's list asked for, which drops it again if
      // someone else erased it meanwhile.
      if (latest.current.mapId === forMap) useGameStore.getState().putDrawing(drawing);
      askAgain(forMap);
      latest.current.onRefused(answer.error);
    });
  }, [socket, askAgain]);

  const clearMine = useCallback(() => {
    const { mapId: forMap, role: viewer, userId: me } = latest.current;
    if (!socket || !forMap || !me) return;
    useGameStore.getState().removeDrawings((d) => d.layer === 'MARKUP' && d.authorId === me && canEraseDrawing(viewer ?? undefined, me, d));
    void socket.clearMyDrawings({ mapId: forMap }).then((answer) => {
      if (answer.ok) return;
      askAgain(forMap);
      latest.current.onRefused(answer.error);
    });
  }, [socket, askAgain]);

  const clearAll = useCallback(() => {
    const forMap = latest.current.mapId;
    if (!socket || !forMap) return;
    useGameStore.getState().removeDrawings((d) => d.layer === 'MARKUP');
    void socket.clearDrawings({ mapId: forMap, layer: 'MARKUP' }).then((answer) => {
      if (answer.ok) return;
      askAgain(forMap);
      latest.current.onRefused(answer.error);
    });
  }, [socket, askAgain]);

  const sendPreview = useCallback((forMap: string, preview: DrawingPreview) => {
    socket?.sendDrawingPreview({ mapId: forMap, preview });
  }, [socket]);

  const showPreview = useCallback((preview: ActivePreview) => {
    previews.current.set(preview.key, preview);
    setPreviewsLive(true);
    markDirty('overlay');
  }, [markDirty]);

  const dropPreview = useCallback((key: string) => {
    if (previews.current.delete(key)) markDirty('overlay');
  }, [markDirty]);

  return { drawings, previews, add, erase, clearMine, clearAll, sendPreview, showPreview, dropPreview };
}

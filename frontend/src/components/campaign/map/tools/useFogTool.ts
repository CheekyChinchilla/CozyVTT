// ============================================
// The DM's fog boxes, Reveal and Hide: the box is anchored on mouse down,
// follows the cursor, and sends one operation for every square it covers when
// the button is let go.
// ============================================

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { FogState } from '@/types/walls';
import type { FogToolMode } from '@/components/campaign/DmFogControls';
import { fogRectFromDrag, fogCellsInRect } from '../fogSelection';
import type { MapLayer } from '../useRenderLoop';
import type { MapControls, MapTool, PointerAt, ToolSocketSource } from './types';

interface UseFogToolArgs {
  isDM: boolean;
  mapId: string | undefined;
  fogMode: FogToolMode;
  fogState: FogState | null;
  setFogState: Dispatch<SetStateAction<FogState | null>>;
  socket: ToolSocketSource | null | undefined;
  mapControls: MapControls;
  /** True while the right button pans the map under a DM tool (MapCanvas starts it). */
  rightPanActiveRef: RefObject<boolean>;
  markDirty: (...layers: MapLayer[]) => void;
}

export function useFogTool({ isDM, mapId, fogMode, fogState, setFogState, socket, mapControls, rightPanActiveRef, markDirty }: UseFogToolArgs) {
  // Fog selection drag: anchor is fixed on mousedown, current follows the
  // cursor. Both in map pixels — the fog raster is top-left origin like map
  // pixels, so the box never touches the bottom-left grid convention.
  const fogDragAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const [fogDragCurrent, setFogDragCurrent] = useState<{ x: number; y: number } | null>(null);

  /**
   * Apply a set of fog cells: optimistic local update plus one server op.
   *
   * A rectangle drag produces exactly one call here, which is why the old
   * pending-cells buffer and its 80ms flush interval are gone — those existed
   * only to batch the continuous stream a brush stroke produced.
   */
  const applyFogCells = useCallback((cells: number[]) => {
    if (!mapId || !fogMode || cells.length === 0) return;

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

    socket?.getSocket()?.emit('fog:operation', { mapId, operation });
  }, [mapId, fogMode, socket, setFogState]);

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

  // Leaving fog mode, or switching maps, drops any drag in progress.
  useEffect(() => {
    cancelFogDrag();
  }, [fogMode, mapId, cancelFogDrag]);

  const tool: MapTool = {
    // Fog selection: anchor the box on mousedown
    down({ e, mapPx }: PointerAt) {
      if (!(fogMode && isDM && fogState)) return false;
      e.preventDefault(); // Prevent native drag — keeps mousemove firing during the drag
      fogDragAnchorRef.current = mapPx;
      setFogDragCurrent(mapPx);
      return true;
    },
    // Fog selection: track the cursor. Also runs with no button held, so the
    // idle single-cell outline follows the mouse before a drag starts.
    move({ e, mapPx }: PointerAt) {
      if (!(fogMode && isDM && fogState)) return false;
      if (rightPanActiveRef.current) {
        mapControls.handleDrag(e);
        markDirty('terrain', 'tokens', 'overlay');
        return true;
      }
      setFogDragCurrent(mapPx);
      markDirty('overlay');
      return true;
    },
    // Commit the fog selection box on mouse release — one operation per drag.
    up() {
      if (fogMode && fogDragAnchorRef.current) {
        const end = fogDragCurrent ?? fogDragAnchorRef.current;
        commitFogDrag(end.x, end.y);
      }
    },
    // A fog box being dragged is abandoned before any other Escape action
    escape() {
      if (!fogDragAnchorRef.current) return false;
      cancelFogDrag();
      return true;
    },
  };

  return { tool, fogDragAnchorRef, fogDragCurrent, cancelFogDrag };
}

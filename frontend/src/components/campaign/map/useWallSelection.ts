// ============================================
// Wall selection state — which walls the DM has gathered, the box being
// dragged out to gather more, the endpoint being dragged, and the two
// operations on the whole set.
//
// The pointer and keyboard handlers that drive it still live in MapCanvas;
// this owns the state and the set-wide operations so they can be tested on
// their own and so MapCanvas declares one fact fewer.
// ============================================

import { useCallback, useRef, useState } from 'react';
import type { WallSegment } from '@/types/walls';
import type { SelectionRect } from './mapSelection';
import { translateWallSegments } from './mapGeometry';

export interface WallMarqueeDrag {
  startX: number;
  startY: number;
  additive: boolean;
}

/** A drag that moves the selection, holding where it began so it can be undone. */
export interface WallMoveDrag {
  startX: number;
  startY: number;
  preDragState: WallSegment[];
  hasDragged: boolean;
}

export interface WallEndpointDrag {
  targets: Array<{ segId: string; end: 'start' | 'end' }>;
  point: { x: number; y: number };
  preDragState: WallSegment[] | null;
  hasDragged: boolean;
}

interface UseWallSelectionArgs {
  wallSegments: readonly WallSegment[];
  /** Send the whole wall list to everyone and add it to the undo stack. */
  commitWalls: (next: WallSegment[]) => void;
}

export function useWallSelection({ wallSegments, commitWalls }: UseWallSelectionArgs) {
  /**
   * Which walls are selected. A set because the DM can gather several: click,
   * Shift+click, a dragged box, or Ctrl+A. Most of what follows works on the
   * whole set; the properties panel is the exception, since a type belongs to
   * one wall at a time.
   */
  const [selectedWallIds, setSelectedWallIds] = useState<ReadonlySet<string>>(() => new Set());
  /** The box being dragged out over empty space, in map pixels. */
  const [wallMarquee, setWallMarquee] = useState<SelectionRect | null>(null);
  const wallMarqueeRef = useRef<WallMarqueeDrag | null>(null);
  const wallMoveRef = useRef<WallMoveDrag | null>(null);
  const wallDragEndpointRef = useRef<WallEndpointDrag | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<{ x: number; y: number } | null>(null);

  /** Move everything selected by an offset in map pixels. */
  const moveSelectedWalls = useCallback((dxPx: number, dyPx: number) => {
    if (selectedWallIds.size === 0) return;
    const moved = wallSegments.map((seg) =>
      selectedWallIds.has(seg.id) ? translateWallSegments([seg], dxPx, dyPx)[0] : seg
    );
    commitWalls(moved);
  }, [selectedWallIds, wallSegments, commitWalls]);

  const deleteSelectedWalls = useCallback(() => {
    if (selectedWallIds.size === 0) return;
    commitWalls(wallSegments.filter((seg) => !selectedWallIds.has(seg.id)));
    setSelectedWallIds(new Set());
  }, [selectedWallIds, wallSegments, commitWalls]);

  /**
   * The type shown in the wall panel: only when everything selected agrees,
   * since one dropdown cannot show two answers.
   */
  const selectedSegmentType = (() => {
    if (selectedWallIds.size === 0) return null;
    const types = new Set(
      wallSegments.filter((seg) => selectedWallIds.has(seg.id)).map((seg) => seg.type)
    );
    return types.size === 1 ? [...types][0] : null;
  })();

  return {
    selectedWallIds, setSelectedWallIds,
    wallMarquee, setWallMarquee, wallMarqueeRef,
    wallMoveRef,
    wallDragEndpointRef,
    selectedEndpoint, setSelectedEndpoint,
    moveSelectedWalls, deleteSelectedWalls, selectedSegmentType,
  };
}

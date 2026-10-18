// ============================================
// Doors, when no wall, fog or light tool is up: a click opens or closes one,
// hovering one shows the pointer, and a right-click opens its menu (which
// MapCanvas draws). Only a door the map offers this viewer counts
// (doorAccess.ts): the DM any, a player one they can see, a spectator none,
// as the server's wall:update checks.
// ============================================

import { useCallback, useState } from 'react';
import type { WallSegment, WallType } from '@/types/walls';
import type { WallToolMode } from '@/components/campaign/DmWallControls';
import type { FogToolMode } from '@/components/campaign/DmFogControls';
import type { LightToolMode } from '@/components/campaign/DmLightControls';
import type { ToastType } from '@/components/Toast';
import { offeredDoorAt, type DoorViewer } from '../doorAccess';
import type { OwnEdits } from '../ownEdits';
import type { MapLayer } from '../useRenderLoop';
import type { MapTool, PointerAt, ToolSocketSource } from './types';

interface UseDoorToolArgs {
  mapId: string | undefined;
  wallSegments: WallSegment[];
  /** Who is asking, for which doors the map offers them. */
  doorViewer: () => DoorViewer;
  zoom: number;
  wallMode: WallToolMode;
  fogMode: FogToolMode;
  lightMode: LightToolMode;
  /** Whether a token is held, which leaves the hover pointer to it. */
  holdingToken: boolean;
  /**
   * Whether a click would pick a token up or put the held one down. Those
   * win: zoomed out, a door's reach covers most of the square beside it.
   */
  tokenTakesClick: (at: PointerAt) => boolean;
  carryWallHistory: (change: (walls: WallSegment[]) => WallSegment[]) => void;
  socket: ToolSocketSource | null | undefined;
  ownEdits: OwnEdits;
  showToast: (message: string, type?: ToastType) => void;
  markDirty: (...layers: MapLayer[]) => void;
}

export function useDoorTool({
  mapId, wallSegments, doorViewer, zoom, wallMode, fogMode, lightMode, holdingToken, tokenTakesClick,
  carryWallHistory, socket, ownEdits, showToast, markDirty,
}: UseDoorToolArgs) {
  const [hoveredDoorId, setHoveredDoorId] = useState<string | null>(null); // for pointer cursor in pan mode

  /** The door the map offers this viewer under a point, if any. */
  const doorAt = (mapPx: { x: number; y: number }): WallSegment | undefined =>
    offeredDoorAt(wallSegments, mapPx.x, mapPx.y, 12 / zoom, doorViewer());

  /** Change a door's type and send it to everyone. */
  const setDoorType = useCallback((door: WallSegment, newType: WallType) => {
    if (!mapId) return;
    const updated = { ...door, type: newType };
    // Opening or closing a door is not an undoable edit: carried into the
    // whole history, so undo never closes a door again.
    carryWallHistory((walls) => walls.map((s) => s.id === door.id ? updated : s));
    socket?.getSocket()?.emit('wall:update', ownEdits.tag({ mapId, segment: updated }));
  }, [mapId, socket, carryWallHistory, ownEdits]);

  const tool: MapTool = {
    // Click near a door segment to toggle open/closed.
    down(at: PointerAt) {
      if (wallMode || fogMode || lightMode || tokenTakesClick(at)) return false;
      const door = doorAt(at.mapPx);
      if (!door) return false;
      if (door.type === 'door-locked') {
        showToast('This door is locked.', 'info');
        return true;
      }
      setDoorType(door, door.type === 'door-closed' ? 'door-open' : 'door-closed');
      return true;
    },
    // Door hover detection in pan mode — changes cursor to pointer over a
    // door. Never takes the move: the token and pan handling still see it.
    move({ mapPx }: PointerAt) {
      if (wallMode || fogMode || holdingToken) return false;
      const newHoveredDoorId = doorAt(mapPx)?.id ?? null;
      if (newHoveredDoorId !== hoveredDoorId) {
        setHoveredDoorId(newHoveredDoorId);
        markDirty('overlay');
      }
      return false;
    },
  };

  return { tool, doorAt, setDoorType, hoveredDoorId, setHoveredDoorId };
}

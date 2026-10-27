// ============================================
// The DM's light tools: Place drops a light with the panel's settings where
// the map is clicked, and Select picks the nearest light up to edit it or
// drag it somewhere else, sending it once when it is let go.
//
// The lights themselves stay with MapCanvas, which draws them and keeps them
// in step with the server.
// ============================================

import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { LightSource } from '@/types/walls';
import type { LightToolMode, LightPlacementDefaults } from '@/components/campaign/DmLightControls';
import { randomId } from '@/utils/uuid';
import type { OwnEdits } from '../ownEdits';
import type { MapLayer } from '../useRenderLoop';
import type { MapControls, MapTool, PointerAt, ToolSocketSource } from './types';

interface UseLightToolArgs {
  isDM: boolean;
  /** A player-view preview hides the light markers, so Select stays idle. */
  previewing: boolean;
  mapId: string | undefined;
  lightMode: LightToolMode;
  setLightMode: (mode: LightToolMode) => void;
  lightSources: LightSource[];
  setLightSources: Dispatch<SetStateAction<LightSource[]>>;
  /** The lights as they are now, for the release that ends a drag. */
  lightSourcesRef: RefObject<LightSource[]>;
  socket: ToolSocketSource | null | undefined;
  ownEdits: OwnEdits;
  mapControls: MapControls;
  /** Set while the right button pans the map under a DM tool. */
  rightPanActiveRef: RefObject<boolean>;
  markDirty: (...layers: MapLayer[]) => void;
}

export function useLightTool({
  isDM, previewing, mapId, lightMode, setLightMode, lightSources, setLightSources, lightSourcesRef,
  socket, ownEdits, mapControls, rightPanActiveRef, markDirty,
}: UseLightToolArgs) {
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [lightPlacementDefaults, setLightPlacementDefaults] = useState<LightPlacementDefaults>({
    brightRadius: 4, dimRadius: 8, color: '#ffcc66',
  });
  // Drag-to-move state for lights in select mode: the light, and where it
  // stood when it was picked up, to put it back if the drag is cancelled.
  const draggingLightRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

  // A new map has none of the last one's lights to have selected or in hand.
  useEffect(() => {
    setSelectedLightId(null);
    draggingLightRef.current = null;
  }, [mapId]);

  const tool: MapTool = {
    // Light tool: place or select/drag
    down({ mapPx }: PointerAt) {
      if (!(lightMode && isDM)) return false;
      if (lightMode === 'light-place') {
        const newLight: LightSource = {
          id: randomId(),
          x: Math.round(mapPx.x),
          y: Math.round(mapPx.y),
          brightRadius: lightPlacementDefaults.brightRadius,
          dimRadius: lightPlacementDefaults.dimRadius,
          color: lightPlacementDefaults.color,
          enabled: true,
        };
        // TODO(ui): past MAP_LIMITS.maxLightSources the server refuses light:add and this
        // light stays drawn; refuse at the cap before drawing.
        setLightSources((prev) => [...prev, newLight]);
        setSelectedLightId(newLight.id);
        const socketInstance = socket?.getSocket();
        if (socketInstance && mapId) {
          socketInstance.emit('light:add', ownEdits.tag({ mapId, light: newLight }));
        }
        return true;
      }
      // Placing a light while previewing shows its effect as a player sees it;
      // selecting one does nothing there, with no markers to show what is hit.
      if (previewing) return false;
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
        draggingLightRef.current = { id: closest.id, startX: closest.x, startY: closest.y };
      } else {
        setSelectedLightId(null);
      }
      return true;
    },
    // Light mode: handle right-pan and drag-to-move
    move({ e, mapPx }: PointerAt) {
      if (!(lightMode && isDM)) return false;
      if (rightPanActiveRef.current) mapControls.handleDrag(e);
      // Drag-to-move: update light position in real time
      if (draggingLightRef.current && (e.buttons & 1)) {
        const dragId = draggingLightRef.current.id;
        setLightSources((prev) => prev.map((l) =>
          l.id === dragId ? { ...l, x: Math.round(mapPx.x), y: Math.round(mapPx.y) } : l
        ));
        markDirty('overlay');
      }
      return true;
    },
    // Commit light drag-to-move
    up() {
      if (!draggingLightRef.current) return;
      const dragId = draggingLightRef.current.id;
      draggingLightRef.current = null;
      const movedLight = lightSourcesRef.current.find((l) => l.id === dragId);
      if (movedLight) {
        const socketInstance = socket?.getSocket();
        if (socketInstance && mapId) {
          socketInstance.emit('light:update', ownEdits.tag({ mapId, light: movedLight }));
        }
      }
    },
    // A cancelled drag puts the light back where it was; nothing was sent.
    cancel() {
      const drag = draggingLightRef.current;
      if (!drag) return;
      draggingLightRef.current = null;
      setLightSources((prev) => prev.map((l) => (l.id === drag.id ? { ...l, x: drag.startX, y: drag.startY } : l)));
      markDirty('overlay');
    },
    escape() {
      if (!lightMode) return false;
      setLightMode(null);
      setSelectedLightId(null);
      return true;
    },
  };

  return {
    tool,
    selectedLightId, setSelectedLightId,
    lightPlacementDefaults, setLightPlacementDefaults,
    draggingLightRef,
  };
}

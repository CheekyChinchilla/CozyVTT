// ============================================
// The shape every map tool's input handling takes.
//
// MapCanvas owns the canvas and its mouse and keyboard listeners; each tool
// owns what it does with them. A tool is asked in a fixed order, so the order
// in MapCanvas decides which tool a click goes to when two are up at once
// (a measuring tool can sit beside a DM tool).
// ============================================

import type React from 'react';
import type { useMapControls } from '@/hooks/useMapControls';

/** Zoom, pan and the screen-to-grid conversion, as `useMapControls` gives them. */
export type MapControls = ReturnType<typeof useMapControls>;

/** Where a mouse event landed, in the three spaces the tools work in. */
export interface PointerAt {
  e: React.MouseEvent<HTMLCanvasElement>;
  /** Canvas pixels from its top-left corner. */
  screenX: number;
  screenY: number;
  /** Map pixels, top-left origin, not snapped. */
  mapPx: { x: number; y: number };
  /** Grid squares, bottom-left origin, as `screenToGrid` gives them. */
  gridCoords: { x: number; y: number };
}

/**
 * One tool's share of the canvas's input. `down` and `move` return true when
 * the tool took the event, and no later tool is asked. On mouse up every tool
 * finishes whatever it holds. `escape` returns true when it let go of
 * something, which ends that key press.
 */
export interface MapTool {
  down?(at: PointerAt): boolean;
  move?(at: PointerAt): boolean;
  up?(): void;
  escape?(): boolean;
}

/** The slice of a socket the tools send on; the real one is socket.io's. */
export interface ToolSocket {
  emit(event: string, data: unknown): unknown;
}

export interface ToolSocketSource {
  getSocket(): ToolSocket | null | undefined;
}

// ============================================
// The shape every map tool's input handling takes.
//
// MapCanvas owns the canvas and its pointer and keyboard listeners; each tool
// owns what it does with them. A tool is asked in a fixed order, so the order
// in MapCanvas decides which tool a click goes to when two are up at once
// (a measuring tool can sit beside a DM tool).
// ============================================

import type { useMapControls } from '@/hooks/useMapControls';
import type { MapPointer } from '../mapPointer';

/** Zoom, pan and the screen-to-grid conversion, as `useMapControls` gives them. */
export type MapControls = ReturnType<typeof useMapControls>;

/** Where a pointer was, in the three spaces the tools work in, and what brought it. */
export interface PointerAt {
  e: MapPointer;
  /**
   * A mouse or a pen ('mouse'), or a finger's tap or drag. A finger's input
   * arrives once the gesture is known: a drag's down at the point the finger
   * landed, with the moves after it.
   */
  via: 'mouse' | 'tap' | 'drag';
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
 * the tool took the event, and no later tool is asked. When the button or
 * finger lifts, every tool finishes whatever it holds. `escape` returns true
 * when it let go of something, which ends that key press.
 */
export interface MapTool {
  down?(at: PointerAt): boolean;
  move?(at: PointerAt): boolean;
  /** `at` is where the pointer lifted, when the page knows. */
  up?(at?: PointerAt): void;
  /**
   * The browser or a second finger took the pointer: drop what the current
   * press holds and put back what it changed, leaving work that spans clicks
   * (a half-drawn line), selections and the mode alone. Every tool is told.
   */
  cancel?(): void;
  escape?(): boolean;
}

/** The slice of a socket the tools send on; the real one is socket.io's. */
export interface ToolSocket {
  emit(event: string, data: unknown): unknown;
}

export interface ToolSocketSource {
  getSocket(): ToolSocket | null | undefined;
}

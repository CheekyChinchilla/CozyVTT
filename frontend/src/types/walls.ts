/**
 * Wall and Fog of War Types — Frontend
 *
 * IMPORTANT: Keep this file in sync with backend/src/types/walls.ts.
 * These types define the data structures for the wall segment and fog of war
 * systems. Any changes here must be mirrored in the backend type file.
 */

// ── Wall Segments ─────────────────────────────────────────────────────────────

export type WallType = 'wall' | 'door-closed' | 'door-open' | 'door-locked' | 'window';

export interface WallSegment {
  id: string;   // UUID, assigned on creation
  x1: number;   // map-space pixels, origin top-left
  y1: number;
  x2: number;
  y2: number;
  type: WallType;
}

// ── Fog of War ────────────────────────────────────────────────────────────────

/**
 * Fog state: a flat array of booleans, one per fog cell.
 * Cell (col, row) maps to index: row * fogCols + col.
 * true = revealed to players, false = hidden.
 */
export interface FogState {
  fogCols: number;     // number of fog cells horizontally
  fogRows: number;     // number of fog cells vertically
  cellPx: number;      // fog cell size in map pixels (default 32)
  revealed: boolean[]; // length = fogCols * fogRows
}

export type FogOperation =
  | { op: 'reveal'; cells: number[] }   // cell indices to reveal
  | { op: 'hide'; cells: number[] }     // cell indices to hide
  | { op: 'reveal_all' }
  | { op: 'hide_all' };

// ── Light Sources ────────────────────────────────────────────────────────────

export interface LightSource {
  id: string;          // UUID, assigned on creation
  x: number;           // map-space pixels, origin top-left
  y: number;
  brightRadius: number; // bright-light radius in grid squares (full visibility, strong glow)
  dimRadius: number;    // dim-light radius in grid squares (lightly obscured, faint glow; >= brightRadius)
  color: string;        // hex color e.g. '#ffcc66' (warm amber default)
  enabled: boolean;     // toggle without deleting (extinguished torch)
}

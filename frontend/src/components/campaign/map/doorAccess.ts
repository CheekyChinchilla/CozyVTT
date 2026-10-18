// ============================================
// Which doors the map offers a viewer: to open or close with a click or the
// door menu, and to point at. The server refuses the rest (wall:update), so
// this only keeps a page from drawing a change that would be undone.
//
// Pure: no React, no canvas.
// ============================================

import type { WallSegment } from '@/types/walls';
import { doorBesideRevealed, type FogGrid } from '@/utils/doorFog';
import { distToSegment } from './mapGeometry';

export interface DoorViewer {
  /** The viewer's role in the campaign. */
  role: string | null | undefined;
  lightingEnabled: boolean;
  /** Whether the viewer makes out a point, by the shared visibility rule. */
  canSee: (x: number, y: number) => boolean;
  /** Manual fog as this viewer has it, or null when the map has none. */
  fog?: { grid: FogGrid; isRevealed: (cellIndex: number) => boolean } | null;
}

function isDoor(segment: WallSegment): boolean {
  return segment.type === 'door-closed' || segment.type === 'door-open' || segment.type === 'door-locked';
}

/**
 * Whether the map offers this viewer a door. The DM any door. A player only
 * a door they can see: on a lit map, where its middle is seen by the rule the
 * walls layer shows doors by; under manual fog, one beside a revealed square
 * (utils/doorFog.ts); otherwise every door. A spectator none, since
 * spectators change nothing at the table.
 */
export function doorOffered(door: WallSegment, viewer: DoorViewer): boolean {
  if (viewer.role === 'DM') return true;
  if (viewer.role !== 'PLAYER') return false;
  if (viewer.lightingEnabled && !viewer.canSee((door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2)) return false;
  return !viewer.fog || doorBesideRevealed(door, viewer.fog.grid, viewer.fog.isRevealed);
}

/** The door within `threshold` map pixels of a point that the map offers this viewer, if any. */
export function offeredDoorAt(
  walls: readonly WallSegment[],
  x: number,
  y: number,
  threshold: number,
  viewer: DoorViewer
): WallSegment | undefined {
  return walls.find((s) => isDoor(s) && distToSegment(x, y, s) <= threshold && doorOffered(s, viewer));
}

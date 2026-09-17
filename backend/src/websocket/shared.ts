// ============================================
// WebSocket shared state & helpers
//
// Extracted from the former events.ts monolith so the
// per-domain handler modules can share the rate limiters, fog helpers,
// and the Token shape. Behaviour is unchanged — this is a verbatim lift.
// ============================================

import type { FogState, FogOperation } from '../types/walls';
import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from './auth';
import { getSpiritVisibilityBatch, filterMapData, type MapData } from '../utils/spirit-layer';

/**
 * A token as stored in the `Map.tokens` JSON column.
 *
 * This is the single declaration of that shape for the backend — `routes/maps.ts`
 * imports it rather than keeping its own. It used to keep its own, and the two
 * drifted: this copy was missing `type`, `disposition`, `hp` and `initiative`,
 * all of which the REST routes write and the websocket handlers read. Nothing
 * caught it because every reader reached the column through `as any[]`.
 *
 * The fields the REST routes only set conditionally are optional here, because
 * tokens placed by older versions of the app genuinely do not carry them.
 */
export interface Token {
  id: string;
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layer: 'token' | 'spirit';
  visible: boolean;
  controlledBy?: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, unknown>;
  type?: 'player' | 'npc' | 'object';
  disposition?: 'friendly' | 'neutral' | 'hostile' | null;
  hp?: { current: number; max: number; temp: number } | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  sightRadius?: number;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, unknown> | null;
  creatureTemplateId?: string | null;
}

/**
 * Rate Limiter for WebSocket Events
 * Tracks timestamps of recent events per user
 * Rate Limiting
 */
export class RateLimiter {
  private events: Map<string, number[]> = new Map();

  /**
   * Check if user is within rate limit
   * @param userId - User ID
   * @param limit - Maximum number of events allowed
   * @param windowMs - Time window in milliseconds
   * @returns true if within limit, false if exceeded
   */
  check(userId: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const userEvents = this.events.get(userId) || [];

    // Remove timestamps outside the time window
    const recentEvents = userEvents.filter((timestamp) => now - timestamp < windowMs);

    // Check if user has exceeded the limit
    if (recentEvents.length >= limit) {
      return false;
    }

    // Add current event timestamp
    recentEvents.push(now);
    this.events.set(userId, recentEvents);

    return true;
  }

  /**
   * Clear old events periodically to prevent memory leaks
   */
  cleanup(windowMs: number): void {
    const now = Date.now();
    for (const [userId, timestamps] of this.events.entries()) {
      const recentEvents = timestamps.filter((timestamp) => now - timestamp < windowMs);
      if (recentEvents.length === 0) {
        this.events.delete(userId);
      } else {
        this.events.set(userId, recentEvents);
      }
    }
  }
}

// Rate limiter instances (shared across handler modules)
export const diceRollLimiter = new RateLimiter();
export const chatMessageLimiter = new RateLimiter();
export const fogOperationLimiter = new RateLimiter(); // Max 10 fog ops/second per socket

// flood ceilings for the high-frequency map surfaces. Generous
// enough that no legitimate interaction is ever throttled (a drag emits ~60
// token.move/s; human wall/light edits are a few per second) — these exist to
// blunt a misbehaving/malicious client, so over-limit events are dropped
// silently rather than surfaced as an error toast (same policy as fog).
export const tokenMoveLimiter = new RateLimiter(); // Max 150 token-move events/second per socket
export const mapEditLimiter = new RateLimiter();   // Max 40 wall/light edits/second per socket
// Map pings are a deliberate human gesture, so the ceiling is low compared to
// the drag/edit streams above. Over-limit pings are dropped silently — an error
// toast for pressing the ping key too often is worse than nothing happening.
export const pingLimiter = new RateLimiter();      // Max 10 pings/10s per socket
// Explored-memory reveals arrive as a player's vision moves; a client sends
// at most a few a second. Over-limit reveals are dropped silently.
export const explorationRevealLimiter = new RateLimiter(); // Max 10 reveals/second per socket

// Cleanup old events every 5 minutes. unref() so this housekeeping timer
// never holds the process open on its own (matters for test runners and
// graceful shutdown — the HTTP server keeps the process alive in production).
setInterval(() => {
  diceRollLimiter.cleanup(60 * 1000); // Dice rolls: 1 minute window
  chatMessageLimiter.cleanup(60 * 1000); // Chat messages: 1 minute window
  fogOperationLimiter.cleanup(5 * 1000); // Fog ops: 5 second window
  tokenMoveLimiter.cleanup(1000); // Token moves: 1 second window
  mapEditLimiter.cleanup(1000); // Map edits: 1 second window
  pingLimiter.cleanup(10 * 1000); // Map pings: 10 second window
  explorationRevealLimiter.cleanup(5 * 1000); // Explored-memory reveals: 5 second window
}, 5 * 60 * 1000).unref();

// ── Fog/Wall Helpers ─────────────────────────────────────────────────────────

export function buildWsFogState(map: { width: number; height: number; gridSize: number }): FogState {
  // One fog cell per grid square so fog perfectly aligns with the visible grid.
  const cellPx = map.gridSize;
  const fogCols = map.width;   // grid columns
  const fogRows = map.height;  // grid rows
  return {
    fogCols,
    fogRows,
    cellPx,
    revealed: new Array(fogCols * fogRows).fill(false),
  };
}

/**
 * Load fog state from DB, rebuilding from scratch if the stored cell size no longer
 * matches the map's current grid size (e.g. after a cellPx migration or grid resize).
 */
export function loadFogState(map: { width: number; height: number; gridSize: number }, stored: FogState | null): FogState {
  const expected = buildWsFogState(map);
  if (!stored || stored.cellPx !== expected.cellPx || stored.fogCols !== expected.fogCols || stored.fogRows !== expected.fogRows) {
    return expected; // Reset: stale/misaligned fog data
  }
  return stored;
}

export function applyWsFogOperation(fog: FogState, operation: FogOperation): void {
  const total = fog.fogCols * fog.fogRows;
  switch (operation.op) {
    case 'reveal_all':
      fog.revealed.fill(true);
      break;
    case 'hide_all':
      fog.revealed.fill(false);
      break;
    case 'reveal':
      for (const idx of operation.cells) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = true;
      }
      break;
    case 'hide':
      for (const idx of operation.cells) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = false;
      }
      break;
  }
}

/**
 * Send a map's fog to every socket in the campaign, by role: the DM gets the
 * full grid, everyone else their revealed cells. The socket handler and the
 * REST route both go through this, so a reveal reaches the table the same
 * way whichever path made it.
 */
export async function broadcastFogState(io: Server, campaignId: string, mapId: string, fog: FogState): Promise<void> {
  const sockets = await io.in(campaignId).fetchSockets();
  for (const s of sockets) {
    const role = (s as unknown as AuthenticatedSocket).role;
    if (role === 'DM') {
      s.emit('fog:updated', { mapId, fogState: fog });
    } else {
      s.emit('fog:cells', {
        mapId,
        revealedCells: revealedCellIndices(fog),
        fogCols: fog.fogCols,
        fogRows: fog.fogRows,
        cellPx: fog.cellPx,
      });
    }
  }
}

/** Derive the list of revealed cell indices from a FogState for player broadcasts. */
export function revealedCellIndices(fog: FogState): number[] {
  return fog.revealed.reduce<number[]>((acc, v, i) => {
    if (v) acc.push(i);
    return acc;
  }, []);
}

/** Context handed to every per-domain handler registrar. */
export interface HandlerContext {
  io: import('socket.io').Server;
  socket: import('./auth').AuthenticatedSocket;
}

/**
 * Send every connected member the map as they are allowed to see it: the DM
 * everything, each player only what their role, plane and sight permit. One
 * resync path for a map switch, a spirit-realm crossing, and a lighting or
 * Global Illumination change, so a player is never left holding a token the
 * server would no longer send them, or missing one it now would.
 */
export async function broadcastMapData(io: Server, campaignId: string, map: MapData): Promise<void> {
  const members = await io.in(campaignId).fetchSockets();
  const visibility = await getSpiritVisibilityBatch(
    campaignId,
    members.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
  );
  for (const s of members) {
    const member = s as unknown as AuthenticatedSocket;
    const spiritVisible = member.role === 'DM' ? true : member.userId ? (visibility.get(member.userId) ?? false) : false;
    const mapData = filterMapData(map, member.role || 'PLAYER', spiritVisible, member.userId);
    s.emit('map.changed', { mapId: map.id, mapData, spiritVisible });
  }
}

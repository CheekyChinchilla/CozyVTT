// ============================================
// WebSocket shared state & helpers
//
// Extracted from the former events.ts monolith so the
// per-domain handler modules can share the rate limiters, fog helpers,
// and the Token shape. Behaviour is unchanged — this is a verbatim lift.
// ============================================

import type { FogState, FogOperation } from '../types/walls';

// Token interface
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
  metadata: Record<string, any>;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, any> | null;
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

// Cleanup old events every 5 minutes. unref() so this housekeeping timer
// never holds the process open on its own (matters for test runners and
// graceful shutdown — the HTTP server keeps the process alive in production).
setInterval(() => {
  diceRollLimiter.cleanup(60 * 1000); // Dice rolls: 1 minute window
  chatMessageLimiter.cleanup(60 * 1000); // Chat messages: 1 minute window
  fogOperationLimiter.cleanup(5 * 1000); // Fog ops: 5 second window
  tokenMoveLimiter.cleanup(1000); // Token moves: 1 second window
  mapEditLimiter.cleanup(1000); // Map edits: 1 second window
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

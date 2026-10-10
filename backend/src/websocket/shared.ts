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
import { campaignSockets, stillInCampaign } from './utils';
import { prisma } from '../config/database';
import { canReadMap } from '../services/permissions';
import logger from '../utils/logger';
import { MAP_LIMITS, MAX_FOG_CELLS } from '../validators/maps';

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
  /** Identity hidden from players who do not control it; see utils/tokenMask.ts. DM-only on write. */
  obscured?: boolean;
}

/** One window of a flood ceiling: at most `limit` events in any `windowMs`. */
export interface CeilingWindow {
  limit: number;
  windowMs: number;
}

/** Every limiter, so the housekeeping below reaches each one without a list to keep in step. */
const everyLimiter = new Set<RateLimiter>();

/**
 * Rate Limiter for WebSocket Events
 * Tracks timestamps of recent events per user
 * Rate Limiting
 */
export class RateLimiter {
  private events: Map<string, number[]> = new Map();
  /** The longest window any check has used: how long an event can still be counted. */
  private longestWindowMs = 0;

  constructor() {
    everyLimiter.add(this);
  }

  /**
   * Check if user is within rate limit
   * @param userId - User ID
   * @param limit - Maximum number of events allowed
   * @param windowMs - Time window in milliseconds
   * @returns true if within limit, false if exceeded
   */
  check(userId: string, limit: number, windowMs: number): boolean {
    return this.checkAll(userId, [{ limit, windowMs }]);
  }

  /**
   * Whether one more event fits every window at once, counting it if so. A
   * refused event is not counted, so a flood does not push the allowance
   * further away.
   */
  checkAll(key: string, windows: readonly CeilingWindow[]): boolean {
    const now = Date.now();
    const longest = Math.max(...windows.map((w) => w.windowMs));
    if (longest > this.longestWindowMs) this.longestWindowMs = longest;

    // Remove timestamps outside the longest window
    const recentEvents = (this.events.get(key) || []).filter((timestamp) => now - timestamp < longest);
    const within = windows.every(
      ({ limit, windowMs }) => recentEvents.filter((timestamp) => now - timestamp < windowMs).length < limit
    );
    if (within) recentEvents.push(now);
    if (recentEvents.length > 0) this.events.set(key, recentEvents);
    else this.events.delete(key);
    return within;
  }

  /**
   * Forget the events no check can count any more. Pruned by the longest
   * window this limiter has been checked with, not one the caller picks: the
   * chat cooldown runs up to five minutes, and pruning it at one let a player
   * post before their cooldown was over.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [userId, timestamps] of this.events.entries()) {
      const recentEvents = timestamps.filter((timestamp) => now - timestamp < this.longestWindowMs);
      if (recentEvents.length === 0) {
        this.events.delete(userId);
      } else {
        this.events.set(userId, recentEvents);
      }
    }
  }
}

// Rate limiter instances (shared across handler modules)
export const chatMessageLimiter = new RateLimiter();
export const fogOperationLimiter = new RateLimiter(); // Max 10 fog ops/second per user

// flood ceilings for the high-frequency map surfaces. Generous
// enough that no legitimate interaction is ever throttled (a drag emits ~60
// token.move/s; human wall/light edits are a few per second) — these exist to
// blunt a misbehaving/malicious client, so over-limit events are dropped
// silently rather than surfaced as an error toast (same policy as fog).
export const tokenMoveLimiter = new RateLimiter(); // Max 150 drag frames (token.move)/second per user
export const mapEditLimiter = new RateLimiter();   // Max 40 wall/light edits/second per user
// Map pings are a deliberate human gesture, so the ceiling is low compared to
// the drag/edit streams above. Over-limit pings are dropped silently — an error
// toast for pressing the ping key too often is worse than nothing happening.
export const pingLimiter = new RateLimiter();      // Max 10 pings/10s per user
// Explored-memory reveals arrive as a player's vision moves; a client sends
// at most a few a second. Over-limit reveals are dropped silently.
export const explorationRevealLimiter = new RateLimiter(); // Max 10 reveals/second per user

/**
 * The key a per-socket flood ceiling is counted under: the user, so that
 * opening more sockets does not multiply the budget. Thirty sockets of one
 * player each at their own limit stalled the server; one player is one
 * budget. Before authentication the socket id stands in.
 */
export function limiterKey(socket: { userId?: string; id: string }): string {
  return socket.userId ?? socket.id;
}

// The requests a client makes when it opens a map or reconnects: walls,
// lights, fog, explored memory, presence, the initiative order. A client
// sends each once per load; a flood of any of them is database work for
// nothing (the initiative reply alone runs several queries), so each is
// answered at most a few times a second per user and the rest are dropped
// silently, like the other ceilings.
export const stateRequestLimiter = new RateLimiter();
const STATE_REQUESTS_PER_SECOND = 5;

export function stateRequestAllowed(socket: { userId?: string; id: string }, event: string): boolean {
  return stateRequestLimiter.check(`${limiterKey(socket)}:${event}`, STATE_REQUESTS_PER_SECOND, 1000);
}

/** A per-user flood ceiling on one event, and what the sender is told when it is reached. */
export interface SocketCeiling {
  windows: readonly CeilingWindow[];
  refusal: string;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const tokenMoves: SocketCeiling = {
  windows: [{ limit: 30, windowMs: SECOND }],
  refusal: 'Too many token moves at once. Wait a moment, then move it again.',
};
/** The DM's events, each its own budget: a click apiece in the web client, a tool call apiece from the bridge. */
const dmEvent = (what: string): SocketCeiling => ({
  windows: [{ limit: 50, windowMs: SECOND }],
  refusal: `Too many ${what} at once. Wait a moment, then try again.`,
});
const atmosphere = dmEvent('atmosphere changes');
const spiritLayer = dmEvent('spirit layer changes');
const initiative = dmEvent('initiative changes');

/**
 * Abuse ceilings on the events a member sends by hand, each its own budget
 * per user across all their sockets. Each is at least five times the busiest
 * real use of that event, from the web client at a fast table or from the
 * community MCP bridge, whichever is higher, so nobody playing reaches one;
 * they exist to stop a script. busyTable.integration.test.ts plays that use
 * and fails if a number here drops below five times it.
 *
 * The web client sends one pick-up and one drop per drag, one change per HP
 * button, one message per send. The bridge sends one event per tool call
 * and paces only dice.
 */
export const SOCKET_CEILINGS = {
  'chat.message': {
    windows: [{ limit: 50, windowMs: SECOND }, { limit: 300, windowMs: MINUTE }],
    refusal: 'Too many chat messages at once. Wait a few seconds, then send yours again.',
  },
  // A player's initiative.roll counts against the same budget. The web
  // client's dice panel waits a short while after a refusal that starts
  // "Rate limit exceeded".
  'dice.roll': {
    windows: [{ limit: 50, windowMs: SECOND }, { limit: 200, windowMs: MINUTE }],
    refusal: 'Rate limit exceeded: too many dice rolls at once. Wait a few seconds, then roll again.',
  },
  'character.hp.update': {
    windows: [{ limit: 50, windowMs: SECOND }],
    refusal: 'Too many hit point changes at once. Wait a moment, then try again.',
  },
  'character.hitdice.spend': {
    windows: [{ limit: 50, windowMs: SECOND }],
    refusal: 'Too many hit dice spent at once. Wait a moment, then try again.',
  },
  // Their own budget, apart from the drag frames: each drop is a write under
  // the map's lock, and on a lit map line of sight for every player.
  'token.move.start': tokenMoves,
  'token.move.end': tokenMoves,
  // A page joins once per socket, and again after each reconnect; a browser
  // restoring its tabs joins with all of them at once.
  authenticate: {
    windows: [{ limit: 50, windowMs: 10 * SECOND }],
    refusal: 'Too many attempts to join a campaign at once. Wait a few seconds, then reload the page.',
  },
  // The DM's. Any user can run a campaign of their own, so these are as open
  // to a script as the players' events. map.change is the costly one: the
  // whole map, rebuilt for and sent to every member.
  'map.change': dmEvent('map updates'),
  'atmosphere.effect.set': atmosphere,
  'atmosphere.audio.set': atmosphere,
  'vibe.update': atmosphere,
  'spirit_layer.toggle': spiritLayer,
  'spirit_layer.style_change': spiritLayer,
  'spirit_layer.token.toggle': spiritLayer,
  'initiative.add': initiative,
  'initiative.remove': initiative,
  'initiative.set': initiative,
  'initiative.reorder': initiative,
  'initiative.start': initiative,
  'initiative.next': initiative,
  'initiative.end': initiative,
  // The DM's own rolls; a player's count against their dice rolls.
  'initiative.roll': initiative,
  'dice.clearHistory': dmEvent('requests to clear the dice log'),
  'exploration:reset': dmEvent('explored-area resets'),
} satisfies Record<string, SocketCeiling>;

export type CeilingEvent = keyof typeof SOCKET_CEILINGS;

/**
 * How many sockets one user may hold open at once, in every campaign
 * together. Each campaign page is one; a connection that dropped without
 * closing lingers for up to 85 seconds until its heartbeat times out. Every
 * fan-out to a campaign is worked out per socket, so this bounds how far one
 * account can multiply what the rest of the table's events cost.
 */
export const MAX_SOCKETS_PER_USER = 40;
export const TOO_MANY_SOCKETS =
  `Too many CozyVTT tabs or devices are open on this account at once (the most is ${MAX_SOCKETS_PER_USER}). Close one, then reload this page.`;

const ceilingLimiter = new RateLimiter();
/** One refusal notice per socket and event in this long; the rest are refused quietly. */
const REFUSAL_NOTICE_MS = 10 * SECOND;
const refusalNotices = new RateLimiter();

/**
 * Whether this socket's user may send one more `event` now, counting it if
 * so. Checked before any work. A refused event changes nothing; its socket
 * is told once in REFUSAL_NOTICE_MS, not once per event, and nothing is
 * logged, so a flood fills neither the socket nor the log.
 */
export function withinCeiling(socket: AuthenticatedSocket, event: CeilingEvent): boolean {
  const ceiling: SocketCeiling = SOCKET_CEILINGS[event];
  if (ceilingLimiter.checkAll(`${limiterKey(socket)}:${event}`, ceiling.windows)) return true;
  if (refusalNotices.check(`${socket.id}:${event}`, 1, REFUSAL_NOTICE_MS)) {
    socket.emit('error', { message: ceiling.refusal });
  }
  return false;
}

// Cleanup old events every 5 minutes, in every limiter there is. unref() so
// this housekeeping timer never holds the process open on its own (matters
// for test runners and graceful shutdown — the HTTP server keeps the process
// alive in production).
setInterval(() => {
  for (const limiter of everyLimiter) limiter.cleanup();
}, 5 * 60 * 1000).unref();

// ── Fog/Wall Helpers ─────────────────────────────────────────────────────────

/**
 * A map has more grid squares than fog can cover (MAX_FOG_CELLS). Only a map
 * stored before the size limits existed can be this large; it still loads,
 * and every fog and explored-area path answers with this message instead.
 */
export class FogTooLargeError extends Error {
  constructor(width: number, height: number) {
    super(
      `This map is too big for fog of war and explored areas: it is ${width} by ${height} squares, ` +
      `and they work on maps of up to ${MAX_FOG_CELLS.toLocaleString('en-US')} squares ` +
      `(${MAP_LIMITS.maxSide} by ${MAP_LIMITS.maxSide}). ` +
      `Make the map smaller in Edit Map to use them.`
    );
    this.name = 'FogTooLargeError';
  }
}

/** Whether fog can be built for a map of this size. */
export function fogFits(map: { width: number; height: number }): boolean {
  return map.width * map.height <= MAX_FOG_CELLS;
}

/**
 * A fresh, fully hidden fog grid for a map. Refuses a map with more squares
 * than MAX_FOG_CELLS, before allocating anything: the grid is a dense array,
 * and one for a map of tens of thousands of squares a side exhausted the
 * heap, which no try/catch survives.
 */
export function buildWsFogState(map: { width: number; height: number; gridSize: number }): FogState {
  if (!fogFits(map)) throw new FogTooLargeError(map.width, map.height);
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
 * Throws FogTooLargeError for a map too large for fog, whatever is stored.
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
  // A prepared map's fog is the DM's until they switch to it (canReadMap).
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
  const sockets = await campaignSockets(io, campaignId);
  for (const s of sockets) {
    const role = (s as unknown as AuthenticatedSocket).role;
    if (!canReadMap(role, mapId, campaign?.currentMapId)) continue;
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

/**
 * Send a user's explored memory to those who show it: that user's own
 * sockets in the campaign, so a second tab stays in step, and the DM sockets
 * whose Player Preview is on that user (previewingMemoryOf), so the preview
 * follows the memory as it grows. Each send is the whole memory, a few times
 * a second while a player moves, so a DM socket not previewing them is not
 * sent it. Nobody else: one player's memory is never another's to see.
 */
export async function broadcastExplorationState(
  io: Server,
  campaignId: string,
  mapId: string,
  userId: string,
  cells: number[]
): Promise<void> {
  const sockets = await campaignSockets(io, campaignId);
  for (const s of sockets) {
    const member = s as unknown as AuthenticatedSocket;
    if (member.userId === userId || (member.role === 'DM' && member.previewingMemoryOf === userId)) {
      s.emit('exploration:state', { mapId, userId, cells });
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
 * resync path for a map switch, a spirit-realm crossing, a lighting or
 * Global Illumination change, and a light, wall or door change on a lit map,
 * so a player is never left holding a token the server would no longer send
 * them, or missing one it now would. `players` leaves out the DM, who is
 * sent everything whatever the light.
 */
export async function broadcastMapData(
  io: Server,
  campaignId: string,
  map: MapData,
  audience: 'everyone' | 'players' = 'everyone'
): Promise<void> {
  const members = await campaignSockets(io, campaignId);
  const visibility = await getSpiritVisibilityBatch(
    campaignId,
    members.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
  );
  for (const s of stillInCampaign(members, campaignId)) {
    const member = s as unknown as AuthenticatedSocket;
    if (audience === 'players' && member.role === 'DM') continue;
    const spiritVisible = member.role === 'DM' ? true : member.userId ? (visibility.get(member.userId) ?? false) : false;
    const mapData = filterMapData(map, member.role || 'PLAYER', spiritVisible, member.userId);
    s.emit('map.changed', { mapId: map.id, mapData, spiritVisible });
  }
}

/**
 * On a lit map, which tokens a player is sent depends on the lights, walls
 * and doors. After any of them changes, players are sent the map again as
 * they can now see it: a creature a new light shows, or a door opens onto,
 * appears at once, and one whose light goes out leaves their browser. Only
 * for the map the table is on, since players are sent no other.
 *
 * Changes come in bursts (a wall drawn as two segments, a replace after a
 * drag), so one re-send per map follows the last change of a burst by
 * SIGHT_RESEND_MS. Best-effort: the change is saved by then, so a failure is
 * logged and nothing else.
 */
const SIGHT_RESEND_MS = 150;
const pendingSightResends = new Map<string, ReturnType<typeof setTimeout>>();

export function resendSightAfterChange(io: Server, campaignId: string, mapId: string): void {
  const key = `${campaignId}:${mapId}`;
  const pending = pendingSightResends.get(key);
  if (pending) clearTimeout(pending);
  const timer = setTimeout(() => {
    pendingSightResends.delete(key);
    void (async () => {
      try {
        const [map, campaign] = await Promise.all([
          prisma.map.findUnique({ where: { id: mapId } }),
          prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } }),
        ]);
        if (!map || map.campaignId !== campaignId || !map.lightingEnabled || campaign?.currentMapId !== mapId) return;
        await broadcastMapData(io, campaignId, map, 'players');
      } catch (err) {
        logger.warn('Players not sent their sight after a light or wall change; the change stands', { err, mapId });
      }
    })();
  }, SIGHT_RESEND_MS);
  timer.unref?.();
  pendingSightResends.set(key, timer);
}

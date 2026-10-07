// ============================================
// Explored memory handlers: exploration:reveal / exploration:request /
// exploration:reset
//
// What each player has seen of a map, kept per user so the client can grey
// it in when it is out of sight. Stored in the FogState shape, so the fog
// helpers apply unchanged and a grid resize forgets it exactly as it forgets
// fog.
//
// The server NEVER reads MapExploration when deciding which tokens to send:
// exploration only greys in map artwork every client already holds. A forged
// reveal can therefore show a player nothing they were not already given.
// See filterTokensByLighting.
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { ExplorationRevealSchema } from '../../validators/walls';
import type { FogState } from '../../types/walls';
import logger from '../../utils/logger';
import { emitToMapReaders } from '../utils';
import { explorationRevealLimiter, limiterKey, stateRequestAllowed, withinCeiling, loadFogState, applyWsFogOperation, revealedCellIndices, broadcastExplorationState } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canReadMap } from '../../services/permissions';

const MAP_SELECT = {
  campaignId: true, explorationEnabled: true, width: true, height: true, gridSize: true,
  campaign: { select: { currentMapId: true } },
} as const;

/**
 * Reports a second, per user. The page reports at most every 300 ms per tab,
 * so two tabs of one player send under seven; a dropped report's cells are
 * never remembered, since the page does not send them again.
 */
const REVEALS_PER_SECOND = 40;

/** At most one write of a player's memory of a map in this long. */
const REVEAL_WRITE_MS = 1000;

/**
 * Cells reported and not yet written, per map and user. Each report used to
 * read and rewrite the whole memory, a boolean per grid cell; now the cells
 * of the reports that arrive within a second are written together.
 */
interface QueuedReveal {
  campaignId: string;
  mapId: string;
  userId: string;
  cells: Set<number>;
  lastWrite: number;
  timer: ReturnType<typeof setTimeout> | null;
  writing: boolean;
}
const queuedReveals = new Map<string, QueuedReveal>();

function queueReveal(io: Server, campaignId: string, mapId: string, userId: string, cells: number[]): void {
  const key = `${mapId}:${userId}`;
  let queued = queuedReveals.get(key);
  if (!queued) {
    queued = { campaignId, mapId, userId, cells: new Set(), lastWrite: 0, timer: null, writing: false };
    queuedReveals.set(key, queued);
  }
  for (const cell of cells) queued.cells.add(cell);
  scheduleRevealWrite(io, key, queued);
}

function scheduleRevealWrite(io: Server, key: string, queued: QueuedReveal): void {
  if (queued.timer || queued.writing || queued.cells.size === 0) return;
  const wait = Math.max(0, queued.lastWrite + REVEAL_WRITE_MS - Date.now());
  queued.timer = setTimeout(() => void writeQueuedReveal(io, key, queued), wait);
  queued.timer.unref?.();
}

async function writeQueuedReveal(io: Server, key: string, queued: QueuedReveal): Promise<void> {
  queued.timer = null;
  queued.writing = true;
  queued.lastWrite = Date.now();
  const cells = [...queued.cells];
  queued.cells.clear();
  const { campaignId, mapId, userId } = queued;
  try {
    // Read again: memory can be turned off, or the map moved, within the second.
    const map = await prisma.map.findUnique({ where: { id: mapId }, select: MAP_SELECT });
    if (!map || map.campaignId !== campaignId || !map.explorationEnabled) return;
    // Cells already remembered, which is what the page reports most of the
    // time it moves about known ground, are not worth a lock or a write.
    const held = await prisma.mapExploration.findUnique({ where: { mapId_userId: { mapId, userId } }, select: { explored: true } });
    const known = loadFogState(map, (held?.explored as FogState | null) ?? null);
    if (cells.every((cell) => cell >= known.revealed.length || known.revealed[cell])) return;
    // One writer per (map, user) at a time. Two tabs, or two reports in
    // flight, would each read the row and write back only their own cells;
    // the lock is released when the transaction ends.
    const cellsNow = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${mapId}), hashtext(${userId}))`;
      const row = await tx.mapExploration.findUnique({
        where: { mapId_userId: { mapId, userId } },
        select: { explored: true },
      });
      const explored: FogState = loadFogState(map, (row?.explored as FogState | null) ?? null);
      const before = revealedCellIndices(explored).length;
      applyWsFogOperation(explored, { op: 'reveal', cells });
      const after = revealedCellIndices(explored);
      // Nothing new: nothing to write, and nobody's memory to resend.
      if (after.length === before) return null;
      await tx.mapExploration.upsert({
        where: { mapId_userId: { mapId, userId } },
        create: { mapId, userId, explored: toJson(explored) },
        update: { explored: toJson(explored) },
      });
      return after;
    });
    if (cellsNow) await broadcastExplorationState(io, campaignId, mapId, userId, cellsNow);
  } catch (error) {
    logger.error('exploration:reveal failed', { err: error });
  } finally {
    queued.writing = false;
    if (queued.cells.size > 0) {
      scheduleRevealWrite(io, key, queued);
    } else {
      // Kept a second after its write, so the next report still waits its turn.
      setTimeout(() => {
        const idle = queuedReveals.get(key) === queued && !queued.timer && !queued.writing && queued.cells.size === 0;
        if (idle) queuedReveals.delete(key);
      }, REVEAL_WRITE_MS).unref?.();
    }
  }
}

/** Drop what is waiting to be written for a map, when the DM forgets its memory. */
function forgetQueuedReveals(mapId: string): void {
  for (const [key, queued] of queuedReveals) {
    if (queued.mapId !== mapId) continue;
    if (queued.timer) clearTimeout(queued.timer);
    queued.timer = null;
    queued.cells.clear();
    if (!queued.writing) queuedReveals.delete(key);
  }
}

export function registerExplorationHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * exploration:reveal — a player's vision covered these cells; remember them (a DM may name another member with userId to record theirs).
   * Any member. Throttled to 40/s per user; over-limit reveals are dropped.
   * Written at most once a second per map and user (queueReveal).
   * A DM may name another member and write that player's memory: Player
   * Preview records what the previewed token has seen, so a table the DM
   * drives alone still accrues it. The user's whole memory is then sent to
   * their own sockets and to the DM sockets previewing them, so a preview
   * follows it live (broadcastExplorationState).
   */
  socket.on('exploration:reveal', async (data: unknown) => {
    try {
      if (!socket.campaignId || !socket.userId) return;
      if (!explorationRevealLimiter.check(limiterKey(socket), REVEALS_PER_SECOND, 1000)) return;

      const parsed = ExplorationRevealSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid exploration data' });
        return;
      }
      const { mapId, cells, userId: named } = parsed.data;

      // A prepared map is the DM's until they switch to it, for writes as
      // for reads (canReadMap). A report is sent by the page on its own and
      // can cross a map switch, or memory being turned off, in flight, so
      // one that no longer applies is dropped without an error: the page
      // shows socket errors in the dice panel.
      const map = await prisma.map.findUnique({ where: { id: mapId }, select: MAP_SELECT });
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;
      if (!map.explorationEnabled) return;

      const isDM = socket.role === 'DM';
      let userId = socket.userId;
      if (named !== undefined && named !== socket.userId) {
        if (!isDM) {
          socket.emit('error', { message: 'You can only record your own explored memory' });
          return;
        }
        const member = await prisma.campaignMembership.findUnique({
          where: { userId_campaignId: { userId: named, campaignId: socket.campaignId } },
          select: { userId: true },
        });
        if (!member) {
          socket.emit('error', { message: 'That user is not a member of this campaign' });
          return;
        }
        userId = named;
      }
      queueReveal(io, socket.campaignId, mapId, userId, cells);
    } catch (error) {
      logger.error('exploration:reveal failed', { err: error });
    }
  });

  /**
   * exploration:request — what this user has explored on a map. A DM may name
   * another user, for Player Preview; anyone else gets their own.
   */
  socket.on('exploration:request', async (data: { mapId?: unknown; userId?: unknown }) => {
    try {
      if (!socket.campaignId || !socket.userId) return;
      const userId = socket.role === 'DM' && typeof data?.userId === 'string' ? data.userId : socket.userId;
      // A DM naming a player is previewing them: that player's memory is
      // the one this socket follows from now on (broadcastExplorationState).
      // Before the limit, so a preview switched faster than it allows still
      // follows the player now shown; it reads nothing.
      if (socket.role === 'DM') socket.previewingMemoryOf = userId === socket.userId ? undefined : userId;
      if (!stateRequestAllowed(socket, 'exploration:request')) return;
      const mapId = typeof data?.mapId === 'string' ? data.mapId : null;
      if (!mapId) return;

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: MAP_SELECT });
      if (!map || map.campaignId !== socket.campaignId) return;
      // A prepared map is the DM's alone; a player is answered only about
      // the map the campaign is showing.
      if (!canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;
      if (!map.explorationEnabled) return;

      const row = await prisma.mapExploration.findUnique({
        where: { mapId_userId: { mapId, userId } },
        select: { explored: true },
      });
      const explored: FogState = loadFogState(map, (row?.explored as FogState | null) ?? null);
      socket.emit('exploration:state', { mapId, userId, cells: revealedCellIndices(explored) });
    } catch (error) {
      logger.error('exploration:request failed', { err: error });
    }
  });

  /**
   * exploration:reset — DM forgets every player's explored areas on a map.
   */
  socket.on('exploration:reset', async (data: { mapId?: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (!withinCeiling(socket, 'exploration:reset')) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can reset explored areas' });
        return;
      }
      const mapId = typeof data?.mapId === 'string' ? data.mapId : null;
      if (!mapId) {
        socket.emit('error', { message: 'mapId required' });
        return;
      }
      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      forgetQueuedReveals(mapId);
      await prisma.mapExploration.deleteMany({ where: { mapId } });
      await emitToMapReaders(io, socket.campaignId, mapId, 'exploration:state', { mapId, userId: null, cells: [] });
    } catch (error) {
      logger.error('exploration:reset failed', { err: error });
      socket.emit('error', { message: 'Failed to reset explored areas' });
    }
  });
}

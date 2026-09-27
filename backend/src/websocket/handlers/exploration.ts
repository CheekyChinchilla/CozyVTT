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
import { explorationRevealLimiter, loadFogState, applyWsFogOperation, revealedCellIndices, broadcastExplorationState } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canReadMap } from '../../services/permissions';

const MAP_SELECT = {
  campaignId: true, explorationEnabled: true, width: true, height: true, gridSize: true,
  campaign: { select: { currentMapId: true } },
} as const;

export function registerExplorationHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * exploration:reveal — a player's vision covered these cells; remember them.
   * Any member. Throttled to 10/s per socket; over-limit reveals are dropped.
   * A DM may name another member and write that player's memory: Player
   * Preview records what the previewed token has seen, so a table the DM
   * drives alone still accrues it. The user's whole memory is then sent to
   * their own sockets and to every DM's, so a preview follows it live.
   */
  socket.on('exploration:reveal', async (data: unknown) => {
    try {
      if (!socket.campaignId || !socket.userId) return;
      if (!explorationRevealLimiter.check(socket.id, 10, 1000)) return;

      const parsed = ExplorationRevealSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid exploration data' });
        return;
      }
      const { mapId, cells, userId: named } = parsed.data;

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: MAP_SELECT });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      if (!map.explorationEnabled) {
        socket.emit('error', { message: 'Explored memory is off for this map' });
        return;
      }

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
        applyWsFogOperation(explored, { op: 'reveal', cells });
        await tx.mapExploration.upsert({
          where: { mapId_userId: { mapId, userId } },
          create: { mapId, userId, explored: toJson(explored) },
          update: { explored: toJson(explored) },
        });
        return revealedCellIndices(explored);
      });

      await broadcastExplorationState(io, socket.campaignId, mapId, userId, cellsNow);
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
      const mapId = typeof data?.mapId === 'string' ? data.mapId : null;
      if (!mapId) return;

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: MAP_SELECT });
      if (!map || map.campaignId !== socket.campaignId) return;
      // A prepared map is the DM's alone; a player is answered only about
      // the map the campaign is showing.
      if (!canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;
      if (!map.explorationEnabled) return;

      const userId = socket.role === 'DM' && typeof data.userId === 'string' ? data.userId : socket.userId;
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
      await prisma.mapExploration.deleteMany({ where: { mapId } });
      io.to(socket.campaignId).emit('exploration:state', { mapId, userId: null, cells: [] });
    } catch (error) {
      logger.error('exploration:reset failed', { err: error });
      socket.emit('error', { message: 'Failed to reset explored areas' });
    }
  });
}

// ============================================
// Fog of war handlers: fog:operation / fog:request_state
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { FogOperationSchema } from '../../validators/walls';
import type { FogState } from '../../types/walls';
import logger from '../../utils/logger';
import { fogOperationLimiter, limiterKey, stateRequestAllowed, loadFogState, applyWsFogOperation, revealedCellIndices, broadcastFogState, FogTooLargeError } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canReadMap } from '../../services/permissions';
import { bestEffort } from '../utils';
import { withMapsLocked } from '../../utils/mapTokens';

export function registerFogHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * fog:operation — DM applies a fog operation (reveal/hide cells).
   * Throttled to 10 operations/second per user, across all their sockets.
   * DM receives full fogState; players receive only revealed cell indices.
   */
  socket.on('fog:operation', async (data: { mapId: string; operation: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can modify fog of war' });
        return;
      }

      // Throttle: max 10 fog ops/second per user
      if (!fogOperationLimiter.check(limiterKey(socket), 10, 1000)) {
        return; // Silently drop — brush strokes fire fast, flooding is expected
      }

      const { mapId, operation } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = FogOperationSchema.safeParse(operation);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid fog operation' });
        return;
      }

      // The whole grid is read, changed and written back, so this runs under
      // the map's lock and reads the grid after taking it: two operations
      // that overlap apply one after the other instead of the later one
      // writing the earlier one's cells away.
      const campaignId = socket.campaignId;
      const op = parsed.data;
      const outcome = await withMapsLocked([mapId], async (tx): Promise<{ refused: string } | { fog: FogState }> => {
        const map = await tx.map.findUnique({
          where: { id: mapId },
          select: { campaignId: true, fogData: true, fogEnabled: true, width: true, height: true, gridSize: true },
        });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };
        // The map's flag is the single source of truth for whether fog applies.
        if (!map.fogEnabled) return { refused: 'Fog of war is off for this map' };

        const fog: FogState = loadFogState(map, map.fogData as FogState | null);
        applyWsFogOperation(fog, op);
        await tx.map.update({ where: { id: mapId }, data: { fogData: toJson(fog) } });
        return { fog };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      // Saved: failing to tell the table is logged, not reported as failed.
      await bestEffort('fog:cells', () => broadcastFogState(io, campaignId, mapId, outcome.fog));
    } catch (error) {
      if (error instanceof FogTooLargeError) {
        socket.emit('error', { message: error.message });
        return;
      }
      logger.error('fog:operation failed', { err: error });
      socket.emit('error', { message: 'Failed to apply fog operation' });
    }
  });

  /**
   * fog:request_state — Any campaign member requests current fog state on (re)join.
   * DM receives full fogState; players receive revealed-cell list.
   */
  socket.on('fog:request_state', async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;
      if (!stateRequestAllowed(socket, 'fog:request_state')) return;
      const { mapId } = data;
      if (!mapId) return;

      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, fogData: true, fogEnabled: true, width: true, height: true, gridSize: true, campaign: { select: { currentMapId: true } } },
      });
      if (!map || map.campaignId !== socket.campaignId) return;
      // A prepared map is the DM's alone; a player is answered only about
      // the map the campaign is showing.
      if (!canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;
      // Fog off: nothing to send. A client that receives no reply draws no fog.
      if (!map.fogEnabled) return;

      const fog: FogState = loadFogState(map, map.fogData as FogState | null);

      if (socket.role === 'DM') {
        socket.emit('fog:updated', { mapId, fogState: fog });
      } else {
        socket.emit('fog:cells', {
          mapId,
          revealedCells: revealedCellIndices(fog),
          fogCols: fog.fogCols,
          fogRows: fog.fogRows,
          cellPx: fog.cellPx,
        });
      }
    } catch (error) {
      // A map stored before the size limits can be too large for fog. Say
      // so, once per request, rather than leaving the page without fog and
      // without a reason.
      if (error instanceof FogTooLargeError) {
        socket.emit('error', { message: error.message });
        return;
      }
      logger.error('fog:request_state failed', { err: error });
    }
  });
}

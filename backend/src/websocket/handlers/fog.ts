// ============================================
// Fog of war handlers: fog:operation / fog:request_state
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { FogOperationSchema } from '../../validators/walls';
import type { FogState } from '../../types/walls';
import logger from '../../utils/logger';
import { fogOperationLimiter, loadFogState, applyWsFogOperation, revealedCellIndices } from '../shared';

export function registerFogHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * fog:operation — DM applies a fog operation (reveal/hide cells).
   * Throttled to 10 operations/second per socket.
   * DM receives full fogState; players receive only revealed cell indices.
   */
  socket.on('fog:operation', async (data: { mapId: string; operation: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can modify fog of war' });
        return;
      }

      // Throttle: max 10 fog ops/second
      if (!fogOperationLimiter.check(socket.id, 10, 1000)) {
        return; // Silently drop — brush strokes fire fast, flooding is expected
      }

      const { mapId, operation } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = FogOperationSchema.safeParse(operation);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid fog operation' });
        return;
      }

      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, fogData: true, width: true, height: true, gridSize: true },
      });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const fog: FogState = loadFogState(map, map.fogData as FogState | null);
      applyWsFogOperation(fog, parsed.data);

      await prisma.map.update({ where: { id: mapId }, data: { fogData: fog as any } });

      // Broadcast: DM gets full state; all others get revealed-cell indices + grid metadata
      const campaignSockets = await io.in(socket.campaignId).fetchSockets();
      for (const s of campaignSockets) {
        const authed = s as unknown as AuthenticatedSocket;
        if (authed.role === 'DM') {
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
    } catch (error) {
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
      const { mapId } = data;
      if (!mapId) return;

      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, fogData: true, width: true, height: true, gridSize: true },
      });
      if (!map || map.campaignId !== socket.campaignId) return;

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
      logger.error('fog:request_state failed', { err: error });
    }
  });
}

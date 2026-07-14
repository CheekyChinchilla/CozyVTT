// ============================================
// Map switch handler: map.change
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { getSpiritVisibilityBatch, filterMapData } from '../../utils/spirit-layer';
import logger from '../../utils/logger';

export function registerMapHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * MAP.CHANGE - DM switches to a different map.
   * Broadcasts role-filtered map data to all campaign members.
   */
  socket.on('map.change', async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;

      // DM only
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can change the map' });
        return;
      }

      const { mapId } = data;
      if (!mapId) {
        socket.emit('error', { message: 'mapId required' });
        return;
      }

      // Verify map belongs to this campaign
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Broadcast role-filtered map data to each connected campaign member.
      // spiritVisible is included in the payload so the client knows whether
      // to show the spirit overlay for this specific viewer.
      const campaignSockets = await io.in(socket.campaignId).fetchSockets();
      const visibility = await getSpiritVisibilityBatch(
        socket.campaignId,
        campaignSockets.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
      );
      for (const s of campaignSockets) {
        const authedSocket = s as unknown as AuthenticatedSocket;
        const spiritVisible =
          authedSocket.role === 'DM'
            ? true
            : authedSocket.userId
              ? (visibility.get(authedSocket.userId) ?? false)
              : false;
        const filteredMap = filterMapData(
          {
            ...map,
            tokens: map.tokens as any,
            annotations: map.annotations as any,
          },
          authedSocket.role || 'PLAYER',
          spiritVisible,
          authedSocket.userId
        );
        s.emit('map.changed', { mapId, mapData: filteredMap, spiritVisible });
      }

      logger.info('map.change', { mapId, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('map.change failed', { err: error });
      socket.emit('error', { message: 'Failed to broadcast map change' });
    }
  });
}

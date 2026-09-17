// ============================================
// Map switch handler: map.change
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { broadcastMapData } from '../shared';
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

      // Each member gets the map as they may see it; the payload says whether
      // the spirit overlay applies to that viewer.
      await broadcastMapData(io, socket.campaignId, map);

      logger.info('map.change', { mapId, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('map.change failed', { err: error });
      socket.emit('error', { message: 'Failed to broadcast map change' });
    }
  });
}

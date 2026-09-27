// ============================================
// Map switch handler: map.change
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { broadcastMapData } from '../shared';
import logger from '../../utils/logger';
import { getState as getCombatState } from '../initiativeState';
import { resendInitiativeState } from './initiative';

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

      // map.changed puts every client onto the map it carries, so only the
      // map the campaign is showing may be sent: a token moved to another
      // map used to switch the whole table onto that map.
      const campaign = await prisma.campaign.findUnique({ where: { id: socket.campaignId }, select: { currentMapId: true } });
      if (campaign?.currentMapId !== mapId) {
        socket.emit('error', { message: 'Only the current map can be sent to the table; set it current first' });
        return;
      }

      // Each member gets the map as they may see it; the payload says whether
      // the spirit overlay applies to that viewer.
      await broadcastMapData(io, socket.campaignId, map);
      // The plane each player is on follows the current map, and with it
      // which combatants they are sent.
      if (getCombatState(socket.campaignId).combatants.length > 0) {
        await resendInitiativeState(io, socket.campaignId);
      }

      logger.info('map.change', { mapId, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('map.change failed', { err: error });
      socket.emit('error', { message: 'Failed to broadcast map change' });
    }
  });
}

// ============================================
// Vibe tracker handler: vibe.update
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { findVibePeriod, normalizeVibeSettings } from '../../utils/vibe-presets';
import { sendSystemMessage } from '../utils';
import logger from '../../utils/logger';

export function registerVibeHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * VIBE.UPDATE - DM changes the current vibe period.
   * Updates campaign.currentVibe and broadcasts period data to all members.
   */
  socket.on('vibe.update', async (data: { period: string }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      // DM only
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can change the vibe' });
        return;
      }

      const { period } = data;

      if (!period || typeof period !== 'string') {
        socket.emit('error', { message: 'period (string) is required' });
        return;
      }

      // Fetch campaign vibe settings
      const campaign = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { vibeSettings: true, currentVibe: true },
      });

      if (!campaign) {
        socket.emit('error', { message: 'Campaign not found' });
        return;
      }

      // Normalize settings to handle old and new formats
      const vibeSettings = normalizeVibeSettings(campaign.vibeSettings);

      // Check if vibe tracker is enabled
      if (!vibeSettings.enabled) {
        socket.emit('error', { message: 'Vibe tracker is not enabled for this campaign' });
        return;
      }

      // Find the requested period in settings
      const vibePeriod = findVibePeriod(vibeSettings, period);

      if (!vibePeriod) {
        const availablePeriods = vibeSettings.periods.map((p: { name: string }) => p.name).join(', ');
        socket.emit('error', {
          message: `Unknown vibe period '${period}'. Available: ${availablePeriods}`,
        });
        return;
      }

      // Update campaign currentVibe
      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { currentVibe: vibePeriod.name },
      });

      // Broadcast to all campaign members (including sender for confirmation)
      io.to(socket.campaignId).emit('vibe.updated', {
        period: vibePeriod.name,
        hue: vibePeriod.hue,
        filter: vibePeriod.filter,
        audio: vibePeriod.audio,
        updatedBy: socket.userId,
        timestamp: new Date().toISOString(),
      });

      // Send system message
      const periodDisplayName = vibePeriod.name.charAt(0).toUpperCase() + vibePeriod.name.slice(1);
      await sendSystemMessage(
        socket.campaignId,
        `Time advances to ${periodDisplayName}.`,
        { userId: socket.userId, action: 'vibe.update', period: vibePeriod.name }
      );

      logger.info('vibe.update', { period: vibePeriod.name, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('vibe.update failed', { err: error });
      socket.emit('error', { message: 'Failed to update vibe' });
    }
  });
}

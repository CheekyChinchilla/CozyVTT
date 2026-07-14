// ============================================
// Atmosphere handlers: atmosphere.effect.set / atmosphere.audio.set
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

export function registerAtmosphereHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * ATMOSPHERE.EFFECT.SET — DM sets a visual particle overlay on the map canvas.
   * Valid: 'rain' | 'mist' | 'leaves' | 'sparkles' | 'snow' | 'wind' | null (clear)
   */
  socket.on('atmosphere.effect.set', async (data: { effect: string | null }) => {
    try {
      if (!socket.campaignId) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can set atmosphere effects' });
        return;
      }

      const VALID_EFFECTS = ['rain', 'mist', 'leaves', 'sparkles', 'snow', 'wind'];
      const effect = data.effect === null || VALID_EFFECTS.includes(data.effect)
        ? data.effect
        : null;

      // Fetch existing vibeSettings so we preserve all other keys
      const campaign = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { vibeSettings: true },
      });
      const existing = (campaign?.vibeSettings as Record<string, any>) ?? {};

      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { vibeSettings: { ...existing, atmosphereEffect: effect } as any },
      });

      io.to(socket.campaignId).emit('atmosphere.effect.updated', {
        effect,
        setBy: socket.userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('atmosphere.effect.set', { effect: effect ?? 'none', userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('atmosphere.effect.set failed', { err: error });
      socket.emit('error', { message: 'Failed to set atmosphere effect' });
    }
  });

  /**
   * ATMOSPHERE.AUDIO.SET — DM queues or stops ambient audio for all players.
   * assetId: UUID of an AUDIO asset, or null to stop.
   */
  socket.on('atmosphere.audio.set', async (data: { assetId: string | null; volume?: number; loop?: boolean }) => {
    try {
      if (!socket.campaignId) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can control ambient audio' });
        return;
      }

      let audioUrl: string | null = null;

      if (data.assetId) {
        const asset = await prisma.asset.findUnique({
          where: { id: data.assetId },
        });

        if (!asset || asset.type !== 'AUDIO') {
          socket.emit('error', { message: 'Audio asset not found' });
          return;
        }

        // Verify asset is accessible to this campaign (global or belongs to this campaign)
        if (asset.scope === 'CAMPAIGN' && asset.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Asset does not belong to this campaign' });
          return;
        }

        audioUrl = `/api/assets/audio/${data.assetId}`;
      }

      const volume = typeof data.volume === 'number'
        ? Math.min(1, Math.max(0, data.volume))
        : 0.5;
      const loop = data.loop !== false; // default true

      // Persist atmosphere audio state alongside existing vibeSettings keys
      const campaign = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { vibeSettings: true },
      });
      const existing = (campaign?.vibeSettings as Record<string, any>) ?? {};

      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: {
          vibeSettings: {
            ...existing,
            atmosphereAudio: data.assetId
              ? { assetId: data.assetId, volume, loop }
              : null,
          } as any,
        },
      });

      io.to(socket.campaignId).emit('atmosphere.audio.updated', {
        assetId: data.assetId,
        audioUrl,
        volume,
        loop,
        setBy: socket.userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('atmosphere.audio.set', { assetId: data.assetId ?? 'none', userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('atmosphere.audio.set failed', { err: error });
      socket.emit('error', { message: 'Failed to set atmosphere audio' });
    }
  });
}

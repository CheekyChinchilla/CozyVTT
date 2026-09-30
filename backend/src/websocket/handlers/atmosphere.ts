// ============================================
// Atmosphere handlers: atmosphere.effect.set / atmosphere.audio.set
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { readJsonObject, toJson } from '../../utils/prisma-json';
import { setCampaignAmbientAudio } from '../../services/atmosphereAudio';

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
      const existing = readJsonObject(campaign?.vibeSettings) ?? {};

      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { vibeSettings: toJson({ ...existing, atmosphereEffect: effect }) },
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
   *
   * Setting a track is what opens it to the campaign: the read rule lets a
   * member fetch whatever their campaign is playing, because the sound is not
   * relayed through here, each player's browser fetches the file itself. So
   * this handler asks the same question the serving route asks, of the DM. A
   * track the DM cannot read answers the same as one that does not exist, so
   * the reply cannot be used to discover which ids are real.
   */
  socket.on('atmosphere.audio.set', async (data: { assetId: string | null; volume?: number; loop?: boolean }) => {
    try {
      if (!socket.campaignId || !socket.userId) return;

      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can control ambient audio' });
        return;
      }

      const result = await setCampaignAmbientAudio(io, socket.campaignId, socket.userId, data.assetId ?? null, {
        volume: data.volume,
        loop: data.loop,
      });
      if (!result.ok) {
        socket.emit('error', { message: result.message ?? 'Failed to set atmosphere audio' });
      }
    } catch (error) {
      logger.error('atmosphere.audio.set failed', { err: error });
      socket.emit('error', { message: 'Failed to set atmosphere audio' });
    }
  });
}

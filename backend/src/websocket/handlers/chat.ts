// ============================================
// Chat handler: chat.message
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { chatMessageLimiter } from '../shared';

export function registerChatHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * CHAT.MESSAGE - User sends chat message.
   * Validates content, saves to database, and broadcasts to campaign.
   * Rate limited per the campaign's chatCooldown settings.
   * SECURITY: Uses server-authenticated socket.campaignId only.
   */
  socket.on('chat.message', async (data: { content: string; type: 'PLAYER' | 'DM' }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      const { content, type } = data;

      // Validate content is provided
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        socket.emit('error', { message: 'Message content required' });
        return;
      }

      // Validate message length (max 2000 characters)
      if (content.length > 2000) {
        socket.emit('error', { message: 'Message too long. Maximum 2000 characters.' });
        return;
      }

      // Validate message type
      if (type !== 'PLAYER' && type !== 'DM') {
        socket.emit('error', { message: 'Invalid message type. Must be PLAYER or DM.' });
        return;
      }

      // Rate limiting: respect campaign's chatCooldown settings
      const campaignSettings = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { chatCooldownEnabled: true, chatCooldownSeconds: true },
      });

      if (campaignSettings?.chatCooldownEnabled) {
        const windowMs = (campaignSettings.chatCooldownSeconds ?? 5) * 1000;
        if (!chatMessageLimiter.check(`${socket.userId}:${socket.campaignId}`, 1, windowMs)) {
          socket.emit('error', { message: `Rate limit: wait ${campaignSettings.chatCooldownSeconds}s between messages.` });
          return;
        }
      }

      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { displayName: true },
      });

      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      // Save to database
      const message = await prisma.message.create({
        data: {
          campaignId: socket.campaignId,
          userId: socket.userId!,
          type,
          content: content.trim(),
          // metadata is optional for chat messages
        },
      });

      // Broadcast to all campaign members (including sender)
      io.to(socket.campaignId).emit('chat.message', {
        id: message.id,
        userId: socket.userId,
        userName: user.displayName,
        content: content.trim(),
        type,
        timestamp: message.createdAt.toISOString(),
      });

      logger.debug('chat.message', { type, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('chat.message failed', { err: error });
      socket.emit('error', { message: 'Failed to send chat message' });
    }
  });
}

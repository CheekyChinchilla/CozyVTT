import { Server } from 'socket.io';
import { AuthenticatedSocket, authenticateSocket, authenticateCampaign } from './auth';
import { prisma } from '../config/database';
import { sendSystemMessage } from './utils';
import logger from '../utils/logger';
import { registerTokenHandlers } from './handlers/tokens';
import { registerDiceHandlers } from './handlers/dice';
import { registerChatHandlers } from './handlers/chat';
import { registerSpiritHandlers } from './handlers/spirit';
import { registerVibeHandlers } from './handlers/vibe';
import { registerMapHandlers } from './handlers/maps';
import { registerAtmosphereHandlers } from './handlers/atmosphere';
import { registerCharacterHandlers } from './handlers/characters';
import { registerInitiativeHandlers } from './handlers/initiative';
import { registerWallHandlers } from './handlers/walls';
import { registerFogHandlers } from './handlers/fog';
import { registerLightHandlers } from './handlers/lights';
import { registerPingHandlers } from './handlers/pings';

/**
 * WebSocket Event Handlers — orchestrator.
 *
 * Per-domain handlers live under ./handlers/*. This file owns only the
 * connection lifecycle (connect → authenticateSocket → authenticate/
 * disconnect/ping/error) and wires each domain's
 * `registerXxxHandlers(io, socket)` per connection. Shared state (rate
 * limiters, fog helpers, the Token shape) lives in ./shared.
 */

/**
 * Register all WebSocket event handlers
 * @param io - Socket.io server instance
 */
export function registerEventHandlers(io: Server): void {
  io.on('connection', async (socket: AuthenticatedSocket) => {
    logger.debug('ws connection attempt', { socketId: socket.id });

    // CRITICAL: Authenticate the socket connection
    const authenticated = await authenticateSocket(socket);

    if (!authenticated) {
      logger.warn('ws unauthenticated connection rejected', { socketId: socket.id });
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
      return;
    }

    // Add socket to user's personal room (for direct messaging)
    if (socket.userId) {
      socket.join(socket.userId);
      logger.debug('ws joined user room', { socketId: socket.id, userId: socket.userId });
    }

    // Send connection acknowledgment
    socket.emit('connected', {
      userId: socket.userId,
      timestamp: new Date().toISOString(),
    });

    // ============================================
    // AUTHENTICATE EVENT
    // User requests to join a campaign room
    // ============================================
    socket.on('authenticate', async (data: { campaignId: string }) => {
      try {
        logger.debug('authenticate', { campaignId: data.campaignId, userId: socket.userId });

        if (!data.campaignId || typeof data.campaignId !== 'string') {
          socket.emit('error', { message: 'Campaign ID required' });
          return;
        }

        // Authenticate campaign membership
        const result = await authenticateCampaign(socket, data.campaignId);

        if (!result.success) {
          socket.emit('error', { message: result.error });
          return;
        }

        // SECURITY: Enforce single campaign context per socket
        // Leave previous campaign room if exists
        if (socket.campaignId && socket.campaignId !== data.campaignId) {
          await socket.leave(socket.campaignId);

          // Notify old campaign that user left
          socket.to(socket.campaignId).emit('user.left', {
            userId: socket.userId,
            timestamp: new Date().toISOString(),
          });
        }

        // Join the campaign room
        socket.join(data.campaignId);
        socket.campaignId = data.campaignId; // Update stored campaign ID

        // Notify the user they've been authenticated
        socket.emit('authenticated', {
          userId: socket.userId,
          campaignId: data.campaignId,
          role: result.role,
          timestamp: new Date().toISOString(),
        });

        // Get user information for system message
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { displayName: true },
        });

        // Send system message to campaign
        if (user) {
          await sendSystemMessage(
            data.campaignId,
            `${user.displayName} has joined the campaign.`,
            { userId: socket.userId, action: 'user.joined' }
          );
        }

        // Also emit user.joined event for backwards compatibility
        socket.to(data.campaignId).emit('user.joined', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });

        logger.info('authenticated', { userId: socket.userId, campaignId: data.campaignId, role: result.role });
      } catch (error) {
        logger.error('authenticate failed', { err: error });
        socket.emit('error', { message: 'Authentication failed' });
      }
    });

    // ============================================
    // DOMAIN HANDLERS — one registrar per domain
    // ============================================
    registerTokenHandlers(io, socket);
    registerDiceHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerSpiritHandlers(io, socket);
    registerVibeHandlers(io, socket);
    registerMapHandlers(io, socket);
    registerAtmosphereHandlers(io, socket);
    registerCharacterHandlers(io, socket);
    registerInitiativeHandlers(io, socket);
    registerWallHandlers(io, socket);
    registerFogHandlers(io, socket);
    registerLightHandlers(io, socket);
    registerPingHandlers(io, socket);

    // ============================================
    // DISCONNECT EVENT
    // Clean up when user disconnects
    // ============================================
    socket.on('disconnect', async (reason: string) => {
      logger.debug('ws disconnected', { socketId: socket.id, reason });

      // Notify campaign members if user was in a campaign
      if (socket.campaignId) {
        // Get user information for system message
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { displayName: true },
        });

        // Send system message to campaign (best-effort — campaign may have been deleted)
        if (user) {
          try {
            await sendSystemMessage(
              socket.campaignId,
              `${user.displayName} has left the campaign.`,
              { userId: socket.userId, action: 'user.left' }
            );
          } catch {
            // Swallow — campaign was deleted or DB unavailable; disconnect must still complete cleanly
          }
        }

        // Also emit user.left event for backwards compatibility
        socket.to(socket.campaignId).emit('user.left', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });
      }

      // Leave all rooms
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });
    });

    // ============================================
    // PING/PONG HEARTBEAT
    // Connection health monitoring
    // ============================================
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // ============================================
    // ERROR HANDLER
    // Catch unhandled socket errors
    // ============================================
    socket.on('error', (error: Error) => {
      logger.error('socket error', { err: error });
    });
  });
}

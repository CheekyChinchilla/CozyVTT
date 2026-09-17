import { Server } from 'socket.io';
import { AuthenticatedSocket, authenticateSocket, authenticateCampaign } from './auth';
import { broadcastPresence, getOnlineUserIds } from './utils';
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
import { registerExplorationHandlers } from './handlers/exploration';
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
          const previousCampaignId = socket.campaignId;
          await socket.leave(previousCampaignId);

          // Notify old campaign that user left
          socket.to(previousCampaignId).emit('user.left', {
            userId: socket.userId,
            timestamp: new Date().toISOString(),
          });

          // Re-broadcast the old campaign's presence too. The roster is driven
          // by the full `presence.state` snapshot, so telling only the new
          // campaign would leave the old one showing this user online forever.
          // Recomputed after the leave above, so a second tab still counts.
          await broadcastPresence(previousCampaignId);
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

        // No "X has joined" chat message. This handler runs on every socket
        // authentication — so once per page load, per refresh and per recovered
        // network blip — and each one wrote a permanent Message row as well as
        // a live notification. A player reloading twice buried the actual
        // conversation. Who is present is now shown as a dot in the campaign
        // roster instead, which is what the message was really trying to say.
        socket.to(data.campaignId).emit('user.joined', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });

        await broadcastPresence(data.campaignId);

        logger.info('authenticated', { userId: socket.userId, campaignId: data.campaignId, role: result.role });
      } catch (error) {
        logger.error('authenticate failed', { err: error });
        socket.emit('error', { message: 'Authentication failed' });
      }
    });

    // ============================================
    // PRESENCE REQUEST
    // A client asking who is online right now.
    // ============================================
    // Presence is pushed on every join and leave, but a component that mounts
    // after this socket authenticated would have missed its own snapshot and
    // would then show everyone offline until somebody else moved. This lets it
    // ask. Replies to the caller alone — nobody else's view has changed.
    socket.on('presence.request', async () => {
      if (!socket.campaignId) return;
      try {
        const onlineUserIds = await getOnlineUserIds(socket.campaignId);
        socket.emit('presence.state', { campaignId: socket.campaignId, onlineUserIds });
      } catch (error) {
        logger.error('presence.request failed', { err: error });
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
    registerExplorationHandlers(io, socket);
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
        // No "X has left" chat message — a dropped connection is not news, and
        // writing one per blip is what filled the log. Presence covers it.
        socket.to(socket.campaignId).emit('user.left', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });

        // Recomputed AFTER this socket has left the room, so a user with a
        // second tab open still reads as online.
        await broadcastPresence(socket.campaignId);
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

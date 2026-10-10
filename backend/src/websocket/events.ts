import { types } from 'util';
import { Server } from 'socket.io';
import { AuthenticatedSocket, authenticateSocket, authenticateCampaign, socketSessionIsLive } from './auth';
import { broadcastPresence, getOnlineUserIds } from './utils';
import logger from '../utils/logger';
import { stateRequestAllowed, withinCeiling, MAX_SOCKETS_PER_USER, TOO_MANY_SOCKETS } from './shared';
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

    // Add socket to user's personal room (for direct messaging), which is
    // also how this user's open sockets are counted. Counted and joined in
    // one step, with nothing awaited between, so sockets opened together
    // cannot all pass the count.
    if (socket.userId) {
      if ((io.sockets.adapter.rooms.get(socket.userId)?.size ?? 0) >= MAX_SOCKETS_PER_USER) {
        socket.emit('error', { message: TOO_MANY_SOCKETS });
        socket.disconnect(true);
        return;
      }
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
    // One at a time per socket. Two of these overlapping both read the room
    // to leave before either has joined its own, and the socket ends up in
    // two campaign rooms carrying one role. The chain never rejects (the
    // handler catches everything), so a refused attempt does not block the
    // next.
    //
    // Counted before it is queued, so a flood cannot grow the chain.
    socket.on('authenticate', (data: { campaignId: string }) => {
      if (!withinCeiling(socket, 'authenticate')) return;
      socket.authenticating = (socket.authenticating ?? Promise.resolve()).then(() => authenticateInto(data));
    });

    async function authenticateInto(data: { campaignId: string }): Promise<void> {
      try {
        logger.debug('authenticate', { campaignId: data.campaignId, userId: socket.userId });

        if (!data.campaignId || typeof data.campaignId !== 'string') {
          socket.emit('error', { message: 'Campaign ID required' });
          return;
        }

        // The sign-in has to be live now, not only at the handshake. The
        // same answer a refused handshake gets, then the connection ends; the
        // client then asks the server whether it is still signed in.
        if (!(await socketSessionIsLive(socket))) {
          socket.emit('error', { message: 'Unauthorized' });
          socket.disconnect(true);
          return;
        }

        const result = await authenticateCampaign(socket, data.campaignId);

        if (!result.success) {
          socket.emit('error', { message: result.error });
          return;
        }

        // SECURITY: one campaign per socket. Leave every other campaign room
        // before taking the new campaign's role, or a role-filtered fan-out in
        // an old room would find this socket still there and answer it with
        // the new role's view of that campaign. A socket's rooms are its own
        // id, its user room and campaign rooms, nothing else.
        for (const room of [...socket.rooms]) {
          if (room === socket.id || room === socket.userId || room === data.campaignId) continue;
          await socket.leave(room);

          // Notify old campaign that user left
          socket.to(room).emit('user.left', {
            userId: socket.userId,
            timestamp: new Date().toISOString(),
          });

          // Re-broadcast the old campaign's presence too. The roster is driven
          // by the full `presence.state` snapshot, so telling only the new
          // campaign would leave the old one showing this user online forever.
          // Recomputed after the leave above, so a second tab still counts.
          await broadcastPresence(room);
        }

        // Already in this campaign with this role: nothing about this socket
        // changes for anyone else, so the table is not told again.
        const rejoined = socket.campaignId === data.campaignId && socket.role === result.role && socket.rooms.has(data.campaignId);

        // Join the campaign room. Role is refreshed even when the campaign is
        // the same, since a client re-authenticates after a reconnect.
        socket.join(data.campaignId);
        socket.campaignId = data.campaignId;
        socket.role = result.role;

        // Notify the user they've been authenticated
        socket.emit('authenticated', {
          userId: socket.userId,
          campaignId: data.campaignId,
          role: result.role,
          timestamp: new Date().toISOString(),
        });

        if (rejoined) {
          socket.emit('presence.state', { campaignId: data.campaignId, onlineUserIds: await getOnlineUserIds(data.campaignId) });
          return;
        }

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
    }

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
      if (!stateRequestAllowed(socket, 'presence.request')) return;
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
    // Socket.io emits 'error' for a packet it cannot decode and for one a
    // middleware refuses, always as an Error. It does not reserve the name,
    // so a client can emit 'error' too, with any payload up to a megabyte;
    // that arrives as plain JSON, never an Error, and none of it is logged.
    // The listener has to stay either way: an 'error' with no listener is
    // thrown, and would end the process.
    // ============================================
    socket.on('error', (error: unknown) => {
      if (types.isNativeError(error)) {
        logger.error('socket error', { err: error, socketId: socket.id, userId: socket.userId });
        return;
      }
      logger.debug('ws client sent an error event; ignored', { socketId: socket.id, userId: socket.userId });
    });
  });
}

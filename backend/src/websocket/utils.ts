import { Server } from 'socket.io';
import { CampaignRole } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { jsonOrNull } from '../utils/prisma-json';

/**
 * WebSocket Utility Functions
 * WebSocket Event Specification
 */

let ioInstance: Server | null = null;

/**
 * Store the Socket.io instance for use in utility functions
 */
export function setSocketInstance(io: Server): void {
  ioInstance = io;
}

/**
 * Get the Socket.io instance
 */
export function getSocketInstance(): Server {
  if (!ioInstance) {
    throw new Error('Socket.io instance not initialized');
  }
  return ioInstance;
}

/**
 * Broadcast an event to all members of a campaign
 * @param campaignId - Campaign ID
 * @param event - Event name
 * @param data - Event data
 */
export function broadcastToCampaign(campaignId: string, event: string, data: unknown): void {
  const io = getSocketInstance();
  io.to(campaignId).emit(event, data);
}

/**
 * Broadcast an event to a specific user (all their connected sockets)
 * @param userId - User ID
 * @param event - Event name
 * @param data - Event data
 */
export function broadcastToUser(userId: string, event: string, data: unknown): void {
  const io = getSocketInstance();
  io.to(userId).emit(event, data);
}

/**
 * Get all sockets in a campaign room
 * @param campaignId - Campaign ID
 * @returns Array of socket IDs
 */
export async function getSocketsInCampaign(campaignId: string): Promise<string[]> {
  const io = getSocketInstance();
  const sockets = await io.in(campaignId).fetchSockets();
  return sockets.map((socket) => socket.id);
}

/**
 * Get campaign member count (connected users)
 * @param campaignId - Campaign ID
 * @returns Number of connected users
 */
export async function getCampaignMemberCount(campaignId: string): Promise<number> {
  const io = getSocketInstance();
  const sockets = await io.in(campaignId).fetchSockets();
  return sockets.length;
}

/**
 * Which users currently have at least one socket in the campaign.
 *
 * Derived from the room membership rather than tracked in a counter, because a
 * user can hold several sockets at once — two tabs, or an old one that has not
 * timed out yet. Anything that flipped a user offline on the first disconnect
 * would show them as gone while they were still sitting there in another tab.
 *
 * @param campaignId - Campaign ID
 * @returns Distinct user IDs, deduplicated across sockets
 */
export async function getOnlineUserIds(campaignId: string): Promise<string[]> {
  const io = getSocketInstance();
  const sockets = await io.in(campaignId).fetchSockets();
  const ids = new Set<string>();
  for (const socket of sockets) {
    // The default in-memory adapter hands back the real sockets, so the fields
    // set during authentication are readable — the same approach the secret
    // dice-roll fan-out uses.
    const userId = (socket as unknown as { userId?: string }).userId;
    if (userId) ids.add(userId);
  }
  return [...ids];
}

/**
 * Tell a campaign who is currently online.
 *
 * Sends the whole set rather than a join/leave delta: a table is a handful of
 * people so the payload is trivial, and a snapshot cannot drift out of step the
 * way an incrementally-patched list can after a missed event.
 *
 * Best-effort — presence is decoration, and a failure here must never break the
 * connect or disconnect path it is called from.
 */
export async function broadcastPresence(campaignId: string): Promise<void> {
  try {
    const io = getSocketInstance();
    const onlineUserIds = await getOnlineUserIds(campaignId);
    io.to(campaignId).emit('presence.state', { campaignId, onlineUserIds });
  } catch (error) {
    logger.error('Failed to broadcast presence', { err: error, campaignId });
  }
}

/**
 * Disconnect a user's sockets (for forced logout, bans, etc.)
 * @param userId - User ID
 * @param reason - Reason for disconnection
 */
export async function disconnectUser(userId: string, reason: string): Promise<void> {
  const io = getSocketInstance();
  const sockets = await io.in(userId).fetchSockets();

  sockets.forEach((socket) => {
    socket.emit('error', { message: reason });
    socket.disconnect(true);
  });

  logger.info(`❌ Disconnected user ${userId}: ${reason}`);
}

/**
 * Send a system message to a campaign
 * Creates a database record and broadcasts to all campaign members
 * System Messages
 *
 * @param campaignId - Campaign ID
 * @param content - Message content
 * @param metadata - Optional metadata (e.g., { userId, action })
 */
export async function sendSystemMessage(
  campaignId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Save to database
    const message = await prisma.message.create({
      data: {
        campaignId,
        userId: null, // System messages have no user
        type: 'SYSTEM',
        content,
        // `jsonOrNull` rather than a bare `null`: Prisma types a nullable Json
        // column as needing an explicit null sentinel, and the previous `as any`
        // was only hiding that. Verified against Postgres that a bare `null`
        // stores the JSON `null` literal — the same thing `Prisma.JsonNull`
        // stores, and *not* SQL NULL — so this is the equivalent spelling.
        metadata: jsonOrNull(metadata),
      },
    });

    // Broadcast to campaign
    const io = getSocketInstance();
    io.to(campaignId).emit('chat.system', {
      id: message.id,
      content,
      metadata: metadata || null,
      timestamp: message.createdAt.toISOString(),
    });

    logger.info(`📢 System message to campaign ${campaignId}: ${content}`);
  } catch (error) {
    // Log but never re-throw — a failed system message must not crash the server
    // (e.g. when the campaign was deleted just before the disconnect fires).
    logger.error('❌ Error sending system message', { err: error });
  }
}

/**
 * Point a user's live sockets at their new campaign role.
 *
 * `socket.role` is read from the session once, when the socket authenticates to
 * a campaign, and then trusted by every handler that gates on it. That is the
 * right place to read it from — a handler must never take a role off the wire —
 * but it means the value is a snapshot. When a role changes underneath a
 * connected socket the snapshot is simply wrong, and wrong in the dangerous
 * direction: a demoted DM keeps DM powers over that connection until they
 * happen to reload.
 *
 * REST has no equivalent problem because its middleware reads the membership per
 * request. This closes the same gap for sockets rather than waiting for a
 * reconnect, so a handover does not interrupt play.
 *
 * Only sockets attached to this campaign are touched: the same person may have
 * another tab open on a different campaign, where this role means nothing.
 *
 * Returns how many sockets were updated, which is 0 when the user is offline —
 * the ordinary case, and not a failure.
 */
export async function applyRoleToLiveSockets(
  userId: string,
  campaignId: string,
  role: CampaignRole
): Promise<number> {
  const io = getSocketInstance();
  // Sockets join a room named for their user (see events.ts), which is how a
  // specific person's connections are addressed.
  const sockets = await io.in(userId).fetchSockets();

  let updated = 0;
  for (const socket of sockets) {
    // The default in-memory adapter hands back the real sockets, so the fields
    // set during authentication are both readable and writable — the same
    // approach getOnlineUserIds and the secret dice-roll fan-out rely on.
    const authed = socket as unknown as { campaignId?: string; role?: string };
    if (authed.campaignId === campaignId) {
      authed.role = role;
      updated += 1;
    }
  }

  return updated;
}

import { Server } from 'socket.io';
import { prisma } from '../config/database';
import logger from '../utils/logger';

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
export function broadcastToCampaign(campaignId: string, event: string, data: any): void {
  const io = getSocketInstance();
  io.to(campaignId).emit(event, data);
}

/**
 * Broadcast an event to a specific user (all their connected sockets)
 * @param userId - User ID
 * @param event - Event name
 * @param data - Event data
 */
export function broadcastToUser(userId: string, event: string, data: any): void {
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
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // Save to database
    const message = await prisma.message.create({
      data: {
        campaignId,
        userId: null, // System messages have no user
        type: 'SYSTEM',
        content,
        metadata: metadata ? (metadata as any) : null,
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

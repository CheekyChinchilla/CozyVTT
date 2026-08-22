import { Socket } from 'socket.io';
import { prisma } from '../config/database';
import logger from '../utils/logger';

/**
 * WebSocket Authentication Middleware
 * Connection & Authentication
 *
 * Every WebSocket connection is authenticated against the Express session store
 * before any campaign events are processed.
 */

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  campaignId?: string;
  role?: string;
}

/**
 * Authenticate an incoming WebSocket connection via the shared Express session.
 * Attaches userId to the socket on success.
 */
export async function authenticateSocket(socket: AuthenticatedSocket): Promise<boolean> {
  try {
    const session = (socket.request as any).session;

    if (!session || !session.userId) {
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, mustChangePassword: true },
    });

    if (!user) {
      return false;
    }

    // Same gate the REST API applies: an account that still has to replace an
    // admin-issued password cannot play over the socket either
    if (user.mustChangePassword) {
      logger.warn('WebSocket rejected: password change required', { userId: user.id });
      return false;
    }

    socket.userId = user.id;
    return true;
  } catch (error) {
    logger.error('WebSocket authentication error', { err: error });
    return false;
  }
}

/**
 * Validate campaign membership and assign role
 * Called when user joins a campaign room
 */
export async function authenticateCampaign(
  socket: AuthenticatedSocket,
  campaignId: string
): Promise<{ success: boolean; role?: string; error?: string }> {
  try {
    if (!socket.userId) {
      return { success: false, error: 'Socket not authenticated' };
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, status: true },
    });

    if (!campaign) {
      return { success: false, error: 'Campaign not found' };
    }

    // Verify user is a member of the campaign
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId: socket.userId,
          campaignId,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      return { success: false, error: 'You are not a member of this campaign' };
    }

    socket.campaignId = campaignId;
    socket.role = membership.role;

    return {
      success: true,
      role: membership.role,
    };
  } catch (error) {
    logger.error('WebSocket campaign authentication error', { err: error });
    return { success: false, error: 'Internal server error' };
  }
}

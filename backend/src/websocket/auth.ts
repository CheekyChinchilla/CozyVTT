import { Socket } from 'socket.io';
import { prisma } from '../config/database';

/**
 * WebSocket Authentication Middleware
 * Per SOW Section 6.1: Connection & Authentication
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
      select: { id: true },
    });

    if (!user) {
      return false;
    }

    socket.userId = user.id;
    return true;
  } catch (error) {
    console.error('WebSocket authentication error:', error);
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
    console.error('WebSocket campaign authentication error:', error);
    return { success: false, error: 'Internal server error' };
  }
}

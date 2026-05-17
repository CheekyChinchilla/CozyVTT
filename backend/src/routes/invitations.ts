/**
 * Campaign Invitation Routes
 * Per SOW Section 6.3: Campaign Invitations
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { broadcastToCampaign } from '../websocket/utils';

const router = Router();

/**
 * GET /api/invitations
 * Get user's pending invitations
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const invitations = await prisma.campaignInvitation.findMany({
      where: {
        userId,
        status: 'PENDING',
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            gameSystem: true,
            status: true,
            owner: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return res.status(500).json({ message: 'Failed to fetch invitations' });
  }
});

/**
 * POST /api/invitations/:id/accept
 * Accept invitation and join campaign with selected characters
 * Body: { characterIds: string[] }
 */
router.post('/:id/accept', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id: invitationId } = req.params;
    const { characterIds = [] } = req.body;

    // Verify invitation exists and belongs to user
    const invitation = await prisma.campaignInvitation.findUnique({
      where: { id: invitationId },
      include: { campaign: true },
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ message: 'Invitation already processed' });
    }

    // Check if invitation is expired
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      return res.status(400).json({ message: 'Invitation expired' });
    }

    // Verify all characters belong to user and are compatible with campaign
    if (characterIds.length > 0) {
      const characters = await prisma.character.findMany({
        where: {
          id: { in: characterIds },
          userId,
        },
      });

      if (characters.length !== characterIds.length) {
        return res.status(400).json({ message: 'Invalid character selection' });
      }

      // Check if any characters are already assigned to a campaign
      const assignedCharacter = characters.find((c) => c.campaignId !== null);
      if (assignedCharacter) {
        return res.status(400).json({
          message: `Character "${assignedCharacter.name}" is already assigned to a campaign`,
        });
      }

      // Check game system compatibility
      if (invitation.campaign.gameSystem) {
        const incompatibleCharacter = characters.find(
          (c) => c.gameSystem && c.gameSystem !== invitation.campaign.gameSystem
        );
        if (incompatibleCharacter) {
          return res.status(400).json({
            message: `Character "${incompatibleCharacter.name}" is not compatible with campaign game system`,
          });
        }
      }
    }

    // Use transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
      // Update invitation status
      await tx.campaignInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED' },
      });

      // Create campaign membership
      const membership = await tx.campaignMembership.create({
        data: {
          userId,
          campaignId: invitation.campaignId,
          role: 'PLAYER',
          characterIds,
        },
      });

      // Assign characters to campaign
      if (characterIds.length > 0) {
        await tx.character.updateMany({
          where: {
            id: { in: characterIds },
            userId,
          },
          data: {
            campaignId: invitation.campaignId,
          },
        });
      }

      return membership;
    });

    // Broadcast roster.updated to campaign members
    try {
      broadcastToCampaign(invitation.campaignId, 'roster.updated', {
        action: 'member.joined',
        userId,
        campaignId: invitation.campaignId,
        characterIds,
      });
    } catch (error) {
      console.error('Failed to broadcast roster update:', error);
      // Don't fail the request if broadcast fails
    }

    return res.json({
      message: 'Invitation accepted',
      membership: result,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

/**
 * POST /api/invitations/:id/decline
 * Decline invitation
 */
router.post('/:id/decline', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id: invitationId } = req.params;

    // Verify invitation exists and belongs to user
    const invitation = await prisma.campaignInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ message: 'Invitation already processed' });
    }

    // Update invitation status
    await prisma.campaignInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' },
    });

    return res.json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('Error declining invitation:', error);
    return res.status(500).json({ message: 'Failed to decline invitation' });
  }
});

export default router;

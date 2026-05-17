import { Request, Response, NextFunction } from 'express';
import { CampaignRole } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Campaign-Level RBAC Middleware
 * Per SOW Section 3.5: Role & Permission Model
 *
 * All permission checks are enforced server-side. Never trust role information
 * from the client — always re-verify against the database.
 */

/**
 * Extended Request with campaign membership info
 */
export interface AuthenticatedRequest extends Request {
  campaignMembership?: {
    role: CampaignRole;
    characterIds: string[];
    campaignId: string;
  };
}

/**
 * Load campaign membership for authenticated user
 * Attaches membership info to req.campaignMembership
 * Must be used after requireAuth middleware
 */
export async function loadCampaignMembership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.session.userId;
    const campaignId = req.params.campaignId || req.body.campaignId;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!campaignId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Campaign ID is required',
      });
    }

    // Find user's membership in this campaign
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this campaign',
      });
    }

    // Attach membership to request
    req.campaignMembership = {
      role: membership.role,
      characterIds: membership.characterIds,
      campaignId: membership.campaignId,
    };

    return next();
  } catch (error) {
    console.error('Error loading campaign membership:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify campaign membership',
    });
  }
}

/**
 * Require user to be DM of the campaign
 * Per SOW Section 3.5: Only ONE DM allowed per campaign
 */
export function requireDM(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.campaignMembership) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Campaign membership not loaded. Use loadCampaignMembership middleware first.',
    });
  }

  if (req.campaignMembership.role !== 'DM') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This action requires Dungeon Master (DM) role',
    });
  }

  return next();
}

/**
 * Require user to be DM or Player (excludes Spectators)
 */
export function requireDMOrPlayer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.campaignMembership) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Campaign membership not loaded. Use loadCampaignMembership middleware first.',
    });
  }

  if (req.campaignMembership.role === 'SPECTATOR') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This action is not available to spectators',
    });
  }

  return next();
}

/**
 * Require specific campaign role
 */
export function requireCampaignRole(role: CampaignRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.campaignMembership) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Campaign membership not loaded. Use loadCampaignMembership middleware first.',
      });
    }

    if (req.campaignMembership.role !== role) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This action requires ${role} role`,
      });
    }

    return next();
  };
}

/**
 * Allow campaign members with any role (DM, Player, or Spectator)
 * Simply verifies membership exists (already checked by loadCampaignMembership)
 */
export function requireCampaignMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.campaignMembership) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Campaign membership not loaded. Use loadCampaignMembership middleware first.',
    });
  }

  // If we got here, membership exists and is valid
  return next();
}

import { Request, Response, NextFunction } from 'express';
import { CampaignRole } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';

/**
 * Campaign-Level RBAC Middleware
 * Role & Permission Model
 *
 * All permission checks are enforced server-side. Never trust role information
 * from the client — always re-verify against the database.
 */

/**
 * Extended Request with campaign membership info.
 *
 * The route parameters are typed as plain strings. Express's own types allow a
 * string array for any parameter, which only a `*name` wildcard produces, and
 * no route here has one.
 */
export interface AuthenticatedRequest<P = Record<string, string>> extends Request<P> {
  campaignMembership?: {
    role: CampaignRole;
    characterIds: string[];
    campaignId: string;
  };
}

/**
 * What a signed-in user is told when they are not a member of the campaign a
 * route names: the 403 the membership check answers, the map routes' own
 * checks (routes/maps.ts), the leave route's answer when a removal wins the
 * race with the leave (routes/campaigns.ts), and the live table's refusal to
 * join (websocket/auth.ts).
 */
export const NOT_A_MEMBER_MESSAGE = 'You are not a member of this campaign';

/**
 * Load campaign membership for authenticated user
 * Attaches membership info to req.campaignMembership
 * Must be used after requireAuth middleware
 *
 * The campaign comes from the route's `:campaignId` only (directly, or through
 * a mount with `mergeParams`). The request body never chooses it.
 */
export async function loadCampaignMembership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.session.userId;
    const campaignId = req.params.campaignId;

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
        message: NOT_A_MEMBER_MESSAGE,
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
    logger.error('Error loading campaign membership', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify campaign membership',
    });
  }
}

/**
 * Require user to be GM of the campaign
 * Only ONE GM allowed per campaign
 */
export function requireGM(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.campaignMembership) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Campaign membership not loaded. Use loadCampaignMembership middleware first.',
    });
  }

  if (req.campaignMembership.role !== 'GM') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This action requires the GM role',
    });
  }

  return next();
}

/**
 * Require user to be GM or Player (excludes Spectators)
 */
export function requireGMOrPlayer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
 * Allow campaign members with any role (GM, Player, or Spectator)
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

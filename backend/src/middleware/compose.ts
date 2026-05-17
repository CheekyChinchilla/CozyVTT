import { RequestHandler } from 'express';
import { requireAuth, requireAdmin } from './auth';
import { loadCampaignMembership, requireDM, requireDMOrPlayer, requireCampaignMember } from './rbac';

/**
 * Middleware Composition Helpers
 * Combines common middleware chains for cleaner route definitions
 */

/**
 * Standard authenticated route
 * Requires user to be logged in
 */
export const authenticated: RequestHandler[] = [requireAuth];

/**
 * Admin-only route
 * Requires user to be logged in AND be an admin
 */
export const adminOnly: RequestHandler[] = [requireAuth, requireAdmin];

/**
 * Campaign member route
 * Requires user to be logged in AND be a member of the campaign
 * Loads campaign membership into request
 */
export const campaignMember: RequestHandler[] = [requireAuth, loadCampaignMembership, requireCampaignMember];

/**
 * Campaign DM route
 * Requires user to be logged in AND be the DM of the campaign
 */
export const campaignDM: RequestHandler[] = [requireAuth, loadCampaignMembership, requireDM];

/**
 * Campaign DM or Player route
 * Requires user to be logged in AND be DM or Player (excludes Spectators)
 */
export const campaignDMOrPlayer: RequestHandler[] = [requireAuth, loadCampaignMembership, requireDMOrPlayer];

/**
 * Helper to compose multiple middleware arrays
 */
export function compose(...middlewares: RequestHandler[][]): RequestHandler[] {
  return middlewares.flat();
}

import { RequestHandler } from 'express';
import { requireAuth, requireAdmin } from './auth';
import { loadCampaignMembership, requireDM, requireDMOrPlayer, requireCampaignMember } from './rbac';

/**
 * Middleware Composition Helpers
 * Combines common middleware chains for cleaner route definitions
 */

/**
 * A guard whose route parameters are plain strings, as AuthenticatedRequest
 * types them, so a guard chain fits a route whose handler takes one.
 */
type RouteGuard = RequestHandler<Record<string, string>>;

/**
 * Standard authenticated route
 * Requires user to be logged in
 */
export const authenticated: RouteGuard[] = [requireAuth];

/**
 * Admin-only route
 * Requires user to be logged in AND be an admin
 */
export const adminOnly: RouteGuard[] = [requireAuth, requireAdmin];

/**
 * Campaign member route
 * Requires user to be logged in AND be a member of the campaign
 * Loads campaign membership into request
 */
export const campaignMember: RouteGuard[] = [requireAuth, loadCampaignMembership, requireCampaignMember];

/**
 * Campaign DM route
 * Requires user to be logged in AND be the DM of the campaign
 */
export const campaignDM: RouteGuard[] = [requireAuth, loadCampaignMembership, requireDM];

/**
 * Campaign DM or Player route
 * Requires user to be logged in AND be DM or Player (excludes Spectators)
 */
export const campaignDMOrPlayer: RouteGuard[] = [requireAuth, loadCampaignMembership, requireDMOrPlayer];

/**
 * Helper to compose multiple middleware arrays
 */
export function compose(...middlewares: RouteGuard[][]): RouteGuard[] {
  return middlewares.flat();
}

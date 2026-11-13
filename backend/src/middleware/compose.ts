import { RequestHandler } from 'express';
import { requireAuth, requireAdmin } from './auth';
import { loadCampaignMembership, requireGM, requireCampaignMember } from './rbac';

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
 * Campaign GM route
 * Requires user to be logged in AND be the GM of the campaign
 */
export const campaignGM: RouteGuard[] = [requireAuth, loadCampaignMembership, requireGM];

/**
 * Helper to compose multiple middleware arrays
 */
export function compose(...middlewares: RouteGuard[][]): RouteGuard[] {
  return middlewares.flat();
}

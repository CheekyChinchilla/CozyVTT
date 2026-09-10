/**
 * Who runs a campaign, and who owns it.
 *
 * These are two different facts. `Campaign.ownerId` is whoever created it and
 * never moves; the DM is a membership role and can be handed to someone else.
 * They match in a campaign whose creator still runs it, which is most of them —
 * and that coincidence is exactly why the difference kept being missed.
 *
 * Five places had independently worked out "the DM" by looking up the *owner*,
 * so after a handover the dashboard, the campaign info panel, the character
 * editor's permission check and the asset scope picker all still named or
 * empowered the previous DM. A sixth, in the dice handler, refused the real DM
 * outright.
 *
 * One place to ask, so the answer cannot drift apart again.
 */

import type { Campaign, CampaignMembership } from '@/types';

/** The membership of whoever currently runs the campaign, if it is loaded. */
export function campaignDmMembership(
  campaign: Pick<Campaign, 'memberships'> | null | undefined
): CampaignMembership | null {
  return campaign?.memberships?.find((m) => m.role === 'DM') ?? null;
}

/** The membership of whoever owns the campaign, if it is loaded. */
export function campaignOwnerMembership(
  campaign: Pick<Campaign, 'memberships' | 'ownerId'> | null | undefined
): CampaignMembership | null {
  if (!campaign) return null;
  return campaign.memberships?.find((m) => m.userId === campaign.ownerId) ?? null;
}

/**
 * The display name of the DM.
 *
 * Falls back rather than throwing: a campaign summary may arrive without its
 * memberships, and a name is decoration — it must never be the thing that stops
 * a card rendering.
 */
export function campaignDmName(
  campaign: Pick<Campaign, 'memberships'> | null | undefined,
  fallback = 'Unknown'
): string {
  return campaignDmMembership(campaign)?.user?.displayName ?? fallback;
}

/** The display name of the owner, on the same terms. */
export function campaignOwnerName(
  campaign: Pick<Campaign, 'memberships' | 'ownerId'> | null | undefined,
  fallback = 'Unknown'
): string {
  return campaignOwnerMembership(campaign)?.user?.displayName ?? fallback;
}

/**
 * Whether the owner is somebody other than the DM.
 *
 * Used to decide whether ownership is worth mentioning in the UI at all: while
 * the two are the same person, saying so twice is noise, and it only becomes
 * information once they diverge.
 */
export function ownerDiffersFromDm(
  campaign: Pick<Campaign, 'memberships' | 'ownerId'> | null | undefined
): boolean {
  if (!campaign) return false;
  const dm = campaignDmMembership(campaign);
  // With no DM row loaded there is nothing to differ from; say no rather than
  // inventing a distinction out of missing data.
  if (!dm) return false;
  return dm.userId !== campaign.ownerId;
}

/** Whether this user owns the campaign, whoever happens to be running it. */
export function isCampaignOwner(
  campaign: Pick<Campaign, 'ownerId'> | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!campaign || !userId) return false;
  return campaign.ownerId === userId;
}

/**
 * Whether this user runs the campaign.
 *
 * Prefer the server's own `userRole` when it is present — it is computed from
 * the membership by the API and is the same answer this would derive — and fall
 * back to reading the membership list for callers that hold only a summary.
 */
export function isCampaignDm(
  campaign: Pick<Campaign, 'memberships' | 'userRole'> | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!campaign || !userId) return false;
  if (campaign.userRole) return campaign.userRole === 'DM';
  return campaign.memberships?.some((m) => m.userId === userId && m.role === 'DM') ?? false;
}

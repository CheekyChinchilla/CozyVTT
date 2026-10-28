/**
 * Taking a member out of a campaign, and telling everyone it has happened.
 *
 * The DM's Remove (`DELETE /api/campaigns/:campaignId/members/:userId`)
 * does both: one serializable transaction that takes the member out, then
 * the notices to their open connections and to the table. Each route says
 * its own refusals in its own words; the rules are these.
 */

import { inSerializableTransaction } from '../utils/serializable';
import { clearCampaignFromLiveSockets, announceRosterChange } from '../websocket/utils';
import logger from '../utils/logger';

/** Why a member was not taken out: not a member, the DM, or the campaign's owner. */
export type TakeOutRefusal = 'not-member' | 'dm' | 'owner';

/**
 * Take `userId` out of the campaign: their characters in it go back to
 * their own list, and the membership is deleted. Refused, with nothing
 * changed, for someone who is not a member, for the DM, and for the owner.
 * Returns the refusal, or null once it is done.
 *
 * Who the member is, and the change, are one serializable transaction
 * (utils/serializable.ts): a DM hand-over landing in between could otherwise
 * give this member the seat just before they were taken out, leaving the
 * campaign with no DM.
 */
export async function takeMemberOut(campaignId: string, userId: string): Promise<TakeOutRefusal | null> {
  return inSerializableTransaction(async (tx): Promise<TakeOutRefusal | null> => {
    const membership = await tx.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { role: true },
    });
    if (!membership) return 'not-member';

    // CRITICAL: the campaign keeps its DM.
    if (membership.role === 'DM') return 'dm';

    // Nor the owner, who is often sitting as a player after handing the seat
    // over. Taking the seat back needs a membership, and only the DM can add
    // one, so taking the owner out would shut them out of their own campaign
    // with no way in except deleting it.
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId }, select: { ownerId: true } });
    if (campaign?.ownerId === userId) return 'owner';

    // Delete the membership, and take their characters out of the campaign
    // with it: a character that still named the campaign stayed readable by
    // every member and editable by the DM, and each save the owner made was
    // still sent to the table they had left.
    await tx.character.updateMany({ where: { userId, campaignId }, data: { campaignId: null } });
    await tx.campaignMembership.delete({ where: { userId_campaignId: { userId, campaignId } } });
    return null;
  });
}

/**
 * Tell everyone a member taken out of the campaign is gone: their open
 * connections to it leave it, each told why, and the table's pages refresh
 * their member lists (`roster.updated`, `member.left`). Never throws: the
 * membership is already gone.
 */
export async function tellTableMemberLeft(userId: string, campaignId: string): Promise<void> {
  // A socket caches the campaign from when it authenticated, so without this
  // the person carries on playing until they close the tab. Best-effort: a
  // socket layer that is not up must not fail the request.
  try {
    await clearCampaignFromLiveSockets(userId, campaignId);
  } catch (error) {
    logger.error('Member removed but live sockets were not updated', { err: error, userId, campaignId });
  }
  announceRosterChange(userId, [campaignId], 'member.left');
}

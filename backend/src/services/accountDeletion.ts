/**
 * Deleting an account, from the account itself or by an admin.
 *
 * What the person leaves behind: their dice rolls and uploaded files stay,
 * owned by no one (the database sets those columns to null), as their chat
 * messages already do, so a campaign's history and the art on its maps
 * survive them, and documents they shared into a campaign stay shared.
 * Their memberships, characters, notes and the rest go with them.
 *
 * A campaign needs an owner. One they own while someone else sits as its DM
 * passes to that DM. One they run themselves stops the deletion until they
 * hand the DM seat over or delete the campaign; nothing is changed then.
 */

import { prisma } from '../config/database';

/**
 * A campaign that stops a deletion, with the other members its DM seat could
 * go to, so an admin can hand it over (the DM transfer route lets an admin
 * do that) or delete it, and a user who will not cannot keep their account
 * that way.
 */
export interface BlockingCampaign {
  id: string;
  name: string;
  members: { userId: string; displayName: string; role: string }[];
}

export type AccountDeletion =
  | { deleted: true; campaignIds: string[] }
  | { deleted: false; runs: BlockingCampaign[] };

export async function deleteAccount(userId: string): Promise<AccountDeletion> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.campaign.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        memberships: { select: { userId: true, role: true, user: { select: { displayName: true } } } },
      },
    });
    const dmOf = (c: (typeof owned)[number]) => c.memberships.find((m) => m.role === 'DM')?.userId;
    // TODO(accounts): only campaigns the user owns are checked. After a DM
    // handover the DM need not be the owner, and deleting that DM's account
    // leaves the campaign with no DM until the owner hands the seat to someone
    // (PUT /:campaignId/dm). Refuse, and list in `runs`, every campaign the
    // user is DM of, so an admin can hand it on first.
    const runs = owned
      .filter((c) => dmOf(c) === undefined || dmOf(c) === userId)
      .map((c) => ({
        id: c.id,
        name: c.name,
        members: c.memberships
          .filter((m) => m.userId !== userId)
          .map((m) => ({ userId: m.userId, displayName: m.user.displayName, role: m.role })),
      }));
    if (runs.length > 0) return { deleted: false, runs };

    // Every campaign left here has a DM other than this user.
    for (const campaign of owned) {
      const dm = dmOf(campaign);
      if (dm !== undefined) await tx.campaign.update({ where: { id: campaign.id }, data: { ownerId: dm } });
    }
    // Documents they shared into a campaign stay shared: the share passes to
    // the campaign's DM, or to its owner when the DM seat is theirs or empty.
    // Owned campaigns have just passed to their DM above.
    const shares = await tx.campaignDocument.findMany({
      where: { linkedById: userId },
      select: {
        id: true,
        campaign: { select: { ownerId: true, memberships: { where: { role: 'DM' }, select: { userId: true } } } },
      },
    });
    for (const share of shares) {
      const dm = share.campaign.memberships[0]?.userId;
      const heir = dm !== undefined && dm !== userId ? dm : share.campaign.ownerId;
      if (heir !== userId) await tx.campaignDocument.update({ where: { id: share.id }, data: { linkedById: heir } });
    }

    // The campaigns they were in, read before the cascade removes the rows.
    const campaignIds = (await tx.campaignMembership.findMany({ where: { userId }, select: { campaignId: true } }))
      .map((m) => m.campaignId);
    await tx.user.delete({ where: { id: userId } });
    return { deleted: true, campaignIds };
  });
}

/** The reason a deletion was refused, for the person or an admin. */
export function runsCampaignsMessage(runs: BlockingCampaign[], whose: 'you' | 'they'): string {
  const list = runs.map((c) => `"${c.name}"`).join(', ');
  return whose === 'you'
    ? `You run ${list}. Hand the DM seat to someone else in the campaign's settings, or delete the campaign, then delete your account.`
    : `This user runs ${list}. Hand each one's DM seat to another member, or delete it, then delete the user.`;
}

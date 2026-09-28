/**
 * Deleting an account, from the account itself or by an admin.
 *
 * What the person leaves behind: their dice rolls and uploaded files stay,
 * owned by no one (the database sets those columns to null), as their chat
 * messages already do, so a campaign's history and the art on its maps
 * survive them. Their memberships, characters, notes and the rest go with
 * them.
 *
 * A campaign needs an owner. One they own while someone else sits as its DM
 * passes to that DM. One they run themselves stops the deletion until they
 * hand the DM seat over or delete the campaign; nothing is changed then.
 */

import { prisma } from '../config/database';

export type AccountDeletion =
  | { deleted: true; campaignIds: string[] }
  | { deleted: false; runs: string[] };

export async function deleteAccount(userId: string): Promise<AccountDeletion> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.campaign.findMany({
      where: { ownerId: userId },
      select: { id: true, name: true, memberships: { where: { role: 'DM' }, select: { userId: true } } },
    });
    const runs = owned.filter((c) => c.memberships.every((m) => m.userId === userId)).map((c) => c.name);
    if (runs.length > 0) return { deleted: false, runs };

    for (const campaign of owned) {
      await tx.campaign.update({ where: { id: campaign.id }, data: { ownerId: campaign.memberships[0].userId } });
    }
    // The campaigns they were in, read before the cascade removes the rows.
    const campaignIds = (await tx.campaignMembership.findMany({ where: { userId }, select: { campaignId: true } }))
      .map((m) => m.campaignId);
    await tx.user.delete({ where: { id: userId } });
    return { deleted: true, campaignIds };
  });
}

/** The reason a deletion was refused, for the person or an admin. */
export function runsCampaignsMessage(runs: string[], whose: 'you' | 'they'): string {
  const list = runs.map((name) => `"${name}"`).join(', ');
  return whose === 'you'
    ? `You run ${list}. Hand the DM seat to someone else in the campaign's settings, or delete the campaign, then delete your account.`
    : `This user runs ${list}. They, or you as an admin, can hand the DM seat to someone else or delete the campaign first.`;
}

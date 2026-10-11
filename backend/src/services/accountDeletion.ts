/**
 * Deleting an account, from the account itself or by an admin.
 *
 * What the person leaves behind: their dice rolls stay, owned by no one (the
 * database sets the column to null), as their chat messages already do, and
 * so do the files they uploaded into a campaign, so a campaign's history and
 * its own art survive them. Documents they shared into a campaign stay
 * shared. Their memberships, characters, notes and the rest go with them.
 *
 * Their personal files go too: the avatar always, and any other personal
 * upload that nothing uses and no campaign has shared, row and file. A
 * personal file a map, token, template, creature or campaign setting still
 * names stays, owned by no one, like a campaign's files. The rows are
 * deleted with the account; the files are removed by removePersonalFiles,
 * which the routes call once the account's sessions have ended.
 *
 * A campaign needs an owner. One they own while someone else sits as its DM
 * passes to that DM. One they run themselves stops the deletion until they
 * hand the DM seat over or delete the campaign; nothing is changed then.
 */

import type { AssetType } from '@prisma/client';
import { prisma } from '../config/database';
import { isAssetInUse } from './assetUsage';
import { deleteFile } from '../utils/fileUtils';
import logger from '../utils/logger';

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

/** A personal upload of the person being deleted, read before the row goes. */
export interface PersonalAsset {
  id: string;
  type: AssetType;
}

/**
 * `personal` lists the account's personal uploads, for removePersonalFiles
 * to delete the ones nothing uses once the account's sessions have ended.
 */
export type AccountDeletion =
  | { deleted: true; campaignIds: string[]; personal: PersonalAsset[] }
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
    // Their personal uploads, read while the rows still name them.
    const personal = await tx.asset.findMany({ where: { uploadedById: userId, scope: 'USER' }, select: { id: true, type: true } });
    await tx.user.delete({ where: { id: userId } });
    return { deleted: true, campaignIds, personal };
  });
}

/**
 * Delete the personal uploads of an account just deleted: the avatar, and
 * every other one nothing uses and no campaign has shared. Run after the
 * deletion, so a character that went with the account no longer counts as a
 * use, and after its sessions have ended, so the time this takes is not time
 * a deleted account can still act. The rows go first and the files after; a
 * file that cannot be removed is left for the Admin Panel's leftover files
 * check. The account is already gone, so nothing here fails the request: a
 * failure is logged.
 */
export async function removePersonalFiles(personal: PersonalAsset[]): Promise<void> {
  try {
    const doomed: string[] = [];
    for (const asset of personal) {
      if (asset.type !== 'AVATAR') {
        // TODO(accounts): a personal file kept here because a campaign uses it
        // can no longer be read by that campaign's members, since a null
        // uploader grants nothing in assetUsedInUserCampaign, so their maps and
        // tokens show it as missing. Either move such a file into the campaign
        // that uses it, or let the use rule accept a file with no uploader.
        // Both change who may read it, so it waits for a decision.
        if (await isAssetInUse(asset.id)) continue;
        if ((await prisma.campaignDocument.count({ where: { assetId: asset.id } })) > 0) continue;
      }
      doomed.push(asset.id);
    }
    if (doomed.length === 0) return;
    // Owned by no one now; nobody but an admin could have claimed one since.
    const where = { id: { in: doomed }, uploadedById: null };
    const files = await prisma.asset.findMany({ where, select: { filePath: true, thumbnailPath: true } });
    await prisma.asset.deleteMany({ where });
    for (const file of files.flatMap((f) => [f.filePath, f.thumbnailPath])) {
      if (!file) continue;
      await deleteFile(file).catch((error) => logger.error("Could not delete a deleted account's file", { err: error }));
    }
  } catch (error) {
    logger.error("Account deleted, but its personal files could not all be removed", { err: error });
  }
}

/** The reason a deletion was refused, for the person or an admin. */
export function runsCampaignsMessage(runs: BlockingCampaign[], whose: 'you' | 'they'): string {
  const list = runs.map((c) => `"${c.name}"`).join(', ');
  return whose === 'you'
    ? `You run ${list}. Hand the DM seat to someone else in the campaign's settings, or delete the campaign, then delete your account.`
    : `This user runs ${list}. Hand each one's DM seat to another member, or delete it, then delete the user.`;
}

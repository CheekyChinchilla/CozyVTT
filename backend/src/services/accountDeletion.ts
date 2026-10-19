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
 * names stays, owned by no one, like a campaign's files. A file with no
 * uploader grants nobody reading through its uses, so one whose every use is
 * in a single campaign becomes that campaign's own, in the deletion's
 * transaction; one used anywhere else stays personal, readable by admins
 * alone, and the activity log names it so an admin can move it. The rows are
 * deleted with the account; the files are removed by removePersonalFiles,
 * which the routes start once the account's sessions have ended and the answer
 * is on its way (removePersonalFilesAfterwards), since working out which may
 * go costs several queries a file.
 *
 * A campaign needs an owner and a DM. One they own while someone else sits as
 * its DM passes to that DM. One whose DM seat is theirs, owned by them or not,
 * or one they own with nobody in the DM seat, stops the deletion until they
 * hand the DM seat over or delete the campaign; nothing is changed then.
 */

import type { AssetType } from '@prisma/client';
import { prisma } from '../config/database';
import { findUses, isAssetInUse } from './assetUsage';
import { writeSystemLog } from './systemLog';
import { deleteFile } from '../utils/fileUtils';
import logger from '../utils/logger';
import { destroyUserLoginSessions } from './sessionStore';
import { isOnlyAdmin } from './platformAdmins';
import { inSerializableTransaction } from '../utils/serializable';

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

/** A kept personal file left personal: used in several campaigns, or outside one. */
interface LeftPersonal {
  id: string;
  name: string;
  outsideCampaigns: boolean;
}

/**
 * `personal` lists the account's personal uploads, for removePersonalFiles
 * to delete the ones nothing uses once the account's sessions have ended.
 */
export type AccountDeletion =
  | { deleted: true; campaignIds: string[]; personal: PersonalAsset[] }
  | { deleted: false; refused: 'runsCampaigns'; runs: BlockingCampaign[] }
  | { deleted: false; refused: 'onlyAdmin' };

/**
 * Delete an account, unless it is the instance's only admin
 * (services/platformAdmins) or runs a campaign. One serializable transaction
 * (utils/serializable.ts), so an admin removed at the same moment, or a DM
 * seat handed over meanwhile, is seen before anything is written.
 */
export async function deleteAccount(userId: string): Promise<AccountDeletion> {
  type Inside =
    | Exclude<AccountDeletion, { deleted: true }>
    | (Extract<AccountDeletion, { deleted: true }> & { email: string; leftPersonal: LeftPersonal[] });
  return inSerializableTransaction(async (tx): Promise<Inside> => {
    const account = await tx.user.findUnique({ where: { id: userId }, select: { platformRole: true, email: true } });
    if (account?.platformRole === 'ADMIN' && (await isOnlyAdmin(userId, tx))) {
      return { deleted: false, refused: 'onlyAdmin' };
    }

    // The campaigns they own, and the ones whose DM seat is theirs.
    const theirs = await tx.campaign.findMany({
      where: { OR: [{ ownerId: userId }, { memberships: { some: { userId, role: 'DM' } } }] },
      select: {
        id: true,
        name: true,
        ownerId: true,
        memberships: { select: { userId: true, role: true, user: { select: { displayName: true } } } },
      },
    });
    const dmOf = (c: (typeof theirs)[number]) => c.memberships.find((m) => m.role === 'DM')?.userId;
    const owned = theirs.filter((c) => c.ownerId === userId);
    const runs = theirs
      .filter((c) => dmOf(c) === userId || (c.ownerId === userId && dmOf(c) === undefined))
      .map((c) => ({
        id: c.id,
        name: c.name,
        members: c.memberships
          .filter((m) => m.userId !== userId)
          .map((m) => ({ userId: m.userId, displayName: m.user.displayName, role: m.role })),
      }));
    if (runs.length > 0) return { deleted: false, refused: 'runsCampaigns', runs };

    // Every campaign left here has a DM other than this user.
    for (const campaign of owned) {
      const dm = dmOf(campaign);
      if (dm !== undefined) await tx.campaign.update({ where: { id: campaign.id }, data: { ownerId: dm } });
    }
    // Documents they shared into a campaign stay shared: the share passes to
    // the campaign's DM, or to its owner when the DM seat is empty.
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
    const uploads = await tx.asset.findMany({
      where: { uploadedById: userId, scope: 'USER' },
      select: { id: true, type: true, name: true },
    });
    // A file a campaign uses is kept. Its uses stop granting reading once it
    // has no uploader, so one used in a single campaign becomes that
    // campaign's. Their own characters go with the account and do not count.
    const personal: PersonalAsset[] = [];
    const leftPersonal: LeftPersonal[] = [];
    for (const asset of uploads) {
      if (asset.type !== 'AVATAR') {
        const uses = (await findUses(asset.id, tx)).filter((u) => !(u.kind === 'character' && u.ownerId === userId));
        const where = new Set(uses.map((u) => u.campaignId));
        const [only] = where;
        if (where.size === 1 && only) {
          await tx.asset.update({ where: { id: asset.id }, data: { scope: 'CAMPAIGN', campaignId: only } });
          continue;
        }
        if (uses.length > 0) leftPersonal.push({ id: asset.id, name: asset.name, outsideCampaigns: where.has(null) });
      }
      personal.push({ id: asset.id, type: asset.type });
    }
    // Their sign-ins end with the row, in the same transaction: the guards
    // read the session, so a deleted admin's other device would otherwise
    // keep the role until the session expired.
    await destroyUserLoginSessions(userId, undefined, tx);
    await tx.user.delete({ where: { id: userId } });
    return { deleted: true, campaignIds, personal, leftPersonal, email: account?.email ?? '' };
  }).then(async (result) => {
    if (!result.deleted) return result;
    // Written once the deletion has committed: a retried transaction would
    // otherwise write each line again.
    for (const file of result.leftPersonal) {
      await writeSystemLog({
        level: 'WARNING',
        message: `Kept "${file.name}", a personal file of the deleted account ${result.email}, with no owner: it is used ${
          file.outsideCampaigns ? 'outside a campaign' : 'in more than one campaign'
        }, so only an admin can see it until it is moved`,
        context: { assetId: file.id },
      });
    }
    return { deleted: true, campaignIds: result.campaignIds, personal: result.personal };
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

/** Removals started by removePersonalFilesAfterwards that have not finished. */
const removals = new Set<Promise<void>>();

/**
 * The removals of deleted accounts' files that are still under way, which a
 * shutdown waits for (utils/shutdown.ts) so it does not stop between the
 * check and the delete.
 */
export const personalFilesBeingRemoved = {
  get count(): number {
    return removals.size;
  },

  /** Settles once none is under way: at once when none is. */
  async finished(): Promise<void> {
    while (removals.size > 0) await Promise.all([...removals]);
  },
};

/**
 * Remove the personal files of an account just deleted without making the
 * caller wait: the account is gone, so what is left is housekeeping, and a
 * person with many uploads waited on seven queries per file for an answer
 * that was already settled. Never rejects; removePersonalFiles logs its own
 * failures, and what it did not reach stays as assets owned by no one, which
 * an administrator can delete.
 */
export function removePersonalFilesAfterwards(personal: PersonalAsset[]): void {
  if (personal.length === 0) return;
  const removal: Promise<void> = removePersonalFiles(personal)
    .catch((error: unknown) => {
      logger.error("Account deleted, but its personal files could not all be removed", { err: error });
    })
    .finally(() => {
      removals.delete(removal);
    });
  removals.add(removal);
}

/** The reason a deletion was refused, for the person or an admin. */
export function runsCampaignsMessage(runs: BlockingCampaign[], whose: 'you' | 'they'): string {
  const list = runs.map((c) => `"${c.name}"`).join(', ');
  return whose === 'you'
    ? `You run ${list}. Hand the DM seat to someone else in the campaign's settings, or delete the campaign, then delete your account.`
    : `This user runs ${list}. Hand each one's DM seat to another member, or delete it, then delete the user.`;
}

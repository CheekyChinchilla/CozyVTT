// ============================================
// Who may delete an asset, or move it out of where it is
// ============================================
//
// Whoever may change an asset (mayChangeAsset) may delete it or move it,
// with one narrowing for a campaign asset. Its uploader keeps the right
// while a member, so a DM who handed the seat over could, as a player,
// delete with force=true a picture the new DM's maps use, and every map
// using it lost its picture. So an uploader who does not run the campaign
// may delete or move one only while nothing but their own things use it
// (usedByOthersThan); otherwise it is the campaign's DM's alone. An admin
// and the campaign's DM are not narrowed. Editing the text of a document
// stays with mayChangeAsset.

import type { AssetScope } from '@prisma/client';
import { prisma } from '../config/database';
import { mayChangeAsset } from './permissions';
import { usedByOthersThan } from './assetUsage';

/** Why a removal is refused: not the caller's to change, used by others in the campaign, or by a character template alone. */
export type AssetRemovalVerdict = { allowed: true } | { allowed: false; reason: 'not-theirs' | 'used-by-others' | 'used-by-a-template' };

/** Whether `userId` may delete the asset, or move it out of its scope. */
export async function mayRemoveAsset(
  asset: { id: string; scope: AssetScope; uploadedById: string | null; campaignId: string | null },
  userId: string,
  isAdmin: boolean
): Promise<AssetRemovalVerdict> {
  if (!(await mayChangeAsset(asset, userId, isAdmin))) return { allowed: false, reason: 'not-theirs' };
  if (isAdmin || asset.scope !== 'CAMPAIGN' || !asset.campaignId) return { allowed: true };
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId: asset.campaignId } },
    select: { role: true },
  });
  if (membership?.role === 'DM') return { allowed: true };
  // The uploader, a member who does not run the campaign.
  const using = await usedByOthersThan(asset.id, userId);
  if (using === 'others') return { allowed: false, reason: 'used-by-others' };
  if (using === 'character-template') return { allowed: false, reason: 'used-by-a-template' };
  return { allowed: true };
}

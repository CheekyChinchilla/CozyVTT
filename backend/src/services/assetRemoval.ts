// ============================================
// Who may delete an asset, or move it out of where it is
// ============================================
//
// Whoever may change an asset (mayChangeAsset) may delete it or move it,
// with one narrowing for a campaign asset. Its uploader keeps the right
// while a member, so a GM who handed the seat over could, as a player,
// delete with force=true a picture the new GM's maps use, and every map
// using it lost its picture. So an uploader who does not run the campaign
// may delete or move one only while nothing but their own things use it
// (usedByOthersThan); otherwise it is the campaign's GM's alone. An admin
// and the campaign's GM are not narrowed. Editing the text of a document
// stays with mayChangeAsset.
//
// A document shows a picture by what was read from its text and kept. The
// documents stored before that was kept are read a few at a time as the
// table plays, so this reads the campaign's other members' unread ones
// first (readUnreadDocumentsBy, at most MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL
// of them), and refuses while any stays unread: past the cap, being read by
// another request, or with a file that could not be read, which keeps it
// the GM's until the file can be read. Once none is left the uses are
// looked at again, since any request may have read one meanwhile.

import type { AssetScope } from '@prisma/client';
import { prisma } from '../config/database';
import { mayChangeAsset } from './permissions';
import { usedByOthersThan } from './assetUsage';
import { readUnreadDocumentsBy } from './sharedDocumentPictures';

/**
 * Why a removal is refused: not the caller's to change, used by others in
 * the campaign, by a character template alone, or older documents of the
 * campaign's members not read yet for the pictures they show.
 */
export type AssetRemovalVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'not-theirs' | 'used-by-others' | 'used-by-a-template' | 'documents-unread' };

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
  if (membership?.role === 'GM') return { allowed: true };
  // The uploader, a member who does not run the campaign.
  let using = await usedByOthersThan(asset.id, userId);
  if (using === 'others') return { allowed: false, reason: 'used-by-others' };
  // Their own documents are theirs to lose, so only the other members' are read.
  const others = await prisma.campaignMembership.findMany({
    where: { campaignId: asset.campaignId, userId: { not: userId } },
    select: { userId: true },
  });
  if ((await readUnreadDocumentsBy(others.map((m) => m.userId))) === 'some-unread') {
    return { allowed: false, reason: 'documents-unread' };
  }
  using = await usedByOthersThan(asset.id, userId);
  if (using === 'others') return { allowed: false, reason: 'used-by-others' };
  if (using === 'character-template') return { allowed: false, reason: 'used-by-a-template' };
  return { allowed: true };
}

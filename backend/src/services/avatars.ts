/**
 * A person's avatar pictures.
 *
 * The avatar route serves the newest AVATAR asset a person uploaded, and
 * nothing used to remove the older ones: each upload added a picture, and
 * deleting the newest brought the one before it back as their avatar. A new
 * avatar now deletes the ones before it, and clearing the avatar deletes them
 * all. A picture that something else names, such as a token, is kept: it
 * stops being anyone's avatar only when nothing uses it.
 */

import { prisma } from '../config/database';
import { deleteFile } from '../utils/fileUtils';
import { isAssetInUse } from './assetUsage';
import logger from '../utils/logger';

/**
 * Delete a person's avatar pictures, rows first and then files, apart from
 * `keepId` and any picture something still uses. Answers how many went. A
 * file that cannot be removed is logged and left for the Admin Panel's
 * leftover files check.
 */
export async function removeAvatars(userId: string, keepId?: string): Promise<number> {
  const avatars = await prisma.asset.findMany({
    where: { uploadedById: userId, type: 'AVATAR', ...(keepId ? { id: { not: keepId } } : {}) },
    select: { id: true, filePath: true, thumbnailPath: true },
  });
  let removed = 0;
  for (const avatar of avatars) {
    if (await isAssetInUse(avatar.id)) continue;
    const gone = await prisma.asset.deleteMany({ where: { id: avatar.id, uploadedById: userId } });
    if (gone.count === 0) continue;
    removed += 1;
    for (const file of [avatar.filePath, avatar.thumbnailPath]) {
      if (!file) continue;
      await deleteFile(file).catch((error) => logger.error('Could not delete an earlier avatar file', { err: error }));
    }
  }
  return removed;
}

/**
 * After one of a person's avatar pictures was deleted: when none is left,
 * the profile no longer has an avatar, so nothing points at the empty route.
 */
export async function clearAvatarIfNoneLeft(userId: string): Promise<void> {
  const left = await prisma.asset.count({ where: { uploadedById: userId, type: 'AVATAR' } });
  if (left === 0) {
    await prisma.user.updateMany({ where: { id: userId, avatarUrl: { not: null } }, data: { avatarUrl: null } });
  }
}

/**
 * A campaign asset with no campaign recorded is read like a personal one.
 *
 * Deleting a campaign sets its assets' campaign to null (the foreign key's
 * rule), and the one route that deletes campaigns turns their assets
 * personal first, under a lock. The read rule treated a campaign asset with
 * no campaign as readable by anyone signed in, so any other way of removing
 * a campaign added later would have opened its assets to every account. It
 * now answers as for a personal asset: the uploader, an admin, or a member
 * of a campaign that uses it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { canReadAsset } from '../permissions';

const userIds: string[] = [];

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: userIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

async function orphanBy(uploadedById: string) {
  return prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId: null, uploadedById,
      filename: `orphan-${randomUUID()}.png`, originalName: 'lair.png', mimeType: 'image/png', fileSize: 1,
      filePath: `/nowhere/orphan-${randomUUID()}.png`, name: 'Boss lair', tags: [],
    },
    select: { id: true, scope: true, uploadedById: true, campaignId: true },
  });
}

it('is refused to a stranger', async () => {
  const uploader = await createTestUser({ displayName: 'Orphan Uploader' });
  const stranger = await createTestUser({ displayName: 'Orphan Stranger' });
  userIds.push(uploader.id, stranger.id);
  const asset = await orphanBy(uploader.id);

  expect(await canReadAsset(asset, stranger.id, false)).toBe(false);
});

it('is still open to its uploader and to an admin', async () => {
  const uploader = await createTestUser({ displayName: 'Orphan Owner' });
  const admin = await createTestUser({ displayName: 'Orphan Admin', role: 'ADMIN' });
  userIds.push(uploader.id, admin.id);
  const asset = await orphanBy(uploader.id);

  expect(await canReadAsset(asset, uploader.id, false)).toBe(true);
  expect(await canReadAsset(asset, admin.id, true)).toBe(true);
});

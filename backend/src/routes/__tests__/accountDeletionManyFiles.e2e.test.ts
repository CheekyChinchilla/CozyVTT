/**
 * Deleting an account with hundreds of personal files that campaigns use.
 *
 * Working out where each kept file is used takes seven queries, one of them
 * a search through the text of every map's tokens. That ran for every
 * personal upload inside the deletion's transaction, which PostgreSQL ends
 * after five seconds unless told otherwise, so an account with a few hundred
 * files in use, on an instance with many maps, could not be deleted: the
 * request answered 500 and nothing changed. The uses are now read before the
 * transaction, which only moves the files.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { personalFilesBeingRemoved } from '../../services/accountDeletion';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

jest.setTimeout(120000);

const FILES = 300;
/** Maps with tokens that name none of the files, for the token search to read through. */
const OTHER_MAPS = 60;

const app = createTestApp();
const userIds: string[] = [];
const campaignIds: string[] = [];

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { OR: [{ campaignId: { in: campaignIds } }, { uploadedById: { in: userIds } }] } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

const tokens = (urls: string[]) => urls.map((imageUrl, i) => ({ id: randomUUID(), name: `Token ${i}`, x: i, y: 0, imageUrl }));

it(`deletes an account with ${FILES} personal files in use, giving each to the campaign that uses it`, async () => {
  const dm = await createTestUser({ displayName: 'Many Files DM' });
  const leaver = await createTestUser({ displayName: 'Many Files Leaver' });
  userIds.push(dm.id, leaver.id);
  const campaign = await createTestCampaign(dm.id, { name: `Many files ${randomUUID().slice(0, 6)}` });
  campaignIds.push(campaign.id);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dm.id, campaignId: campaign.id, role: 'DM', characterIds: [] },
      { userId: leaver.id, campaignId: campaign.id, role: 'PLAYER', characterIds: [] },
    ],
  });

  const ids = Array.from({ length: FILES }, () => randomUUID());
  await prisma.asset.createMany({
    data: ids.map((id) => ({
      id, type: 'TOKEN' as const, scope: 'USER' as const, uploadedById: leaver.id,
      filename: `${id}.png`, originalName: 'art.png', mimeType: 'image/png', fileSize: 1,
      filePath: `/nonexistent/${id}.png`, name: 'Many Files Art',
    })),
  });
  const map = (name: string, urls: string[]) => ({
    campaignId: campaign.id, name, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, tokens: tokens(urls), annotations: [],
  });
  // Every file on a token of one map, ten maps of thirty tokens.
  await prisma.map.createMany({
    data: Array.from({ length: FILES / 30 }, (_, m) => map(`Used ${m}`, ids.slice(m * 30, m * 30 + 30).map((id) => `/api/assets/tokens/${id}`))),
  });
  await prisma.map.createMany({
    data: Array.from({ length: OTHER_MAPS }, (_, m) => map(`Other ${m}`, Array.from({ length: 200 }, () => `/api/assets/tokens/${randomUUID()}`))),
  });

  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: leaver.email, password: TEST_PASSWORD })).status).toBe(200);
  const started = Date.now();
  const res = await agent.delete('/api/auth/account').send({ password: TEST_PASSWORD });
  const took = Date.now() - started;
  await personalFilesBeingRemoved.finished();

  expect({ status: res.status, took: took < 60000 }).toEqual({ status: 200, took: true });
  expect(await prisma.user.findUnique({ where: { id: leaver.id } })).toBeNull();
  const after = await prisma.asset.findMany({ where: { id: { in: ids } }, select: { scope: true, campaignId: true, uploadedById: true } });
  expect(after).toHaveLength(FILES);
  expect(after.every((a) => a.scope === 'CAMPAIGN' && a.campaignId === campaign.id && a.uploadedById === null)).toBe(true);
});

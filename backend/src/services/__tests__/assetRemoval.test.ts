/**
 * Who may delete or move a campaign asset, when documents stored before
 * what documents show was kept are still unread (mayRemoveAsset).
 *
 * Other requests read such documents too, a few at a time, at any moment.
 * A verdict taken while a document showing the asset was unread must not
 * stand once that document has been read, by this request or another.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import * as assetUsage from '../assetUsage';
import { readSomeUnreadDocuments } from '../sharedDocumentPictures';
import { mayRemoveAsset } from '../assetRemoval';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-asset-removal-'));
const userIds: string[] = [];
const campaignIds: string[] = [];
let campaignId = '';
let dmId = '';
let formerDmId = '';

beforeAll(async () => {
  const stamp = Date.now();
  dmId = (await createTestUser({ email: `removal-dm-${stamp}@test.invalid` })).id;
  formerDmId = (await createTestUser({ email: `removal-former-${stamp}@test.invalid` })).id;
  userIds.push(dmId, formerDmId);
  campaignId = (await createTestCampaign(dmId, { name: `Removal ${stamp}` })).id;
  campaignIds.push(campaignId);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: formerDmId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.asset.updateMany({ where: { campaignId, type: 'DOCUMENT', picturesReadAt: null }, data: { picturesReadAt: new Date() } });
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
  fs.rmSync(DIR, { recursive: true, force: true });
});

/** A map picture the former DM uploaded into the campaign. */
async function picture() {
  const filename = `p-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  return prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId, uploadedById: formerDmId, filename, originalName: filename,
      mimeType: 'image/png', fileSize: 1, filePath: path.join(DIR, filename), name: 'p',
    },
    select: { id: true, scope: true, uploadedById: true, campaignId: true },
  });
}

/** A handout of the DM's in the campaign stored before what documents show was kept. */
async function storedBefore(content: string): Promise<string> {
  const filename = `d-${Date.now()}-${Math.random().toString(36).slice(2)}.md`;
  const filePath = path.join(DIR, filename);
  fs.writeFileSync(filePath, content);
  await prisma.asset.create({
    data: {
      type: 'DOCUMENT', scope: 'CAMPAIGN', campaignId, uploadedById: dmId, filename, originalName: filename,
      mimeType: 'text/markdown', fileSize: Buffer.byteLength(content), filePath, name: filename,
    },
  });
  return filePath;
}

it('refuses when another request reads the handout between the first look at the uses and the reading', async () => {
  const art = await picture();
  await storedBefore(`![Map](/api/assets/maps/${art.id})`);

  const real = assetUsage.usedByOthersThan;
  let first = true;
  jest.spyOn(assetUsage, 'usedByOthersThan').mockImplementation(async (assetId, userId) => {
    const verdict = await real(assetId, userId);
    if (first) {
      first = false;
      // Another request's read of the campaign's documents finishes now.
      await readSomeUnreadDocuments({ campaignIds: [campaignId] });
    }
    return verdict;
  });

  expect(await mayRemoveAsset(art, formerDmId, false)).toEqual({ allowed: false, reason: 'used-by-others' });
});

it('refuses while another request is reading the handout', async () => {
  const art = await picture();
  const file = await storedBefore(`![Map](/api/assets/maps/${art.id})`);

  // Another request picks the handout and holds it while its file opens.
  const realOpen = fs.promises.open.bind(fs.promises);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let opened = () => {};
  const isOpen = new Promise<void>((resolve) => { opened = resolve; });
  jest.spyOn(fs.promises, 'open').mockImplementation(async (target, ...rest) => {
    if (path.resolve(String(target)) === path.resolve(file)) {
      opened();
      await held;
    }
    return realOpen(target, ...rest);
  });
  const other = readSomeUnreadDocuments({ campaignIds: [campaignId] });
  await isOpen;

  try {
    expect(await mayRemoveAsset(art, formerDmId, false)).toEqual({ allowed: false, reason: 'documents-unread' });
  } finally {
    release();
    await other;
  }
  // Once it is read, the handout itself refuses.
  expect(await mayRemoveAsset(art, formerDmId, false)).toEqual({ allowed: false, reason: 'used-by-others' });
});

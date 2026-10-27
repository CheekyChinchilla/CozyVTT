/**
 * What a campaign archive carries of drawing on the map.
 *
 * The campaign's Players may draw goes with it, so a DM who turned it off
 * finds it off after moving the campaign to another server; an archive from
 * before the setting existed imports with it on, as every campaign was at
 * the upgrade.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-drawings-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport } from '../campaignExporter';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Archive Drawings' })).id;
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

/** A campaign of the user's, with one empty map, as the DM. */
async function campaign(name: string) {
  const source = await createTestCampaign(userId, { name });
  await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
  const map = await prisma.map.create({
    data: { campaignId: source.id, name: 'Plan', imageUrl: '', baseLayerUrl: '', width: 20, height: 20, gridSize: 50, tokens: [], annotations: [] },
  });
  return { campaignId: source.id, mapId: map.id };
}

/** Export the campaign and import the archive again, as the same user. */
async function roundTrip(campaignId: string) {
  const file = path.join(SCRATCH, `${campaignId}.cozyvtt`);
  const prepared = await prepareCampaignExport(campaignId, { userId, isAdmin: false });
  await prepared.writeTo(fs.createWriteStream(file));
  return { file, result: await importCampaign(file, userId) };
}

describe('Players may draw', () => {
  it('comes back off when it was off', async () => {
    const { campaignId } = await campaign('Players kept from drawing');
    await prisma.campaign.update({ where: { id: campaignId }, data: { playersMayDraw: false } });
    const { result } = await roundTrip(campaignId);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } })).playersMayDraw).toBe(false);
  });

  it('is on for an archive from before the setting', async () => {
    const file = path.join(SCRATCH, 'before-the-setting.cozyvtt');
    await writeZip(file, [
      {
        name: 'manifest.json',
        data: JSON.stringify({
          formatVersion: 1, exportedAt: '2026-10-25T12:00:00.000Z', exportedFrom: 'CozyVTT v1.5.4', campaignName: 'Older',
          gameSystem: 'NONE', mapCount: 0, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 0,
          includesAudio: false, totalSizeBytes: 0,
        }),
      },
      { name: 'campaign.json', data: JSON.stringify({ name: 'Older', description: null, gameSystem: null, vibeSettings: { periods: [] } }) },
      { name: 'assets/asset-manifest.json', data: '{}' },
    ]);
    const result = await importCampaign(file, userId);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } })).playersMayDraw).toBe(true);
  });
});

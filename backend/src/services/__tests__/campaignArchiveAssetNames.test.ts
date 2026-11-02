/**
 * A campaign archive keeps each picture's and sound's own name and
 * description, and an import holds them to what an upload may set.
 *
 * An archive's list of assets gave each one's file name, format, kind, size
 * and tags and nothing else, so an imported campaign's Asset Library named
 * every asset after its file and showed no description, whatever the DM had
 * called it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-names-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import unzipper from 'unzipper';
import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport } from '../campaignExporter';
import { ASSET_LIMITS } from '../../validators/assetLimits';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Archive Names' })).id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

async function picture(campaignId: string, type: 'MAP' | 'TOKEN', file: string, name: string, description: string | null) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, `${randomUUID()}.png`);
  fs.writeFileSync(filePath, PNG);
  return prisma.asset.create({
    data: {
      type, scope: 'CAMPAIGN', campaignId, uploadedById: userId, filename: path.basename(filePath),
      originalName: `${file}.png`, mimeType: 'image/png', fileSize: PNG.length, filePath, name, description,
    },
  });
}

/** Each imported asset's name and description, by the file name it came from. */
async function imported(campaignId: string): Promise<Record<string, [string, string | null]>> {
  const assets = await prisma.asset.findMany({ where: { campaignId } });
  return Object.fromEntries(assets.map((a) => [a.originalName, [a.name, a.description]]));
}

describe('a campaign exported and imported again', () => {
  it('keeps the name and description of its pictures', async () => {
    const source = await createTestCampaign(userId, { name: 'Named' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
    const crypt = await picture(source.id, 'MAP', 'IMG_2041', 'The Undercroft', 'Lower level, flooded in the second act');
    const goblin = await picture(source.id, 'TOKEN', 'goblin-final-v3', 'Goblin Boss', null);
    await prisma.map.create({
      data: {
        campaignId: source.id, name: 'Crypt', imageUrl: `/api/assets/maps/${crypt.id}`, baseLayerUrl: `/api/assets/maps/${crypt.id}`,
        width: 10, height: 10, gridSize: 70, tokens: [], annotations: [], wallSegments: [], lights: [],
      },
    });
    await prisma.tokenTemplate.create({ data: { campaignId: source.id, name: 'Goblin', imageUrl: `/api/assets/tokens/${goblin.id}` } });

    const file = path.join(SCRATCH, 'named.cozyvtt');
    const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
    await prepared.writeTo(fs.createWriteStream(file));

    const directory = await unzipper.Open.file(file);
    const manifestEntry = directory.files.find((f) => f.path === 'assets/asset-manifest.json');
    const manifest = JSON.parse((await manifestEntry!.buffer()).toString()) as Record<string, { name?: unknown; description?: unknown }>;
    expect(manifest[crypt.id]).toMatchObject({ name: 'The Undercroft', description: 'Lower level, flooded in the second act' });
    expect(manifest[goblin.id]).toMatchObject({ name: 'Goblin Boss', description: null });

    const result = await importCampaign(file, userId);

    expect(result).toMatchObject({ skipped: [], warnings: [] });
    expect(await imported(result.campaignId)).toEqual({
      'IMG_2041.png': ['The Undercroft', 'Lower level, flooded in the second act'],
      'goblin-final-v3.png': ['Goblin Boss', null],
    });
  });
});

/** An archive holding one picture for each entry of `entries`, each with the asset manifest fields given. */
async function archiveOf(entries: Array<[file: string, fields: Record<string, unknown>]>): Promise<string> {
  const file = path.join(SCRATCH, `${randomUUID()}.cozyvtt`);
  const ids = entries.map(() => randomUUID());
  await writeZip(file, [
    {
      name: 'manifest.json',
      data: JSON.stringify({
        formatVersion: 1, exportedAt: '2026-11-01T12:00:00.000Z', exportedFrom: 'CozyVTT v1.5.4', campaignName: 'Hand-made',
        gameSystem: 'DND_5E', mapCount: 0, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0,
        assetCount: entries.length, includesAudio: false, totalSizeBytes: PNG.length * entries.length,
      }),
    },
    { name: 'campaign.json', data: JSON.stringify({ name: 'Hand-made', gameSystem: 'DND_5E' }) },
    {
      name: 'assets/asset-manifest.json',
      data: JSON.stringify(Object.fromEntries(entries.map(([name, fields], i) => [
        ids[i], { originalName: `${name}.png`, mimeType: 'image/png', type: 'TOKEN', fileSize: PNG.length, ...fields },
      ]))),
    },
    ...ids.map((id) => ({ name: `assets/${id}.png`, data: PNG, store: true })),
  ]);
  return file;
}

describe('an archive made by hand', () => {
  it('names an asset after its file, with no description, when its entry has neither, as archives made before they were carried', async () => {
    const result = await importCampaign(await archiveOf([['older', {}]]), userId);

    expect(result).toMatchObject({ skipped: [], warnings: [] });
    expect(await imported(result.campaignId)).toEqual({ 'older.png': ['older', null] });
  });

  it('trims the name and description, and takes one left empty as none', async () => {
    const result = await importCampaign(
      await archiveOf([['spaced', { name: '  Goblin Boss  ', description: '  Leader of the cave  ' }], ['blank', { name: '   ', description: '   ' }]]),
      userId
    );

    expect(result).toMatchObject({ skipped: [], warnings: [] });
    expect(await imported(result.campaignId)).toEqual({ 'spaced.png': ['Goblin Boss', 'Leader of the cave'], 'blank.png': ['blank', null] });
  });

  it('takes a name or description that is not text as none', async () => {
    const result = await importCampaign(await archiveOf([['odd', { name: 7, description: { text: 'no' } }]]), userId);

    expect(result.skipped).toEqual([]);
    expect(await imported(result.campaignId)).toEqual({ 'odd.png': ['odd', null] });
  });

  it('shortens a name over 200 characters and a description over 1,000 to fit, and says so', async () => {
    const name = 'n'.repeat(ASSET_LIMITS.maxNameLength);
    const description = 'd'.repeat(ASSET_LIMITS.maxDescriptionLength);
    const result = await importCampaign(await archiveOf([['long', { name: `${name}more`, description: `${description}more` }]]), userId);

    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([
      'Asset "long.png": shortened its name to 200 characters.',
      'Asset "long.png": shortened its description to 1,000 characters.',
    ]);
    expect(await imported(result.campaignId)).toEqual({ 'long.png': [name, description] });
  });

  it('imports a name or description holding U+0000, which the database cannot store, without it, as all archive text', async () => {
    const result = await importCampaign(await archiveOf([['nul', { name: 'Gob\u0000lin', description: 'Sleeps\u0000' }]]), userId);

    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([
      'assets/asset-manifest.json: removed 2 null characters (U+0000) from its text, which the app cannot store.',
    ]);
    expect(await imported(result.campaignId)).toEqual({ 'nul.png': ['Goblin', 'Sleeps'] });
  });
});

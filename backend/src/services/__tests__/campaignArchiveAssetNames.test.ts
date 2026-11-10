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
import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport, assetEntryName } from '../campaignExporter';
import { MAX_ARCHIVE_NAME_BYTES } from '../../utils/archive';
import { storedFilePath } from '../../utils/storedPath';
import { MAX_EXTENSION_LENGTH, MAX_ORIGINAL_NAME_LENGTH } from '../../validators/assets';
import { ASSET_LIMITS } from '../../validators/assetLimits';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip, readZip } from '../../__tests__/helpers/zipFixtures';

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

    const manifestEntry = (await readZip(file)).find((f) => f.path === 'assets/asset-manifest.json');
    const manifest = JSON.parse(manifestEntry!.data.toString()) as Record<string, { name?: unknown; description?: unknown }>;
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

describe("a picture of someone's own library the campaign uses", () => {
  // The DM may read it, but an archive goes off the server: only the
  // campaign's own assets carry what their uploader wrote about them.
  it('goes into the archive as its file, with no name, description or tags', async () => {
    const source = await createTestCampaign(userId, { name: 'Borrowing' });
    const player = await createTestUser({ displayName: 'Archive Names Player' });
    try {
      await prisma.campaignMembership.createMany({
        data: [
          { userId, campaignId: source.id, role: 'DM', characterIds: [] },
          { userId: player.id, campaignId: source.id, role: 'PLAYER', characterIds: [] },
        ],
      });
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const filePath = path.join(UPLOAD_DIR, `${randomUUID()}.png`);
      fs.writeFileSync(filePath, PNG);
      const own = await prisma.asset.create({
        data: {
          type: 'TOKEN', scope: 'USER', campaignId: null, uploadedById: player.id, filename: path.basename(filePath),
          originalName: 'my-elf.png', mimeType: 'image/png', fileSize: PNG.length, filePath,
          name: 'Elowen, before the curse', description: 'Do not show the DM', tags: ['secret-plot'],
        },
      });
      const kept = await picture(source.id, 'TOKEN', 'goblin', 'Goblin', 'A goblin');
      await prisma.tokenTemplate.create({ data: { campaignId: source.id, name: 'Elowen', imageUrl: `/api/assets/tokens/${own.id}` } });
      await prisma.tokenTemplate.create({ data: { campaignId: source.id, name: 'Goblin', imageUrl: `/api/assets/tokens/${kept.id}` } });

      const file = path.join(SCRATCH, 'borrowing.cozyvtt');
      const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
      await prepared.writeTo(fs.createWriteStream(file));
      const manifestEntry = (await readZip(file)).find((f) => f.path === 'assets/asset-manifest.json');
      const manifest = JSON.parse(manifestEntry!.data.toString()) as Record<string, Record<string, unknown>>;

      expect(manifest[own.id]).toEqual({ originalName: 'my-elf.png', mimeType: 'image/png', type: 'TOKEN', fileSize: PNG.length });
      expect(manifest[kept.id]).toMatchObject({ name: 'Goblin', description: 'A goblin' });
    } finally {
      await prisma.asset.deleteMany({ where: { uploadedById: player.id } });
      await cleanupUsers([player.id]);
    }
  });
});

describe("a picture of the exporting DM's own library the campaign uses", () => {
  it('goes with its name, description and tags', async () => {
    const source = await createTestCampaign(userId, { name: 'Own art' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, `${randomUUID()}.png`);
    fs.writeFileSync(filePath, PNG);
    const mine = await prisma.asset.create({
      data: {
        type: 'TOKEN', scope: 'USER', campaignId: null, uploadedById: userId, filename: path.basename(filePath),
        originalName: 'IMG_7.png', mimeType: 'image/png', fileSize: PNG.length, filePath,
        name: 'The Lich', description: 'Final form', tags: ['boss'],
      },
    });
    await prisma.tokenTemplate.create({ data: { campaignId: source.id, name: 'Lich', imageUrl: `/api/assets/tokens/${mine.id}` } });

    const file = path.join(SCRATCH, 'own-art.cozyvtt');
    const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
    await prepared.writeTo(fs.createWriteStream(file));
    const manifestEntry = (await readZip(file)).find((f) => f.path === 'assets/asset-manifest.json');
    const manifest = JSON.parse(manifestEntry!.data.toString()) as Record<string, Record<string, unknown>>;

    expect(manifest[mine.id]).toMatchObject({ name: 'The Lich', description: 'Final form', tags: ['boss'] });
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

// An import refuses an entry name longer than MAX_ARCHIVE_NAME_BYTES, and an
// asset's entry ends in its original name's extension.
describe('the name an asset has in the archive', () => {
  it('is never longer than an import takes, whatever its original name', () => {
    const id = randomUUID();
    // The longest extension kept, in letters of three bytes each.
    const longest = assetEntryName(id, `x.${'地'.repeat(MAX_EXTENSION_LENGTH - 1)}`, 'image/png');
    expect(longest).toBe(`assets/${id}.${'地'.repeat(MAX_EXTENSION_LENGTH - 1)}`);
    expect(Buffer.byteLength(longest)).toBeLessThanOrEqual(MAX_ARCHIVE_NAME_BYTES / 4);
    expect(assetEntryName(id, `x.${'地'.repeat(MAX_EXTENSION_LENGTH)}`, 'image/png')).toBe(`assets/${id}.png`);
    expect(assetEntryName(id, 'x', 'image/webp')).toBe(`assets/${id}.webp`);
  });

  it('takes the format for its extension when the original name ends in a long one, and imports', async () => {
    const source = await createTestCampaign(userId, { name: 'Long Names' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
    // Older versions stored an upload's own name at any length; this is the
    // longest an archive's list of assets takes, all after one dot.
    const longName = `map.${'地'.repeat(496)}`;
    const map = await picture(source.id, 'MAP', 'placeholder', 'Long', null);
    await prisma.asset.update({ where: { id: map.id }, data: { originalName: longName } });
    await prisma.map.create({
      data: {
        campaignId: source.id, name: 'Long', imageUrl: `/api/assets/maps/${map.id}`, baseLayerUrl: `/api/assets/maps/${map.id}`,
        width: 10, height: 10, gridSize: 70, tokens: [], annotations: [], wallSegments: [], lights: [],
      },
    });

    const file = path.join(SCRATCH, 'long-names.cozyvtt');
    const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
    await prepared.writeTo(fs.createWriteStream(file));
    const names = (await readZip(file)).map((f) => f.path);

    expect(names).toContain(`assets/${map.id}.png`);
    for (const name of names) expect(Buffer.byteLength(name)).toBeLessThanOrEqual(MAX_ARCHIVE_NAME_BYTES);
    const result = await importCampaign(file, userId);
    expect(result).toMatchObject({ skipped: [] });
    // An extension a map picture cannot have gives way to its format's.
    expect(Object.keys(await imported(result.campaignId))).toEqual(['map.png']);
  });

  it('goes into the list of assets shortened when the original name is over what an import takes, and imports with its picture', async () => {
    const source = await createTestCampaign(userId, { name: 'Very Long Name' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
    // Older versions stored an upload's own name at any length.
    const longName = `${'b'.repeat(596)}.png`;
    const shortened = `${'b'.repeat(MAX_ORIGINAL_NAME_LENGTH - 4)}.png`;
    const map = await picture(source.id, 'MAP', 'placeholder', 'Sunken Hall', null);
    await prisma.asset.update({ where: { id: map.id }, data: { originalName: longName } });
    await prisma.map.create({
      data: {
        campaignId: source.id, name: 'Sunken Hall', imageUrl: `/api/assets/maps/${map.id}`, baseLayerUrl: `/api/assets/maps/${map.id}`,
        width: 10, height: 10, gridSize: 70, tokens: [], annotations: [], wallSegments: [], lights: [],
      },
    });

    const file = path.join(SCRATCH, 'very-long-name.cozyvtt');
    const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
    await prepared.writeTo(fs.createWriteStream(file));
    const manifestEntry = (await readZip(file)).find((f) => f.path === 'assets/asset-manifest.json');
    const manifest = JSON.parse(manifestEntry!.data.toString()) as Record<string, Record<string, unknown>>;
    expect(manifest[map.id]).toMatchObject({ originalName: shortened, name: 'Sunken Hall' });

    const result = await importCampaign(file, userId);
    expect(result).toMatchObject({ skipped: [], warnings: [] });
    expect(await imported(result.campaignId)).toEqual({ [shortened]: ['Sunken Hall', null] });
    const [asset] = await prisma.asset.findMany({ where: { campaignId: result.campaignId } });
    expect(fs.readFileSync(storedFilePath(asset.filePath))).toEqual(PNG);
    const [importedMap] = await prisma.map.findMany({ where: { campaignId: result.campaignId } });
    expect(importedMap.imageUrl).toBe(`/api/assets/maps/${asset.id}`);
  });
});

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

/**
 * A campaign archive keeps each picture's tags, and an import holds them to
 * what an upload may set.
 *
 * The Asset Library finds a picture by its tags, and a Universal VTT import
 * tags its map picture `uvtt-import`. An archive's list of pictures gave
 * each one's file name, format, kind and size and no tags, so every picture
 * of an imported campaign had none.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-tags-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport } from '../campaignExporter';
import { ASSET_LIMITS, DRAWN_MAP_TAG } from '../../validators/assetLimits';
import { IMPORT_LIMITS } from '../../validators/campaignImport';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip, readZip } from '../../__tests__/helpers/zipFixtures';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Archive Tags' })).id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

async function picture(campaignId: string, type: 'MAP' | 'TOKEN', name: string, tags: string[]) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = path.join(UPLOAD_DIR, `${randomUUID()}.png`);
  fs.writeFileSync(file, PNG);
  return prisma.asset.create({
    data: {
      type, scope: 'CAMPAIGN', campaignId, uploadedById: userId, filename: path.basename(file),
      originalName: `${name}.png`, mimeType: 'image/png', fileSize: PNG.length, filePath: file, name, tags,
    },
  });
}

async function importedTags(campaignId: string): Promise<Record<string, string[]>> {
  const assets = await prisma.asset.findMany({ where: { campaignId } });
  return Object.fromEntries(assets.map((a) => [a.originalName, a.tags]));
}

describe('a campaign exported and imported again', () => {
  it('keeps the tags of its map and token pictures', async () => {
    const source = await createTestCampaign(userId, { name: 'Tagged' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
    const crypt = await picture(source.id, 'MAP', 'crypt', ['drawn-map', 'Undercroft']);
    const goblin = await picture(source.id, 'TOKEN', 'goblin', ['goblin', 'monster']);
    await prisma.map.create({
      data: {
        campaignId: source.id, name: 'Crypt', imageUrl: `/api/assets/maps/${crypt.id}`, baseLayerUrl: `/api/assets/maps/${crypt.id}`,
        width: 10, height: 10, gridSize: 70, tokens: [], annotations: [], wallSegments: [], lights: [],
      },
    });
    await prisma.tokenTemplate.create({ data: { campaignId: source.id, name: 'Goblin', imageUrl: `/api/assets/tokens/${goblin.id}` } });

    const file = path.join(SCRATCH, 'tagged.cozyvtt');
    const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
    await prepared.writeTo(fs.createWriteStream(file));

    const manifestEntry = (await readZip(file)).find((f) => f.path === 'assets/asset-manifest.json');
    const manifest = JSON.parse(manifestEntry!.data.toString()) as Record<string, { tags?: unknown }>;
    expect(manifest[crypt.id].tags).toEqual(['drawn-map', 'Undercroft']);
    expect(manifest[goblin.id].tags).toEqual(['goblin', 'monster']);

    const result = await importCampaign(file, userId);

    expect(result).toMatchObject({ skipped: [], warnings: [] });
    expect(await importedTags(result.campaignId)).toEqual({ 'crypt.png': ['drawn-map', 'Undercroft'], 'goblin.png': ['goblin', 'monster'] });
  });
});

/** An archive holding one picture for each entry of `entries`, each with the asset manifest fields given. */
async function archiveOf(entries: Array<[name: string, fields: Record<string, unknown>]>): Promise<string> {
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
  it('imports pictures with no tags field, as archives from before tags were carried have, with none', async () => {
    const result = await importCampaign(await archiveOf([['older', {}]]), userId);

    expect(result.skipped).toEqual([]);
    expect(await importedTags(result.campaignId)).toEqual({ 'older.png': [] });
  });

  it('tidies tags as an upload does: trimmed, split at commas, empty ones dropped, each kept once', async () => {
    const result = await importCampaign(await archiveOf([['untidy', { tags: ['  crypt ', '', '   ', 'crypt', 'drawn-map,undead', 'Crypt'] }]]), userId);

    expect(await importedTags(result.campaignId)).toEqual({ 'untidy.png': ['crypt', 'drawn-map', 'undead', 'Crypt'] });
  });

  // The tag Paint takes as proof a picture is its own to write over:
  // only the server's own upload of a drawn picture may carry it.
  it(`leaves out ${DRAWN_MAP_TAG}, in any case, and keeps the rest`, async () => {
    const result = await importCampaign(
      await archiveOf([['crypt', { type: 'MAP', tags: [DRAWN_MAP_TAG, DRAWN_MAP_TAG.toUpperCase(), `${DRAWN_MAP_TAG},Undercroft`, 'drawn-map'] }]]),
      userId
    );

    expect(await importedTags(result.campaignId)).toEqual({ 'crypt.png': ['Undercroft', 'drawn-map'] });
  });

  it('leaves out a tag that is too long or is not text, and keeps the rest', async () => {
    const longest = 'x'.repeat(ASSET_LIMITS.maxTagLength);
    const result = await importCampaign(
      await archiveOf([['mixed', { tags: [longest, `${longest}y`, 7, null, { tag: 'object' }, 'kept'] }]]),
      userId
    );

    expect(result.skipped).toEqual([]);
    expect(await importedTags(result.campaignId)).toEqual({ 'mixed.png': [longest, 'kept'] });
  });

  it('keeps a tag without a character the database cannot store, and leaves out one left empty', async () => {
    const result = await importCampaign(await archiveOf([['nul', { tags: ['good', 'bad\u0000tag', '\u0000'] }]]), userId);

    expect(result.skipped).toEqual([]);
    expect(await importedTags(result.campaignId)).toEqual({ 'nul.png': ['good', 'badtag'] });
  });

  it('keeps the first 50 tags, in order, of a picture with more, as one tagged before the limit may have', async () => {
    const most = Array.from({ length: ASSET_LIMITS.maxTags }, (_, i) => `tag ${i}`);
    const result = await importCampaign(
      await archiveOf([['most', { tags: most }], ['too-many', { tags: [...most, 'one more'] }]]),
      userId
    );

    expect(await importedTags(result.campaignId)).toEqual({ 'most.png': most, 'too-many.png': most });
  });

  it('imports a picture whose tags are not a list, or a list of more than 1,000 entries, with none', async () => {
    const result = await importCampaign(
      await archiveOf([
        ['text', { tags: 'crypt, undead' }],
        ['nothing', { tags: null }],
        ['longest', { tags: Array.from({ length: IMPORT_LIMITS.MAX_ASSET_TAG_ENTRIES }, () => 'crypt') }],
        ['too-long', { tags: Array.from({ length: IMPORT_LIMITS.MAX_ASSET_TAG_ENTRIES + 1 }, () => 'crypt') }],
      ]),
      userId
    );

    expect(result.skipped).toEqual([]);
    expect(await importedTags(result.campaignId)).toEqual({ 'text.png': [], 'nothing.png': [], 'longest.png': ['crypt'], 'too-long.png': [] });
  });
});

/**
 * A campaign import either brings in the whole campaign or leaves nothing.
 *
 * The importer created the campaign first and then its pictures, maps,
 * creatures and templates one at a time, and undid none of it when a later
 * step failed, so a refused archive left a half-built campaign in the
 * importer's list and its files on disk. The pictures are now unpacked into a
 * staging folder, every row is written in one transaction, and the files are
 * moved into place only once that has committed.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-atomic-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

// The real file-type is ESM-only; this knows a PNG.
jest.mock('file-type', () => {
  const sniff = (head: Buffer) =>
    head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? { ext: 'png', mime: 'image/png' } : undefined;
  return {
    fileTypeFromBuffer: async (buf: Buffer) => sniff(buf),
    fileTypeFromFile: async (file: string) => {
      const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
      return sniff(readFileSync(file).subarray(0, 16));
    },
  };
});

import { importCampaign } from '../campaignImporter';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip, type FixtureEntry } from '../../__tests__/helpers/zipFixtures';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const PICTURE_ID = '44444444-4444-4444-8444-444444444444';

const map = (name: string) => ({
  name, imageAssetRef: PICTURE_ID, width: 10, height: 10, gridSize: 50, feetPerSquare: 5,
  tokens: [{ name: 'Goblin', imageUrl: PICTURE_ID, position: { x: 1, y: 1 }, size: { width: 1, height: 1 } }],
});

/** An archive of one picture and these maps, written to disk as the import route saves one. */
async function archive(maps: object[]): Promise<string> {
  const file = path.join(SCRATCH, `${Date.now()}-${Math.random()}.cozyvtt`);
  const entries: FixtureEntry[] = [
    {
      name: 'manifest.json',
      data: JSON.stringify({
        formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT test', campaignName: 'Atomic',
        gameSystem: 'DND_5E', mapCount: maps.length, tokenCount: maps.length, creatureCount: 0, tokenTemplateCount: 0,
        assetCount: 1, includesAudio: false, totalSizeBytes: PNG.length,
      }),
    },
    { name: 'campaign.json', data: JSON.stringify({ name: 'Atomic', gameSystem: 'DND_5E' }) },
    {
      name: 'assets/asset-manifest.json',
      data: JSON.stringify({ [PICTURE_ID]: { originalName: 'cave.png', mimeType: 'image/png', type: 'MAP', fileSize: PNG.length } }),
    },
    { name: `assets/${PICTURE_ID}.png`, data: PNG },
    ...maps.map((m, i) => ({ name: `maps/map-${i}.json`, data: JSON.stringify(m) })),
  ];
  await writeZip(file, entries);
  return file;
}

/** Every file left under the uploads folder. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(dir, f)).isFile());
}

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Import Atomic' })).id;
});

afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('a campaign import that fails after its second map', () => {
  // PostgreSQL cannot store a NUL character, so the third map's row is
  // refused by the database itself, after the first two have been written.
  const failing = () => archive([map('Cellar'), map('Hall'), map('Broken\u0000Tower')]);

  it('leaves no campaign, maps or asset rows behind', async () => {
    await expect(importCampaign(await failing(), userId)).rejects.toThrow();

    expect(await prisma.campaign.count({ where: { ownerId: userId } })).toBe(0);
    expect(await prisma.asset.count({ where: { uploadedById: userId } })).toBe(0);
    expect(await prisma.map.count({ where: { name: { in: ['Cellar', 'Hall'] }, campaign: { ownerId: userId } } })).toBe(0);
  });

  it('leaves no files behind', async () => {
    await expect(importCampaign(await failing(), userId)).rejects.toThrow();

    expect(filesUnder(UPLOAD_DIR)).toEqual([]);
  });

  it('says that nothing was imported, without the database error', async () => {
    await expect(importCampaign(await failing(), userId)).rejects.toThrow(
      'The campaign could not be saved, so nothing was imported. The server log has the details.'
    );
  });
});

describe('a campaign import whose pictures cannot be moved into place', () => {
  it('removes the campaign it had saved, and every file', async () => {
    const realRename = fs.promises.rename;
    let renames = 0;
    // The first picture moves; the move after it fails, as a full disk would.
    jest.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(to).includes(`${path.sep}campaigns${path.sep}`) && ++renames > 1) throw new Error('ENOSPC: no space left on device');
      return realRename(from, to);
    });
    const file = path.join(SCRATCH, 'two-pictures.cozyvtt');
    const second = '55555555-5555-4555-8555-555555555555';
    await writeZip(file, [
      {
        name: 'manifest.json',
        data: JSON.stringify({
          formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT test', campaignName: 'Moved',
          gameSystem: 'DND_5E', mapCount: 1, tokenCount: 1, creatureCount: 0, tokenTemplateCount: 0, assetCount: 2,
          includesAudio: false, totalSizeBytes: PNG.length * 2,
        }),
      },
      { name: 'campaign.json', data: JSON.stringify({ name: 'Moved' }) },
      {
        name: 'assets/asset-manifest.json',
        data: JSON.stringify({
          [PICTURE_ID]: { originalName: 'cave.png', mimeType: 'image/png', type: 'MAP', fileSize: PNG.length },
          [second]: { originalName: 'goblin.png', mimeType: 'image/png', type: 'TOKEN', fileSize: PNG.length },
        }),
      },
      { name: `assets/${PICTURE_ID}.png`, data: PNG },
      { name: `assets/${second}.png`, data: PNG },
      { name: 'maps/map-0.json', data: JSON.stringify(map('Cellar')) },
    ]);

    await expect(importCampaign(file, userId)).rejects.toThrow(/nothing was imported/);

    expect(await prisma.campaign.count({ where: { ownerId: userId } })).toBe(0);
    expect(await prisma.asset.count({ where: { uploadedById: userId } })).toBe(0);
    expect(filesUnder(UPLOAD_DIR)).toEqual([]);
  });
});

describe('a campaign import that succeeds', () => {
  it('puts each picture where the upload system keeps a campaign file, and leaves no staging files', async () => {
    const result = await importCampaign(await archive([map('Cellar'), map('Hall')]), userId);

    const assets = await prisma.asset.findMany({ where: { campaignId: result.campaignId } });
    expect(assets).toHaveLength(1);
    expect(assets[0].filePath.replace(/\\/g, '/')).toBe(
      path.join(UPLOAD_DIR, 'maps', 'campaigns', result.campaignId, assets[0].filename).replace(/\\/g, '/')
    );
    expect(fs.readFileSync(path.resolve(assets[0].filePath))).toEqual(PNG);
    expect(filesUnder(UPLOAD_DIR).map((f) => f.replace(/\\/g, '/'))).toEqual([
      `maps/campaigns/${result.campaignId}/${assets[0].filename}`,
    ]);
    const maps = await prisma.map.findMany({ where: { campaignId: result.campaignId }, orderBy: { createdAt: 'asc' } });
    expect(maps.map((m) => m.name)).toEqual(['Cellar', 'Hall']);
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } });
    expect(campaign.currentMapId).toBe(maps[0].id);
  });
});

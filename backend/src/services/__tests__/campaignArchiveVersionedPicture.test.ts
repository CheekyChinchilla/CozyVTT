/**
 * A drawn map's picture, named by its address with a version, survives a
 * campaign archive.
 *
 * A drawn picture is written over in place, and its map names it as
 * `/api/assets/maps/<id>?v=<n>` so every open table asks for the new
 * picture. The archive names the picture by its id, so the version is not
 * kept: the imported map names its own copy of the picture, a new asset no
 * browser has seen, by its plain address.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-versioned-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport } from '../campaignExporter';
import { DRAWN_MAP_TAG } from '../../validators/assetLimits';
import { storedFilePath } from '../../utils/storedPath';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Archive Versioned' })).id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('a campaign whose map names its picture with a version', () => {
  it('is exported with the picture, and imported with the map naming its copy', async () => {
    const source = await createTestCampaign(userId, { name: 'Versioned' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'GM', characterIds: [] } });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const file = path.join(UPLOAD_DIR, `${randomUUID()}.png`);
    fs.writeFileSync(file, PNG);
    const drawn = await prisma.asset.create({
      data: {
        type: 'MAP', scope: 'CAMPAIGN', campaignId: source.id, uploadedById: userId, filename: path.basename(file),
        originalName: 'drawn-map.png', mimeType: 'image/png', fileSize: PNG.length, filePath: file, name: 'Drawn map', tags: [DRAWN_MAP_TAG],
      },
    });
    const address = `/api/assets/maps/${drawn.id}?v=1730000000000`;
    await prisma.map.create({
      data: {
        campaignId: source.id, name: 'Crypt', imageUrl: address, baseLayerUrl: address,
        width: 10, height: 10, gridSize: 70, tokens: [], annotations: [], wallSegments: [], lights: [],
      },
    });

    const archive = path.join(SCRATCH, 'versioned.cozyvtt');
    const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
    await prepared.writeTo(fs.createWriteStream(archive));
    const result = await importCampaign(archive, userId);

    expect(result).toMatchObject({ skipped: [], warnings: [] });
    const [map] = await prisma.map.findMany({ where: { campaignId: result.campaignId } });
    const [copy] = await prisma.asset.findMany({ where: { campaignId: result.campaignId } });
    expect(copy.id).not.toBe(drawn.id);
    expect([map.imageUrl, map.baseLayerUrl]).toEqual([`/api/assets/maps/${copy.id}`, `/api/assets/maps/${copy.id}`]);
    expect(fs.readFileSync(storedFilePath(copy.filePath))).toEqual(PNG);
  });
});

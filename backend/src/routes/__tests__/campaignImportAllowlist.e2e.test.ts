/**
 * Files inside a campaign archive meet the same allowlists as an upload.
 *
 * The upload route accepts only listed formats for each kind of asset, and
 * names the stored file after what its bytes are. The importer used to
 * accept any asset type, compare only the first half of the format ("image",
 * "application"), and keep the archive's own format and file name, so a
 * Windows program declared as a PDF went into the campaign and was offered
 * for download under whatever name the archive chose.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-allowlist-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';
import { picture, oggVorbis, mp3, pdf, windowsProgram } from '../../__tests__/helpers/wholeFiles';

const app = createTestApp();

// A picture's size is read before it is kept, so the PNG is a whole one too.
let png: Buffer;

const BYTES = {
  exe: windowsProgram(),
  pdf: pdf(),
  ogg: oggVorbis(),
  mp3: mp3(false),
  // Built in beforeAll: sharp writes a picture asynchronously.
  tiff: Buffer.alloc(0),
};

interface ArchivedAsset {
  type: string;
  mimeType: string;
  originalName: string;
  bytes: Buffer;
}

let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  png = await picture().png().toBuffer();
  BYTES.tiff = await picture().tiff().toBuffer();
  const user = await createTestUser({ displayName: 'Import Allowlist' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

let counter = 0;

/** Import an archive holding one asset, and return what the campaign stored. */
async function importOne(asset: ArchivedAsset) {
  counter += 1;
  const id = `33333333-3333-4333-8333-${String(counter).padStart(12, '0')}`;
  const file = path.join(SCRATCH, `one-${counter}.cozyvtt`);
  await writeZip(file, [
    {
      name: 'manifest.json',
      data: JSON.stringify({
        formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT test', campaignName: 'Allowlist',
        gameSystem: 'DND_5E', mapCount: 0, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 1,
        includesAudio: true, totalSizeBytes: asset.bytes.length,
      }),
    },
    { name: 'campaign.json', data: '{"name":"Allowlist"}' },
    {
      name: 'assets/asset-manifest.json',
      data: JSON.stringify({ [id]: { originalName: asset.originalName, mimeType: asset.mimeType, type: asset.type, fileSize: asset.bytes.length } }),
    },
    { name: `assets/${id}${path.extname(asset.originalName)}`, data: asset.bytes },
  ]);
  const res = await agent.post('/api/campaigns/import').attach('file', file);
  expect(res.status).toBe(201);
  return prisma.asset.findMany({ where: { campaignId: res.body.campaignId } });
}

describe('an imported asset', () => {
  it('is refused when it is a program declared as a PDF map', async () => {
    expect(await importOne({ type: 'MAP', mimeType: 'application/pdf', originalName: 'Handout.pdf', bytes: BYTES.exe })).toEqual([]);
  });

  it('is refused when it is a picture format the upload route does not take', async () => {
    expect(await importOne({ type: 'TOKEN', mimeType: 'image/png', originalName: 'goblin.png', bytes: BYTES.tiff })).toEqual([]);
  });

  it.each(['DOCUMENT', 'AVATAR', 'OTHER', 'SPELLBOOK'])('is refused when its type is %s, which an export never writes', async (type) => {
    expect(await importOne({ type, mimeType: 'application/pdf', originalName: 'rules.pdf', bytes: BYTES.pdf })).toEqual([]);
  });

  it('is stored under the format and extension its bytes show, not the ones the archive gives', async () => {
    const [stored] = await importOne({ type: 'MAP', mimeType: 'image/webp', originalName: 'Players Handbook.exe', bytes: png });
    expect(stored.mimeType).toBe('image/png');
    expect(stored.filename).toMatch(/\.png$/);
    expect(stored.filePath).toMatch(/\.png$/);
    expect(stored.originalName).toBe('Players Handbook.png');
  });

  it('keeps an allowed name as it was', async () => {
    const [stored] = await importOne({ type: 'TOKEN', mimeType: 'image/png', originalName: 'Goblin Boss.png', bytes: png });
    expect(stored.originalName).toBe('Goblin Boss.png');
    expect(stored.type).toBe('TOKEN');
  });

  // No client can draw a PDF as a map, so the upload route refuses one, and
  // so does an import.
  it('is refused when it is a PDF map, as an upload would be', async () => {
    expect(await importOne({ type: 'MAP', mimeType: 'application/pdf', originalName: 'dungeon.pdf', bytes: BYTES.pdf })).toEqual([]);
  });

  it.each([
    ['an Ogg track', { type: 'AUDIO', mimeType: 'audio/ogg', originalName: 'rain.ogg', bytes: BYTES.ogg }, 'audio/ogg'],
    ['an MP3', { type: 'AUDIO', mimeType: 'audio/mpeg', originalName: 'tavern.mp3', bytes: BYTES.mp3 }, 'audio/mpeg'],
  ])('is accepted when it is %s, as an upload would be', async (_label, asset, mime) => {
    const [stored] = await importOne(asset);
    expect(stored?.mimeType).toBe(mime);
  });
});

// The archive may give a name of up to 500 characters, and the import stored
// it as it was: a name past the 200 an upload allows, and an original name
// past the 255 a download name can be on most file systems. It is cut as an
// upload's is, keeping the extension.
describe('an imported asset with a very long name', () => {
  it('is stored with its names cut to an upload\'s limits', async () => {
    const long = `${'A very long map name '.repeat(20)}.png`;
    const [stored] = await importOne({ type: 'MAP', mimeType: 'image/png', originalName: long, bytes: png });
    expect(stored.originalName.length).toBeLessThanOrEqual(255);
    expect(stored.originalName).toMatch(/\.png$/);
    expect(stored.name.length).toBeLessThanOrEqual(200);
    expect(stored.name.startsWith('A very long map name')).toBe(true);
  });
});

/**
 * A picture in a campaign archive is held to the limits an upload is.
 *
 * An uploaded map or token picture is refused when it is too large in pixels
 * or, animated, in frames, since every player's browser unpacks every frame.
 * An archive could bring the same picture in, so the import leaves it out
 * and lists it with the reason, as it does a picture of the wrong format.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-picture-limits-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';
import { craftedGif, craftedAnimatedWebp, plainPng } from '../../__tests__/helpers/animatedPictures';

const app = createTestApp();

let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Import Picture Limits' });
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

/** Every file under the uploads folder, as paths relative to it. */
function filesOnDisk(): string[] {
  const root = process.env.UPLOAD_DIR!;
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(path.relative(root, full));
    }
  };
  walk(root);
  return found.sort();
}

let counter = 0;

/** Import an archive holding one picture, and return the answer and what the campaign stored. */
async function importOne(type: 'MAP' | 'TOKEN', originalName: string, mimeType: string, bytes: Buffer) {
  counter += 1;
  const id = `44444444-4444-4444-8444-${String(counter).padStart(12, '0')}`;
  const file = path.join(SCRATCH, `one-${counter}.cozyvtt`);
  await writeZip(file, [
    {
      name: 'manifest.json',
      data: JSON.stringify({
        formatVersion: 1, exportedAt: '2026-10-20T00:00:00.000Z', exportedFrom: 'CozyVTT test', campaignName: 'Picture limits',
        gameSystem: 'DND_5E', mapCount: 0, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 1,
        includesAudio: false, totalSizeBytes: bytes.length,
      }),
    },
    { name: 'campaign.json', data: '{"name":"Picture limits"}' },
    {
      name: 'assets/asset-manifest.json',
      data: JSON.stringify({ [id]: { originalName, mimeType, type, fileSize: bytes.length } }),
    },
    { name: `assets/${id}${path.extname(originalName)}`, data: bytes },
  ]);
  const res = await agent.post('/api/campaigns/import').attach('file', file);
  expect(res.status).toBe(201);
  const stored = await prisma.asset.findMany({ where: { campaignId: res.body.campaignId } });
  return { skipped: res.body.skipped, stored };
}

describe('a picture in a campaign archive over the limits', () => {
  it.each([
    ['a GIF token of 1,001 frames', 'TOKEN', 'spinner.gif', 'image/gif', () => craftedGif({ width: 10, height: 10, frames: 1_001 }),
      'This animation has 1,001 frames. An animated picture can have at most 1,000.'],
    ['a GIF token of over 50 million pixels across its frames', 'TOKEN', 'banner.gif', 'image/gif', () => craftedGif({ width: 5_001, height: 10, frames: 1_000 }),
      'This animation is 50.1 million pixels across its frames. An animated token picture can be at most 50 million.'],
    ['an animated WebP map of over 200 million pixels', 'MAP', 'river.webp', 'image/webp', () => craftedAnimatedWebp({ width: 16_000, height: 125, frames: 101 }),
      'This animation is 202 million pixels across its frames. An animated map can be at most 200 million.'],
    ['a still map 16,385 pixels wide', 'MAP', 'strip.png', 'image/png', () => plainPng(16_385, 1),
      'This picture is 16,385 pixels wide. A picture can be at most 16,384 pixels on each side.'],
  ] as const)('is left out and listed with the reason: %s', async (_label, type, name, mime, make, reason) => {
    const files = filesOnDisk();
    const { skipped, stored } = await importOne(type, name, mime, await make());
    expect(stored).toEqual([]);
    expect(skipped).toEqual([{ kind: 'asset', name, reason }]);
    expect(filesOnDisk()).toEqual(files);
  });
});

describe('a picture in a campaign archive at the limits', () => {
  it.each([
    ['a GIF token of 1,000 frames and 50 million pixels', 'TOKEN', 'spinner.gif', 'image/gif', () => craftedGif({ width: 5_000, height: 10, frames: 1_000 })],
    ['an animated WebP map of 200 million pixels', 'MAP', 'river.webp', 'image/webp', () => craftedAnimatedWebp({ width: 16_000, height: 125, frames: 100 })],
    ['a still map 16,384 pixels wide', 'MAP', 'strip.png', 'image/png', () => plainPng(16_384, 1)],
  ] as const)('is imported: %s', async (_label, type, name, mime, make) => {
    const { skipped, stored } = await importOne(type, name, mime, await make());
    expect(skipped).toEqual([]);
    expect(stored).toHaveLength(1);
    expect(stored[0].mimeType).toBe(mime);
  });
});

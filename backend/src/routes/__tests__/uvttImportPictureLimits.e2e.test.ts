/**
 * The picture inside a Universal VTT file is held to the picture limits.
 *
 * The UVTT import writes its map picture itself, so it makes the checks an
 * upload gets itself. An uploaded map is refused when it is more than 16,384
 * pixels on a side or, animated, more than 200 million pixels across its
 * frames, since every player's browser unpacks every frame; so is the
 * picture in a UVTT, before anything is saved.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-uvtt-picture-limits-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import { craftedAnimatedWebp, plainPng } from '../../__tests__/helpers/animatedPictures';

const app = createTestApp();

/** A map file of 10 by 10 squares whose picture is whatever bytes you give it. */
function uvttWithImage(image: Buffer): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
      line_of_sight: [],
      portals: [],
      lights: [],
      image: image.toString('base64'),
    })
  );
}

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

const importUvtt = (file: Buffer, name: string) =>
  dm.post(`/api/campaigns/${campaignId}/maps/import-uvtt`).attach('file', file, `${name}.uvtt`).field('name', name);

/** Every file under the uploads folder, as paths relative to it. */
function filesOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(path.relative(UPLOAD_DIR, full));
    }
  };
  walk(UPLOAD_DIR);
  return found.sort();
}

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `uvtt-limits-${stamp}@test.cozyvtt.local`, displayName: 'UVTT Limits DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `UVTT limits ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
});

describe('a UVTT whose picture is over the limits', () => {
  it.each([
    ['an animated WebP of over 200 million pixels', () => craftedAnimatedWebp({ width: 16_000, height: 125, frames: 101 }),
      'This animation is 202 million pixels across its frames. An animated map can be at most 200 million.'],
    ['an animated WebP of 1,001 frames', () => craftedAnimatedWebp({ width: 4, height: 4, frames: 1_001 }),
      'This animation has 1,001 frames. An animated picture can have at most 1,000.'],
    ['a still PNG 16,385 pixels wide', () => plainPng(16_385, 1),
      'This picture is 16,385 pixels wide. A picture can be at most 16,384 pixels on each side.'],
  ])('is refused, and nothing is saved: %s', async (_label, make, problem) => {
    const files = filesOnDisk();
    const res = await importUvtt(uvttWithImage(await make()), 'too-large');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: `The picture inside this file cannot be used as a map. ${problem}` });
    expect(await prisma.map.count({ where: { campaignId } })).toBe(0);
    expect(await prisma.asset.count({ where: { uploadedById: dmId } })).toBe(0);
    expect(filesOnDisk()).toEqual(files);
  });
});

describe('a UVTT whose picture is at the limits', () => {
  it.each([
    ['an animated WebP of 200 million pixels', () => craftedAnimatedWebp({ width: 16_000, height: 125, frames: 100 }), 'image/webp'],
    ['a still PNG 16,384 pixels wide', () => plainPng(16_384, 1), 'image/png'],
  ])('is imported: %s', async (_label, make, mime) => {
    const res = await importUvtt(uvttWithImage(await make()), 'at-limit');
    expect(res.status).toBe(201);
    const asset = await prisma.asset.findFirstOrThrow({ where: { campaignId, tags: { has: 'uvtt-import' } } });
    expect(asset.mimeType).toBe(mime);
  });
});

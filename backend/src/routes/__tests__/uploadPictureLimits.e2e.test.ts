/**
 * An uploaded map, token or avatar picture is held to the picture limits.
 *
 * GIF tokens and animated WebP pictures were accepted with no limit on their
 * size or frames, and every player's browser unpacks every frame, so a file
 * of a few megabytes could take gigabytes there. A picture over the limits is
 * now refused with the reason, and nothing of it is kept.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-upload-picture-limits-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { craftedGif, craftedAnimatedWebp, plainPng } from '../../__tests__/helpers/animatedPictures';

const app = createTestApp();

let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Picture Limits' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

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

const upload = (type: string, bytes: Buffer, filename: string) =>
  agent.post('/api/assets/upload').field('type', type).field('scope', 'USER').attach('file', bytes, { filename });

async function expectRefused(type: string, bytes: Buffer, filename: string, message: string) {
  const files = filesOnDisk();
  const rows = await prisma.asset.count({ where: { uploadedById: userId } });
  const res = await upload(type, bytes, filename);
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Validation Error', message });
  expect(filesOnDisk()).toEqual(files);
  expect(await prisma.asset.count({ where: { uploadedById: userId } })).toBe(rows);
}

describe('an uploaded picture over the limits', () => {
  it('is refused when a GIF token has more than 1,000 frames', async () => {
    await expectRefused('TOKEN', craftedGif({ width: 10, height: 10, frames: 1_001 }), 'spinner.gif',
      'This animation has 1,001 frames. An animated picture can have at most 1,000.');
  });

  it('is refused when a GIF token is more than 50 million pixels across its frames', async () => {
    await expectRefused('TOKEN', craftedGif({ width: 5_001, height: 10, frames: 1_000 }), 'banner.gif',
      'This animation is 50.1 million pixels across its frames. An animated token picture can be at most 50 million.');
  });

  it('is refused when an animated WebP map is more than 200 million pixels across its frames', async () => {
    await expectRefused('MAP', await craftedAnimatedWebp({ width: 16_000, height: 125, frames: 101 }), 'river.webp',
      'This animation is 202 million pixels across its frames. An animated map can be at most 200 million.');
  });

  it('is refused when an animated WebP avatar is more than 50 million pixels across its frames', async () => {
    await expectRefused('AVATAR', await craftedAnimatedWebp({ width: 5_001, height: 10, frames: 1_000 }), 'me.webp',
      'This animation is 50.1 million pixels across its frames. An animated avatar can be at most 50 million.');
  });

  it('is refused when a still map is more than 16,384 pixels wide', async () => {
    await expectRefused('MAP', await plainPng(16_385, 1), 'strip.png',
      'This picture is 16,385 pixels wide. A picture can be at most 16,384 pixels on each side.');
  });

  it('is refused when a GIF\'s screen is wider than 16,384 pixels, however small its frames', async () => {
    await expectRefused('TOKEN', craftedGif({ width: 20_000, height: 10, frames: 2 }), 'wide.gif',
      'This picture is 20,000 pixels wide. A picture can be at most 16,384 pixels on each side.');
  });
});

describe('an uploaded picture at the limits', () => {
  it.each([
    ['a GIF token of 1,000 frames and 50 million pixels', 'TOKEN', () => craftedGif({ width: 5_000, height: 10, frames: 1_000 }), 'spinner.gif'],
    ['an animated WebP map of 200 million pixels', 'MAP', () => craftedAnimatedWebp({ width: 16_000, height: 125, frames: 100 }), 'river.webp'],
    ['an animated WebP avatar of 50 million pixels', 'AVATAR', () => craftedAnimatedWebp({ width: 5_000, height: 10, frames: 1_000 }), 'me.webp'],
    ['a still map 16,384 pixels wide', 'MAP', () => plainPng(16_384, 1), 'strip.png'],
  ])('is accepted: %s', async (_label, type, make, filename) => {
    const res = await upload(type, await make(), filename);
    expect(res.status).toBe(201);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } });
    expect(fs.existsSync(row.filePath)).toBe(true);
  });
});

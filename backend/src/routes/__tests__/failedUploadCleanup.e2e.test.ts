/**
 * An upload whose database row cannot be written leaves nothing on disk.
 *
 * The upload route removed the uploaded file when the insert failed, but not
 * the thumbnail it had already made from it, and creating a document from
 * typed text removed nothing. Each left a file that no row names, which only
 * someone looking through the uploads folder would ever find.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import sharp from 'sharp';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-failed-upload-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

// file-type is ESM-only and stubbed in every suite; these bytes are a PNG.
jest.mock('file-type', () => ({
  fileTypeFromFile: jest.fn(async () => ({ ext: 'png', mime: 'image/png' })),
  fileTypeFromBuffer: jest.fn(async () => ({ ext: 'png', mime: 'image/png' })),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';

const app = createTestApp();
const userIds: string[] = [];

/** A real PNG, made once, which sharp makes a thumbnail of. */
let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 40, g: 90, b: 60 } } }).png().toBuffer();
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

async function signedIn() {
  const user = await createTestUser({ displayName: 'Failed Uploader' });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: userIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

it('makes a thumbnail for a map upload that is saved', async () => {
  const agent = await signedIn();
  const res = await agent.post('/api/assets/upload').field('type', 'MAP').field('scope', 'USER')
    .attach('file', PNG, { filename: 'keep.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  const row = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } });
  // The case below relies on a thumbnail having been made.
  expect(row.thumbnailPath).not.toBeNull();
  expect(fs.existsSync(row.thumbnailPath!)).toBe(true);
});

it('removes the uploaded map and its thumbnail when the row cannot be written', async () => {
  const agent = await signedIn();
  const before = filesOnDisk();
  jest.spyOn(appPrisma.asset, 'create').mockRejectedValueOnce(new Error('database unavailable'));

  const res = await agent.post('/api/assets/upload').field('type', 'MAP').field('scope', 'USER')
    .attach('file', PNG, { filename: 'lost.png', contentType: 'image/png' });
  expect(res.status).toBe(500);
  expect(filesOnDisk()).toEqual(before);
});

it('removes the written document when its row cannot be written', async () => {
  const agent = await signedIn();
  const before = filesOnDisk();
  jest.spyOn(appPrisma.asset, 'create').mockRejectedValueOnce(new Error('database unavailable'));

  const res = await agent.post('/api/assets/documents').send({ name: 'Lost notes', format: 'md', content: '# Gone', scope: 'USER' });
  expect(res.status).toBe(500);
  expect(filesOnDisk()).toEqual(before);
});

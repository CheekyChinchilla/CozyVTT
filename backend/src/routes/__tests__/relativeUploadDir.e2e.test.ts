/**
 * Uploads with UPLOAD_DIR relative, as a self-hosted server has it.
 *
 * A server leaves UPLOAD_DIR unset, so uploads go to `uploads` in its
 * working directory and each asset's stored path is relative to it, such as
 * `uploads/maps/<campaign>/<file>`. Every other test file uploads into an
 * absolute folder of its own, so this one works from a folder of its own,
 * with UPLOAD_DIR set to `uploads`, and takes one picture through upload,
 * serving, a campaign export and deletion.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// Before anything reads the working directory or UPLOAD_DIR.
const STARTED_IN = process.cwd();
const SCRATCH = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-relative-uploads-')));
process.chdir(SCRATCH);
process.env.UPLOAD_DIR = 'uploads';

import request from 'supertest';
import unzipper from 'unzipper';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

/** A real 1x1 PNG: the upload route decodes what it is given. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
let assetId: string;
let stored: { filePath: string; thumbnailPath: string | null };

beforeAll(async () => {
  expect(process.cwd()).toBe(SCRATCH);
  const user = await createTestUser({ displayName: 'Relative Uploads DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Relative uploads' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  try {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId]);
    await prisma.$disconnect();
  } finally {
    process.chdir(STARTED_IN);
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  }
});

it('stores an upload under uploads in the working directory, by a relative path', async () => {
  const res = await dm
    .post('/api/assets/upload')
    .attach('file', PNG, 'room.png')
    .field('type', 'MAP')
    .field('scope', 'CAMPAIGN')
    .field('campaignId', campaignId)
    .field('name', 'room');
  expect(res.status).toBe(201);
  assetId = res.body.asset.id;
  stored = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { filePath: true, thumbnailPath: true } });

  const relative = stored.filePath.replace(/\\/g, '/');
  expect(path.isAbsolute(relative)).toBe(false);
  expect(relative.startsWith('uploads/maps/')).toBe(true);
  expect(fs.readFileSync(path.join(SCRATCH, relative))).toEqual(PNG);
  // Nowhere near the folder the run started in.
  if (STARTED_IN !== SCRATCH) expect(fs.existsSync(path.join(STARTED_IN, relative))).toBe(false);
});

it('serves the picture from its relative path', async () => {
  const res = await dm.get(`/api/assets/maps/${assetId}`).buffer(true);
  expect(res.status).toBe(200);
  expect(Buffer.from(res.body as Buffer)).toEqual(PNG);
});

it('puts the picture in a campaign export', async () => {
  const address = `/api/assets/maps/${assetId}`;
  await prisma.map.create({
    data: { campaignId, name: 'Room', imageUrl: address, baseLayerUrl: address, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  });
  const res = await dm
    .get(`/api/campaigns/${campaignId}/export`)
    .buffer(true)
    .parse((r, done) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => done(null, Buffer.concat(chunks)));
    });
  expect(res.status).toBe(200);
  const archive = await unzipper.Open.buffer(res.body as Buffer);
  const entry = archive.files.find((f) => f.path === `assets/${assetId}.png`);
  expect(entry).toBeDefined();
  expect(await entry?.buffer()).toEqual(PNG);
});

it('removes the picture from the disk when the asset is deleted', async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  const res = await dm.delete(`/api/assets/${assetId}`);
  expect(res.status).toBe(200);
  expect(await prisma.asset.findUnique({ where: { id: assetId } })).toBeNull();
  expect(fs.existsSync(path.join(SCRATCH, stored.filePath))).toBe(false);
  if (stored.thumbnailPath) expect(fs.existsSync(path.join(SCRATCH, stored.thumbnailPath))).toBe(false);
});

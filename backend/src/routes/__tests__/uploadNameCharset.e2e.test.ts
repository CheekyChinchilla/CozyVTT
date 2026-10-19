/**
 * A file's name keeps its accented and other non-ASCII letters.
 *
 * Browsers send a file's name in UTF-8. multer read it as latin1, so an
 * upload named "café.png" was stored as "cafÃ©.png" and shown so in the Asset
 * Library, and a map imported from "Höhle.uvtt" with no name given was called
 * "HÃ¶hle". Every upload route reads the name as UTF-8 now. Names stored
 * before stay as they were; their downloads are read back by downloadNameOf.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-upload-names-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

/** A real 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let userId: string;
let campaignId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Upload Names' });
  userId = user.id;
  campaignId = (await createTestCampaign(userId, { name: 'Upload names' })).id;
  await prisma.campaignMembership.create({ data: { userId, campaignId, role: 'DM', characterIds: [] } });
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

it.each(['café.png', 'Höhle des Drachen 竜.png'])('stores an upload named %s under that name', async (filename) => {
  const res = await agent
    .post('/api/assets/upload')
    .field('type', 'MAP')
    .field('scope', 'USER')
    .attach('file', PNG, { filename, contentType: 'image/png' });
  expect(res.status).toBe(201);
  expect(res.body.asset.originalName).toBe(filename);
  expect((await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } })).originalName).toBe(filename);
});

it('names a map imported with no name given after its file, accents and all', async () => {
  const uvtt = Buffer.from(JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
    line_of_sight: [], portals: [], lights: [],
    image: PNG.toString('base64'),
  }));
  const res = await agent.post(`/api/campaigns/${campaignId}/maps/import-uvtt`).attach('file', uvtt, 'Höhle.uvtt');
  expect(res.status).toBe(201);
  expect((await prisma.map.findFirstOrThrow({ where: { campaignId } })).name).toBe('Höhle');
});

/**
 * A Universal VTT import that fails to save leaves nothing behind.
 *
 * The import writes the map picture and its thumbnail to disk, then the
 * asset row, then the map. When the asset row could not be written, the two
 * files stayed on disk with nothing naming them; when the map could not be
 * written, the asset row (and its files) stayed with no map using it. Each
 * is now removed when the step after it fails, as the upload route removes
 * its own file.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-uvtt-cleanup-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma as appPrisma } from '../../config/database';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

/** A real 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const UVTT = Buffer.from(
  JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
    line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]],
    portals: [],
    lights: [],
    image: PNG.toString('base64'),
  })
);

let dmId: string;
let campaignId: string;
let dm: request.Agent;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'UVTT cleanup DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId)).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

/** Every file under the uploads folder but the importer's temporary ones. */
function storedFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(path.join(UPLOAD_DIR, 'maps'));
  return found;
}

const importUvtt = () =>
  dm.post(`/api/campaigns/${campaignId}/maps/import-uvtt`).field('name', 'Cleanup Map').attach('file', UVTT, 'cleanup.uvtt');

describe('POST /api/campaigns/:campaignId/maps/import-uvtt when saving fails', () => {
  it('removes the picture and thumbnail when the asset row cannot be written', async () => {
    jest.spyOn(appPrisma.asset, 'create').mockRejectedValueOnce(new Error('database unavailable'));

    const res = await importUvtt();

    expect(res.status).toBe(500);
    expect(storedFiles()).toEqual([]);
  });

  it('removes the asset, row and files, when the map cannot be written', async () => {
    jest.spyOn(appPrisma.map, 'create').mockRejectedValueOnce(new Error('database unavailable'));

    const res = await importUvtt();

    expect(res.status).toBe(500);
    expect(await prisma.asset.count({ where: { campaignId } })).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('keeps the picture, thumbnail and asset of an import that works', async () => {
    const res = await importUvtt();

    expect(res.status).toBe(201);
    expect(await prisma.asset.count({ where: { campaignId } })).toBe(1);
    expect(storedFiles()).toHaveLength(2);
  });
});

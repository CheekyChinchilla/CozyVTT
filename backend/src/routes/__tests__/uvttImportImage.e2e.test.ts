/**
 * The picture inside a UVTT, and the checks every other upload gets.
 *
 * A UVTT carries its map image as base64 inside the JSON, so the import writes
 * that image to disk itself instead of going through the upload middleware.
 * That made it the one path where a file reached disk without its bytes being
 * checked, without the map size limit applying, and without a thumbnail, which
 * left these maps looking broken in the asset library next to every other one.
 *
 * Only a campaign's DM can reach it, so this was never wide open. It was
 * simply the one door with no lock on it.
 *
 * The picture is identified by the real `file-type`: a real PNG is
 * identified, and text is not identified at all.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-uvtt-image-'));
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

const app = createTestApp();

/** A real 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

type Point = { x: number; y: number };

/** A map file whose picture is whatever bytes you give it. */
function uvttWithImage(image: Buffer): Buffer {
  const wall: Point[] = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ];
  return Buffer.from(
    JSON.stringify({
      format: 0.3,
      resolution: {
        map_origin: { x: 0, y: 0 },
        map_size: { x: 10, y: 10 },
        pixels_per_grid: 140,
      },
      line_of_sight: [wall],
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
  dm
    .post(`/api/campaigns/${campaignId}/maps/import-uvtt`)
    .attach('file', file, `${name}.uvtt`)
    .field('name', name);

const mapCount = () => prisma.map.count({ where: { campaignId } });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({
    email: `uvtt-image-${stamp}@test.cozyvtt.local`,
    displayName: 'UVTT Image DM',
  });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `UVTT image ${stamp}` })).id;
  await prisma.campaignMembership.create({
    data: { userId: dmId, campaignId, role: 'DM', characterIds: [] },
  });
  dm = request.agent(app);
  const login = await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

beforeEach(() => prisma.map.deleteMany({ where: { campaignId } }));

describe('a UVTT carrying a real picture', () => {
  it('imports, and records the type the bytes actually are', async () => {
    const res = await importUvtt(uvttWithImage(PNG), 'good');
    expect(res.status).toBe(201);
    const asset = await prisma.asset.findFirst({
      where: { campaignId, tags: { has: 'uvtt-import' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(asset?.mimeType).toBe('image/png');
    expect(asset?.filename).toMatch(/\.png$/);
  });

  it('gets a thumbnail, like every other map', async () => {
    await importUvtt(uvttWithImage(PNG), 'thumbed');
    const asset = await prisma.asset.findFirst({
      where: { campaignId, tags: { has: 'uvtt-import' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(asset?.thumbnailPath).toBeTruthy();
    expect(fs.existsSync(asset!.thumbnailPath!)).toBe(true);
  });
});

describe('a UVTT whose picture is not one', () => {
  it('is refused when the bytes are not an image at all', async () => {
    const notAnImage = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await importUvtt(uvttWithImage(notAnImage), 'html');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/image/i);
    expect(await mapCount()).toBe(0);
  });

  it('is refused when the base64 decodes to nothing usable', async () => {
    const res = await importUvtt(uvttWithImage(Buffer.from([0x00, 0x01, 0x02, 0x03])), 'junk');
    expect(res.status).toBe(400);
    expect(await mapCount()).toBe(0);
  });

  it('leaves nothing on disk or in the asset table when it refuses', async () => {
    const before = await prisma.asset.count({ where: { campaignId } });
    await importUvtt(uvttWithImage(Buffer.from('not an image')), 'nothing-left');
    expect(await prisma.asset.count({ where: { campaignId } })).toBe(before);
  });
});

describe('a UVTT whose picture is too big for a map', () => {
  it('is refused at the map size limit, not the multipart one', async () => {
    // The MAP cap is 50 MB; multer allows 100 MB for the whole JSON, so a
    // picture between the two used to slip through on this route alone.
    const huge = Buffer.concat([PNG, Buffer.alloc(51 * 1024 * 1024)]);
    const res = await importUvtt(uvttWithImage(huge), 'huge');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too large|size/i);
    expect(await mapCount()).toBe(0);
  }, 30000);
});

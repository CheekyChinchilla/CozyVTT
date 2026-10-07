/**
 * A Universal VTT upload the server refuses says why, with a 4xx.
 *
 * Refusals that came from the upload itself (a wrong field, a wrong extension,
 * a file over the limit, a malformed body, a field name past the ceilings)
 * used to reach the generic error handler and answer 500 "An unexpected error
 * occurred". The asset upload answers 400 with the reason; so does this.
 *
 * The map size limit is set to 1 MB so that the file size ceiling, which
 * follows it, can be crossed with a small body.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-uvtt-errors-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.MAX_MAP_SIZE_MB = '1';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(async (buffer: Buffer) => {
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { ext: 'png', mime: 'image/png' };
    }
    if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
    return undefined;
  }),
  fileTypeFromFile: jest.fn(async () => undefined),
}));

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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)]);

function uvttWithImage(image: Buffer): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
      line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]],
      portals: [],
      lights: [],
      image: image.toString('base64'),
    })
  );
}

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

const url = () => `/api/campaigns/${campaignId}/maps/import-uvtt`;
const mapCount = () => prisma.map.count({ where: { campaignId } });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `uvtt-errors-${stamp}@test.cozyvtt.local`, displayName: 'UVTT Errors DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `UVTT errors ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
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

describe('a refused UVTT upload answers with a reason', () => {
  it('answers 400 for a file sent under the wrong field name', async () => {
    const res = await dm.post(url()).attach('map', uvttWithImage(PNG), 'a.uvtt');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/file/i);
    expect(await mapCount()).toBe(0);
  });

  it('answers 400 for a file with the wrong extension', async () => {
    const res = await dm.post(url()).attach('file', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/\.uvtt/);
  });

  it('answers 413 for a file over the size limit, and says the limit', async () => {
    const res = await dm.post(url()).attach('file', Buffer.alloc(10 * 1024 * 1024, 0x20), 'big.uvtt');
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/larger than the 9MB.*at most 1MB/);
  });

  it('answers 400 for a body that is not valid multipart', async () => {
    const res = await dm
      .post(url())
      .set('Content-Type', 'multipart/form-data; boundary=xyz')
      .send('--xyz\r\nContent-Disposition: form-data; name="file"; filename="a.uvtt"\r\n\r\nabc');
    expect(res.status).toBe(400);
  });

  it('answers 400 for a field name past the ceilings', async () => {
    const res = await dm.post(url()).field('a[5000]', 'x').field('a[b]', 'y').attach('file', uvttWithImage(PNG), 'a.uvtt');
    expect(res.status).toBe(400);
    expect(await mapCount()).toBe(0);
  });
});

describe('the name field', () => {
  it('answers 400, not 500, when the name is sent twice', async () => {
    const res = await dm.post(url()).field('name', 'one').field('name', 'two').attach('file', uvttWithImage(PNG), 'a.uvtt');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
    expect(await mapCount()).toBe(0);
  });

  it('refuses a name over 200 characters', async () => {
    const res = await dm.post(url()).field('name', 'n'.repeat(201)).attach('file', uvttWithImage(PNG), 'a.uvtt');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/200/);
  });

  it('takes a name of exactly 200 characters', async () => {
    const res = await dm.post(url()).field('name', 'n'.repeat(200)).attach('file', uvttWithImage(PNG), 'a.uvtt');
    expect(res.status).toBe(201);
  });
});

describe('the picture inside', () => {
  it('is refused when it is a PDF', async () => {
    const res = await dm.post(url()).attach('file', uvttWithImage(PDF), 'pdf.uvtt');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/image/i);
    expect(await mapCount()).toBe(0);
  });

  it('is refused over the map limit before it is decoded', async () => {
    const res = await dm.post(url()).attach('file', uvttWithImage(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])), 'big.uvtt');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too large/i);
  });
});

describe('importing one map after another', () => {
  it('is never slowed down: ten in a row all succeed', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await dm.post(url()).field('name', `map ${i}`).attach('file', uvttWithImage(PNG), `m${i}.uvtt`);
      expect(res.status).toBe(201);
    }
  }, 60000);
});

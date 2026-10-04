/**
 * A map's width, height and grid size are whole numbers.
 *
 * They are integer columns, but the routes checked only that they were
 * positive numbers, so 10.5 reached Prisma and answered 500. The UVTT import
 * read its optional grid size with `Number(x) || 70`, which stored a negative
 * one and failed on a fraction after the picture had been saved; it now gives
 * anything unusable the default. The app only ever sends whole numbers, and
 * sends no grid size to the UVTT import at all.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

// `file-type` is ESM-only and cannot be loaded under Jest; stubbed as the other
// import suites stub it. The fixture carries a real PNG.
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(async (buffer: Buffer) =>
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? { ext: 'png', mime: 'image/png' }
      : undefined
  ),
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

/** A 1x1 PNG, enough for the importer to decode and store. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const UVTT = Buffer.from(
  JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
    line_of_sight: [],
    objects_line_of_sight: [],
    portals: [],
    lights: [],
    environment: { baked_lighting: false, ambient_light: '00000000' },
    image: PNG_BASE64,
  })
);

let dmId: string;
let campaignId: string;
let mapId: string;
let imageUrl: string;
let dm: ReturnType<typeof request.agent>;

const importUvtt = (gridSize?: string) => {
  const req = dm.post(`/api/campaigns/${campaignId}/maps/import-uvtt`).attach('file', UVTT, 'size.uvtt');
  if (gridSize !== undefined) req.field('gridSize', gridSize);
  return req;
};

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `mapsize-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Map size ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);

  const imported = await importUvtt();
  expect(imported.status).toBe(201);
  mapId = imported.body.map.id;
  imageUrl = imported.body.map.imageUrl;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

describe('POST /api/campaigns/:campaignId/maps', () => {
  const create = (body: Record<string, unknown>) =>
    dm.post(`/api/campaigns/${campaignId}/maps`).send({ name: 'Sized', imageUrl, width: 20, height: 20, ...body });

  it.each([['width', 10.5], ['height', 7.25], ['width', 3e9]])('refuses %s %s with 400', async (field, value) => {
    const res = await create({ [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('gives a fractional grid size the default, as it does any other unusable one', async () => {
    const res = await create({ gridSize: 52.5 });

    expect(res.status).toBe(201);
    expect(res.body.map.gridSize).toBe(50);
  });
});

describe('PUT /api/campaigns/:campaignId/maps/:id', () => {
  it.each([['width', 10.5], ['height', 0.5], ['gridSize', 52.5]])('refuses %s %s with 400', async (field, value) => {
    const res = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('accepts whole numbers', async () => {
    const res = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send({ width: 12, height: 9, gridSize: 64 });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/campaigns/:campaignId/maps/import-uvtt gridSize', () => {
  it.each(['-70', '52.5', 'big', '0', '3000000000'])(
    'gives %s the default of 70, as the map create route defaults an unusable grid size',
    async (gridSize) => {
      const res = await importUvtt(gridSize);

      expect(res.status).toBe(201);
      expect(res.body.map.gridSize).toBe(70);
    },
  );

  it('uses a whole grid size when one is sent', async () => {
    const res = await importUvtt('100');

    expect(res.status).toBe(201);
    expect(res.body.map.gridSize).toBe(100);
  });
});

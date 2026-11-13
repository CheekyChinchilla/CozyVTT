/**
 * The colour a map drawn in CozyVTT was made in, kept with the map.
 *
 * Mapmaker's eraser paints it. It was read off the picture's top-left pixel,
 * which a room or a stamp in that corner changed. Create Map sends it; the
 * map gives it back to every member, as it does its grid. Anything but a
 * colour written #rrggbb is not kept, as an unusable grid size gets the
 * default.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
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

let gmId: string;
let campaignId: string;
let imageUrl: string;
let gm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `drawn-colour-${stamp}@test.local`, displayName: 'Colour GM' });
  gmId = user.id;
  campaignId = (await createTestCampaign(gmId, { name: `Drawn colour ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: gmId, campaignId, role: 'GM', characterIds: [] } });
  gm = request.agent(app);
  expect((await gm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  const imported = await gm.post(`/api/campaigns/${campaignId}/maps/import-uvtt`).attach('file', UVTT, 'colour.uvtt');
  expect(imported.status).toBe(201);
  imageUrl = imported.body.map.imageUrl;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: gmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId]);
  await prisma.$disconnect();
});

const create = (body: Record<string, unknown>) =>
  gm.post(`/api/campaigns/${campaignId}/maps`).send({ name: 'Drawn', imageUrl, width: 10, height: 10, ...body });

describe('POST /api/campaigns/:campaignId/maps drawnBackground', () => {
  it('keeps the colour the map was made in, and gives it back with the map', async () => {
    const res = await create({ drawnBackground: '#2b3a4c' });

    expect(res.status).toBe(201);
    expect(res.body.map.drawnBackground).toBe('#2b3a4c');
    const read = await gm.get(`/api/campaigns/${campaignId}/maps/${res.body.map.id}`);
    expect(read.body.map.drawnBackground).toBe('#2b3a4c');
  });

  it.each([['red'], ['#12345'], ['#2b3a4c; x'], [12]])('keeps no colour for %p', async (drawnBackground) => {
    const res = await create({ drawnBackground });

    expect(res.status).toBe(201);
    expect(res.body.map.drawnBackground).toBeNull();
  });

  it('keeps no colour for a map made from a picture', async () => {
    const res = await create({});

    expect(res.status).toBe(201);
    expect(res.body.map.drawnBackground).toBeNull();
  });
});

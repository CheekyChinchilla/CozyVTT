/**
 * Importing a UVTT whose picture does not cover its walls.
 *
 * A UVTT holds one map image and the geometry that goes with it. Some exporters
 * crop the image to part of the map and then write out the walls for the whole
 * of it, so the import lands a map with bare areas and walls floating in them.
 * Those walls cannot even block sight: the visibility pass stops at the map's
 * own edges.
 *
 * Rather than quietly producing that, the route asks first. Declining must
 * leave nothing behind, and confirming must import every segment, including the
 * ones outside, since it is the picture that is incomplete, not the walls.
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

type Point = { x: number; y: number };

/** A square of wall one grid square on a side, starting at (ox, oy). */
const square = (ox: number, oy: number): Point[] => [
  { x: ox, y: oy },
  { x: ox + 1, y: oy },
  { x: ox + 1, y: oy + 1 },
  { x: ox, y: oy + 1 },
  { x: ox, y: oy },
];

function uvttFile(lineOfSight: Point[][], objectsLineOfSight: Point[][] = []): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: 0.3,
      resolution: {
        map_origin: { x: 0, y: 0 },
        map_size: { x: 10, y: 10 },
        pixels_per_grid: 140,
      },
      line_of_sight: lineOfSight,
      objects_line_of_sight: objectsLineOfSight,
      portals: [],
      lights: [],
      environment: { baked_lighting: false, ambient_light: '00000000' },
      image: PNG_BASE64,
    })
  );
}

/** Entirely inside the picture. */
const TIDY = uvttFile([square(2, 2)]);
/** One square inside, one well off to the right of the picture. */
const CROPPED = uvttFile([square(2, 2), square(20, 2)]);
/** Tidy walls, plus a table's worth of object walls. */
const WITH_FURNITURE = uvttFile([square(2, 2)], [square(4, 4)]);

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

const importUvtt = (
  file: Buffer,
  name: string,
  opts: { confirm?: boolean; includeObjectWalls?: boolean } = {}
) => {
  const req = dm
    .post(`/api/campaigns/${campaignId}/maps/import-uvtt`)
    .attach('file', file, `${name}.uvtt`)
    .field('name', name);
  if (opts.confirm !== undefined) req.field('confirm', String(opts.confirm));
  if (opts.includeObjectWalls !== undefined) {
    req.field('includeObjectWalls', String(opts.includeObjectWalls));
  }
  return req;
};

const mapCount = () => prisma.map.count({ where: { campaignId } });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({
    email: `uvtt-dm-${stamp}@test.cozyvtt.local`,
    displayName: 'UVTT DM',
  });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `UVTT ${stamp}` })).id;
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
});

beforeEach(() => prisma.map.deleteMany({ where: { campaignId } }));

describe('a UVTT whose picture covers all its walls', () => {
  it('imports without asking', async () => {
    const res = await importUvtt(TIDY, 'tidy');
    expect(res.status).toBe(201);
    expect(res.body.totalSegments).toBe(4);
  });
});

describe('a UVTT with walls outside its picture', () => {
  it('asks first, and creates nothing', async () => {
    const res = await importUvtt(CROPPED, 'cropped');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('UVTT_IMPORT_NEEDS_CONFIRMATION');
    expect(res.body.outOfBounds).toEqual({ walls: 4, doors: 0, lights: 0 });
    expect(await mapCount()).toBe(0);
  });

  it('leaves no asset or file behind when it asks', async () => {
    const before = await prisma.asset.count({ where: { campaignId } });
    await importUvtt(CROPPED, 'cropped');
    expect(await prisma.asset.count({ where: { campaignId } })).toBe(before);
  });

  it('imports on confirmation, keeping the walls outside too', async () => {
    const res = await importUvtt(CROPPED, 'cropped', { confirm: true });
    expect(res.status).toBe(201);
    // Both squares: nothing is discarded, the picture is what is incomplete.
    expect(res.body.totalSegments).toBe(8);
    expect(await mapCount()).toBe(1);
  });

  it('still asks when confirm says anything but true', async () => {
    const res = await importUvtt(CROPPED, 'cropped', { confirm: false });
    expect(res.status).toBe(409);
    expect(await mapCount()).toBe(0);
  });

  it('does not ask about a tidy file even when confirmation is offered', async () => {
    expect((await importUvtt(TIDY, 'tidy', { confirm: true })).status).toBe(201);
  });
});

describe('a UVTT carrying walls for its furniture', () => {
  it('asks first, reporting how many there are', async () => {
    const res = await importUvtt(WITH_FURNITURE, 'furniture');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('UVTT_IMPORT_NEEDS_CONFIRMATION');
    expect(res.body.objectWalls).toBe(4);
    expect(res.body.outOfBounds).toEqual({ walls: 0, doors: 0, lights: 0 });
    expect(await mapCount()).toBe(0);
  });

  it('leaves them out when the DM says no', async () => {
    const res = await importUvtt(WITH_FURNITURE, 'furniture', {
      confirm: true,
      includeObjectWalls: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.totalSegments).toBe(4);
  });

  it('brings them in when the DM says yes', async () => {
    const res = await importUvtt(WITH_FURNITURE, 'furniture', {
      confirm: true,
      includeObjectWalls: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.totalSegments).toBe(8);
  });

  it('does not ask again once they were asked for', async () => {
    // The answer is already in the request, so there is nothing left to decide.
    const res = await importUvtt(WITH_FURNITURE, 'furniture', { includeObjectWalls: true });
    expect(res.status).toBe(201);
    expect(res.body.totalSegments).toBe(8);
  });
});

describe('a UVTT with more walls than a map can hold', () => {
  it('is refused at import, where it can still be acted on', async () => {
    // 5001 segments: one polyline of 5002 points. The map editor caps at 5000,
    // so before this check the file imported and then refused the first edit.
    const long: Point[] = Array.from({ length: 5002 }, (_, i) => ({ x: i % 10, y: 1 }));
    const res = await importUvtt(uvttFile([long]), 'huge', { confirm: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/more than a map can hold/i);
    expect(await mapCount()).toBe(0);
  });
});

describe('whether dynamic lighting comes on', () => {
  it('stays off for a file with walls but no lights', async () => {
    // Walls alone used to switch it on, which left players looking at a black
    // map lit only by their own token until the DM worked out why.
    const res = await importUvtt(TIDY, 'walls-only', { confirm: true });
    expect(res.status).toBe(201);
    expect(res.body.map.lightingEnabled).toBe(false);
  });

  it('comes on when the file brings lights', async () => {
    const lit = Buffer.from(
      JSON.stringify({
        format: 0.3,
        resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
        line_of_sight: [square(2, 2)],
        portals: [],
        lights: [{ position: { x: 5, y: 5 }, range: 4 }],
        image: PNG_BASE64,
      })
    );
    const res = await importUvtt(lit, 'lit', { confirm: true });
    expect(res.status).toBe(201);
    expect(res.body.map.lightingEnabled).toBe(true);
  });
});

describe('who may import', () => {
  it('refuses someone who is not the DM of this campaign', async () => {
    const stranger = await createTestUser({
      email: `uvtt-stranger-${Date.now()}@test.cozyvtt.local`,
      displayName: 'UVTT Stranger',
    });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: stranger.email, password: TEST_PASSWORD });

    const res = await agent
      .post(`/api/campaigns/${campaignId}/maps/import-uvtt`)
      .attach('file', CROPPED, 'cropped.uvtt');
    expect([403, 404]).toContain(res.status);
    expect(await mapCount()).toBe(0);

    await cleanupUsers([stranger.id]);
  });
});

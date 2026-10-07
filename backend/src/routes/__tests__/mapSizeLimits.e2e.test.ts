/**
 * A map's size has limits the server enforces: width and height from 1 to
 * 500 squares, grid size from 10 to 500 pixels, feet per square from 1 to 100.
 * They are what the map dialogs offer.
 *
 * The routes used to accept any whole number up to 2^31-1, and fog of war is
 * one cell per square, so a 50,000 by 50,000 map with fog on allocated a
 * 2.5-billion-entry array and took the whole server down. A map stored larger
 * before the limits existed still loads and still saves edits that leave its
 * size alone; only fog on it is refused, with a message saying why.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';

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

const uvtt = (mapSize: { x: number; y?: number }) =>
  Buffer.from(
    JSON.stringify({
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: mapSize, pixels_per_grid: 140 },
      line_of_sight: [],
      portals: [],
      lights: [],
      image: PNG_BASE64,
    })
  );

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

/** A map made straight in the database, as one stored before the limits would be. */
async function storedMap(data: { width: number; height: number; gridSize?: number; fogEnabled?: boolean }) {
  return prisma.map.create({
    data: {
      campaignId, name: 'Stored', imageUrl: `/api/assets/maps/${randomUUID()}`, baseLayerUrl: '/api/assets/maps/x',
      width: data.width, height: data.height, gridSize: data.gridSize ?? 50,
      // The flag columns default to on, for maps from before they existed.
      tokens: [], annotations: [], fogEnabled: data.fogEnabled ?? false, explorationEnabled: false,
    },
  });
}

const create = (body: Record<string, unknown>) =>
  dm.post(`/api/campaigns/${campaignId}/maps`).send({ name: 'Sized', imageUrl: randomUUID(), width: 20, height: 20, ...body });
const update = (mapId: string, body: Record<string, unknown>) =>
  dm.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send(body);
const importUvtt = (file: Buffer, gridSize?: string) => {
  const req = dm.post(`/api/campaigns/${campaignId}/maps/import-uvtt`).attach('file', file, 'limits.uvtt');
  if (gridSize !== undefined) req.field('gridSize', gridSize);
  return req;
};

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `maplimits-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Map limits ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

describe('POST /maps', () => {
  it.each([['width', 501], ['height', 501], ['width', 50000], ['height', 0]])('refuses %s %s with 400', async (field, value) => {
    const res = await create({ [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1 to 500/);
  });

  it('accepts the largest map the dialogs offer', async () => {
    const res = await create({ width: 500, height: 500, gridSize: 500, feetPerSquare: 100 });

    expect(res.status).toBe(201);
    expect(res.body.map).toMatchObject({ width: 500, height: 500, gridSize: 500, feetPerSquare: 100 });
  });

  it.each([9, 501, 3e9])('gives grid size %s the default, as it does any other unusable one', async (gridSize) => {
    const res = await create({ gridSize });

    expect(res.status).toBe(201);
    expect(res.body.map.gridSize).toBe(50);
  });
});

describe('PUT /maps/:id', () => {
  it.each([['width', 50000], ['height', 501], ['gridSize', 501], ['gridSize', 9], ['feetPerSquare', 101]])(
    'refuses %s %s with 400, and stores nothing',
    async (field, value) => {
      const map = await storedMap({ width: 20, height: 20 });

      const res = await update(map.id, { [field]: value });

      expect(res.status).toBe(400);
      const after = await prisma.map.findUniqueOrThrow({ where: { id: map.id } });
      expect(after).toMatchObject({ width: 20, height: 20, gridSize: 50, feetPerSquare: 5 });
    }
  );

  it('saves an edit to a map stored larger than the limits when its size is sent back unchanged', async () => {
    // Edit Map sends every field, so renaming a map like this sends its size too.
    const map = await storedMap({ width: 1000, height: 800, gridSize: 600 });

    const res = await update(map.id, { name: 'Renamed', width: 1000, height: 800, gridSize: 600 });

    expect(res.status).toBe(200);
    expect(res.body.map).toMatchObject({ name: 'Renamed', width: 1000, height: 800, gridSize: 600 });
  });

  it('refuses to make such a map larger still, or to change its size to anything over the limits', async () => {
    const map = await storedMap({ width: 1000, height: 800 });

    expect((await update(map.id, { width: 1001 })).status).toBe(400);
    expect((await update(map.id, { width: 600 })).status).toBe(400);
    expect((await update(map.id, { width: 500, height: 500 })).status).toBe(200);
  });

  it('refuses to turn fog of war on for a map too large for it, saying why', async () => {
    const map = await storedMap({ width: 1000, height: 1000 });

    const res = await update(map.id, { fogEnabled: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too big for fog of war/);
    expect((await prisma.map.findUniqueOrThrow({ where: { id: map.id } })).fogEnabled).toBe(false);
  });

  it('refuses to turn explored areas on for a map too large for them', async () => {
    const map = await storedMap({ width: 1000, height: 1000 });

    const res = await update(map.id, { explorationEnabled: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too big for fog of war/);
  });

  it('turns fog on when the same request makes the map small enough', async () => {
    const map = await storedMap({ width: 1000, height: 1000 });

    const res = await update(map.id, { width: 400, height: 400, fogEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.map.fogEnabled).toBe(true);
  });

  it('leaves fog that is already on alone when an edit sends it again', async () => {
    const map = await storedMap({ width: 1000, height: 1000, fogEnabled: true });

    const res = await update(map.id, { name: 'Still fogged', fogEnabled: true });

    expect(res.status).toBe(200);
  });
});

describe('fog on a map stored larger than the limits', () => {
  it('answers GET /fog with 409 and a reason, not a grid', async () => {
    const map = await storedMap({ width: 1000, height: 1000, fogEnabled: true });

    const res = await dm.get(`/api/campaigns/${campaignId}/maps/${map.id}/fog`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/too big for fog of war/);
  });

  it('answers a fog operation with 409 and stores nothing', async () => {
    const map = await storedMap({ width: 1000, height: 1000, fogEnabled: true });

    const res = await dm.post(`/api/campaigns/${campaignId}/maps/${map.id}/fog/operation`).send({ op: 'reveal_all' });

    expect(res.status).toBe(409);
    expect((await prisma.map.findUniqueOrThrow({ where: { id: map.id } })).fogData).toBeNull();
  });

  it('still loads the map itself', async () => {
    const map = await storedMap({ width: 1000, height: 1000, fogEnabled: true });

    const res = await dm.get(`/api/campaigns/${campaignId}/maps/${map.id}`);

    expect(res.status).toBe(200);
    expect(res.body.map.width).toBe(1000);
  });
});

describe('POST /maps/import-uvtt', () => {
  it.each([[{ x: 501, y: 10 }], [{ x: 10, y: 600 }]])('refuses a file whose map is %j squares, before saving its picture', async (size) => {
    const assetsBefore = await prisma.asset.count({ where: { campaignId } });

    const res = await importUvtt(uvtt(size));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/500/);
    expect(await prisma.asset.count({ where: { campaignId } })).toBe(assetsBefore);
  });

  it('refuses a file that gives no height for its map, before saving its picture', async () => {
    const assetsBefore = await prisma.asset.count({ where: { campaignId } });

    const res = await importUvtt(uvtt({ x: 10 }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not say how many squares/);
    expect(await prisma.asset.count({ where: { campaignId } })).toBe(assetsBefore);
  });

  it.each(['9', '501'])('gives grid size %s the default of 70', async (gridSize) => {
    const res = await importUvtt(uvtt({ x: 10, y: 10 }), gridSize);

    expect(res.status).toBe(201);
    expect(res.body.map.gridSize).toBe(70);
  });
});

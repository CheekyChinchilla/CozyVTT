/**
 * PUT /api/assets/:id/picture: Paint's Save writes the painting over the
 * map's drawn picture, the same asset under the same id, so every link to it
 * (the map, a shared Document, a note) shows the newest painting.
 *
 * Only a picture Paint made may be written over (a campaign map picture
 * tagged cozyvtt-drawn-map), only by its campaign's GM, and only with what
 * the map upload would take: within MAX_MAP_SIZE_MB, a picture by its bytes,
 * within the picture limits, and of the format it replaces. A refused
 * picture leaves the old one as it was. The new file is renamed over the
 * old, so a reader gets one or the other whole, and the row's size and the
 * thumbnail follow it. The answer names the map address to use next, with a
 * version that changes on every save.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-drawn-replace-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.MAX_MAP_SIZE_MB = '1';

import request from 'supertest';
import sharp from 'sharp';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { pngHeader } from '../../__tests__/helpers/animatedPictures';
import { DRAWN_MAP_TAG } from '../../validators/assetLimits';
import { storedFilePath } from '../../utils/storedPath';

const app = createTestApp();

type Agent = ReturnType<typeof request.agent>;
type Who = 'gm' | 'player' | 'otherGm' | 'stranger' | 'admin';
const ids: Record<Who, string> = { gm: '', player: '', otherGm: '', stranger: '', admin: '' };
const agents = {} as Record<Who, Agent>;
let campaignId = '';
let otherCampaignId = '';

const picture = (colour: string, format: 'png' | 'jpeg' = 'png') => {
  const made = sharp({ create: { width: 40, height: 30, channels: 3, background: colour } });
  return (format === 'png' ? made.png() : made.jpeg()).toBuffer();
};

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

/** A campaign map picture uploaded by the GM, as Draw a map uploads one, or untagged. */
async function upload(tags: string): Promise<string> {
  const res = await agents.gm.post('/api/assets/upload')
    .field('type', 'MAP').field('scope', 'CAMPAIGN').field('campaignId', campaignId).field('name', 'Drawn map').field('tags', tags)
    .attach('file', await picture('#e8dcc4'), 'drawn-map.png');
  expect(res.status).toBe(201);
  return res.body.asset.id;
}

const replace = (who: Who, id: string, bytes: Buffer, name = 'drawn-map.png') =>
  agents[who].put(`/api/assets/${id}/picture`).attach('file', bytes, name);

/** The bytes the server has for an asset's picture and thumbnail, read from disk. */
async function onDisk(id: string) {
  const row = await prisma.asset.findUniqueOrThrow({ where: { id } });
  return {
    row,
    picture: fs.readFileSync(storedFilePath(row.filePath)),
    thumbnail: row.thumbnailPath ? fs.readFileSync(storedFilePath(row.thumbnailPath)) : null,
  };
}

/** Every file under the upload folder, so a test can tell nothing was left behind. */
function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)).sort();
}

beforeAll(async () => {
  const stamp = Date.now();
  for (const who of Object.keys(ids) as Who[]) {
    const user = await createTestUser({ email: `replace-${who.toLowerCase()}-${stamp}@test.invalid`, displayName: `Replace ${who}`, role: who === 'admin' ? 'ADMIN' : 'USER' });
    ids[who] = user.id;
  }
  campaignId = (await createTestCampaign(ids.gm, { name: `Replace ${stamp}` })).id;
  otherCampaignId = (await createTestCampaign(ids.otherGm, { name: `Replace other ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: ids.gm, campaignId, role: 'GM', characterIds: [] },
      { userId: ids.player, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.otherGm, campaignId: otherCampaignId, role: 'GM', characterIds: [] },
    ],
  });
  // One at a time: the server hashes one password per address at once.
  for (const who of Object.keys(ids) as Who[]) agents[who] = await login(`replace-${who.toLowerCase()}-${stamp}@test.invalid`);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { uploadedById: { in: Object.values(ids) } } });
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers(Object.values(ids));
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

/** A map of the campaign naming the picture, the table's map when `current`. */
async function mapNaming(id: string, name: string, current = false) {
  const imageUrl = `/api/assets/maps/${id}`;
  const map = await prisma.map.create({
    data: { campaignId, name, imageUrl, baseLayerUrl: imageUrl, width: 10, height: 10, gridSize: 4, annotations: [], tokens: [] },
  });
  if (current) await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map;
}

describe("the campaign's GM", () => {
  it('writes a new painting over the drawn picture, under the same id, and is told the address to use', async () => {
    const id = await upload(DRAWN_MAP_TAG);
    const before = await onDisk(id);
    const files = filesUnder(UPLOAD_DIR);
    const painted = await picture('#336699');

    const res = await replace('gm', id, painted);

    expect(res.status).toBe(200);
    expect(res.body.asset).toMatchObject({ id, fileSize: painted.length, tags: [DRAWN_MAP_TAG] });
    expect(res.body.asset.filePath).toBeUndefined();
    expect(res.body.imageUrl).toMatch(new RegExp(`^/api/assets/maps/${id}\\?v=\\d+$`));
    const after = await onDisk(id);
    expect(after.picture).toEqual(painted);
    expect(after.row.fileSize).toBe(painted.length);
    expect(after.row.filePath).toBe(before.row.filePath);
    expect(after.thumbnail).not.toBeNull();
    expect(after.thumbnail).not.toEqual(before.thumbnail);
    expect(await sharp(after.thumbnail!).stats().then((s) => s.channels[2].mean)).toBeGreaterThan(140);
    // No upload, temporary file or second thumbnail is left behind.
    expect(filesUnder(UPLOAD_DIR)).toEqual(files);
  });

  it('is told a new version on every save', async () => {
    const id = await upload(DRAWN_MAP_TAG);
    const first = await replace('gm', id, await picture('#112233'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await replace('gm', id, await picture('#445566'));
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.imageUrl).not.toBe(first.body.imageUrl);
  });

  it('gets a thumbnail again for a picture that had none', async () => {
    const id = await upload(DRAWN_MAP_TAG);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id } });
    fs.rmSync(storedFilePath(row.thumbnailPath!));
    await prisma.asset.update({ where: { id }, data: { thumbnailPath: null } });
    expect((await replace('gm', id, await picture('#336699'))).status).toBe(200);
    const after = await onDisk(id);
    expect(after.thumbnail).not.toBeNull();
    expect(path.dirname(after.row.thumbnailPath!)).toBe(path.dirname(after.row.filePath));
  });
});

describe('everyone who reads the picture', () => {
  it('gets the new painting: a player at the table, by the map, and a Document by the old address', async () => {
    const id = await upload(DRAWN_MAP_TAG);
    await mapNaming(id, 'At the table', true);
    const oldPicture = await agents.player.get(`/api/assets/maps/${id}`);
    expect(oldPicture.status).toBe(200);
    const painted = await picture('#336699');

    const res = await replace('gm', id, painted);
    expect(res.status).toBe(200);

    const byMap = await agents.player.get(res.body.imageUrl);
    expect(byMap.status).toBe(200);
    expect(byMap.body).toEqual(painted);
    // A Document embeds the address without a version; the browser asks again with what it holds.
    const byOldAddress = await agents.player.get(`/api/assets/maps/${id}`).set('If-None-Match', oldPicture.headers.etag);
    expect(byOldAddress.status).toBe(200);
    expect(byOldAddress.body).toEqual(painted);
  });

  it('gets it on every map that uses it', async () => {
    const id = await upload(DRAWN_MAP_TAG);
    const one = await mapNaming(id, 'One');
    const two = await mapNaming(id, 'Two');
    const painted = await picture('#336699');
    expect((await replace('gm', id, painted)).status).toBe(200);
    for (const map of [one, two]) {
      expect((await agents.gm.get(map.imageUrl)).body).toEqual(painted);
    }
  });
});

describe('anyone but the GM', () => {
  it.each<[Who, number]>([
    ['player', 403],
    ['admin', 403],
    ['otherGm', 404],
    ['stranger', 404],
  ])('is refused, as %s, and the picture stays as it was', async (who, status) => {
    const id = await upload(DRAWN_MAP_TAG);
    await mapNaming(id, `Seen by ${who}`, true);
    const before = await onDisk(id);
    const files = filesUnder(UPLOAD_DIR);

    const res = await replace(who, id, await picture('#336699'));

    expect(res.status).toBe(status);
    expect(await onDisk(id)).toEqual(before);
    expect(filesUnder(UPLOAD_DIR)).toEqual(files);
  });

  it('is told 404 for an id that names nothing', async () => {
    expect((await replace('gm', '00000000-0000-4000-8000-000000000000', await picture('#336699'))).status).toBe(404);
  });
});

describe('a picture that was not drawn in CozyVTT', () => {
  it.each([
    ['an uploaded picture', async () => upload('drawn-map')],
    ['a drawn picture moved to a personal library', async () => {
      const id = await upload(DRAWN_MAP_TAG);
      await prisma.asset.update({ where: { id }, data: { scope: 'USER', campaignId: null } });
      return id;
    }],
  ])('is refused with 400 and left as it was: %s', async (_what, make) => {
    const id = await make();
    const before = await onDisk(id);
    const res = await replace('gm', id, await picture('#336699'));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Only a picture drawn in CozyVTT can be saved over. Upload a new picture instead.');
    expect(await onDisk(id)).toEqual(before);
  });
});

describe('a painting the map upload would refuse', () => {
  it.each<[string, () => Promise<[Buffer, string]>, string]>([
    ['too large', async () => [Buffer.concat([await picture('#336699'), Buffer.alloc(1024 * 1024)]), 'drawn-map.png'], 'MAP files must be smaller than 1MB'],
    ['not a picture', async () => [Buffer.from('not a picture at all'), 'drawn-map.png'], 'Could not determine file type. File may be corrupted or invalid.'],
    ['too many pixels', async () => [pngHeader(20000, 20), 'drawn-map.png'], ''],
    ['another format', async () => [await picture('#336699', 'jpeg'), 'drawn-map.jpg'], 'The new picture must be a PNG file, as the picture it replaces is.'],
  ])('is refused with 400 when %s, and the old picture is left whole', async (_why, make, message) => {
    const id = await upload(DRAWN_MAP_TAG);
    const before = await onDisk(id);
    const files = filesUnder(UPLOAD_DIR);
    const [bytes, name] = await make();

    const res = await replace('gm', id, bytes, name);

    expect(res.status).toBe(400);
    if (message) expect(res.body.message).toBe(message);
    expect(await onDisk(id)).toEqual(before);
    expect(filesUnder(UPLOAD_DIR)).toEqual(files);
  });

  it('is refused with 400 when no file is sent', async () => {
    const id = await upload(DRAWN_MAP_TAG);
    const res = await agents.gm.put(`/api/assets/${id}/picture`).field('name', 'nothing');
    expect(res.status).toBe(400);
  });
});

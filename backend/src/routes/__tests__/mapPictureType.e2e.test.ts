/**
 * A map's picture and its spirit layer picture are map pictures, and the
 * server hands a picture's bytes to the image library only once it knows
 * they are a picture.
 *
 * The reference check asked only whether the DM could read the asset an
 * address named, never what kind of asset it was, and an address names an
 * asset by its id whatever folder it gives: `/api/assets/maps/<id>` passed
 * for a document as readily as `/api/assets/documents/<id>`, and so did the
 * bare id, which the routes turn into the first. A map could then be given
 * a document, a sound file or an avatar as its picture, and the Universal
 * VTT export handed whatever bytes that was to the image library, which
 * reads far more formats than a map picture can be, SVG among them.
 *
 * A map's picture and spirit layer must now be assets uploaded as map
 * pictures, and the export reads a picture only when its bytes are PNG,
 * JPEG, WebP or GIF. A map stored before with another asset as its picture
 * keeps it, and an edit that sends that picture back unchanged still saves.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-map-picture-type-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import request from 'supertest';
import sharp from 'sharp';
import type { AssetType } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

const NOT_A_MAP_IMAGE = 'The map image must be a map picture from the asset library.';
const NOT_A_MAP_SPIRIT_LAYER = 'The spirit layer image must be a map picture from the asset library.';
const EXPORT_NOT_A_PICTURE =
  "This map's picture is not a PNG, JPEG, WebP or GIF image, so it cannot be exported as a Universal VTT file. " +
  'Choose a map picture for it in Edit Map, then export it again.';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
let png: Buffer;
let gif: Buffer;
let mapPictureId: string;
let otherMapPictureId: string;
const assetIds: string[] = [];

/** An asset of the DM's own, so the read check passes and only its type is in question. */
async function makeAsset(type: AssetType, bytes: Buffer, ext: string): Promise<string> {
  const filename = `${type.toLowerCase()}-${randomUUID()}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, bytes);
  const asset = await prisma.asset.create({
    data: { type, scope: 'USER', uploadedById: dmId, filename, originalName: filename, mimeType: 'application/octet-stream', fileSize: bytes.length, filePath, name: filename },
  });
  assetIds.push(asset.id);
  return asset.id;
}

/** A map as an older release, or a direct write, may have stored it. */
async function storedMap(name: string, imageUrl: string, spiritLayerUrl: string | null = null) {
  return prisma.map.create({
    data: { campaignId, name, imageUrl, baseLayerUrl: imageUrl, spiritLayerUrl, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  });
}

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Picture Type DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Map picture types' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } }).png().toBuffer();
  gif = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } }).gif().toBuffer();
  mapPictureId = await makeAsset('MAP', png, 'png');
  otherMapPictureId = await makeAsset('MAP', png, 'png');
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const at = (p: string) => `/api/campaigns/${campaignId}${p}`;
const createMap = (fields: Record<string, unknown>) =>
  dm.post(at('/maps')).send({ name: 'Cellar', width: 10, height: 10, gridSize: 50, ...fields });

const NOT_MAP_PICTURES: Array<[AssetType, () => Promise<string>]> = [
  ['DOCUMENT', () => makeAsset('DOCUMENT', Buffer.from(SVG), 'txt')],
  ['TOKEN', () => makeAsset('TOKEN', png, 'png')],
  ['AVATAR', () => makeAsset('AVATAR', png, 'png')],
  ['AUDIO', () => makeAsset('AUDIO', Buffer.from('ID3not really a song'), 'mp3')],
  ['OTHER', () => makeAsset('OTHER', png, 'png')],
];

/** Every way a client can name one asset: its bare id, and an address under any asset folder. */
const ADDRESSES: Array<[string, (id: string) => string]> = [
  ['its bare id', (id) => id],
  ['an address under maps', (id) => `/api/assets/maps/${id}`],
  ['an address under its own folder', (id) => `/api/assets/documents/${id}`],
];

describe('a map picture that is not a map picture', () => {
  it.each(NOT_MAP_PICTURES)('is refused on Create Map when it is a %s asset, however it is named', async (_type, make) => {
    const id = await make();
    for (const [, address] of ADDRESSES) {
      const res = await createMap({ imageUrl: address(id) });
      expect(res.body.message).toBe(NOT_A_MAP_IMAGE);
      expect(res.status).toBe(400);
    }
    expect(await prisma.map.count({ where: { campaignId, imageUrl: { contains: id } } })).toBe(0);
  });

  it.each(NOT_MAP_PICTURES)('is refused as the spirit layer on Create Map when it is a %s asset', async (_type, make) => {
    const id = await make();
    const res = await createMap({ imageUrl: mapPictureId, spiritLayerUrl: id });
    expect(res.body.message).toBe(NOT_A_MAP_SPIRIT_LAYER);
    expect(res.status).toBe(400);
  });

  it.each(NOT_MAP_PICTURES)('is refused by Edit Map, as the picture and as the spirit layer, when it is a %s asset', async (_type, make) => {
    const id = await make();
    const map = await storedMap('Edited', `/api/assets/maps/${mapPictureId}`);
    const asImage = await dm.put(at(`/maps/${map.id}`)).send({ imageUrl: id });
    expect(asImage.body.message).toBe(NOT_A_MAP_IMAGE);
    expect(asImage.status).toBe(400);
    const asSpirit = await dm.put(at(`/maps/${map.id}`)).send({ spiritLayerUrl: `/api/assets/maps/${id}` });
    expect(asSpirit.body.message).toBe(NOT_A_MAP_SPIRIT_LAYER);
    expect(asSpirit.status).toBe(400);
    const stored = await prisma.map.findUniqueOrThrow({ where: { id: map.id } });
    expect(stored.imageUrl).toBe(`/api/assets/maps/${mapPictureId}`);
    expect(stored.spiritLayerUrl).toBeNull();
  });
});

describe('a map picture uploaded as one', () => {
  it('is taken by Create Map, as the picture and as the spirit layer', async () => {
    const res = await createMap({ imageUrl: mapPictureId, spiritLayerUrl: otherMapPictureId });
    expect(res.status).toBe(201);
    expect(res.body.map.imageUrl).toBe(`/api/assets/maps/${mapPictureId}`);
    expect(res.body.map.spiritLayerUrl).toBe(`/api/assets/maps/${otherMapPictureId}`);
  });

  it('is taken by Edit Map, and the spirit layer can still be cleared', async () => {
    const map = await storedMap('Swapped', `/api/assets/maps/${mapPictureId}`);
    const res = await dm.put(at(`/maps/${map.id}`)).send({ imageUrl: otherMapPictureId, spiritLayerUrl: mapPictureId });
    expect(res.status).toBe(200);
    expect((await dm.put(at(`/maps/${map.id}`)).send({ spiritLayerUrl: null })).status).toBe(200);
  });
});

describe('a map stored before with another kind of asset as its picture', () => {
  it('keeps it, and an edit that sends it back unchanged still saves', async () => {
    const tokenId = await makeAsset('TOKEN', png, 'png');
    const documentId = await makeAsset('DOCUMENT', Buffer.from('notes'), 'txt');
    const map = await storedMap('Older', `/api/assets/tokens/${tokenId}`, `/api/assets/documents/${documentId}`);

    expect((await dm.get(at(`/maps/${map.id}`))).status).toBe(200);
    const res = await dm.put(at(`/maps/${map.id}`)).send({
      name: 'Older, renamed', imageUrl: `/api/assets/tokens/${tokenId}`, spiritLayerUrl: `/api/assets/documents/${documentId}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.map.imageUrl).toBe(`/api/assets/tokens/${tokenId}`);
    expect(res.body.map.spiritLayerUrl).toBe(`/api/assets/documents/${documentId}`);
  });
});

describe('a Universal VTT export', () => {
  const exportOf = (mapId: string) =>
    dm.get(at(`/maps/${mapId}/export-uvtt`)).buffer(true).parse((r, done) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => done(null, Buffer.concat(chunks)));
    });

  it('refuses a picture whose bytes are SVG, and never embeds them', async () => {
    const documentId = await makeAsset('DOCUMENT', Buffer.from(SVG), 'txt');
    const map = await storedMap('Drawn', `/api/assets/maps/${documentId}`);
    const res = await exportOf(map.id);
    const body = (res.body as Buffer).toString('utf8');
    expect(body).not.toContain(Buffer.from(SVG).toString('base64').slice(0, 40));
    expect(res.status).toBe(422);
    expect(JSON.parse(body).message).toBe(EXPORT_NOT_A_PICTURE);
  });

  it('refuses a picture whose bytes are plain text', async () => {
    const documentId = await makeAsset('DOCUMENT', Buffer.from('Session notes, nothing more.'), 'txt');
    const map = await storedMap('Notes', `/api/assets/documents/${documentId}`);
    const res = await exportOf(map.id);
    expect(res.status).toBe(422);
    expect(JSON.parse((res.body as Buffer).toString('utf8')).message).toBe(EXPORT_NOT_A_PICTURE);
  });

  it.each([
    ['a PNG map picture', () => makeAsset('MAP', png, 'png')],
    ['a GIF token picture an older release stored as a map picture', () => makeAsset('TOKEN', gif, 'gif')],
  ])('embeds %s', async (_label, make) => {
    const id = await make();
    const bytes = fs.readFileSync((await prisma.asset.findUniqueOrThrow({ where: { id } })).filePath);
    const map = await storedMap('Exported', `/api/assets/maps/${id}`);
    const res = await exportOf(map.id);
    expect(res.status).toBe(200);
    const uvtt = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(uvtt.image).toBe(bytes.toString('base64'));
    // 40 pixels across a map 10 squares wide.
    expect(uvtt.resolution.pixels_per_grid).toBe(4);
  });
});

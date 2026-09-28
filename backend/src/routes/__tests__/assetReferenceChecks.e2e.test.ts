/**
 * Pointing at an asset needs the right to read it, on every route that
 * stores a reference.
 *
 * A private asset is readable by members of a campaign that uses it, and the
 * read rule counts a reference as use: a map's image, a token's art, a token
 * or creature template's picture, a character's token. Map creation and the
 * character routes checked the reference before storing it. The map update,
 * the token routes and the two template libraries did not, so a DM who knew
 * a player's private asset id could name it on any of them and then read it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-asset-refs-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;
let privateId: string;
let outsiderId: string | undefined;
let adminId: string | undefined;
let departedId: string | undefined;
let ownId: string;
const assetIds: string[] = [];

async function makeAsset(uploadedById: string, label: string) {
  const filename = `${label}-${randomUUID()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, PNG);
  const asset = await prisma.asset.create({
    data: { type: 'TOKEN', scope: 'USER', uploadedById, filename, originalName: filename, mimeType: 'image/png', fileSize: PNG.length, filePath, name: label },
  });
  assetIds.push(asset.id);
  return asset.id;
}

beforeAll(async () => {
  const dmUser = await createTestUser({ displayName: 'Refs DM' });
  const playerUser = await createTestUser({ displayName: 'Refs Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Asset references' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  privateId = await makeAsset(playerId, 'player-private');
  ownId = await makeAsset(dmId, 'dm-own');
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Refs', imageUrl: `/api/assets/maps/${ownId}`, baseLayerUrl: `/api/assets/maps/${ownId}`,
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.tokenTemplate.deleteMany({ where: { campaignId } });
  await prisma.creatureTemplate.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, ...[outsiderId, adminId, departedId].filter((id): id is string => id !== undefined)]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const base = `/api/campaigns/${'CAMPAIGN'}`;
const url = (p: string) => p.replace('CAMPAIGN', campaignId);
const commoner = { ac: 10, hpMax: 4, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 }, challengeRating: '0' };

/** Each route that stores a reference, sent the given address. */
const WRITES: Array<[string, (address: string) => Promise<request.Response>]> = [
  ['the map update, image', (a) => dm.put(url(`${base}/maps/${mapId}`)).send({ imageUrl: a })],
  ['the map update, spirit layer', (a) => dm.put(url(`${base}/maps/${mapId}`)).send({ spiritLayerUrl: a })],
  ['placing a token', (a) => dm.post(url(`${base}/maps/${mapId}/tokens`)).send({ name: 'Imp', position: { x: 1, y: 1 }, imageUrl: a })],
  ['a token template', (a) => dm.post(url(`${base}/token-templates`)).send({ name: 'Imp', imageUrl: a })],
  ['a creature template', (a) => dm.post(url(`${base}/creatures`)).send({ name: 'Imp', statBlock: commoner, imageUrl: a })],
];

describe('a reference to an asset the DM cannot read', () => {
  it.each(WRITES)('is refused by %s, and the asset stays private', async (_route, write) => {
    const res = await write(`/api/assets/tokens/${privateId}`);
    expect(res.status).toBe(403);
    expect((await dm.get(`/api/assets/tokens/${privateId}`)).status).toBe(403);
  });
});

describe("a reference to the DM's own asset", () => {
  it.each(WRITES)('is stored by %s', async (_route, write) => {
    expect((await write(`/api/assets/tokens/${ownId}`)).status).toBeLessThan(300);
  });
});

describe('an update naming an asset the DM cannot read', () => {
  const privateUrl = () => `/api/assets/tokens/${privateId}`;

  it('is refused for a token, a token template and a creature template', async () => {
    const placed = await dm.post(url(`${base}/maps/${mapId}/tokens`)).send({ name: 'Imp', position: { x: 2, y: 2 } });
    expect(placed.status).toBe(201);
    expect((await dm.put(url(`${base}/maps/${mapId}/tokens/${placed.body.token.id}`)).send({ imageUrl: privateUrl() })).status).toBe(403);

    const template = await dm.post(url(`${base}/token-templates`)).send({ name: 'Imp' });
    expect(template.status).toBe(201);
    expect((await dm.put(url(`${base}/token-templates/${template.body.id ?? template.body.template?.id}`)).send({ imageUrl: privateUrl() })).status).toBe(403);

    const creature = await dm.post(url(`${base}/creatures`)).send({ name: 'Imp', statBlock: commoner });
    expect(creature.status).toBe(201);
    const creatureId = creature.body.id ?? creature.body.creature?.id ?? creature.body.template?.id;
    expect((await dm.put(url(`${base}/creatures/${creatureId}`)).send({ imageUrl: privateUrl() })).status).toBe(403);

    expect((await dm.get(privateUrl())).status).toBe(403);
  });
});

describe('an update that leaves a stored reference as it was', () => {
  // A picture that exists but that the DM can no longer read: its uploader is
  // in no campaign with them (a player who has left, say), so the reference
  // grants no one anything. An edit re-sends the stored address, and refusing
  // it would refuse every edit of the record. An asset that no longer exists
  // would not do: that is accepted whatever the record holds.
  let strandedUrl: string;
  beforeAll(async () => {
    const outsider = await createTestUser({ displayName: 'Refs Outsider' });
    outsiderId = outsider.id;
    strandedUrl = `/api/assets/tokens/${await makeAsset(outsiderId, 'stranded')}`;
    expect((await dm.get(strandedUrl)).status).toBe(403);
  });

  it('goes through for a token template', async () => {
    const template = await prisma.tokenTemplate.create({
      data: { id: randomUUID(), campaignId, createdById: dmId, name: 'Old', imageUrl: strandedUrl, type: 'npc', displayMode: 'pog', size: { width: 1, height: 1 } },
    });
    expect((await dm.put(url(`${base}/token-templates/${template.id}`)).send({ name: 'Renamed', imageUrl: strandedUrl })).status).toBe(200);
  });

  it('goes through for a creature template', async () => {
    const creature = await prisma.creatureTemplate.create({
      data: { campaignId, createdById: dmId, name: 'Old', imageUrl: strandedUrl, statBlock: commoner },
    });
    expect((await dm.put(url(`${base}/creatures/${creature.id}`)).send({ name: 'Renamed', imageUrl: strandedUrl })).status).toBe(200);
  });

  it('goes through for a token', async () => {
    const tokenId = randomUUID();
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const tokens = Array.isArray(map.tokens) ? map.tokens : [];
    await prisma.map.update({
      where: { id: mapId },
      data: { tokens: [...tokens, { id: tokenId, name: 'Old', imageUrl: strandedUrl, position: { x: 3, y: 3 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, type: 'npc' }] },
    });
    expect((await dm.put(url(`${base}/maps/${mapId}/tokens/${tokenId}`)).send({ name: 'Renamed', imageUrl: strandedUrl })).status).toBe(200);
  });

  it('goes through for a map', async () => {
    const other = await prisma.map.create({
      data: { campaignId, name: 'Old', imageUrl: strandedUrl, baseLayerUrl: strandedUrl, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
    });
    expect((await dm.put(url(`${base}/maps/${other.id}`)).send({ name: 'Renamed', imageUrl: strandedUrl })).status).toBe(200);
  });
});

// A copy of something already in the campaign (Duplicate, Save as Template,
// placing from a template) names a picture already stored here. When that
// picture can no longer be read, its uploader having left, say, every copy
// was refused, though another reference in the same campaign grants no one
// anything the first did not.
describe('a copy naming a picture already used in the campaign', () => {
  let usedUrl: string;
  let otherUrl: string;
  let theirsId: string;
  beforeAll(async () => {
    const outsider = await createTestUser({ displayName: 'Refs Departed' });
    departedId = outsider.id;
    usedUrl = `/api/assets/tokens/${await makeAsset(departedId, 'departed-used')}`;
    otherUrl = `/api/assets/tokens/${await makeAsset(departedId, 'departed-unused')}`;
    theirsId = randomUUID();
    await prisma.tokenTemplate.create({
      data: { id: theirsId, campaignId, createdById: dmId, name: 'Theirs', imageUrl: usedUrl, type: 'npc', displayMode: 'pog', size: { width: 1, height: 1 } },
    });
    expect((await dm.get(usedUrl)).status).toBe(403);
  });

  it('goes through, even when the picture can no longer be read', async () => {
    expect((await dm.post(url(`${base}/maps/${mapId}/tokens`)).send({ name: 'Copy', position: { x: 4, y: 4 }, imageUrl: usedUrl })).status).toBe(201);
    expect((await dm.post(url(`${base}/token-templates`)).send({ name: 'Copy', imageUrl: usedUrl })).status).toBe(201);
    expect((await dm.post(url(`${base}/creatures`)).send({ name: 'Copy', statBlock: commoner, imageUrl: usedUrl })).status).toBe(201);
  });

  it('is still refused for a picture the campaign does not already use', async () => {
    expect((await dm.post(url(`${base}/token-templates`)).send({ name: 'Other', imageUrl: otherUrl })).status).toBe(403);
  });

  // Copying a template to another campaign stores its picture there, where
  // nothing used it: the first reference, and from then on the reason the
  // other campaign's members may read it.
  it('is refused when a template is copied into another campaign that does not use it', async () => {
    const elsewhere = (await createTestCampaign(dmId, { name: 'Asset references, elsewhere' })).id;
    try {
      await prisma.campaignMembership.create({ data: { userId: dmId, campaignId: elsewhere, role: 'DM', characterIds: [] } });
      const res = await dm.post(url(`${base}/token-templates/${theirsId}/copy-to/${elsewhere}`));
      expect(res.status).toBe(403);
      expect(await prisma.tokenTemplate.count({ where: { campaignId: elsewhere } })).toBe(0);

      const own = await prisma.tokenTemplate.create({
        data: { id: randomUUID(), campaignId, createdById: dmId, name: 'Mine', imageUrl: `/api/assets/tokens/${ownId}`, type: 'npc', displayMode: 'pog', size: { width: 1, height: 1 } },
      });
      expect((await dm.post(url(`${base}/token-templates/${own.id}/copy-to/${elsewhere}`))).status).toBe(201);
    } finally {
      await prisma.tokenTemplate.deleteMany({ where: { campaignId: elsewhere } });
      await cleanupCampaigns([elsewhere]);
    }
  });
});

describe('creating a map', () => {
  // As on every other route: a picture deleted since the list was loaded
  // grants nothing, and is not a reason to refuse.
  it('accepts a picture that no longer exists', async () => {
    const res = await dm.post(url(`${base}/maps`)).send({ name: 'Gone', imageUrl: `/api/assets/maps/${randomUUID()}`, width: 10, height: 10, gridSize: 50 });
    expect(res.status).toBe(201);
  });

  it("refuses a player's private picture", async () => {
    const res = await dm.post(url(`${base}/maps`)).send({ name: 'Theirs', imageUrl: `/api/assets/maps/${privateId}`, width: 10, height: 10, gridSize: 50 });
    expect(res.status).toBe(403);
  });
});

// Storing a reference opens the asset to everyone at the table, so it needs
// more than an administrator's right to read any file: the DM must be able to
// read it as the DM, as setting a scene's music already requires.
describe('a DM who is also an administrator', () => {
  let adminCampaignId: string;
  let adminMapId: string;
  let admin: ReturnType<typeof request.agent>;
  beforeAll(async () => {
    const adminUser = await createTestUser({ displayName: 'Refs Admin DM', role: PlatformRole.ADMIN });
    adminId = adminUser.id;
    adminCampaignId = (await createTestCampaign(adminId, { name: 'Admin refs' })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: adminId, campaignId: adminCampaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId: adminCampaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
    adminMapId = (await prisma.map.create({
      data: { campaignId: adminCampaignId, name: 'Admin map', imageUrl: `/api/assets/maps/${ownId}`, baseLayerUrl: `/api/assets/maps/${ownId}`, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
    })).id;
    admin = request.agent(app);
    expect((await admin.post('/api/auth/login').send({ email: adminUser.email, password: TEST_PASSWORD })).status).toBe(200);
  });
  afterAll(async () => {
    await prisma.map.deleteMany({ where: { campaignId: adminCampaignId } });
    await prisma.tokenTemplate.deleteMany({ where: { campaignId: adminCampaignId } });
    await prisma.creatureTemplate.deleteMany({ where: { campaignId: adminCampaignId } });
    await cleanupCampaigns([adminCampaignId]);
  });

  it("cannot put a player's private picture in front of the table", async () => {
    const privateUrl = `/api/assets/tokens/${privateId}`;
    const at = (p: string) => `/api/campaigns/${adminCampaignId}${p}`;
    expect((await admin.post(at('/token-templates')).send({ name: 'Imp', imageUrl: privateUrl })).status).toBe(403);
    expect((await admin.post(at('/creatures')).send({ name: 'Imp', statBlock: commoner, imageUrl: privateUrl })).status).toBe(403);
    expect((await admin.post(at(`/maps/${adminMapId}/tokens`)).send({ name: 'Imp', position: { x: 1, y: 1 }, imageUrl: privateUrl })).status).toBe(403);
    expect((await admin.put(at(`/maps/${adminMapId}`)).send({ imageUrl: `/api/assets/maps/${privateId}` })).status).toBe(403);
    expect((await admin.post(at('/maps')).send({ name: 'Theirs', imageUrl: `/api/assets/maps/${privateId}`, width: 10, height: 10, gridSize: 50 })).status).toBe(403);
  });
});

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
  await cleanupUsers([dmId, playerId]);
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
  it('goes through, even when the asset can no longer be read', async () => {
    // A template whose picture was set before the check, or whose asset has
    // since gone; renaming it re-sends the stored address.
    const stale = `/api/assets/tokens/${randomUUID()}`;
    const template = await prisma.tokenTemplate.create({
      data: { id: randomUUID(), campaignId, createdById: dmId, name: 'Old', imageUrl: stale, type: 'npc', displayMode: 'pog', size: { width: 1, height: 1 } },
    });
    const res = await dm.put(url(`${base}/token-templates/${template.id}`)).send({ name: 'Renamed', imageUrl: stale });
    expect(res.status).toBe(200);
  });
});

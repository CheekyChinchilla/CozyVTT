/**
 * What a member may put into a campaign's asset library, and what they may
 * point at.
 *
 * Creating an asset at CAMPAIGN scope is DM-only, with token art the one
 * exception for players. Moving an asset there through the scope route only
 * checked membership, so a spectator or player could publish a private
 * document, map or track into the campaign library. The token exception also
 * covered spectators. A character's token image was stored unchecked, so any
 * member could point their character at a fellow member's private asset and
 * then read it. The asset listing served the file's storage paths, and it
 * served the spirit-layer image the map itself keeps from players who have
 * not crossed over.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-asset-scope-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

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
import { canPlaceAssetAtScope } from '../../services/permissions';

const app = createTestApp();

/** A tiny valid PNG, written to disk so the serving route has something to send. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

let dmId: string;
let playerId: string;
let spectatorId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let spectator: ReturnType<typeof request.agent>;
const assetIds: string[] = [];

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** An asset row with a real file behind it. */
async function makeAsset(type: 'MAP' | 'TOKEN' | 'DOCUMENT', scope: 'USER' | 'CAMPAIGN', uploadedById: string, label: string) {
  const filename = `${label}-${Date.now()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, PNG);
  const asset = await prisma.asset.create({
    data: {
      type,
      scope,
      campaignId: scope === 'CAMPAIGN' ? campaignId : null,
      uploadedById,
      filename,
      originalName: filename,
      mimeType: 'image/png',
      fileSize: PNG.length,
      filePath,
      name: label,
    },
  });
  assetIds.push(asset.id);
  return asset.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const dmUser = await createTestUser({ email: `scope-dm-${stamp}@test.cozyvtt.local`, displayName: 'Scope DM' });
  const playerUser = await createTestUser({ email: `scope-player-${stamp}@test.cozyvtt.local`, displayName: 'Scope Player' });
  const spectatorUser = await createTestUser({ email: `scope-spec-${stamp}@test.cozyvtt.local`, displayName: 'Scope Spectator' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  spectatorId = spectatorUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Scope ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  [dm, player, spectator] = await Promise.all([login(dmUser.email), login(playerUser.email), login(spectatorUser.email)]);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { userId: { in: [dmId, playerId, spectatorId] } } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, spectatorId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('moving an asset into a campaign', () => {
  const move = (agent: ReturnType<typeof request.agent>, id: string) =>
    agent.patch(`/api/assets/${id}/scope`).send({ scope: 'CAMPAIGN', campaignId });

  it('is refused to a player and a spectator for anything but token art, as uploading there is', async () => {
    const playerDoc = await makeAsset('DOCUMENT', 'USER', playerId, 'player-handout');
    const spectatorMap = await makeAsset('MAP', 'USER', spectatorId, 'spectator-map');
    expect((await move(player, playerDoc)).status).toBe(403);
    expect((await move(spectator, spectatorMap)).status).toBe(403);
    const still = await prisma.asset.findMany({ where: { id: { in: [playerDoc, spectatorMap] } }, select: { scope: true } });
    expect(still.map((a) => a.scope)).toEqual(['USER', 'USER']);
  });

  it('lets a player move their own token art in, and a spectator not even that', async () => {
    const playerToken = await makeAsset('TOKEN', 'USER', playerId, 'player-token');
    const spectatorToken = await makeAsset('TOKEN', 'USER', spectatorId, 'spectator-token');
    expect((await move(player, playerToken)).status).toBe(200);
    expect((await move(spectator, spectatorToken)).status).toBe(403);
  });

  it('lets the DM move any of their own assets in', async () => {
    const dmDoc = await makeAsset('DOCUMENT', 'USER', dmId, 'dm-handout');
    expect((await move(dm, dmDoc)).status).toBe(200);
  });
});

describe('placing token art at campaign scope', () => {
  it('is open to a player and closed to a spectator', async () => {
    expect((await canPlaceAssetAtScope(playerId, 'TOKEN', 'CAMPAIGN', campaignId)).allowed).toBe(true);
    expect((await canPlaceAssetAtScope(spectatorId, 'TOKEN', 'CAMPAIGN', campaignId)).allowed).toBe(false);
    expect((await canPlaceAssetAtScope(dmId, 'MAP', 'CAMPAIGN', campaignId)).allowed).toBe(true);
    expect((await canPlaceAssetAtScope(playerId, 'MAP', 'CAMPAIGN', campaignId)).allowed).toBe(false);
  });
});

describe("a character's token image", () => {
  it("cannot point at a fellow member's private asset, on creation or on update", async () => {
    const dmPrivate = await makeAsset('TOKEN', 'USER', dmId, 'dm-private-token');
    const url = `/api/assets/tokens/${dmPrivate}`;
    const created = await player.post('/api/characters').send({ name: 'Peeker', tokenImageUrl: url });
    expect(created.status).toBe(403);

    const own = await player.post('/api/characters').send({ name: 'Honest' });
    expect(own.status).toBe(201);
    const updated = await player.put(`/api/characters/${own.body.character.id}`).send({ tokenImageUrl: url });
    expect(updated.status).toBe(403);
    // And the private asset stays private.
    expect((await player.get(url)).status).toBe(403);
  });

  // The write check reads the asset id out of the address and asks whether
  // the member may read it. The read side once granted on any stored address
  // merely containing an asset's id, so an address the write check read as
  // naming no asset, or a different one, still opened the private one.
  it.each([
    ['with a character after the id', (victim: string) => `${victim}#`],
    ['inside a longer path segment', (victim: string) => `/api/assets/tokens/x${victim}`],
    ['under a directory that is not an image type', (victim: string) => `/api/assets/documents/${victim}`],
    ['after a readable asset', (victim: string, mine: string) => `/api/assets/tokens/${mine}/../${victim}`],
  ])("grants nothing when the private asset's id is written %s", async (_how, address) => {
    const victim = await makeAsset('TOKEN', 'USER', dmId, 'dm-private-smuggled');
    const mine = await makeAsset('TOKEN', 'USER', playerId, 'my-cover-token');
    const created = await player.post('/api/characters').send({ name: 'Smuggler', tokenImageUrl: address(victim, mine) });
    if (created.status === 201) {
      // Bring it into the campaign the DM shares with the player.
      await prisma.character.update({ where: { id: created.body.character.id }, data: { campaignId } });
    }
    expect((await player.get(`/api/assets/tokens/${victim}`)).status).toBe(403);
  });

  it('may point at an asset the member can read', async () => {
    const mine = await makeAsset('TOKEN', 'USER', playerId, 'my-token');
    const created = await player.post('/api/characters').send({ name: 'Pictured', tokenImageUrl: `/api/assets/tokens/${mine}` });
    expect(created.status).toBe(201);
    expect(created.body.character.tokenImageUrl).toBe(`/api/assets/tokens/${mine}`);
  });
});

describe('what the asset library tells a member', () => {
  it('never includes where a file is stored on the server', async () => {
    const id = await makeAsset('MAP', 'CAMPAIGN', dmId, 'listed-map');
    const list = await player.get(`/api/assets?campaignId=${campaignId}`);
    expect(list.status).toBe(200);
    const listed = list.body.assets.find((a: { id: string }) => a.id === id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty('filePath');
    expect(listed).not.toHaveProperty('thumbnailPath');
    const one = await player.get(`/api/assets/${id}`);
    expect(one.status).toBe(200);
    expect(one.body).not.toHaveProperty('filePath');
    expect(one.body).not.toHaveProperty('thumbnailPath');
  });

  it('keeps the spirit layer image from a player who has not crossed over, and shows it once they have', async () => {
    const spirit = await makeAsset('MAP', 'CAMPAIGN', dmId, 'secret-spirit-realm');
    await prisma.map.create({
      data: {
        campaignId, name: 'Two Planes', imageUrl: '/api/assets/maps/placeholder', baseLayerUrl: '/api/assets/maps/placeholder',
        spiritLayerUrl: `/api/assets/maps/${spirit}`, width: 10, height: 10, gridSize: 50, tokens: [], annotations: [],
      },
    });
    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });

    const hidden = await player.get(`/api/assets?campaignId=${campaignId}&type=MAP`);
    expect(hidden.body.assets.map((a: { id: string }) => a.id)).not.toContain(spirit);
    expect((await player.get(`/api/assets/maps/${spirit}`)).status).toBe(403);
    expect((await player.get(`/api/assets/${spirit}`)).status).toBe(403);
    // The DM always has it.
    expect((await dm.get(`/api/assets?campaignId=${campaignId}&type=MAP`)).body.assets.map((a: { id: string }) => a.id)).toContain(spirit);
    expect((await dm.get(`/api/assets/maps/${spirit}`)).status).toBe(200);

    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: true } });
    const shown = await player.get(`/api/assets?campaignId=${campaignId}&type=MAP`);
    expect(shown.body.assets.map((a: { id: string }) => a.id)).toContain(spirit);
    expect((await player.get(`/api/assets/maps/${spirit}`)).status).toBe(200);
  });
});

/**
 * Deleting a campaign asset, or moving it out of the campaign, as its uploader
 * who does not run the campaign — End-to-End Tests
 *
 * Whoever uploaded a campaign asset could delete it, or move it to their own
 * library, for as long as they were a member. A DM who handed the seat over
 * could, as a player, delete with force=true a picture the new DM's maps use,
 * and every map using it lost its picture. Now an uploader who does not run
 * the campaign may delete or move one only while nothing but their own things
 * use it: their characters, the tokens they control and the documents they
 * wrote. Anything else using it makes it the campaign's DM's alone. Editing
 * the text of a document they wrote stays with the uploader.
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

const userIds: string[] = [];
const campaignIds: string[] = [];
const assetIds: string[] = [];

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function makeAsset(uploadedById: string, type: 'MAP' | 'TOKEN') {
  const asset = await prisma.asset.create({
    data: {
      name: 'Uploaded art',
      filename: `art-${Math.random().toString(36).slice(2)}.png`,
      originalName: 'art.png',
      mimeType: 'image/png',
      fileSize: 128,
      filePath: `${type === 'MAP' ? 'maps' : 'tokens'}/missing-${Math.random().toString(36).slice(2)}.png`,
      type,
      scope: 'CAMPAIGN',
      uploadedById,
      campaignId,
    },
  });
  assetIds.push(asset.id);
  return { id: asset.id, address: `/api/assets/${type === 'MAP' ? 'maps' : 'tokens'}/${asset.id}` };
}

async function makeMap(name: string, extra: { imageUrl?: string; tokens?: object[] } = {}) {
  return prisma.map.create({
    data: {
      campaignId,
      name,
      imageUrl: extra.imageUrl ?? '/api/assets/maps/00000000-0000-4000-8000-000000000000',
      baseLayerUrl: extra.imageUrl ?? '/api/assets/maps/00000000-0000-4000-8000-000000000000',
      width: 10,
      height: 10,
      gridSize: 50,
      annotations: [],
      tokens: extra.tokens ?? [],
    },
  });
}

/** A Markdown document naming `content`, written through the app as `agent`'s. */
async function documentOf(agent: ReturnType<typeof request.agent>, name: string, content: string, where: { campaignId?: string } = {}) {
  const res = await agent.post('/api/assets/documents').send({
    name, format: 'md', content, scope: where.campaignId ? 'CAMPAIGN' : 'USER', ...(where.campaignId ? { campaignId: where.campaignId } : {}),
  });
  expect(res.status).toBe(201);
  assetIds.push(res.body.asset.id);
}

const stillThere = async (id: string) => prisma.asset.findUnique({ where: { id }, select: { scope: true, campaignId: true } });

let campaignId: string;
let newDmId: string;
let formerDmId: string;
let playerId: string;
let adminUser: ReturnType<typeof request.agent>;
let newDm: ReturnType<typeof request.agent>;
let formerDm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = Date.now();
  const admin = await createTestUser({ email: `remove-admin-${stamp}@test.invalid`, role: 'ADMIN' });
  const newDmUser = await createTestUser({ email: `remove-newdm-${stamp}@test.invalid` });
  const formerDmUser = await createTestUser({ email: `remove-olddm-${stamp}@test.invalid` });
  const playerUser = await createTestUser({ email: `remove-player-${stamp}@test.invalid` });
  newDmId = newDmUser.id;
  formerDmId = formerDmUser.id;
  playerId = playerUser.id;
  userIds.push(admin.id, newDmId, formerDmId, playerId);

  campaignId = (await createTestCampaign(newDmId, { name: 'Handed Over' })).id;
  campaignIds.push(campaignId);
  // The seat has been handed over: the former DM now sits as a player.
  await prisma.campaignMembership.createMany({
    data: [
      { userId: newDmId, campaignId, role: 'DM', characterIds: [] },
      { userId: formerDmId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  adminUser = await login(admin.email);
  newDm = await login(newDmUser.email);
  formerDm = await login(formerDmUser.email);
  player = await login(playerUser.email);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

describe('a former DM', () => {
  it('may not delete a picture a map of the campaign uses, forced or not', async () => {
    const picture = await makeAsset(formerDmId, 'MAP');
    await makeMap('Crypt', { imageUrl: picture.address });

    for (const query of ['', '?force=true']) {
      const res = await formerDm.delete(`/api/assets/${picture.id}${query}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Others in the campaign use this asset, so only the campaign's DM can delete it");
    }
    expect(await stillThere(picture.id)).not.toBeNull();
  });

  it('may not move it out of the campaign', async () => {
    const picture = await makeAsset(formerDmId, 'MAP');
    await makeMap('Vault', { imageUrl: picture.address });

    const res = await formerDm.patch(`/api/assets/${picture.id}/scope`).send({ scope: 'USER' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Others in the campaign use this asset, so only the campaign's DM can move it out of the campaign");
    expect(await stillThere(picture.id)).toEqual({ scope: 'CAMPAIGN', campaignId });
  });

  it('may delete a picture nothing uses', async () => {
    const picture = await makeAsset(formerDmId, 'MAP');

    expect((await formerDm.delete(`/api/assets/${picture.id}`)).status).toBe(200);
    expect(await stillThere(picture.id)).toBeNull();
  });
});

describe('the current DM and an admin', () => {
  it('may delete a picture someone else uploaded that the campaign uses', async () => {
    const forDm = await makeAsset(formerDmId, 'MAP');
    const forAdmin = await makeAsset(formerDmId, 'MAP');
    await makeMap('Bridge', { imageUrl: forDm.address });
    await makeMap('Tower', { imageUrl: forAdmin.address });

    expect((await newDm.delete(`/api/assets/${forDm.id}?force=true`)).status).toBe(200);
    expect((await adminUser.delete(`/api/assets/${forAdmin.id}?force=true`)).status).toBe(200);
    expect(await stillThere(forDm.id)).toBeNull();
    expect(await stillThere(forAdmin.id)).toBeNull();
  });
});

describe('a player who uploaded token art', () => {
  it('may delete it while only their own character and the tokens they control use it', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await prisma.character.create({ data: { userId: playerId, campaignId, name: 'Pip', tokenImageUrl: art.address, data: {} } });
    await makeMap('Road', { tokens: [{ id: 'pip', name: 'Pip', imageUrl: art.address, controlledBy: playerId }] });
    await documentOf(player, 'Pip\'s diary', `![Pip](${art.address})`);

    expect((await player.delete(`/api/assets/${art.id}`)).status).toBe(409);
    expect((await player.delete(`/api/assets/${art.id}?force=true`)).status).toBe(200);
    expect(await stillThere(art.id)).toBeNull();
  });

  it('may not delete it once a token they do not control uses it', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await makeMap('Camp', { tokens: [{ id: 'npc', name: 'Guard', imageUrl: art.address, controlledBy: null }] });

    expect((await player.delete(`/api/assets/${art.id}?force=true`)).status).toBe(403);
    expect(await stillThere(art.id)).not.toBeNull();
  });

  it('may not delete it once the DM\'s handout shows it', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await documentOf(newDm, 'Wanted poster', `![Wanted](${art.address})`, { campaignId });

    expect((await player.delete(`/api/assets/${art.id}?force=true`)).status).toBe(403);
    expect(await stillThere(art.id)).not.toBeNull();
  });

  it('may not delete it once another member\'s character uses it', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await prisma.character.create({ data: { userId: formerDmId, campaignId, name: 'Borrowed', tokenImageUrl: art.address, data: {} } });

    expect((await player.delete(`/api/assets/${art.id}?force=true`)).status).toBe(403);
    expect(await stillThere(art.id)).not.toBeNull();
  });
});

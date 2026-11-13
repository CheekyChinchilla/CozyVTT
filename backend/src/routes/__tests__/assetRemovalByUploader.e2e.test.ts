/**
 * Deleting a campaign asset, or moving it out of the campaign, as its uploader
 * who does not run the campaign — End-to-End Tests
 *
 * Whoever uploaded a campaign asset could delete it, or move it to their own
 * library, for as long as they were a member. A GM who handed the seat over
 * could, as a player, delete with force=true a picture the new GM's maps use,
 * and every map using it lost its picture. Now an uploader who does not run
 * the campaign may delete or move one only while nothing but their own things
 * use it: their characters, the tokens they control and the documents they
 * wrote. Anything else using it makes it the campaign's GM's alone. Editing
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
let newGmId: string;
let formerGmId: string;
let playerId: string;
let adminUser: ReturnType<typeof request.agent>;
let newGm: ReturnType<typeof request.agent>;
let formerGm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = Date.now();
  const admin = await createTestUser({ email: `remove-admin-${stamp}@test.invalid`, role: 'ADMIN' });
  const newGmUser = await createTestUser({ email: `remove-newdm-${stamp}@test.invalid` });
  const formerGmUser = await createTestUser({ email: `remove-olddm-${stamp}@test.invalid` });
  const playerUser = await createTestUser({ email: `remove-player-${stamp}@test.invalid` });
  newGmId = newGmUser.id;
  formerGmId = formerGmUser.id;
  playerId = playerUser.id;
  userIds.push(admin.id, newGmId, formerGmId, playerId);

  campaignId = (await createTestCampaign(newGmId, { name: 'Handed Over' })).id;
  campaignIds.push(campaignId);
  // The seat has been handed over: the former GM now sits as a player.
  await prisma.campaignMembership.createMany({
    data: [
      { userId: newGmId, campaignId, role: 'GM', characterIds: [] },
      { userId: formerGmId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  adminUser = await login(admin.email);
  newGm = await login(newGmUser.email);
  formerGm = await login(formerGmUser.email);
  player = await login(playerUser.email);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.characterTemplate.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

describe('a former GM', () => {
  it('may not delete a picture a map of the campaign uses, forced or not', async () => {
    const picture = await makeAsset(formerGmId, 'MAP');
    await makeMap('Crypt', { imageUrl: picture.address });

    for (const query of ['', '?force=true']) {
      const res = await formerGm.delete(`/api/assets/${picture.id}${query}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Others in the campaign use this asset, so only the campaign's GM can delete it");
    }
    expect(await stillThere(picture.id)).not.toBeNull();
  });

  it('may not move it out of the campaign', async () => {
    const picture = await makeAsset(formerGmId, 'MAP');
    await makeMap('Vault', { imageUrl: picture.address });

    const res = await formerGm.patch(`/api/assets/${picture.id}/scope`).send({ scope: 'USER' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Others in the campaign use this asset, so only the campaign's GM can move it out of the campaign");
    expect(await stillThere(picture.id)).toEqual({ scope: 'CAMPAIGN', campaignId });
  });

  it('may delete a picture nothing uses', async () => {
    const picture = await makeAsset(formerGmId, 'MAP');

    expect((await formerGm.delete(`/api/assets/${picture.id}`)).status).toBe(200);
    expect(await stillThere(picture.id)).toBeNull();
  });
});

describe('the current GM and an admin', () => {
  it('may delete a picture someone else uploaded that the campaign uses', async () => {
    const forGm = await makeAsset(formerGmId, 'MAP');
    const forAdmin = await makeAsset(formerGmId, 'MAP');
    await makeMap('Bridge', { imageUrl: forGm.address });
    await makeMap('Tower', { imageUrl: forAdmin.address });

    expect((await newGm.delete(`/api/assets/${forGm.id}?force=true`)).status).toBe(200);
    expect((await adminUser.delete(`/api/assets/${forAdmin.id}?force=true`)).status).toBe(200);
    expect(await stillThere(forGm.id)).toBeNull();
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

  it('may not delete it once the GM\'s handout shows it', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await documentOf(newGm, 'Wanted poster', `![Wanted](${art.address})`, { campaignId });

    expect((await player.delete(`/api/assets/${art.id}?force=true`)).status).toBe(403);
    expect(await stillThere(art.id)).not.toBeNull();
  });

  it('may not delete it once another member\'s character uses it', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await prisma.character.create({ data: { userId: formerGmId, campaignId, name: 'Borrowed', tokenImageUrl: art.address, data: {} } });

    expect((await player.delete(`/api/assets/${art.id}?force=true`)).status).toBe(403);
    expect(await stillThere(art.id)).not.toBeNull();
  });

  // A character template is offered to everyone on the instance, so even
  // the uploader's own keeps the art; the refusal says that is why.
  it('may not delete or move it while their own character template uses it, and is told a template does', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await prisma.characterTemplate.create({ data: { name: 'Pip, as a template', tokenImageUrl: art.address, data: {}, createdById: playerId } });

    const deleted = await player.delete(`/api/assets/${art.id}?force=true`);
    expect(deleted.status).toBe(403);
    expect(deleted.body.message).toBe("A character template uses this asset, so only the campaign's GM can delete it");
    const moved = await player.patch(`/api/assets/${art.id}/scope`).send({ scope: 'USER' });
    expect(moved.status).toBe(403);
    expect(moved.body.message).toBe("A character template uses this asset, so only the campaign's GM can move it out of the campaign");
    expect(await stillThere(art.id)).toEqual({ scope: 'CAMPAIGN', campaignId });
  });

  it('is told others in the campaign use it when a template and another member\'s character both do', async () => {
    const art = await makeAsset(playerId, 'TOKEN');
    await prisma.characterTemplate.create({ data: { name: 'Pip again', tokenImageUrl: art.address, data: {}, createdById: playerId } });
    await prisma.character.create({ data: { userId: formerGmId, campaignId, name: 'Borrowed too', tokenImageUrl: art.address, data: {} } });

    const deleted = await player.delete(`/api/assets/${art.id}?force=true`);
    expect(deleted.status).toBe(403);
    expect(deleted.body.message).toBe("Others in the campaign use this asset, so only the campaign's GM can delete it");
  });
});

/**
 * Deleting an asset that something still uses — End-to-End Tests
 *
 * An asset is only a row and a file; the maps, tokens, characters, templates,
 * creatures and campaign settings that name it by address are not told when it
 * goes. Deleting one that is in use blanks its picture or sound everywhere it
 * appears, and the file cannot be brought back. So the route refuses with 409
 * and a list of where the asset is used, and deletes only when the request
 * says `force=true`.
 *
 * Permissions are decided first and unchanged, and the list names only what the
 * caller may see, so it cannot be used to read other people's campaigns.
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

interface Use {
  kind: string;
  name: string | null;
  campaignId: string | null;
  campaignName: string | null;
  count: number;
}

const userIds: string[] = [];
const campaignIds: string[] = [];
const assetIds: string[] = [];
const characterTemplateIds: string[] = [];

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function makeAsset(opts: {
  scope: 'GLOBAL' | 'USER' | 'CAMPAIGN';
  uploadedById: string;
  campaignId?: string;
  type?: 'MAP' | 'TOKEN' | 'AUDIO';
}) {
  const asset = await prisma.asset.create({
    data: {
      name: 'Used art',
      filename: `used-${Math.random().toString(36).slice(2)}.png`,
      originalName: 'used.png',
      mimeType: 'image/png',
      fileSize: 128,
      filePath: `tokens/missing-${Math.random().toString(36).slice(2)}.png`,
      type: opts.type ?? 'TOKEN',
      scope: opts.scope,
      uploadedById: opts.uploadedById,
      campaignId: opts.campaignId ?? null,
    },
  });
  assetIds.push(asset.id);
  return asset.id;
}

async function makeMap(campaignId: string, name: string, extra: { imageUrl?: string; tokens?: object[] } = {}) {
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

let adminId: string;
let dmId: string;
let managerId: string;
let strangerId: string;
let campaignId: string;
let otherCampaignId: string;
let admin: ReturnType<typeof request.agent>;
let dm: ReturnType<typeof request.agent>;
let manager: ReturnType<typeof request.agent>;
let stranger: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = Date.now();
  const adminUser = await createTestUser({ email: `inuse-admin-${stamp}@test.invalid`, role: 'ADMIN' });
  const dmUser = await createTestUser({ email: `inuse-dm-${stamp}@test.invalid`, displayName: 'In Use DM' });
  const managerUser = await createTestUser({ email: `inuse-mgr-${stamp}@test.invalid` });
  const strangerUser = await createTestUser({ email: `inuse-str-${stamp}@test.invalid` });
  adminId = adminUser.id;
  dmId = dmUser.id;
  managerId = managerUser.id;
  strangerId = strangerUser.id;
  userIds.push(adminId, dmId, managerId, strangerId);
  await prisma.user.update({ where: { id: managerId }, data: { globalAssetManager: true } });

  campaignId = (await createTestCampaign(dmId, { name: 'Lost Mine' })).id;
  otherCampaignId = (await createTestCampaign(strangerId, { name: 'Secret Heist' })).id;
  campaignIds.push(campaignId, otherCampaignId);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: strangerId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
    ],
  });

  admin = await login(adminUser.email);
  dm = await login(dmUser.email);
  manager = await login(managerUser.email);
  stranger = await login(strangerUser.email);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.characterTemplate.deleteMany({ where: { id: { in: characterTemplateIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

describe('an asset a map uses', () => {
  it('is refused with the map named, and is still there', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    await makeMap(campaignId, 'Goblin Cave', { imageUrl: `/api/assets/maps/${id}` });

    const res = await dm.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSET_IN_USE');
    expect(res.body.usage).toEqual([
      { kind: 'map', name: 'Goblin Cave', campaignId, campaignName: 'Lost Mine', count: 1 },
    ]);
    expect(await prisma.asset.findUnique({ where: { id } })).not.toBeNull();
  });

  it('is deleted when the request says force=true', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    await makeMap(campaignId, 'Forced Cave', { imageUrl: `/api/assets/maps/${id}` });

    const res = await dm.delete(`/api/assets/${id}?force=true`);

    expect(res.status).toBe(200);
    expect(await prisma.asset.findUnique({ where: { id } })).toBeNull();
  });

  it('is not forced by any other value of force', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    await makeMap(campaignId, 'Careful Cave', { imageUrl: `/api/assets/maps/${id}` });

    for (const value of ['1', 'yes', 'false', '']) {
      const res = await dm.delete(`/api/assets/${id}?force=${value}`);
      expect(res.status).toBe(409);
    }
    expect(await prisma.asset.findUnique({ where: { id } })).not.toBeNull();
  });

  it('counts the spirit layer too', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    const map = await makeMap(campaignId, 'Haunted Hall');
    await prisma.map.update({ where: { id: map.id }, data: { spiritLayerUrl: `/api/assets/maps/${id}` } });

    const res = await dm.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.usage.map((u: Use) => u.name)).toEqual(['Haunted Hall']);
  });
});

describe('an asset used as token art', () => {
  it('counts the tokens on each map and names the map', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    await makeMap(campaignId, 'Ambush Road', {
      tokens: [
        { id: 't1', name: 'Wolf', imageUrl: `/api/assets/tokens/${id}` },
        { id: 't2', name: 'Wolf', imageUrl: `/api/assets/tokens/${id}` },
        { id: 't3', name: 'Elf', imageUrl: '/api/assets/tokens/00000000-0000-4000-8000-000000000001' },
      ],
    });

    const res = await dm.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.usage).toEqual([
      { kind: 'token', name: 'Ambush Road', campaignId, campaignName: 'Lost Mine', count: 2 },
    ]);
  });
});

describe('an asset used by everything that can hold a picture', () => {
  it('lists each kind of use', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    const address = `/api/assets/tokens/${id}`;
    await makeMap(campaignId, 'Every Map', { tokens: [{ id: 't1', name: 'Imp', imageUrl: address }] });
    await prisma.character.create({
      data: { userId: dmId, campaignId, name: 'Hero Hannah', tokenImageUrl: address, data: {} },
    });
    const template = await prisma.characterTemplate.create({
      data: { name: 'Starter Fighter', tokenImageUrl: address, data: {}, createdById: dmId },
    });
    characterTemplateIds.push(template.id);
    await prisma.creatureTemplate.create({
      data: { name: 'Boss Bat', imageUrl: address, statBlock: {}, campaignId, createdById: dmId },
    });
    await prisma.tokenTemplate.create({
      data: { name: 'Torch Prop', imageUrl: address, campaignId, createdById: dmId },
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { vibeSettings: { atmosphereAudio: { assetId: id, volume: 0.5, loop: true } } },
    });

    const res = await dm.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    const byKind = Object.fromEntries((res.body.usage as Use[]).map((u) => [u.kind, u.name]));
    expect(byKind).toEqual({
      token: 'Every Map',
      character: 'Hero Hannah',
      characterTemplate: 'Starter Fighter',
      creature: 'Boss Bat',
      tokenTemplate: 'Torch Prop',
      campaignSetting: 'Lost Mine',
    });

    await prisma.campaign.update({ where: { id: campaignId }, data: { vibeSettings: {} } });
  });
});

describe('an asset used in a great many places', () => {
  it('lists the first hundred and counts the rest', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    await prisma.map.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        campaignId,
        name: `Map ${i}`,
        imageUrl: `/api/assets/maps/${id}`,
        baseLayerUrl: `/api/assets/maps/${id}`,
        width: 10,
        height: 10,
        gridSize: 50,
        annotations: [],
        tokens: [],
      })),
    });

    const res = await dm.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.usage).toHaveLength(100);
    expect(res.body.omitted).toBe(5);
  });
});

describe('an address that only contains the asset id', () => {
  it('is not a use', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    // Names a different asset, with this id only in the query string.
    await makeMap(campaignId, 'Lookalike', {
      imageUrl: `/api/assets/maps/00000000-0000-4000-8000-000000000002?copy=${id}`,
      tokens: [{ id: 't1', name: 'Imp', imageUrl: `/api/assets/tokens/${id}x` }],
    });

    const res = await dm.delete(`/api/assets/${id}`);

    expect(res.status).toBe(200);
  });
});

describe('who may ask', () => {
  it('refuses a caller with no right to delete before saying anything about use', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    await makeMap(campaignId, 'Private Cave', { imageUrl: `/api/assets/maps/${id}` });

    const res = await stranger.delete(`/api/assets/${id}?force=true`);

    expect(res.status).toBe(403);
    expect(res.body.usage).toBeUndefined();
    expect(await prisma.asset.findUnique({ where: { id } })).not.toBeNull();
  });

  it('shows an admin every campaign by name', async () => {
    const id = await makeAsset({ scope: 'USER', uploadedById: dmId });
    await makeMap(campaignId, 'Admin Cave', { imageUrl: `/api/assets/maps/${id}` });
    await makeMap(otherCampaignId, 'Vault', { imageUrl: `/api/assets/maps/${id}` });

    const res = await admin.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    expect((res.body.usage as Use[]).map((u) => `${u.campaignName}: ${u.name}`).sort()).toEqual([
      'Lost Mine: Admin Cave',
      'Secret Heist: Vault',
    ]);
  });

  it("keeps the names of other people's campaigns from a global asset's owner", async () => {
    const id = await makeAsset({ scope: 'GLOBAL', uploadedById: managerId });
    await makeMap(campaignId, 'Lost Mine Map', { imageUrl: `/api/assets/maps/${id}` });
    await makeMap(otherCampaignId, 'Secret Vault', { imageUrl: `/api/assets/maps/${id}` });

    const res = await manager.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.usage).toEqual([
      { kind: 'map', name: null, campaignId: null, campaignName: null, count: 2 },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Secret');
    expect(JSON.stringify(res.body)).not.toContain('Lost Mine');
  });

  it('shows a DM the uses in their own campaign and only counts the rest', async () => {
    const id = await makeAsset({ scope: 'CAMPAIGN', uploadedById: dmId, campaignId });
    await makeMap(campaignId, 'Campaign Map', { imageUrl: `/api/assets/maps/${id}` });
    await makeMap(otherCampaignId, 'Borrowed Map', { imageUrl: `/api/assets/maps/${id}` });

    const res = await dm.delete(`/api/assets/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.usage).toEqual([
      { kind: 'map', name: 'Campaign Map', campaignId, campaignName: 'Lost Mine', count: 1 },
      { kind: 'map', name: null, campaignId: null, campaignName: null, count: 1 },
    ]);
  });
});

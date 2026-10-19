/**
 * Asset deletion permissions — End-to-End Tests
 *
 * The asset routes had no e2e coverage at all, which is how a permission bug
 * survived here: the globalAssetManager flag was read only when the requester
 * was *not* the owner, while the rule that uses it requires that they *are* —
 * so a global asset manager could never delete their own global asset.
 *
 * These pin the whole delete matrix, not just the case that was broken.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { AssetType, AssetScope, CampaignRole } from '@prisma/client';
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

describe('Asset deletion permissions', () => {
  let adminId: string;
  let managerId: string;
  let strangerId: string;
  let dmId: string;
  let campaignId: string;

  let adminAgent: ReturnType<typeof request.agent>;
  let managerAgent: ReturnType<typeof request.agent>;
  let strangerAgent: ReturnType<typeof request.agent>;
  let dmAgent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  /** Create an asset row directly — this suite is about delete, not upload. */
  async function makeAsset(opts: {
    scope: AssetScope;
    uploadedById: string;
    campaignId?: string | null;
  }) {
    return prisma.asset.create({
      data: {
        name: 'Test Asset',
        filename: `asset-${Math.random().toString(36).slice(2)}.png`,
        originalName: 'asset.png',
        mimeType: 'image/png',
        fileSize: 128,
        // Deliberately a path that does not exist on disk: the handler tolerates
        // a missing file so the row is still removed.
        filePath: `tokens/missing-${Math.random().toString(36).slice(2)}.png`,
        type: AssetType.TOKEN,
        scope: opts.scope,
        uploadedById: opts.uploadedById,
        campaignId: opts.campaignId ?? null,
      },
    });
  }

  beforeAll(async () => {
    const stamp = Date.now();
    const admin = await createTestUser({ email: `ad_${stamp}@test.invalid`, isApproved: true, role: 'ADMIN' });
    const manager = await createTestUser({ email: `mgr_${stamp}@test.invalid`, isApproved: true });
    const stranger = await createTestUser({ email: `str_${stamp}@test.invalid`, isApproved: true });
    const dm = await createTestUser({ email: `dm_${stamp}@test.invalid`, isApproved: true });

    adminId = admin.id;
    managerId = manager.id;
    strangerId = stranger.id;
    dmId = dm.id;

    // The permission under test.
    await prisma.user.update({ where: { id: managerId }, data: { globalAssetManager: true } });

    const campaign = await createTestCampaign(dmId);
    campaignId = campaign.id;
    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: CampaignRole.DM },
        { campaignId, userId: strangerId, role: CampaignRole.PLAYER },
      ],
    });

    adminAgent = await login(`ad_${stamp}@test.invalid`);
    managerAgent = await login(`mgr_${stamp}@test.invalid`);
    strangerAgent = await login(`str_${stamp}@test.invalid`);
    dmAgent = await login(`dm_${stamp}@test.invalid`);
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({
      where: { uploadedById: { in: [adminId, managerId, strangerId, dmId] } },
    });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([adminId, managerId, strangerId, dmId]);
    await prisma.$disconnect();
  });

  describe('GLOBAL assets', () => {
    // The regression. Before the fix this returned 403: the flag was never
    // read for an owner, so the `isOwner && isGlobalAssetManager` rule could
    // not be satisfied by anyone except an admin.
    it('lets a global asset manager delete their own global asset', async () => {
      const asset = await makeAsset({ scope: AssetScope.GLOBAL, uploadedById: managerId });

      const res = await managerAgent.delete(`/api/assets/${asset.id}`);

      expect(res.status).toBe(200);
      expect(await prisma.asset.findUnique({ where: { id: asset.id } })).toBeNull();
    });

    it('lets an admin delete anyone\'s global asset', async () => {
      const asset = await makeAsset({ scope: AssetScope.GLOBAL, uploadedById: managerId });

      const res = await adminAgent.delete(`/api/assets/${asset.id}`);

      expect(res.status).toBe(200);
    });

    // The rule is deliberately narrow: the flag lets you manage your own global
    // uploads, not sweep away another manager's.
    it('refuses a global asset manager deleting someone else\'s global asset', async () => {
      const asset = await makeAsset({ scope: AssetScope.GLOBAL, uploadedById: adminId });

      const res = await managerAgent.delete(`/api/assets/${asset.id}`);

      expect(res.status).toBe(403);
      expect(await prisma.asset.findUnique({ where: { id: asset.id } })).not.toBeNull();
    });

    it('refuses an ordinary user without the flag, even for their own', async () => {
      const asset = await makeAsset({ scope: AssetScope.GLOBAL, uploadedById: strangerId });

      const res = await strangerAgent.delete(`/api/assets/${asset.id}`);

      expect(res.status).toBe(403);
    });

    it('stops a former manager once the flag is revoked', async () => {
      const asset = await makeAsset({ scope: AssetScope.GLOBAL, uploadedById: managerId });

      await prisma.user.update({ where: { id: managerId }, data: { globalAssetManager: false } });
      const denied = await managerAgent.delete(`/api/assets/${asset.id}`);
      expect(denied.status).toBe(403);

      await prisma.user.update({ where: { id: managerId }, data: { globalAssetManager: true } });
      const allowed = await managerAgent.delete(`/api/assets/${asset.id}`);
      expect(allowed.status).toBe(200);
    });
  });

  describe('USER assets', () => {
    it('lets the owner delete their own', async () => {
      const asset = await makeAsset({ scope: AssetScope.USER, uploadedById: strangerId });
      const res = await strangerAgent.delete(`/api/assets/${asset.id}`);
      expect(res.status).toBe(200);
    });

    it('refuses another user', async () => {
      const asset = await makeAsset({ scope: AssetScope.USER, uploadedById: strangerId });
      const res = await dmAgent.delete(`/api/assets/${asset.id}`);
      expect(res.status).toBe(404);
    });

    // The flag is about global assets; it must not leak into personal ones.
    it('does not let a global asset manager delete someone else\'s personal asset', async () => {
      const asset = await makeAsset({ scope: AssetScope.USER, uploadedById: strangerId });
      const res = await managerAgent.delete(`/api/assets/${asset.id}`);
      expect(res.status).toBe(404);
    });

    it('lets an admin delete it', async () => {
      const asset = await makeAsset({ scope: AssetScope.USER, uploadedById: strangerId });
      const res = await adminAgent.delete(`/api/assets/${asset.id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('CAMPAIGN assets', () => {
    it('lets the uploader delete their own', async () => {
      const asset = await makeAsset({ scope: AssetScope.CAMPAIGN, uploadedById: strangerId, campaignId });
      const res = await strangerAgent.delete(`/api/assets/${asset.id}`);
      expect(res.status).toBe(200);
    });

    it('lets the campaign DM delete a member\'s upload', async () => {
      const asset = await makeAsset({ scope: AssetScope.CAMPAIGN, uploadedById: strangerId, campaignId });
      const res = await dmAgent.delete(`/api/assets/${asset.id}`);
      expect(res.status).toBe(200);
    });

    it('refuses someone outside the campaign', async () => {
      const asset = await makeAsset({ scope: AssetScope.CAMPAIGN, uploadedById: strangerId, campaignId });
      const res = await managerAgent.delete(`/api/assets/${asset.id}`);
      expect(res.status).toBe(404);
    });
  });

  it('404s for an asset that does not exist', async () => {
    const res = await adminAgent.delete('/api/assets/2f1c8e5a-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});

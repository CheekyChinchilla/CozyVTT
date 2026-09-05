/**
 * Reading map and token images used in a campaign — End-to-End Tests
 *
 * Reported from a live game: a player opening the campaign saw "Failed to load
 * map image", and token art fell back to plain initial circles.
 *
 * Both were the same 403. A USER-scoped asset is readable only by whoever
 * uploaded it, and nothing about *using* one as a campaign's map changed that.
 * A DM who picked a map out of their own asset library — which the picker
 * offers, since it lists assets with no campaign filter — produced a campaign
 * whose battlemap no player could load.
 *
 * The rule pinned here is that access follows **use**: if a map, a token on a
 * map, a character, or a campaign template in your campaign references an
 * asset, you may read that asset. Nothing is re-scoped, because scope holds a
 * single campaignId and one asset is commonly shared by several campaigns.
 *
 * This widens READ only. Deleting somebody else's asset stays refused, and a
 * stranger to the campaign is refused exactly as before.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-asset-access-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

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

/** A tiny valid PNG, written to disk so the route has something to send. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

describe('assets used in a campaign', () => {
  let dmId: string;
  let playerId: string;
  let strangerId: string;
  let campaignId: string;
  let mapId: string;

  let mapAssetId: string;
  let tokenAssetId: string;
  let characterAssetId: string;
  let unusedAssetId: string;

  let dm: ReturnType<typeof request.agent>;
  let player: ReturnType<typeof request.agent>;
  let stranger: ReturnType<typeof request.agent>;

  /** A USER-scoped asset owned by the DM, with a real file behind it. */
  async function makeAsset(type: 'MAP' | 'TOKEN', label: string) {
    const filePath = path.join(UPLOAD_DIR, `${label}.png`);
    fs.writeFileSync(filePath, PNG);
    const asset = await prisma.asset.create({
      data: {
        type,
        scope: 'USER',
        uploadedById: dmId,
        filename: `${label}.png`,
        originalName: `${label}.png`,
        mimeType: 'image/png',
        fileSize: PNG.length,
        filePath,
        name: label,
      },
    });
    return asset.id;
  }

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  };

  beforeAll(async () => {
    const stamp = Date.now();
    const dmEmail = `aa_dm_${stamp}@test.invalid`;
    const playerEmail = `aa_pl_${stamp}@test.invalid`;
    const strangerEmail = `aa_st_${stamp}@test.invalid`;

    dmId = (await createTestUser({ email: dmEmail, isApproved: true })).id;
    playerId = (await createTestUser({ email: playerEmail, isApproved: true })).id;
    strangerId = (await createTestUser({ email: strangerEmail, isApproved: true })).id;

    campaignId = (await createTestCampaign(dmId, { name: `Asset Access ${stamp}` })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: 'DM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
      ],
    });

    mapAssetId = await makeAsset('MAP', 'battlemap');
    tokenAssetId = await makeAsset('TOKEN', 'goblin');
    characterAssetId = await makeAsset('TOKEN', 'portrait');
    unusedAssetId = await makeAsset('MAP', 'private-notes-map');

    const map = await prisma.map.create({
      data: {
        campaignId,
        name: 'The Ravine',
        imageUrl: `/api/assets/maps/${mapAssetId}`,
        baseLayerUrl: `/api/assets/maps/${mapAssetId}`,
        width: 20,
        height: 16,
        gridSize: 50,
        annotations: [],
        tokens: [
          {
            id: 'tok-goblin',
            characterId: null,
            name: 'Goblin',
            imageUrl: `/api/assets/tokens/${tokenAssetId}`,
            position: { x: 1, y: 1 },
            size: { width: 1, height: 1 },
            layer: 'token',
            visible: true,
            controlledBy: null,
            rotation: 0,
            conditions: [],
            metadata: {},
            type: 'npc',
            disposition: 'hostile',
            hp: null,
            showHpBar: false,
            notes: '',
          },
        ],
      },
    });
    mapId = map.id;

    await prisma.character.create({
      data: {
        userId: playerId,
        campaignId,
        name: 'Aldra',
        tokenImageUrl: `/api/assets/tokens/${characterAssetId}`,
        data: {},
      },
    });

    dm = await login(dmEmail);
    player = await login(playerEmail);
    stranger = await login(strangerEmail);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { campaignId } });
    await prisma.map.deleteMany({ where: { campaignId } });
    await prisma.asset.deleteMany({
      where: { id: { in: [mapAssetId, tokenAssetId, characterAssetId, unusedAssetId] } },
    });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId, strangerId]);
    await prisma.$disconnect();
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  });

  describe('a player in the campaign', () => {
    // The reported bug: "Failed to load map image".
    it('can read the map image the campaign map uses', async () => {
      expect((await player.get(`/api/assets/maps/${mapAssetId}`)).status).toBe(200);
    });

    // The other half: token art silently fell back to initial circles.
    it('can read the art of a token placed on a campaign map', async () => {
      expect((await player.get(`/api/assets/tokens/${tokenAssetId}`)).status).toBe(200);
    });

    it("can read the token art of a character in the campaign", async () => {
      expect((await player.get(`/api/assets/tokens/${characterAssetId}`)).status).toBe(200);
    });

    it("cannot read an asset of the DM's that the campaign does not use", async () => {
      expect((await player.get(`/api/assets/maps/${unusedAssetId}`)).status).toBe(403);
    });

    // Reading is all this grants.
    it('still cannot delete an asset it did not upload', async () => {
      expect((await player.delete(`/api/assets/${mapAssetId}`)).status).toBe(403);
    });
  });

  /**
   * "Used in a campaign you belong to" has to mean used *legitimately*.
   *
   * The first version of this rule accepted any row that referenced the asset,
   * and nothing stops a user creating a campaign of their own and a map whose
   * `imageUrl` merely names somebody else's asset id — the map route formats
   * that string but never checks it. So referencing an asset granted the right
   * to read it, which is the whole permission back to front.
   *
   * The rule now also requires the asset's owner to be in the campaign doing
   * the referencing: you may see an asset because someone who has it brought it
   * somewhere you both are.
   */
  describe('a campaign of your own does not grant access to a stranger\'s asset', () => {
    let strangerCampaignId: string;

    afterEach(async () => {
      if (strangerCampaignId) {
        await prisma.map.deleteMany({ where: { campaignId: strangerCampaignId } });
        await cleanupCampaigns([strangerCampaignId]);
      }
    });

    it('refuses an asset merely named by a map the requester made', async () => {
      // Established first: with no legitimate route, the answer is 403.
      expect((await stranger.get(`/api/assets/maps/${mapAssetId}`)).status).toBe(403);

      const campaign = await createTestCampaign(strangerId, { name: `Stranger own ${Date.now()}` });
      strangerCampaignId = campaign.id;
      await prisma.campaignMembership.create({
        data: { campaignId: strangerCampaignId, userId: strangerId, role: 'DM', characterIds: [] },
      });

      // Reference the victim's asset from a map in the attacker's own campaign.
      const created = await stranger
        .post(`/api/campaigns/${strangerCampaignId}/maps`)
        .send({ name: 'Borrowed', imageUrl: mapAssetId, width: 10, height: 10, gridSize: 50 });

      // Either the write is refused, or the read still is. Both are acceptable
      // outcomes; what must not happen is the asset becoming readable.
      expect((await stranger.get(`/api/assets/maps/${mapAssetId}`)).status).toBe(403);
      expect([201, 400, 403]).toContain(created.status);
    });

    it('refuses to store a map pointing at an asset the creator cannot read', async () => {
      const campaign = await createTestCampaign(strangerId, { name: `Stranger write ${Date.now()}` });
      strangerCampaignId = campaign.id;
      await prisma.campaignMembership.create({
        data: { campaignId: strangerCampaignId, userId: strangerId, role: 'DM', characterIds: [] },
      });

      const res = await stranger
        .post(`/api/campaigns/${strangerCampaignId}/maps`)
        .send({ name: 'Borrowed', imageUrl: mapAssetId, width: 10, height: 10, gridSize: 50 });

      expect(res.status).toBe(403);
    });
  });

  describe('someone outside the campaign', () => {
    it('is still refused the map image', async () => {
      expect((await stranger.get(`/api/assets/maps/${mapAssetId}`)).status).toBe(403);
    });

    it('is still refused the token art', async () => {
      expect((await stranger.get(`/api/assets/tokens/${tokenAssetId}`)).status).toBe(403);
    });
  });

  describe('the owner', () => {
    it('reads their own asset as before', async () => {
      expect((await dm.get(`/api/assets/maps/${mapAssetId}`)).status).toBe(200);
    });

    it('reads their own unused asset as before', async () => {
      expect((await dm.get(`/api/assets/maps/${unusedAssetId}`)).status).toBe(200);
    });
  });

  describe('when the campaign stops using the asset', () => {
    it('the player loses access again', async () => {
      await prisma.map.update({
        where: { id: mapId },
        data: {
          imageUrl: '/api/assets/maps/some-other-asset',
          baseLayerUrl: '/api/assets/maps/some-other-asset',
        },
      });

      expect((await player.get(`/api/assets/maps/${mapAssetId}`)).status).toBe(403);
    });
  });
});

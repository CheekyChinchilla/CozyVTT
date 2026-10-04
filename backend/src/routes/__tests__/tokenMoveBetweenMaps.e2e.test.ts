/**
 * Moving tokens between maps, and writing a map's tokens under load.
 *
 * A move used to be a copy to the target map followed by a delete from the
 * source, one pair of requests per token, all fired at once. Both routes
 * read the map's token list, changed it in memory and wrote the whole list
 * back with nothing serialising them, so parallel requests overwrote each
 * other: every request answered success while some tokens ended on neither
 * map and others on both. The copy also gave the token a new id (a combatant
 * dropped out of the order) and, through the create route's defaults, handed
 * a character's token back to its owner after the DM had taken control away.
 *
 * One request now moves a set of tokens in one transaction under a lock on
 * both maps, keeping each token exactly as stored; and every write to a
 * map's tokens takes that lock, so parallel adds and deletes keep every
 * token.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { readTokens } from '../../utils/prisma-json';
import { getState, setState, clearState } from '../../websocket/initiativeState';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

describe('tokens between maps', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let sourceId: string;
  let targetId: string;
  let dm: ReturnType<typeof request.agent>;

  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {} };
  const tokensOf = async (mapId: string) => {
    const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    return readTokens(row.tokens);
  };
  const seedSource = () =>
    prisma.map.update({
      where: { id: sourceId },
      data: {
        tokens: [
          // A character's token whose controller the DM set to none, with a
          // stat block written before token validation existed.
          { ...base, id: 'aldra', name: 'Aldra', position: { x: 18, y: 14 }, size: { width: 2, height: 2 }, controlledBy: null, characterId: null, statBlock: { ac: 12, abilities: { str: 99 } }, hp: { current: 3, max: 30, temp: 0 } },
          { ...base, id: 'goblin', name: 'Goblin', position: { x: 2, y: 2 }, controlledBy: null },
          { ...base, id: 'stays', name: 'Stays', position: { x: 3, y: 3 }, controlledBy: playerId },
        ],
      },
    });

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Move DM' });
    const playerUser = await createTestUser({ displayName: 'Move Player' });
    dmId = dmUser.id;
    playerId = playerUser.id;
    campaignId = (await createTestCampaign(dmId, { name: 'Token Moves' })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: dmId, campaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
    const mapData = (name: string, width: number, height: number) => ({
      campaignId, name, imageUrl: '/api/assets/maps/placeholder', baseLayerUrl: '/api/assets/maps/placeholder',
      width, height, gridSize: 50, annotations: [], tokens: [],
    });
    sourceId = (await prisma.map.create({ data: mapData('Source', 20, 16) })).id;
    targetId = (await prisma.map.create({ data: mapData('Target', 10, 10) })).id;
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: sourceId } });
    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
  });

  beforeEach(async () => {
    clearState(campaignId);
    await seedSource();
    await prisma.map.update({ where: { id: targetId }, data: { tokens: [] } });
  });

  afterAll(async () => {
    clearState(campaignId);
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
    await prisma.map.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId]);
    await prisma.$disconnect();
  });

  const move = (tokenIds: string[], targetMapId = targetId) =>
    dm.post(`/api/campaigns/${campaignId}/maps/${sourceId}/tokens/move`).send({ tokenIds, targetMapId });

  describe('POST /maps/:id/tokens/move', () => {
    it('moves the tokens as they are stored, under their own ids, and clamps them onto the target', async () => {
      const res = await move(['aldra', 'goblin']);
      expect(res.status).toBe(200);
      expect(res.body.moved.map((t: { id: string }) => t.id).sort()).toEqual(['aldra', 'goblin']);

      const target = await tokensOf(targetId);
      const aldra = target.find((t) => t.id === 'aldra');
      expect(aldra).toMatchObject({
        controlledBy: null,
        statBlock: { ac: 12, abilities: { str: 99 } },
        hp: { current: 3, max: 30, temp: 0 },
        // 18,14 on a 20x16 map; a 2x2 token on a 10x10 map fits at 8,8 at most.
        position: { x: 8, y: 8 },
      });
      expect(target.find((t) => t.id === 'goblin')?.position).toEqual({ x: 2, y: 2 });
      expect((await tokensOf(sourceId)).map((t) => t.id)).toEqual(['stays']);
    });

    it('moves nothing when a token named is not on the map', async () => {
      const res = await move(['goblin', 'missing']);
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/missing/);
      expect((await tokensOf(sourceId)).map((t) => t.id).sort()).toEqual(['aldra', 'goblin', 'stays']);
      expect(await tokensOf(targetId)).toEqual([]);
    });

    it('refuses a target outside the campaign, and the map itself', async () => {
      const other = await createTestCampaign(dmId, { name: 'Elsewhere' });
      const foreign = await prisma.map.create({
        data: { campaignId: other.id, name: 'Foreign', imageUrl: '/x', baseLayerUrl: '/x', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
      });
      try {
        expect((await move(['goblin'], foreign.id)).status).toBe(404);
        expect((await move(['goblin'], sourceId)).status).toBe(400);
        expect((await tokensOf(sourceId)).some((t) => t.id === 'goblin')).toBe(true);
      } finally {
        await prisma.map.deleteMany({ where: { campaignId: other.id } });
        await cleanupCampaigns([other.id]);
      }
    });

    it('takes a combatant along, so the order follows the token to its new map', async () => {
      setState(campaignId, {
        active: false,
        currentTokenId: null,
        round: 1,
        combatants: [{ tokenId: 'goblin', mapId: sourceId, name: 'Goblin', imageUrl: '', initiative: 12, hp: null, type: 'npc', disposition: null }],
      } as never);
      expect((await move(['goblin'])).status).toBe(200);
      expect(getState(campaignId).combatants[0]).toMatchObject({ tokenId: 'goblin', mapId: targetId });
    });

    it('is the DM\'s alone', async () => {
      const playerUser = await prisma.user.findUniqueOrThrow({ where: { id: playerId } });
      const player = request.agent(app);
      await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD });
      const res = await player.post(`/api/campaigns/${campaignId}/maps/${sourceId}/tokens/move`).send({ tokenIds: ['stays'], targetMapId: targetId });
      expect(res.status).toBe(403);
    });
  });

  describe('a map\'s tokens under parallel writes', () => {
    it('keeps every token when ten are added at once', async () => {
      await prisma.map.update({ where: { id: targetId }, data: { tokens: [] } });
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          dm.post(`/api/campaigns/${campaignId}/maps/${targetId}/tokens`).send({ name: `Rat ${i}`, position: { x: i, y: 0 } })
        )
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect((await tokensOf(targetId)).length).toBe(10);
    });

    it('keeps the rest when several are deleted at once', async () => {
      await prisma.map.update({
        where: { id: targetId },
        data: { tokens: Array.from({ length: 10 }, (_, i) => ({ ...base, id: `rat-${i}`, name: `Rat ${i}`, position: { x: i, y: 0 }, controlledBy: null })) },
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => dm.delete(`/api/campaigns/${campaignId}/maps/${targetId}/tokens/rat-${i}`))
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect((await tokensOf(targetId)).map((t) => t.id).sort()).toEqual(['rat-5', 'rat-6', 'rat-7', 'rat-8', 'rat-9']);
    });
  });
});

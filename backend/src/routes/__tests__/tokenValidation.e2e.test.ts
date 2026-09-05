/**
 * What a map token will accept into its JSON column — End-to-End Tests
 *
 * Tokens are not rows; they are JSON on `Map.tokens`. The create route
 * hand-checked name, position, layer, type, disposition and display mode, then
 * took `hp`, `size`, `statBlock`, `conditions` and `metadata` exactly as sent.
 * The update route gated those fields by role but validated none of them.
 *
 * The token *template* route has always validated the same shapes, so the
 * schemas existed; the map routes simply never used them. Nothing in the app's
 * own UI sends a bad shape, which is why this went unseen — but CLAUDE.md's
 * threat model is that any authenticated user may be hostile, and a DM is
 * authenticated. Types are erased at runtime, so the schema is the only thing
 * actually standing here.
 *
 * The visible consequence was HP written in the character-sheet shape
 * (`{current, maximum, temporary}`) being stored happily and then rendered as
 * "8/undefined" by every token reader, all of which read `hp.max`.
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

describe('map token validation', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let mapId: string;
  let dm: ReturnType<typeof request.agent>;
  let player: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Token Validation DM' });
    dmId = dmUser.id;
    const campaign = await createTestCampaign(dmId, { name: 'Token Validation' });
    campaignId = campaign.id;

    // createTestCampaign records the owner but not the membership the DM route
    // guard reads, so the role has to be granted explicitly.
    await prisma.campaignMembership.create({
      data: { userId: dmId, campaignId, role: 'DM', characterIds: [] },
    });

    const playerUser = await createTestUser({ displayName: 'Token Validation Player' });
    playerId = playerUser.id;
    await prisma.campaignMembership.create({
      data: { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    });

    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });

    player = request.agent(app);
    await player.post('/api/auth/login').send({
      email: playerUser.email,
      password: TEST_PASSWORD,
    });

    const map = await prisma.map.create({
      data: {
        campaignId,
        name: 'Validation Map',
        imageUrl: '/api/assets/maps/placeholder',
        baseLayerUrl: '/api/assets/maps/placeholder',
        width: 20,
        height: 16,
        gridSize: 50,
        tokens: [],
        annotations: [],
      },
    });
    mapId = map.id;
  });

  afterAll(async () => {
    await prisma.map.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId]);
    await prisma.$disconnect();
  });

  const place = (body: Record<string, unknown>) =>
    dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({
      name: 'Test Token',
      position: { x: 1, y: 1 },
      ...body,
    });

  describe('hit points', () => {
    it('accepts the token HP shape', async () => {
      const res = await place({ hp: { current: 7, max: 7, temp: 0 } });
      expect(res.status).toBe(201);
      expect(res.body.token.hp).toEqual({ current: 7, max: 7, temp: 0 });
    });

    it('rejects the character-sheet HP shape', async () => {
      // The exact mistake that produced "8/undefined" on every reader.
      const res = await place({ hp: { current: 8, maximum: 8, temporary: 0 } });
      expect(res.status).toBe(400);
    });

    it.each([
      ['a string maximum', { current: 1, max: 'lots', temp: 0 }],
      ['a negative current', { current: -5, max: 10, temp: 0 }],
      ['a zero maximum', { current: 0, max: 0, temp: 0 }],
      ['a missing field', { current: 5, max: 10 }],
      ['not an object', 'healthy'],
      ['an absurd maximum', { current: 1, max: 10_000_000, temp: 0 }],
    ])('rejects %s', async (_label, hp) => {
      expect((await place({ hp })).status).toBe(400);
    });

    it('still accepts a token with no hit points at all', async () => {
      const res = await place({ hp: null });
      expect(res.status).toBe(201);
      expect(res.body.token.hp).toBeNull();
    });
  });

  describe('size', () => {
    it('accepts a legitimate size', async () => {
      expect((await place({ size: { width: 2, height: 2 } })).status).toBe(201);
    });

    it.each([
      ['zero width', { width: 0, height: 1 }],
      ['a fractional size', { width: 1.5, height: 1 }],
      ['an enormous size', { width: 500, height: 500 }],
      ['a missing dimension', { width: 2 }],
    ])('rejects %s', async (_label, size) => {
      expect((await place({ size })).status).toBe(400);
    });
  });

  describe('conditions', () => {
    it('accepts a list of conditions', async () => {
      const res = await place({ conditions: ['Prone', 'Poisoned'] });
      expect(res.status).toBe(201);
      expect(res.body.token.conditions).toEqual(['Prone', 'Poisoned']);
    });

    it('drops blank entries rather than storing an empty chip', async () => {
      const res = await place({ conditions: ['Prone', '   '] });
      expect(res.status).toBe(400);
    });

    it('rejects a condition long enough to be used as storage', async () => {
      expect((await place({ conditions: ['x'.repeat(500)] })).status).toBe(400);
    });

    it('rejects conditions that are not strings', async () => {
      expect((await place({ conditions: [{ name: 'Prone' }] })).status).toBe(400);
    });
  });

  describe('updating a token', () => {
    let tokenId: string;

    beforeAll(async () => {
      const res = await place({ name: 'Updatable', hp: { current: 5, max: 5, temp: 0 } });
      tokenId = res.body.token.id;
    });

    const update = (body: Record<string, unknown>) =>
      dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`).send(body);

    it('accepts a valid HP update', async () => {
      const res = await update({ hp: { current: 2, max: 5, temp: 0 } });
      expect(res.status).toBe(200);
      expect(res.body.token.hp).toEqual({ current: 2, max: 5, temp: 0 });
    });

    it('rejects the character-sheet HP shape on update too', async () => {
      expect((await update({ hp: { current: 2, maximum: 5, temporary: 0 } })).status).toBe(400);
    });

    it('rejects a malformed size on update', async () => {
      expect((await update({ size: { width: 0, height: 0 } })).status).toBe(400);
    });

    it('leaves the stored token untouched when an update is rejected', async () => {
      await update({ hp: { current: 9, maximum: 9 } });
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      const token = after.body.map.tokens.find((t: { id: string }) => t.id === tokenId);
      expect(token.hp).toEqual({ current: 2, max: 5, temp: 0 });
    });

    /**
     * The metadata limit bounds the column, not the request.
     *
     * An update merges into what the token already holds, so checking only the
     * incoming patch left the stored object free to grow: every request stayed
     * under 8KB on its own while the total climbed past it, one new key at a
     * time.
     */
    describe('metadata size', () => {
      // Comfortably under 8KB alone; four of them together are over it.
      const chunk = (key: string) => ({ [key]: 'x'.repeat(2500) });

      it('accepts metadata within the limit', async () => {
        expect((await update({ metadata: chunk('a') })).status).toBe(200);
      });

      it('refuses a patch that pushes the stored total over the limit', async () => {
        expect((await update({ metadata: chunk('b') })).status).toBe(200);
        expect((await update({ metadata: chunk('c') })).status).toBe(200);

        const res = await update({ metadata: chunk('d') });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/metadata/i);
      });

      it('leaves the stored metadata as it was when the merge is refused', async () => {
        const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
        const token = after.body.map.tokens.find((t: { id: string }) => t.id === tokenId);
        expect(Object.keys(token.metadata).sort()).toEqual(['a', 'b', 'c']);
      });
    });

    it('stores the checked stat block rather than what was sent', async () => {
      // The schema normalises save and skill keys by trimming them. Storing the
      // raw body kept the untrimmed key, so the same save could be written twice
      // under names that only differ by whitespace — and the update route was
      // the one place doing it, while the create route stored what it checked.
      const res = await update({
        statBlock: {
          ac: 14,
          speed: '30 ft.',
          abilities: { str: 10, dex: 12, con: 11, int: 10, wis: 10, cha: 10 },
          savingThrows: { '  dex  ': 3 },
        },
      });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.token.statBlock.savingThrows)).toEqual(['dex']);
    });
  });

  /**
   * What a player may change on a token they control.
   *
   * `metadata` was not on the DM-only list, so any campaign member controlling a
   * token could write arbitrary data into the map's JSON. Nothing reads it
   * structurally and nothing player-facing writes it, so it was a write-only
   * channel into the database that served no purpose.
   */
  describe('a player controlling a token', () => {
    let ownedTokenId: string;

    beforeAll(async () => {
      const res = await place({ name: 'Player Token', controlledBy: playerId });
      ownedTokenId = res.body.token.id;
    });

    const playerUpdate = (body: Record<string, unknown>) =>
      player.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${ownedTokenId}`).send(body);

    it('may move it', async () => {
      // Establishes that the refusal below is about the field, not the token:
      // the player really can update this one.
      expect((await playerUpdate({ position: { x: 4, y: 4 } })).status).toBe(200);
    });

    it('may not write metadata', async () => {
      const res = await playerUpdate({ metadata: { anything: 'at all' } });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/metadata/);
    });

    it('may not write a stat block either', async () => {
      expect((await playerUpdate({ statBlock: null })).status).toBe(403);
    });

    it('leaves the stored metadata untouched when refused', async () => {
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      const token = after.body.map.tokens.find((t: { id: string }) => t.id === ownedTokenId);
      expect(token.metadata).toEqual({});
    });
  });
});

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

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { readTokens, toJson } from '../../utils/prisma-json';
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
  let spectatorId: string;
  let dm: ReturnType<typeof request.agent>;
  let player: ReturnType<typeof request.agent>;
  let spectator: ReturnType<typeof request.agent>;

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

    const spectatorUser = await createTestUser({ displayName: 'Token Validation Spectator' });
    spectatorId = spectatorUser.id;
    await prisma.campaignMembership.create({
      data: { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    });

    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });

    player = request.agent(app);
    await player.post('/api/auth/login').send({
      email: playerUser.email,
      password: TEST_PASSWORD,
    });

    spectator = request.agent(app);
    await spectator.post('/api/auth/login').send({
      email: spectatorUser.email,
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
    // The campaign is showing this map: a player is sent the current map only.
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  });

  afterAll(async () => {
    await prisma.map.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId, spectatorId]);
    await prisma.$disconnect();
  });

  const place = (body: Record<string, unknown>) =>
    dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({
      name: 'Test Token',
      position: { x: 1, y: 1 },
      ...body,
    });

  /**
   * Sight radius: how far a token makes things out in the dark, in grid
   * squares. 0 means none. It decides what the server sends a player, so a
   * player cannot set it on their own token; the DM can.
   */
  describe('sight radius', () => {
    it('stores the radius the DM gives a new token', async () => {
      const res = await place({ sightRadius: 12 });
      expect(res.status).toBe(201);
      expect(res.body.token.sightRadius).toBe(12);
    });

    it('defaults to 0 (none) when omitted', async () => {
      const res = await place({});
      expect(res.status).toBe(201);
      expect(res.body.token.sightRadius).toBe(0);
    });

    it.each([['negative', -1], ['not a number', 'far'], ['over the cap', 201]])('rejects a radius that is %s', async (_label, sightRadius) => {
      const res = await place({ sightRadius });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/sightRadius/);
    });

    it('lets the DM change it, and refuses a player', async () => {
      const created = await place({ controlledBy: playerId, sightRadius: 0 });
      expect(created.status).toBe(201);
      const tokenId = created.body.token.id;

      const byPlayer = await player.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`).send({ sightRadius: 12 });
      expect(byPlayer.status).toBe(403);

      const byDm = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`).send({ sightRadius: 12 });
      expect(byDm.status).toBe(200);
      expect(byDm.body.token.sightRadius).toBe(12);
    });
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

    // Size decides how far a token sees of its own accord: the visibility rule
    // lights half the token's footprint around it, so a player who could set
    // size 10 would grant themself a five-square sight disc the DM never gave.
    it('may not resize it', async () => {
      const res = await playerUpdate({ size: { width: 10, height: 10 } });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/size/);
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      const token = after.body.map.tokens.find((t: { id: string }) => t.id === ownedTokenId);
      expect(token.size).toEqual({ width: 1, height: 1 });
    });

    it('the DM may resize it', async () => {
      const res = await dm
        .put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${ownedTokenId}`)
        .send({ size: { width: 2, height: 2 } });
      expect(res.status).toBe(200);
      expect(res.body.token.size).toEqual({ width: 2, height: 2 });
    });

    // The reply carries the map, and it used to be the stored row: every
    // token, hidden ones included, with the DM's notes, stat blocks and hit
    // points, the fog grid and the spirit layer's address. A player moving
    // their own token could read all of it. The reply is now filtered exactly
    // as the map fetch is.
    it('is answered with the map as this player may see it, not the stored row', async () => {
      const hidden = await place({
        name: 'Ambusher', position: { x: 9, y: 9 }, visible: false, notes: 'secret ambusher',
        hp: { current: 7, max: 7, temp: 0 }, showHpBar: false,
      });
      const seen = await place({
        name: 'Cultist', position: { x: 8, y: 8 }, notes: 'a note for the DM',
        hp: { current: 9, max: 9, temp: 0 }, showHpBar: false, sightRadius: 12,
      });
      expect(hidden.status).toBe(201);
      expect(seen.status).toBe(201);
      const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
      const withBlocks = readTokens(row.tokens).map((t) =>
        t.id === seen.body.token.id ? { ...t, statBlock: { ac: 13 } } : t
      );
      await prisma.map.update({
        where: { id: mapId },
        data: {
          tokens: toJson(withBlocks),
          spiritLayerUrl: '/api/assets/maps/spirit-secret',
          fogData: { fogCols: 1, fogRows: 1, cellPx: 50, revealed: [false] },
        },
      });

      const res = await playerUpdate({ position: { x: 5, y: 5 } });
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      const ids = res.body.map.tokens.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(hidden.body.token.id);
      expect(ids).toContain(seen.body.token.id);
      expect(text).not.toContain('secret ambusher');
      expect(text).not.toContain('a note for the DM');
      expect(text).not.toContain('statBlock');
      expect(text).not.toContain('spirit-secret');
      const cultist = res.body.map.tokens.find((t: { id: string }) => t.id === seen.body.token.id);
      expect(cultist.hp).toBeUndefined();
      expect(cultist.sightRadius).toBeUndefined();
      expect(res.body.map.fogData).toBeNull();
      expect(res.body.map.spiritLayerUrl).toBeNull();
      expect(res.body.token.id).toBe(ownedTokenId);
      expect(res.body.token.position).toEqual({ x: 5, y: 5 });
      expect(res.body.token).not.toHaveProperty('notes');
    });

    // Obscuring hides what a token is from everyone who does not control it.
    // Only the DM decides that, and the mask is applied before sending, so
    // the player's own fetch is the proof.
    // The client greys the drag out while the session is paused or ended;
    // the server now holds the same line, over REST as over the socket.
    describe('while the session is paused or ended', () => {
      const url = () => `/api/campaigns/${campaignId}/maps/${mapId}/tokens/${ownedTokenId}`;
      const positionNow = async () => {
        const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
        return after.body.map.tokens.find((t: { id: string }) => t.id === ownedTokenId).position;
      };

      afterAll(async () => {
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } });
      });

      it.each(['PAUSED', 'INACTIVE'] as const)("refuses the player's move while %s, and the DM's goes through", async (status) => {
        await prisma.campaign.update({ where: { id: campaignId }, data: { status } });
        const before = await positionNow();
        const res = await playerUpdate({ position: { x: 2, y: 2 } });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/paused|session/i);
        expect(await positionNow()).toEqual(before);
        expect((await dm.put(url()).send({ position: before })).status).toBe(200);
      });

      it('lets the player move again once the session is live', async () => {
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } });
        expect((await playerUpdate({ position: { x: 4, y: 4 } })).status).toBe(200);
      });
    });

    describe('an obscured token', () => {
      let veiledId: string;

      beforeAll(async () => {
        const res = await place({
          name: 'Something Large', position: { x: 12, y: 12 }, hp: { current: 30, max: 30, temp: 0 }, showHpBar: true,
          conditions: ['prone'], disposition: 'hostile',
        });
        veiledId = res.body.token.id;
      });

      it('may not be set by a player, even on their own token', async () => {
        const res = await playerUpdate({ obscured: true });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/obscured/);
      });

      it('must be a boolean', async () => {
        const res = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${veiledId}`).send({ obscured: 'yes' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/obscured/);
      });

      it('is set by the DM, and reaches the player as a shape with no identity', async () => {
        const set = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${veiledId}`).send({ obscured: true });
        expect(set.status).toBe(200);
        expect(set.body.token.obscured).toBe(true);
        expect(set.body.token.name).toBe('Something Large');

        const seen = await player.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
        const veiled = seen.body.map.tokens.find((t: { id: string }) => t.id === veiledId);
        expect(veiled).toBeDefined();
        expect(veiled.obscured).toBe(true);
        expect(veiled.name).toBe('');
        expect(veiled.imageUrl).toBe('');
        expect(veiled.hp).toBeNull();
        expect(veiled.conditions).toEqual([]);
        expect(veiled.disposition).toBeNull();
        expect(veiled.position).toEqual({ x: 12, y: 12 });
        expect(JSON.stringify(seen.body)).not.toContain('Something Large');
      });

      it('hides who controls it and what kind of token it is from everyone but its controller', async () => {
        const placed = await place({
          name: 'Disguised Rogue', type: 'player', controlledBy: playerId, position: { x: 13, y: 13 }, rotation: 90,
        });
        expect(placed.status).toBe(201);
        const rogueId = placed.body.token.id;
        const set = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${rogueId}`).send({ obscured: true });
        expect(set.status).toBe(200);

        const seenByOther = await spectator.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
        const toOther = seenByOther.body.map.tokens.find((t: { id: string }) => t.id === rogueId);
        expect(toOther).toBeDefined();
        expect(toOther.controlledBy).toBeNull();
        expect(toOther.type).toBe('npc');
        expect(toOther.rotation).toBe(0);
        expect(JSON.stringify(toOther)).not.toContain(playerId);

        const seenByController = await player.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
        const toController = seenByController.body.map.tokens.find((t: { id: string }) => t.id === rogueId);
        expect(toController.name).toBe('Disguised Rogue');
        expect(toController.controlledBy).toBe(playerId);
        expect(toController.type).toBe('player');
      });

      it('is revealed again by the DM', async () => {
        const reveal = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${veiledId}`).send({ obscured: false });
        expect(reveal.status).toBe(200);
        const seen = await player.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
        const veiled = seen.body.map.tokens.find((t: { id: string }) => t.id === veiledId);
        expect(veiled.name).toBe('Something Large');
        expect(veiled.obscured).toBe(false);
      });
    });
  });

  // The socket refuses a player who cannot see the spirit plane from
  // touching a spirit-layer token; the REST update let them, and answered
  // with the token the map fetch withholds from them.
  describe('a spirit-layer token', () => {
    let wispId: string;

    beforeAll(async () => {
      const res = await place({ name: 'Wisp', layer: 'spirit', controlledBy: playerId, position: { x: 14, y: 14 } });
      expect(res.status).toBe(201);
      wispId = res.body.token.id;
      // Placing may or may not take the layer; the DM's update always does.
      // Hidden, because a visible spirit-plane token of the player's on the
      // current map would itself put them in the spirit realm, and the first
      // case below needs them unable to see that plane.
      const moved = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${wispId}`).send({ layer: 'spirit', visible: false });
      expect(moved.status).toBe(200);
      expect(moved.body.token.layer).toBe('spirit');
    });

    afterAll(async () => {
      await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });
    });

    it('cannot be moved over REST by its player while they cannot see the spirit plane', async () => {
      await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });
      const res = await player.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${wispId}`).send({ position: { x: 15, y: 14 } });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/spirit/i);
      expect(JSON.stringify(res.body)).not.toContain('Wisp');
    });

    it('can be moved by its player once the spirit plane is open to them', async () => {
      await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: true } });
      const res = await player.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${wispId}`).send({ position: { x: 15, y: 14 } });
      expect(res.status).toBe(200);
      expect(res.body.token.position).toEqual({ x: 15, y: 14 });
    });
  });

  /**
   * controlledBy is set once and is not cleared when someone is demoted, so a
   * spectator can still hold a token from before. The socket handlers refuse
   * them; the REST route must too, or the two channels disagree about who may
   * act.
   */
  describe('a spectator who still holds a token', () => {
    let heldTokenId: string;

    beforeAll(async () => {
      // The route no longer places a token controlled by a spectator; one can
      // only be left over from before a demotion, so it is written straight
      // into the map.
      heldTokenId = randomUUID();
      const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      const held = {
        id: heldTokenId, name: 'Held Token', imageUrl: '', position: { x: 7, y: 7 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, controlledBy: spectatorId, rotation: 0, conditions: [], metadata: {},
      };
      await prisma.map.update({ where: { id: mapId }, data: { tokens: toJson([...readTokens(row.tokens), held]) } });
    });

    it('may not move it', async () => {
      const res = await spectator
        .put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${heldTokenId}`)
        .send({ position: { x: 8, y: 8 } });
      expect(res.status).toBe(403);
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      const token = after.body.map.tokens.find((t: { id: string }) => t.id === heldTokenId);
      expect(token.position).toEqual({ x: 7, y: 7 });
    });
  });

  // What a player may write is now typed, not only gated: `position` kept
  // whatever arrived beside x and y, and `rotation` took any JSON value, and
  // both were then sent to every member on each map fetch.
  describe('the fields a player may write', () => {
    let tokenId: string;

    beforeAll(async () => {
      const res = await place({ name: 'Typed Player Token', controlledBy: playerId, position: { x: 9, y: 9 } });
      tokenId = res.body.token.id;
    });

    const update = (body: Record<string, unknown>) =>
      player.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`).send(body);
    const stored = async () => {
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      return after.body.map.tokens.find((t: { id: string }) => t.id === tokenId);
    };

    it('stores only x and y of a position', async () => {
      const res = await update({ position: { x: 3, y: 3, junk: 'A'.repeat(2000), nested: { a: [1, 2, 3] } } });
      expect(res.status).toBe(200);
      expect((await stored()).position).toEqual({ x: 3, y: 3 });
    });

    it('stores a rotation in degrees', async () => {
      expect((await update({ rotation: 90 })).status).toBe(200);
      expect((await stored()).rotation).toBe(90);
    });

    it.each([
      ['an object', { evil: 'x'.repeat(500) }],
      ['a word', 'north'],
      ['400 degrees', 400],
      ['a negative angle', -1],
    ])('refuses %s as a rotation', async (_what, rotation) => {
      const res = await update({ rotation });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/rotation/);
      expect((await stored()).rotation).toBe(90);
    });
  });

  // The DM's fields were stored as sent too: `visible: 'false'` is a truthy
  // string, so a token the DM believed hidden was shown to everyone.
  describe('the fields the DM sets', () => {
    it.each([
      ['visible', 'false'],
      ['showHpBar', 'no'],
      ['initiative', 'abc'],
      ['controlledBy', { $ne: null }],
      ['characterId', ['x']],
      ['creatureTemplateId', 'not-a-uuid'],
      ['rotation', 'north'],
      ['notes', ['x']],
    ])('refuses to place a token whose %s is %j', async (field, value) => {
      const res = await place({ name: `Bad ${field}`, [field]: value });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(new RegExp(field));
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      expect(after.body.map.tokens.some((t: { name: string }) => t.name === `Bad ${field}`)).toBe(false);
    });

    it('refuses the same on update, leaving the token as it was', async () => {
      const placed = await place({ name: 'Typed DM Token', visible: false });
      const id = placed.body.token.id;
      const url = `/api/campaigns/${campaignId}/maps/${mapId}/tokens/${id}`;
      expect((await dm.put(url).send({ visible: 'true' })).status).toBe(400);
      expect((await dm.put(url).send({ name: { evil: true } })).status).toBe(400);
      expect((await dm.put(url).send({ initiative: '12' })).status).toBe(400);
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      const token = after.body.map.tokens.find((t: { id: string }) => t.id === id);
      expect(token).toMatchObject({ name: 'Typed DM Token', visible: false, initiative: null });
    });
  });

  // A token could be bound to any character id at all, and the initiative roll
  // then read that sheet. Character ids are visible to every member of a
  // shared campaign, and anyone can be the DM of a campaign they create.
  describe('a token bound to a character', () => {
    let ownCharacterId: string;
    let foreignCharacterId: string;
    let otherCampaignId: string;

    beforeAll(async () => {
      const other = await createTestCampaign(playerId, { name: 'Elsewhere' });
      otherCampaignId = other.id;
      const [own, foreign] = await Promise.all([
        prisma.character.create({ data: { userId: playerId, campaignId, name: 'Here', data: {} } }),
        prisma.character.create({ data: { userId: playerId, campaignId: otherCampaignId, name: 'Elsewhere', data: {} } }),
      ]);
      ownCharacterId = own.id;
      foreignCharacterId = foreign.id;
    });

    afterAll(async () => {
      await prisma.character.deleteMany({ where: { id: { in: [ownCharacterId, foreignCharacterId] } } });
      await cleanupCampaigns([otherCampaignId]);
    });

    it("is placed, and controlled by the character's owner", async () => {
      const res = await place({ name: 'Bound Here', characterId: ownCharacterId });
      expect(res.status).toBe(201);
      expect(res.body.token).toMatchObject({ characterId: ownCharacterId, controlledBy: playerId });
    });

    it.each([
      ["another campaign's character", () => foreignCharacterId],
      ['a character that does not exist', () => '00000000-0000-4000-8000-000000000000'],
    ])('is refused for %s', async (_what, id) => {
      const res = await place({ name: 'Bound Elsewhere', characterId: id() });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/character/i);
      const after = await dm.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      expect(after.body.map.tokens.some((t: { name: string }) => t.name === 'Bound Elsewhere')).toBe(false);
    });
  });
});

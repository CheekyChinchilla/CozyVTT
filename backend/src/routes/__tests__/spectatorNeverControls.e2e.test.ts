/**
 * A spectator never controls a token and cannot change the table.
 *
 * `controlledBy` is set once and not cleared when a player is demoted, so a
 * spectator could still be named on a token. The move handlers refused them,
 * but everything that asked "is this token theirs" for what to send them
 * (hit points, darkvision, an obscured identity, sight on a lit map) still
 * said yes, and the DM could hand a token to a spectator outright. A
 * spectator who owned a character in the campaign could also edit it, which
 * changed that character's tokens on every screen.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { readTokens } from '../../utils/prisma-json';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

const OLD_PICTURE = '/api/assets/tokens/00000000-0000-4000-8000-00000000a01d';

describe('a spectator never controls a token', () => {
  let dmId: string;
  let playerId: string;
  let spectatorId: string;
  let outsiderId: string;
  let campaignId: string;
  let mapId: string;
  let spectatorCharacterId: string;
  let looseCharacterId: string;
  let dm: ReturnType<typeof request.agent>;
  let spectator: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Spectator Test DM' });
    const playerUser = await createTestUser({ displayName: 'Spectator Test Player' });
    const spectatorUser = await createTestUser({ displayName: 'Spectator Test Spectator' });
    const outsiderUser = await createTestUser({ displayName: 'Spectator Test Outsider' });
    dmId = dmUser.id;
    playerId = playerUser.id;
    spectatorId = spectatorUser.id;
    outsiderId = outsiderUser.id;

    const campaign = await createTestCampaign(dmId, { name: 'Spectator Control' });
    campaignId = campaign.id;

    // A character the spectator brought while they were still a player, and
    // one of theirs that belongs to no campaign but has a token on this map.
    const inCampaign = await prisma.character.create({
      data: { userId: spectatorId, campaignId, name: 'Aldra', gameSystem: 'DND_5E', data: {} },
    });
    spectatorCharacterId = inCampaign.id;
    const loose = await prisma.character.create({
      data: { userId: spectatorId, name: 'Loose', gameSystem: 'DND_5E', data: {}, tokenImageUrl: OLD_PICTURE },
    });
    looseCharacterId = loose.id;

    await prisma.campaignMembership.createMany({
      data: [
        { userId: dmId, campaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
        { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [spectatorCharacterId] },
      ],
    });

    const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {} };
    const map = await prisma.map.create({
      data: {
        campaignId,
        name: 'Spectator Map',
        imageUrl: '/api/assets/maps/placeholder',
        baseLayerUrl: '/api/assets/maps/placeholder',
        width: 20,
        height: 16,
        gridSize: 50,
        annotations: [],
        tokens: [
          // Still names the spectator from their time as a player.
          {
            ...base, id: 'held', name: 'Aldra (disguised)', position: { x: 2, y: 2 }, controlledBy: spectatorId,
            hp: { current: 3, max: 30, temp: 0 }, showHpBar: false, sightRadius: 12, obscured: true, conditions: ['invisible'],
          },
          { ...base, id: 'bound', name: 'Loose', position: { x: 5, y: 5 }, controlledBy: null, characterId: looseCharacterId, imageUrl: OLD_PICTURE },
        ],
      },
    });
    mapId = map.id;

    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
    spectator = request.agent(app);
    await spectator.post('/api/auth/login').send({ email: spectatorUser.email, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await prisma.map.deleteMany({ where: { campaignId } });
    await prisma.character.deleteMany({ where: { id: { in: [spectatorCharacterId, looseCharacterId] } } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId, spectatorId, outsiderId]);
    await prisma.$disconnect();
  });

  const place = (body: Record<string, unknown>) =>
    dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({ name: 'Placed', position: { x: 1, y: 1 }, ...body });
  const storedToken = async (id: string) => {
    const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    return readTokens(row.tokens).find((t) => t.id === id);
  };

  describe('assigning control', () => {
    it('refuses to place a token controlled by a spectator', async () => {
      const res = await place({ name: 'For the watcher', controlledBy: spectatorId });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/controlledBy/);
      const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      expect(readTokens(row.tokens).some((t) => t.name === 'For the watcher')).toBe(false);
    });

    it('refuses to hand a token to a spectator or to someone outside the campaign, and lets it go unassigned', async () => {
      const placed = await place({ name: 'Handed', controlledBy: playerId });
      expect(placed.status).toBe(201);
      const url = `/api/campaigns/${campaignId}/maps/${mapId}/tokens/${placed.body.token.id}`;

      const toSpectator = await dm.put(url).send({ controlledBy: spectatorId });
      expect(toSpectator.status).toBe(400);
      expect(toSpectator.body.message).toMatch(/controlledBy/);
      const toOutsider = await dm.put(url).send({ controlledBy: outsiderId });
      expect(toOutsider.status).toBe(400);
      expect((await storedToken(placed.body.token.id))?.controlledBy).toBe(playerId);

      const released = await dm.put(url).send({ controlledBy: null });
      expect(released.status).toBe(200);
      expect(released.body.token.controlledBy).toBeNull();
    });

    it("gives a token bound to a spectator's character no controller", async () => {
      const res = await place({ name: 'Bound to Aldra', characterId: spectatorCharacterId });
      expect(res.status).toBe(201);
      expect(res.body.token).toMatchObject({ characterId: spectatorCharacterId, controlledBy: null });
    });
  });

  describe('what a spectator is sent of a token that still names them', () => {
    const fetchHeld = async () => {
      const res = await spectator.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
      expect(res.status).toBe(200);
      return { tokens: res.body.map.tokens as Array<Record<string, unknown>>, held: res.body.map.tokens.find((t: { id: string }) => t.id === 'held') };
    };

    it('is what any other player would be sent: no hit points, no darkvision, no identity', async () => {
      const { held } = await fetchHeld();
      expect(held).toBeDefined();
      // An obscured token is masked with `hp: null`; an ordinary one has the
      // field dropped. Either way, nothing.
      expect(held.hp ?? null).toBeNull();
      expect(held.sightRadius ?? null).toBeNull();
      expect(held.name).toBe('');
      expect(held.conditions).toEqual([]);
    });

    it('is nothing at all on a lit map, since the token gives them no sight', async () => {
      await prisma.map.update({ where: { id: mapId }, data: { lightingEnabled: true, globalIllumination: true } });
      try {
        expect((await fetchHeld()).tokens).toEqual([]);
      } finally {
        await prisma.map.update({ where: { id: mapId }, data: { lightingEnabled: false } });
      }
    });
  });

  describe('a character a spectator owns', () => {
    it('cannot be edited by them while they are a spectator in its campaign', async () => {
      const res = await spectator.put(`/api/characters/${spectatorCharacterId}`).send({ name: 'Renamed' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/spectator/i);
      const row = await prisma.character.findUniqueOrThrow({ where: { id: spectatorCharacterId } });
      expect(row.name).toBe('Aldra');
    });

    it('can still be edited by the DM', async () => {
      const res = await dm.put(`/api/characters/${spectatorCharacterId}`).send({ name: 'Aldra the Watched' });
      expect(res.status).toBe(200);
    });

    it('does not repaint a token in a campaign where they are a spectator when they change its picture', async () => {
      const res = await spectator.put(`/api/characters/${looseCharacterId}`).send({ tokenImageUrl: null });
      expect(res.status).toBe(200);
      expect((await storedToken('bound'))?.imageUrl).toBe(OLD_PICTURE);
    });
  });
});

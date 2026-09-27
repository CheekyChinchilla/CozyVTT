/**
 * A token bound to a character is controlled by that character's owner
 * unless the request names someone else.
 *
 * The controller is the whole of what makes a token a player's, on the
 * server and in the client. A client that bound a token to a character but
 * named no controller left the player with a token they could see but not
 * move, and that the server never counted as their eyes on a lit map.
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

describe('POST /api/campaigns/:campaignId/maps/:id/tokens with a characterId', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let otherCampaignId: string;
  let mapId: string;
  let otherPlayerId: string;
  let characterId: string;
  let strayCharacterId: string;
  let dm: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Controller DM' });
    dmId = dmUser.id;
    const campaign = await createTestCampaign(dmId, { name: 'Controller' });
    campaignId = campaign.id;
    await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });

    const playerUser = await createTestUser({ displayName: 'Controller Player' });
    playerId = playerUser.id;
    await prisma.campaignMembership.create({ data: { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] } });
    characterId = (await prisma.character.create({ data: { userId: playerId, campaignId, name: 'Aldra', data: {} } })).id;

    const otherPlayerUser = await createTestUser({ displayName: 'Controller Other Player' });
    otherPlayerId = otherPlayerUser.id;
    await prisma.campaignMembership.create({ data: { userId: otherPlayerId, campaignId, role: 'PLAYER', characterIds: [] } });

    const other = await createTestCampaign(dmId, { name: 'Elsewhere' });
    otherCampaignId = other.id;
    strayCharacterId = (await prisma.character.create({ data: { userId: playerId, campaignId: otherCampaignId, name: 'Stray', data: {} } })).id;

    mapId = (await prisma.map.create({
      data: {
        campaignId,
        name: 'Controller Map',
        imageUrl: '/api/assets/maps/placeholder',
        baseLayerUrl: '/api/assets/maps/placeholder',
        width: 20,
        height: 20,
        gridSize: 50,
        tokens: [],
        annotations: [],
      },
    })).id;

    dm = request.agent(app);
    const res = await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId, otherCampaignId]);
    await cleanupUsers([dmId, playerId, otherPlayerId]);
  });

  const create = (body: Record<string, unknown>) =>
    dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({ name: 'Aldra', position: { x: 1, y: 1 }, type: 'player', ...body });

  it("is controlled by the character's owner when no controller is given", async () => {
    const res = await create({ characterId });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBe(playerId);
  });

  // An explicit null is the DM saying "nobody": a character's token the DM
  // took control of used to come back to its owner whenever it was moved or
  // duplicated, because the copy carried `controlledBy: null` and null read
  // as "not given".
  it('has no controller when the request says so with null', async () => {
    const res = await create({ characterId, controlledBy: null });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBeNull();
  });

  it('keeps a controller the request names, when that is a player', async () => {
    const res = await create({ characterId, controlledBy: otherPlayerId });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBe(otherPlayerId);
  });

  // The DM controls every token without being named on one, and a spectator
  // controls nothing, so `controlledBy` may only ever name a player.
  it('refuses a controller who is not a player of the campaign', async () => {
    const res = await create({ characterId, controlledBy: dmId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/controlledBy/);
  });

  // The client names no controller when it places a character, so these two
  // are what a DM's own character and a spectator's come out as: nobody's,
  // which the DM moves. Naming their owner would be refused above.
  it("is placed with no controller when the character's owner is the DM", async () => {
    const own = await prisma.character.create({ data: { userId: dmId, campaignId, name: 'Ser DM', data: {} } });
    const res = await create({ characterId: own.id });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBeNull();
    await prisma.character.delete({ where: { id: own.id } });
  });

  it("is placed with no controller when the character's owner is a spectator", async () => {
    const watcher = await createTestUser({ displayName: 'Controller Spectator' });
    await prisma.campaignMembership.create({ data: { userId: watcher.id, campaignId, role: 'SPECTATOR', characterIds: [] } });
    const theirs = await prisma.character.create({ data: { userId: watcher.id, campaignId, name: 'Watched', data: {} } });
    const res = await create({ characterId: theirs.id });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBeNull();
    await prisma.character.delete({ where: { id: theirs.id } });
    await prisma.campaignMembership.deleteMany({ where: { userId: watcher.id } });
    await cleanupUsers([watcher.id]);
  });

  // Such a token used to be placed with no controller. It is refused now: the
  // initiative roll reads the bound sheet, and character ids are visible to
  // every member of any shared campaign.
  it('refuses a character that belongs to another campaign', async () => {
    const res = await create({ characterId: strayCharacterId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/character/i);
  });

  it('gives an unbound token no controller unless one is named', async () => {
    const res = await create({});
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBeNull();
  });
});

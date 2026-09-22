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
    await cleanupUsers([dmId, playerId]);
  });

  const create = (body: Record<string, unknown>) =>
    dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({ name: 'Aldra', position: { x: 1, y: 1 }, type: 'player', ...body });

  it("is controlled by the character's owner when no controller is given", async () => {
    const res = await create({ characterId });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBe(playerId);
  });

  it('the same when the controller is given as null', async () => {
    const res = await create({ characterId, controlledBy: null });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBe(playerId);
  });

  it('keeps a controller the request names', async () => {
    const res = await create({ characterId, controlledBy: dmId });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBe(dmId);
  });

  it('takes no controller from a character that belongs to another campaign', async () => {
    const res = await create({ characterId: strayCharacterId });
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBeNull();
  });

  it('gives an unbound token no controller unless one is named', async () => {
    const res = await create({});
    expect(res.status).toBe(201);
    expect(res.body.token.controlledBy).toBeNull();
  });
});

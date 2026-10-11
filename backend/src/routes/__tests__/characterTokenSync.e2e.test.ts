/**
 * Character token image sync — End-to-End Tests
 *
 * A map token keeps its own COPY of the character's image, taken when it was
 * placed — there is no Token table, tokens are JSON on the map. Changing the
 * image on a character sheet therefore left every placed token showing the old
 * picture until the DM removed and re-added it.
 *
 * Two things are pinned here:
 *
 *  - The sync has to run **server-side on the character update**, because
 *    `imageUrl` is a DM-only field on the token route. A player editing their
 *    own character could not push this from the client — hence the player case
 *    below, which is the one that matters.
 *  - The token's **name is deliberately not synced**. A DM may have renamed a
 *    token, and losing that on the player's next sheet save would be its own
 *    bug report.
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

describe('character token image sync', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let characterId: string;
  let otherCharacterId: string;
  let mapAId: string;
  let mapBId: string;
  let playerAgent: ReturnType<typeof request.agent>;

  // Addresses of the only form a picture may take on this server, naming
  // assets that do not exist (accepted: they grant nothing).
  const OLD_IMAGE = '/api/assets/tokens/00000000-0000-4000-8000-00000000a01d';
  const NEW_IMAGE = '/api/assets/tokens/00000000-0000-4000-8000-00000000b3e7';

  async function seedMapTokens() {
    const tokensFor = (label: string) => [
      {
        id: `${label}-bound`,
        characterId,
        name: 'Aldra (charmed)', // a DM rename that must survive
        imageUrl: OLD_IMAGE,
        position: { x: 1, y: 1 },
        size: { width: 1, height: 1 },
        layer: 'token',
        visible: true,
        controlledBy: playerId,
        rotation: 0,
        conditions: [],
        metadata: {},
        type: 'player',
        disposition: null,
        hp: null,
        showHpBar: false,
        notes: '',
      },
      {
        id: `${label}-other`,
        characterId: otherCharacterId,
        name: 'Someone Else',
        imageUrl: OLD_IMAGE,
        position: { x: 2, y: 2 },
        size: { width: 1, height: 1 },
        layer: 'token',
        visible: true,
        controlledBy: null,
        rotation: 0,
        conditions: [],
        metadata: {},
        type: 'player',
        disposition: null,
        hp: null,
        showHpBar: false,
        notes: '',
      },
    ];
    await prisma.map.update({ where: { id: mapAId }, data: { tokens: tokensFor('a') } });
    await prisma.map.update({ where: { id: mapBId }, data: { tokens: tokensFor('b') } });
  }

  const tokensOf = async (mapId: string) => {
    const map = await prisma.map.findUnique({ where: { id: mapId }, select: { tokens: true } });
    return map!.tokens as unknown as Array<{ id: string; characterId: string; name: string; imageUrl: string }>;
  };

  beforeAll(async () => {
    const stamp = Date.now();
    const dm = await createTestUser({ email: `tok_dm_${stamp}@test.invalid`, isApproved: true });
    const player = await createTestUser({ email: `tok_pl_${stamp}@test.invalid`, isApproved: true });
    dmId = dm.id;
    playerId = player.id;

    const campaign = await createTestCampaign(dmId, { name: `Token Sync ${stamp}` });
    campaignId = campaign.id;
    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: 'DM', characterIds: [] },
        { campaignId, userId: playerId, role: 'PLAYER', characterIds: [] },
      ],
    });

    const mk = (name: string) =>
      prisma.map.create({
        data: {
          campaignId, name, imageUrl: '/uploads/maps/m.png', baseLayerUrl: '/uploads/maps/m.png',
          width: 20, height: 20, tokens: [], annotations: [],
        },
      });
    mapAId = (await mk('Map A')).id;
    mapBId = (await mk('Map B')).id;

    const mkChar = (owner: string, name: string) =>
      prisma.character.create({
        data: { userId: owner, campaignId, name, tokenImageUrl: OLD_IMAGE, data: {} },
      });
    characterId = (await mkChar(playerId, 'Aldra')).id;
    otherCharacterId = (await mkChar(dmId, 'Bystander')).id;

    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/login')
      .send({ email: `tok_pl_${stamp}@test.invalid`, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    playerAgent = agent;
  });

  beforeEach(async () => {
    await seedMapTokens();
    await prisma.character.update({ where: { id: characterId }, data: { tokenImageUrl: OLD_IMAGE } });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId]);
    await prisma.$disconnect();
  });

  /**
   * A token is bound to a character by `characterId`, and that binding is the
   * only thing that decides whether it should follow the character's picture.
   * The sync used to look up maps by the *character's* `campaignId` instead,
   * which silently missed every token whose character did not happen to carry
   * a matching one — and a character reaches that state easily:
   *
   *  - unassigning it from a campaign nulls `campaignId` and leaves the tokens
   *    exactly where they were;
   *  - `campaignId` is a single column, so a character with tokens in two
   *    campaigns can only ever point at one of them;
   *  - a DM may place any player's character on a map, which writes the token's
   *    `characterId` without touching the character at all.
   *
   * The symptom in every case is the one this whole file exists to prevent: the
   * player's sheet shows the new picture, the token keeps the old one, and only
   * removing and re-adding it helps.
   */
  describe('when the character does not carry the campaign id', () => {
    beforeEach(async () => {
      await prisma.character.update({ where: { id: characterId }, data: { campaignId: null } });
    });

    afterEach(async () => {
      await prisma.character.update({ where: { id: characterId }, data: { campaignId } });
    });

    it('still updates the tokens bound to it', async () => {
      const res = await playerAgent
        .put(`/api/characters/${characterId}`)
        .send({ tokenImageUrl: NEW_IMAGE });
      expect(res.status).toBe(200);

      for (const mapId of [mapAId, mapBId]) {
        const bound = (await tokensOf(mapId)).find((t) => t.characterId === characterId);
        expect(bound!.imageUrl).toBe(NEW_IMAGE);
      }
    });

    it("still leaves another character's tokens alone", async () => {
      await playerAgent.put(`/api/characters/${characterId}`).send({ tokenImageUrl: NEW_IMAGE });
      const other = (await tokensOf(mapAId)).find((t) => t.id === 'a-other');
      expect(other!.imageUrl).toBe(OLD_IMAGE);
    });

    it('still leaves a DM rename alone', async () => {
      await playerAgent.put(`/api/characters/${characterId}`).send({ tokenImageUrl: NEW_IMAGE });
      const bound = (await tokensOf(mapAId)).find((t) => t.characterId === characterId);
      expect(bound!.name).toBe('Aldra (charmed)');
    });
  });

  // The case the token route's own permissions would have blocked.
  it('a player changing their own character updates its tokens', async () => {
    const res = await playerAgent
      .put(`/api/characters/${characterId}`)
      .send({ tokenImageUrl: NEW_IMAGE });
    expect(res.status).toBe(200);

    const bound = (await tokensOf(mapAId)).find((t) => t.id === 'a-bound');
    expect(bound!.imageUrl).toBe(NEW_IMAGE);
  });

  it('updates tokens on every map in the campaign', async () => {
    await playerAgent.put(`/api/characters/${characterId}`).send({ tokenImageUrl: NEW_IMAGE });

    for (const mapId of [mapAId, mapBId]) {
      const bound = (await tokensOf(mapId)).find((t) => t.characterId === characterId);
      expect(bound!.imageUrl).toBe(NEW_IMAGE);
    }
  });

  it("leaves the token's name alone", async () => {
    await playerAgent.put(`/api/characters/${characterId}`).send({ tokenImageUrl: NEW_IMAGE });

    const bound = (await tokensOf(mapAId)).find((t) => t.id === 'a-bound');
    expect(bound!.name).toBe('Aldra (charmed)');
  });

  it("does not touch another character's tokens", async () => {
    await playerAgent.put(`/api/characters/${characterId}`).send({ tokenImageUrl: NEW_IMAGE });

    const other = (await tokensOf(mapAId)).find((t) => t.id === 'a-other');
    expect(other!.imageUrl).toBe(OLD_IMAGE);
  });

  it('leaves tokens alone when the image did not change', async () => {
    const res = await playerAgent.put(`/api/characters/${characterId}`).send({ name: 'Aldra Renamed' });
    expect(res.status).toBe(200);

    const bound = (await tokensOf(mapAId)).find((t) => t.id === 'a-bound');
    expect(bound!.imageUrl).toBe(OLD_IMAGE);
    expect(bound!.name).toBe('Aldra (charmed)');
  });

  it('clears the token image when the character image is removed', async () => {
    await playerAgent.put(`/api/characters/${characterId}`).send({ tokenImageUrl: null });

    const bound = (await tokensOf(mapAId)).find((t) => t.id === 'a-bound');
    expect(bound!.imageUrl).toBe('');
  });
});

/**
 * A DM may change the picture of a player's character in the campaign they
 * run, and the character's tokens follow it. The tokens it left in a
 * campaign the player played before belong to that campaign: its own DM
 * placed them, and another DM's choice of picture is not theirs to make. A
 * DM's change now repaints tokens only in campaigns that DM runs; the
 * owner's own change still repaints every token bound to the character.
 */
describe('a DM changing a player character\'s token picture', () => {
  const OLD_IMAGE = '/api/assets/tokens/00000000-0000-4000-8000-00000000c01d';
  const NEW_IMAGE = '/api/assets/tokens/00000000-0000-4000-8000-00000000d3e7';
  const userIds: string[] = [];
  const campaignIds: string[] = [];
  let characterId: string;
  let mapInA: string;
  let mapInB: string;
  let dmA: ReturnType<typeof request.agent>;

  const boundToken = (characterId: string, controlledBy: string) => ({
    id: `bound-${characterId}`, characterId, name: 'Wren', imageUrl: OLD_IMAGE,
    position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true,
    controlledBy, rotation: 0, conditions: [], metadata: {}, type: 'player', disposition: null, hp: null, showHpBar: false, notes: '',
  });
  const imageOn = async (mapId: string) => {
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    return (map.tokens as unknown as Array<{ characterId: string; imageUrl: string }>).find((t) => t.characterId === characterId)?.imageUrl;
  };

  beforeAll(async () => {
    const stamp = Date.now();
    const [ownerOfA, ownerOfB, player] = await Promise.all([
      createTestUser({ email: `tok2_dma_${stamp}@test.invalid` }),
      createTestUser({ email: `tok2_dmb_${stamp}@test.invalid` }),
      createTestUser({ email: `tok2_pl_${stamp}@test.invalid` }),
    ]);
    userIds.push(ownerOfA.id, ownerOfB.id, player.id);
    const a = await createTestCampaign(ownerOfA.id, { name: `Campaign A ${stamp}` });
    const b = await createTestCampaign(ownerOfB.id, { name: `Campaign B ${stamp}` });
    campaignIds.push(a.id, b.id);
    await prisma.campaignMembership.createMany({
      data: [
        { campaignId: a.id, userId: ownerOfA.id, role: 'DM', characterIds: [] },
        { campaignId: a.id, userId: player.id, role: 'PLAYER', characterIds: [] },
        { campaignId: b.id, userId: ownerOfB.id, role: 'DM', characterIds: [] },
        { campaignId: b.id, userId: player.id, role: 'PLAYER', characterIds: [] },
      ],
    });
    // The player moved the character from B to A; its token stayed on B's map.
    characterId = (await prisma.character.create({ data: { userId: player.id, campaignId: a.id, name: 'Wren', tokenImageUrl: OLD_IMAGE, data: {} } })).id;
    const mapFor = (campaignId: string, name: string) => prisma.map.create({
      data: {
        campaignId, name, imageUrl: '/uploads/maps/m.png', baseLayerUrl: '/uploads/maps/m.png',
        width: 20, height: 20, tokens: [boundToken(characterId, player.id)], annotations: [],
      },
    });
    mapInA = (await mapFor(a.id, 'A map')).id;
    mapInB = (await mapFor(b.id, 'B map')).id;

    dmA = request.agent(app);
    expect((await dmA.post('/api/auth/login').send({ email: `tok2_dma_${stamp}@test.invalid`, password: TEST_PASSWORD })).status).toBe(200);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
    await prisma.map.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await cleanupCampaigns(campaignIds);
    await cleanupUsers(userIds);
  });

  it('repaints the tokens in the campaign they run and leaves another campaign\'s alone', async () => {
    const res = await dmA.put(`/api/characters/${characterId}`).send({ tokenImageUrl: NEW_IMAGE });
    expect(res.status).toBe(200);

    expect(await imageOn(mapInA)).toBe(NEW_IMAGE);
    expect(await imageOn(mapInB)).toBe(OLD_IMAGE);
  });
});

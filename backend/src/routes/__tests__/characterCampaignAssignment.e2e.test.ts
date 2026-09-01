/**
 * Creating a character straight into a campaign — End-to-End Tests
 *
 * Which characters belong to a campaign is recorded in two places:
 * `Character.campaignId`, and the `characterIds` array on the player's
 * `CampaignMembership`. Almost everything the app shows a player reads the
 * second one — the campaign roster is built from it, and
 * `services/permissions.ts` decides whether a player may move a token by
 * asking whether the character is in it.
 *
 * `POST /api/characters/:id/assign` writes both. `POST /api/characters` used to
 * write only the column, so a character created with a campaign preselected
 * was in the campaign as far as the database was concerned and invisible
 * everywhere the player looked — absent from the roster, and its token
 * unmovable by its own owner. Re-assigning it to the same campaign was what
 * repaired it, because that path filled in the missing half.
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

describe('creating a character with a campaign preselected', () => {
  let dmId: string;
  let playerId: string;
  let outsiderId: string;
  let campaignId: string;
  let playerAgent: ReturnType<typeof request.agent>;
  let outsiderAgent: ReturnType<typeof request.agent>;

  const signIn = async (email: string) => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);
    return agent;
  };

  beforeAll(async () => {
    const stamp = Date.now();
    const dm = await createTestUser({ email: `cca_dm_${stamp}@test.invalid`, isApproved: true });
    const player = await createTestUser({ email: `cca_pl_${stamp}@test.invalid`, isApproved: true });
    const outsider = await createTestUser({ email: `cca_out_${stamp}@test.invalid`, isApproved: true });
    dmId = dm.id;
    playerId = player.id;
    outsiderId = outsider.id;

    const campaign = await createTestCampaign(dmId, { gameSystem: null });
    campaignId = campaign.id;

    await prisma.campaignMembership.createMany({
      data: [
        { userId: dmId, campaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      ],
    });

    playerAgent = await signIn(`cca_pl_${stamp}@test.invalid`);
    outsiderAgent = await signIn(`cca_out_${stamp}@test.invalid`);
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId, outsiderId]);
    await prisma.$disconnect();
  });

  const membershipFor = (userId: string) =>
    prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
    });

  it('records the campaign on the character', async () => {
    const res = await playerAgent
      .post('/api/characters')
      .send({ name: 'Column Only', campaignId })
      .expect(201);

    expect(res.body.character.campaignId).toBe(campaignId);
  });

  // The half that was missing. Everything a player sees reads this array.
  it('adds the character to the membership, so it is not invisible', async () => {
    const res = await playerAgent
      .post('/api/characters')
      .send({ name: 'Roster Visible', campaignId })
      .expect(201);

    const membership = await membershipFor(playerId);
    expect(membership?.characterIds).toContain(res.body.character.id);
  });

  it('shows the new character on the campaign roster straight away', async () => {
    const created = await playerAgent
      .post('/api/characters')
      .send({ name: 'Shows On Roster', campaignId })
      .expect(201);

    const roster = await playerAgent.get(`/api/campaigns/${campaignId}/characters`).expect(200);
    const names = roster.body.roster.flatMap(
      (m: { characters: { id: string; name: string }[] }) => m.characters.map((c) => c.name),
    );
    expect(names).toContain('Shows On Roster');
    expect(roster.body.roster.flatMap(
      (m: { characters: { id: string }[] }) => m.characters.map((c) => c.id),
    )).toContain(created.body.character.id);
  });

  it('does not add the character twice when created again', async () => {
    const before = await membershipFor(playerId);
    const res = await playerAgent
      .post('/api/characters')
      .send({ name: 'Once Only', campaignId })
      .expect(201);
    const after = await membershipFor(playerId);

    expect(after?.characterIds).toContain(res.body.character.id);
    expect(after?.characterIds.length).toBe((before?.characterIds.length ?? 0) + 1);
    // No duplicate ids in the array at all.
    expect(new Set(after?.characterIds).size).toBe(after?.characterIds.length);
  });

  // Matches POST /api/characters/:id/assign, which has always refused this.
  it('refuses a campaign the creator is not a member of', async () => {
    await outsiderAgent
      .post('/api/characters')
      .send({ name: 'Gatecrasher', campaignId })
      .expect(403);

    const characters = await prisma.character.findMany({ where: { userId: outsiderId } });
    expect(characters).toHaveLength(0);
  });

  it('still creates a character with no campaign at all', async () => {
    const res = await playerAgent
      .post('/api/characters')
      .send({ name: 'Unassigned' })
      .expect(201);

    expect(res.body.character.campaignId).toBeNull();
  });
});

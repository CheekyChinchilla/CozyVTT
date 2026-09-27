/**
 * The token template library is the DM's.
 *
 * A template carries what a placed token keeps from players: DM notes, a
 * stat block, hit points, darkvision. The list and detail routes were open to
 * every member, so a player or spectator could read all of it with their
 * session cookie, while the map filtered the same fields off every token it
 * sent them. Reads are DM-only now, like the writes always were.
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

let dmId: string;
let playerId: string;
let spectatorId: string;
let campaignId: string;
let templateId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let spectator: ReturnType<typeof request.agent>;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const stamp = Date.now();
  const dmUser = await createTestUser({ email: `tt-dm-${stamp}@test.cozyvtt.local`, displayName: 'Template DM' });
  const playerUser = await createTestUser({ email: `tt-player-${stamp}@test.cozyvtt.local`, displayName: 'Template Player' });
  const spectatorUser = await createTestUser({ email: `tt-spec-${stamp}@test.cozyvtt.local`, displayName: 'Template Spectator' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  spectatorId = spectatorUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Templates ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  [dm, player, spectator] = await Promise.all([login(dmUser.email), login(playerUser.email), login(spectatorUser.email)]);

  const created = await dm.post(`/api/campaigns/${campaignId}/token-templates`).send({
    name: 'Traitor Innkeeper',
    type: 'npc',
    notes: 'DM ONLY: secretly the cult leader',
    hp: { current: 5, max: 5, temp: 0 },
  });
  expect(created.status).toBe(201);
  templateId = created.body.id;
});

afterAll(async () => {
  await prisma.tokenTemplate.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, spectatorId]);
  await prisma.$disconnect();
});

describe('reading token templates', () => {
  it('is open to the DM', async () => {
    const list = await dm.get(`/api/campaigns/${campaignId}/token-templates`);
    expect(list.status).toBe(200);
    expect(list.body.templates.map((t: { name: string }) => t.name)).toContain('Traitor Innkeeper');
    const one = await dm.get(`/api/campaigns/${campaignId}/token-templates/${templateId}`);
    expect(one.status).toBe(200);
    expect(one.body.notes).toBe('DM ONLY: secretly the cult leader');
  });

  it.each([
    ['a player', () => player],
    ['a spectator', () => spectator],
  ])('is refused to %s, notes and all', async (_who: string, agent: () => ReturnType<typeof request.agent>) => {
    const list = await agent().get(`/api/campaigns/${campaignId}/token-templates`);
    expect(list.status).toBe(403);
    expect(JSON.stringify(list.body)).not.toContain('cult leader');
    const one = await agent().get(`/api/campaigns/${campaignId}/token-templates/${templateId}`);
    expect(one.status).toBe(403);
    expect(JSON.stringify(one.body)).not.toContain('cult leader');
  });
});

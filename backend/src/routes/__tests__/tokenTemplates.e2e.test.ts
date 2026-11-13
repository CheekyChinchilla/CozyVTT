/**
 * The token template library is the GM's.
 *
 * A template carries what a placed token keeps from players: GM notes, a
 * stat block, hit points, darkvision. The list and detail routes were open to
 * every member, so a player or spectator could read all of it with their
 * session cookie, while the map filtered the same fields off every token it
 * sent them. Reads are GM-only now, like the writes always were.
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

let gmId: string;
let playerId: string;
let spectatorId: string;
let campaignId: string;
let theirCampaignId: string;
let templateId: string;
let gm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let spectator: ReturnType<typeof request.agent>;

/** A token as it stands on a map: a townsperson the GM has written up. */
const TOKEN = {
  imageUrl: '',
  type: 'npc',
  disposition: 'neutral',
  displayMode: 'top-down',
  size: { width: 1, height: 1 },
  notes: 'Waits by the well',
  hp: { current: 9, max: 11, temp: 0 },
  showHpBar: true,
  sightRadius: 6,
} as const;

/** What the map's Save as Template sends for TOKEN, under `name`. */
function fromToken(name: string) {
  return {
    name,
    imageUrl: TOKEN.imageUrl || null,
    type: TOKEN.type,
    disposition: TOKEN.disposition,
    displayMode: TOKEN.displayMode,
    size: TOKEN.size,
    notes: TOKEN.notes,
    hp: TOKEN.hp,
    showHpBar: TOKEN.showHpBar,
    statBlock: null,
    sightRadius: TOKEN.sightRadius,
  };
}

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const stamp = Date.now();
  const gmUser = await createTestUser({ email: `tt-dm-${stamp}@test.cozyvtt.local`, displayName: 'Template GM' });
  const playerUser = await createTestUser({ email: `tt-player-${stamp}@test.cozyvtt.local`, displayName: 'Template Player' });
  const spectatorUser = await createTestUser({ email: `tt-spec-${stamp}@test.cozyvtt.local`, displayName: 'Template Spectator' });
  gmId = gmUser.id;
  playerId = playerUser.id;
  spectatorId = spectatorUser.id;
  campaignId = (await createTestCampaign(gmId, { name: `Templates ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  // A campaign the player and the spectator run, to copy templates to.
  theirCampaignId = (await createTestCampaign(playerId, { name: `Their Templates ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: playerId, campaignId: theirCampaignId, role: 'GM', characterIds: [] },
      { userId: spectatorId, campaignId: theirCampaignId, role: 'GM', characterIds: [] },
    ],
  });
  // One at a time: one address may have only two sign-ins checked at once.
  gm = await login(gmUser.email);
  player = await login(playerUser.email);
  spectator = await login(spectatorUser.email);

  const created = await gm.post(`/api/campaigns/${campaignId}/token-templates`).send({
    name: 'Traitor Innkeeper',
    type: 'npc',
    notes: 'GM ONLY: secretly the cult leader',
    hp: { current: 5, max: 5, temp: 0 },
  });
  expect(created.status).toBe(201);
  templateId = created.body.id;
});

afterAll(async () => {
  await prisma.tokenTemplate.deleteMany({ where: { campaignId: { in: [campaignId, theirCampaignId] } } });
  await cleanupCampaigns([campaignId, theirCampaignId]);
  await cleanupUsers([gmId, playerId, spectatorId]);
  await prisma.$disconnect();
});

describe('reading token templates', () => {
  it('is open to the GM', async () => {
    const list = await gm.get(`/api/campaigns/${campaignId}/token-templates`);
    expect(list.status).toBe(200);
    expect(list.body.templates.map((t: { name: string }) => t.name)).toContain('Traitor Innkeeper');
    const one = await gm.get(`/api/campaigns/${campaignId}/token-templates/${templateId}`);
    expect(one.status).toBe(200);
    expect(one.body.notes).toBe('GM ONLY: secretly the cult leader');
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

// The writes were always the GM's; nothing checked that a player or a
// spectator of the same campaign is turned away from them.
describe.each([
  ['a player', () => player],
  ['a spectator', () => spectator],
])('changing token templates as %s', (who: string, agent: () => ReturnType<typeof request.agent>) => {
  it('refuses an edit, and the template stays as it was', async () => {
    const res = await agent().put(`/api/campaigns/${campaignId}/token-templates/${templateId}`).send({ name: 'Honest Innkeeper', notes: 'nothing to see' });
    expect(res.status).toBe(403);
    const stored = await prisma.tokenTemplate.findUnique({ where: { id: templateId } });
    expect(stored?.name).toBe('Traitor Innkeeper');
    expect(stored?.notes).toBe('GM ONLY: secretly the cult leader');
  });

  it('refuses a delete, and the template is still there', async () => {
    const res = await agent().delete(`/api/campaigns/${campaignId}/token-templates/${templateId}`);
    expect(res.status).toBe(403);
    expect(await prisma.tokenTemplate.findUnique({ where: { id: templateId } })).not.toBeNull();
  });

  it('refuses saving a token as a template, and none is made', async () => {
    const res = await agent().post(`/api/campaigns/${campaignId}/token-templates/from-token`).send(fromToken(`Saved by ${who}`));
    expect(res.status).toBe(403);
    expect(await prisma.tokenTemplate.count({ where: { name: `Saved by ${who}` } })).toBe(0);
  });

  it('refuses making a template, and none is made', async () => {
    const res = await agent().post(`/api/campaigns/${campaignId}/token-templates`).send(fromToken(`Made by ${who}`));
    expect(res.status).toBe(403);
    expect(await prisma.tokenTemplate.count({ where: { name: `Made by ${who}` } })).toBe(0);
  });

  // They are the GM of the campaign copied to, so only their place in this
  // one turns them away.
  it('refuses copying a template to a campaign they run, and none is copied', async () => {
    const res = await agent().post(`/api/campaigns/${campaignId}/token-templates/${templateId}/copy-to/${theirCampaignId}`);
    expect(res.status).toBe(403);
    expect(await prisma.tokenTemplate.count({ where: { campaignId: theirCampaignId } })).toBe(0);
  });
});

// The bodies above are ones the GM's own requests succeed with, so a refusal
// is the role's doing and not the body's.
describe('the GM, with the same requests', () => {
  it('saves a token as a template', async () => {
    const res = await gm.post(`/api/campaigns/${campaignId}/token-templates/from-token`).send(fromToken('Saved by the GM'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Saved by the GM', notes: 'Waits by the well', hp: { current: 9, max: 11, temp: 0 } });
  });

  it('makes a template', async () => {
    const res = await gm.post(`/api/campaigns/${campaignId}/token-templates`).send(fromToken('Made by the GM'));
    expect(res.status).toBe(201);
  });

  it('copies one to a campaign they also run', async () => {
    await prisma.campaignMembership.create({ data: { userId: gmId, campaignId: theirCampaignId, role: 'GM', characterIds: [] } });
    const res = await gm.post(`/api/campaigns/${campaignId}/token-templates/${templateId}/copy-to/${theirCampaignId}`);
    expect(res.status).toBe(201);
    expect(await prisma.tokenTemplate.count({ where: { campaignId: theirCampaignId } })).toBe(1);
  });
});

/**
 * Every campaign route turns away the people its guard says it must.
 *
 * Which routes are the DM's alone, and which any member's, is written down
 * below and compared with the guard each route runs, read from the routers.
 * A route whose guard is loosened, or a new route, fails that comparison
 * until the list is changed on purpose. Then, for each route the DM alone may
 * use: a player, a spectator, a member of another campaign (403 each) and a
 * caller who is not signed in (401). For each route any member may use: the
 * member of another campaign and the caller who is not signed in. The guard
 * answers before the route does anything, so the ids after the campaign's
 * need not exist.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { mountedRoutes, routeKey, runs, type MountedRoute } from '../../__tests__/helpers/routeInventory';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { requireDM, requireCampaignMember, requireDMOrPlayer } from '../../middleware/rbac';

/** Routes only the campaign's DM may use. */
const DM_ONLY = [
  'PUT /api/campaigns/:campaignId',
  'PUT /api/campaigns/:campaignId/vibe',
  'GET /api/campaigns/:campaignId/invitable-users',
  'POST /api/campaigns/:campaignId/invite',
  'DELETE /api/campaigns/:campaignId/members/:userId',
  'PUT /api/campaigns/:campaignId/members/:userId/role',
  'DELETE /api/campaigns/:campaignId/messages/join-leave',
  'PUT /api/campaigns/:campaignId/sessions/:sessionId/notes',
  'POST /api/campaigns/:campaignId/sessions',
  'PUT /api/campaigns/:campaignId/sessions/:sessionId/pause',
  'PUT /api/campaigns/:campaignId/sessions/:sessionId/end',
  'PUT /api/campaigns/:campaignId/resume',
  'GET /api/campaigns/:campaignId/export',
  'POST /api/campaigns/:campaignId/documents',
  'DELETE /api/campaigns/:campaignId/documents/:assetId',
  'POST /api/campaigns/:campaignId/creatures/seed',
  'GET /api/campaigns/:campaignId/creatures',
  'GET /api/campaigns/:campaignId/creatures/:creatureId',
  'POST /api/campaigns/:campaignId/creatures',
  'PUT /api/campaigns/:campaignId/creatures/:creatureId',
  'DELETE /api/campaigns/:campaignId/creatures/:creatureId',
  'POST /api/campaigns/:campaignId/creatures/:creatureId/duplicate',
  'GET /api/campaigns/:campaignId/creatures/favorites/list',
  'POST /api/campaigns/:campaignId/creatures/:creatureId/favorite',
  'GET /api/campaigns/:campaignId/token-templates',
  'GET /api/campaigns/:campaignId/token-templates/:id',
  'POST /api/campaigns/:campaignId/token-templates',
  'PUT /api/campaigns/:campaignId/token-templates/:id',
  'DELETE /api/campaigns/:campaignId/token-templates/:id',
  'POST /api/campaigns/:campaignId/token-templates/from-token',
  'POST /api/campaigns/:campaignId/token-templates/:id/copy-to/:targetCampaignId',
  'POST /api/campaigns/:campaignId/maps',
  'POST /api/campaigns/:campaignId/maps/import-uvtt',
  'GET /api/campaigns/:campaignId/maps/:id/export-uvtt',
  'PUT /api/campaigns/:campaignId/maps/:id',
  'DELETE /api/campaigns/:campaignId/maps/:id',
  'PUT /api/campaigns/:campaignId/maps/:id/set-current',
  'POST /api/campaigns/:campaignId/maps/:id/tokens',
  'POST /api/campaigns/:campaignId/maps/:id/tokens/move',
  'DELETE /api/campaigns/:campaignId/maps/:id/tokens/:tokenId',
  'PUT /api/campaigns/:campaignId/maps/:id/walls',
  'POST /api/campaigns/:campaignId/maps/:id/walls',
  'DELETE /api/campaigns/:campaignId/maps/:id/walls/:sid',
  'PATCH /api/campaigns/:campaignId/maps/:id/walls/:sid',
  'PUT /api/campaigns/:campaignId/maps/:id/lights',
  'POST /api/campaigns/:campaignId/maps/:id/lights',
  'PATCH /api/campaigns/:campaignId/maps/:id/lights/:lightId',
  'DELETE /api/campaigns/:campaignId/maps/:id/lights/:lightId',
  'GET /api/campaigns/:campaignId/maps/:id/fog',
  'POST /api/campaigns/:campaignId/maps/:id/fog/operation',
  'PUT /api/campaigns/:campaignId/maps/:id/lighting',
];

/** Routes any member of the campaign may use, spectators included. */
const ANY_MEMBER = [
  'GET /api/campaigns/:campaignId',
  'GET /api/campaigns/:campaignId/characters',
  'GET /api/campaigns/:campaignId/messages',
  'GET /api/campaigns/:campaignId/dice-rolls',
  'GET /api/campaigns/:campaignId/notes',
  'POST /api/campaigns/:campaignId/notes',
  'GET /api/campaigns/:campaignId/notes/:noteId',
  'PUT /api/campaigns/:campaignId/notes/:noteId',
  'DELETE /api/campaigns/:campaignId/notes/:noteId',
  'GET /api/campaigns/:campaignId/sessions',
  'GET /api/campaigns/:campaignId/macros',
  'POST /api/campaigns/:campaignId/macros',
  'GET /api/campaigns/:campaignId/macros/:macroId',
  'PUT /api/campaigns/:campaignId/macros/:macroId',
  'DELETE /api/campaigns/:campaignId/macros/:macroId',
  'GET /api/campaigns/:campaignId/documents',
  'GET /api/campaigns/:campaignId/creatures/seed/status',
  'GET /api/campaigns/:campaignId/maps',
  'GET /api/campaigns/:campaignId/maps/:id',
  'PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId',
  'GET /api/campaigns/:campaignId/maps/:id/walls',
  'GET /api/campaigns/:campaignId/maps/:id/lights',
];

const app = createTestApp();
const routes = mountedRoutes(app);
const dmOnly = routes.filter((r) => runs(r, requireDM));
const anyMember = routes.filter((r) => runs(r, requireCampaignMember));

const users: string[] = [];
const campaigns: string[] = [];
let campaignId: string;
let player: request.Agent;
let spectator: request.Agent;
let stranger: request.Agent;

async function member(role: 'DM' | 'PLAYER' | 'SPECTATOR', campaign: string): Promise<request.Agent> {
  const user = await createTestUser({ displayName: `Guard ${role}` });
  users.push(user.id);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId: campaign, role, characterIds: [] } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const owner = await createTestUser({ displayName: 'Guard owner' });
  users.push(owner.id);
  const campaign = await createTestCampaign(owner.id);
  campaigns.push(campaign.id);
  campaignId = campaign.id;
  await prisma.campaignMembership.create({ data: { userId: owner.id, campaignId, role: 'DM', characterIds: [] } });

  player = await member('PLAYER', campaignId);
  spectator = await member('SPECTATOR', campaignId);

  const elsewhereOwner = await createTestUser({ displayName: 'Other DM' });
  users.push(elsewhereOwner.id);
  const elsewhere = await createTestCampaign(elsewhereOwner.id);
  campaigns.push(elsewhere.id);
  stranger = await member('DM', elsewhere.id);
});

afterAll(async () => {
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

/** The route's path with this campaign's id and made-up ids for the rest. */
const concrete = (route: MountedRoute): string =>
  route.path.replace(/:(\w+)/g, (_m, name: string) => (name === 'campaignId' ? campaignId : randomUUID()));

function send(agent: request.Agent | null, route: MountedRoute): request.Test {
  const client = agent ?? request(app);
  const url = concrete(route);
  switch (route.method) {
    case 'GET':
      return client.get(url);
    case 'POST':
      return client.post(url).send({});
    case 'PUT':
      return client.put(url).send({});
    case 'PATCH':
      return client.patch(url).send({});
    case 'DELETE':
      return client.delete(url);
    default:
      throw new Error(`No case for ${route.method}`);
  }
}

it('has the guards written down here', () => {
  // A difference is a route whose guard changed, or a new one. Make sure the
  // change is meant, then move or add the route in the lists above.
  expect(dmOnly.map(routeKey).sort()).toEqual([...DM_ONLY].sort());
  expect(anyMember.map(routeKey).sort()).toEqual([...ANY_MEMBER].sort());
  // Not used by any route today. When one is, give it a case below.
  expect(routes.filter((r) => runs(r, requireDMOrPlayer)).map(routeKey)).toEqual([]);
});

it('has every campaign route guarded, or listed as deciding in its own handler', () => {
  // These answer for themselves, and their refusals are tested where named.
  const ownChecks: Record<string, string> = {
    'DELETE /api/campaigns/:campaignId': 'this file, below',
    'PUT /api/campaigns/:campaignId/dm': 'dmTransfer.e2e.test.ts',
    // A removed member reading their own notes and macros: no membership by
    // design, and every query is scoped to the caller.
    'GET /api/campaigns/left/:campaignId': 'leftCampaignNotes.e2e.test.ts',
  };
  const unguarded = routes
    .filter((r) => r.path.includes(':campaignId') && !runs(r, requireDM) && !runs(r, requireCampaignMember))
    .map(routeKey)
    .filter((key) => !(key in ownChecks));
  expect(unguarded).toEqual([]);
});

describe('DELETE /api/campaigns/:campaignId, the owner\'s or an admin\'s alone,', () => {
  it('refuses a player, a spectator, a member of another campaign and a caller who is not signed in', async () => {
    for (const agent of [player, spectator, stranger]) {
      const res = await agent.delete(`/api/campaigns/${campaignId}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Only the campaign owner or admin can delete this campaign');
    }
    expect((await request(app).delete(`/api/campaigns/${campaignId}`)).status).toBe(401);
    expect(await prisma.campaign.findUnique({ where: { id: campaignId } })).not.toBeNull();
  });
});

describe.each(dmOnly.map((r) => [routeKey(r), r] as const))('%s, the DM\'s alone,', (_key, route) => {
  it('refuses a player and a spectator', async () => {
    for (const agent of [player, spectator]) {
      const res = await send(agent, route);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('This action requires Dungeon Master (DM) role');
    }
  });

  it('refuses a member of another campaign and a caller who is not signed in', async () => {
    const outsider = await send(stranger, route);
    expect(outsider.status).toBe(403);
    expect(outsider.body.message).toBe('You are not a member of this campaign');
    expect((await send(null, route)).status).toBe(401);
  });
});

describe.each(anyMember.map((r) => [routeKey(r), r] as const))('%s, for members,', (_key, route) => {
  it('refuses a member of another campaign and a caller who is not signed in', async () => {
    const outsider = await send(stranger, route);
    expect(outsider.status).toBe(403);
    expect(outsider.body.message).toBe('You are not a member of this campaign');
    expect((await send(null, route)).status).toBe(401);
  });
});

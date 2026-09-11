/**
 * Saved dice macros — End-to-End Tests
 *
 * A macro is a player's own named roll for one campaign. Two things are being
 * pinned here.
 *
 * **It is private, including from the DM.** Running the game is not a reason to
 * read what somebody saved for themselves, and the rule has to hold on the
 * server rather than by the client not asking. A macro belonging to someone else
 * answers 404 rather than 403, so the response cannot be used to confirm that an
 * id exists.
 *
 * **It is always rollable.** The expression is checked on the way in against the
 * thing that does the rolling, so a saved macro cannot be a button that fails
 * every time it is pressed.
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
import { MAX_MACROS_PER_CAMPAIGN, MAX_MACRO_NAME_LENGTH } from '../../validators/diceMacros';

const app = createTestApp();

describe('/api/campaigns/:campaignId/macros', () => {
  let dmId: string;
  let playerId: string;
  let outsiderId: string;
  let campaignId: string;
  let otherCampaignId: string;
  const emails: Record<string, string> = {};

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  beforeAll(async () => {
    const stamp = Date.now();
    for (const who of ['dm', 'player', 'outsider']) {
      emails[who] = `macros-${who}-${stamp}@test.cozyvtt.local`;
    }

    const [dm, player, outsider] = await Promise.all([
      createTestUser({ email: emails.dm, displayName: 'Macro DM' }),
      createTestUser({ email: emails.player, displayName: 'Macro Player' }),
      createTestUser({ email: emails.outsider, displayName: 'Macro Outsider' }),
    ]);
    dmId = dm.id;
    playerId = player.id;
    outsiderId = outsider.id;

    const campaign = await createTestCampaign(dmId, { name: `Macros ${stamp}` });
    campaignId = campaign.id;

    // A second campaign the player also belongs to, to prove macros do not leak
    // between tables — the isolation the feature request specifically asked for.
    const other = await createTestCampaign(dmId, { name: `Macros Other ${stamp}` });
    otherCampaignId = other.id;

    await prisma.campaignMembership.createMany({
      data: [
        { userId: dmId, campaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
        { userId: dmId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId: otherCampaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId, otherCampaignId]);
    await cleanupUsers([dmId, playerId, outsiderId]);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.diceMacro.deleteMany({ where: { campaignId: { in: [campaignId, otherCampaignId] } } });
  });

  const create = (
    agent: ReturnType<typeof request.agent>,
    body: Record<string, unknown>,
    cid = campaignId
  ) => agent.post(`/api/campaigns/${cid}/macros`).send(body);

  describe('saving a macro', () => {
    it('saves a name and an expression', async () => {
      const agent = await login(emails.player);
      const res = await create(agent, { name: 'Stat roll', expression: '4d6kh3' });

      expect(res.status).toBe(201);
      expect(res.body.macro.name).toBe('Stat roll');
      expect(res.body.macro.expression).toBe('4d6kh3');
    });

    it('refuses an expression that cannot be rolled', async () => {
      const agent = await login(emails.player);

      // Charset-wise these look like dice; the roller refuses all of them. A
      // saved macro must never be a button that fails when pressed.
      for (const expression of ['dddd', '2d6+', '2d6*', '101d20']) {
        const res = await create(agent, { name: 'Bad', expression });
        expect(res.status).toBe(400);
      }

      expect(await prisma.diceMacro.count({ where: { campaignId } })).toBe(0);
    });

    it('refuses a blank or oversized name', async () => {
      const agent = await login(emails.player);
      expect((await create(agent, { name: '   ', expression: '1d20' })).status).toBe(400);
      expect(
        (await create(agent, { name: 'x'.repeat(MAX_MACRO_NAME_LENGTH + 1), expression: '1d20' })).status
      ).toBe(400);
    });

    it(`refuses more than ${MAX_MACROS_PER_CAMPAIGN} in one campaign`, async () => {
      await prisma.diceMacro.createMany({
        data: Array.from({ length: MAX_MACROS_PER_CAMPAIGN }, (_, i) => ({
          userId: playerId,
          campaignId,
          name: `Macro ${i}`,
          expression: '1d20',
        })),
      });

      const agent = await login(emails.player);
      const res = await create(agent, { name: 'One too many', expression: '1d20' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/delete one/i);
    });

    it('counts the cap per campaign, not across all of them', async () => {
      await prisma.diceMacro.createMany({
        data: Array.from({ length: MAX_MACROS_PER_CAMPAIGN }, (_, i) => ({
          userId: playerId,
          campaignId,
          name: `Macro ${i}`,
          expression: '1d20',
        })),
      });

      const agent = await login(emails.player);
      const res = await create(agent, { name: 'Different table', expression: '1d20' }, otherCampaignId);
      expect(res.status).toBe(201);
    });
  });

  describe('privacy', () => {
    let playerMacroId: string;

    beforeEach(async () => {
      const macro = await prisma.diceMacro.create({
        data: { userId: playerId, campaignId, name: 'Player only', expression: '2d6+3' },
      });
      playerMacroId = macro.id;
      await prisma.diceMacro.create({
        data: { userId: dmId, campaignId, name: 'DM only', expression: '1d100' },
      });
    });

    it('lists only your own', async () => {
      const agent = await login(emails.player);
      const res = await agent.get(`/api/campaigns/${campaignId}/macros`);

      expect(res.status).toBe(200);
      expect(res.body.macros).toHaveLength(1);
      expect(res.body.macros[0].name).toBe('Player only');
    });

    it('hides a player\'s macros from the DM', async () => {
      // Running the game is not a reason to read what a player saved for
      // themselves.
      const agent = await login(emails.dm);
      const list = await agent.get(`/api/campaigns/${campaignId}/macros`);
      expect(list.body.macros.map((m: { name: string }) => m.name)).toEqual(['DM only']);

      const read = await agent.get(`/api/campaigns/${campaignId}/macros/${playerMacroId}`);
      // 404 rather than 403: the answer must not confirm the id exists.
      expect(read.status).toBe(404);
    });

    it('refuses to let the DM edit or delete a player\'s macro', async () => {
      const agent = await login(emails.dm);

      expect((await agent.put(`/api/campaigns/${campaignId}/macros/${playerMacroId}`)
        .send({ name: 'Hijacked' })).status).toBe(404);
      expect((await agent.delete(`/api/campaigns/${campaignId}/macros/${playerMacroId}`)).status).toBe(404);

      const still = await prisma.diceMacro.findUnique({ where: { id: playerMacroId } });
      expect(still?.name).toBe('Player only');
    });

    it('refuses someone who is not in the campaign', async () => {
      const agent = await login(emails.outsider);
      expect((await agent.get(`/api/campaigns/${campaignId}/macros`)).status).toBe(403);
    });

    it('refuses an unauthenticated caller', async () => {
      expect((await request(app).get(`/api/campaigns/${campaignId}/macros`)).status).toBe(401);
    });

    it('does not leak macros between campaigns', async () => {
      await prisma.diceMacro.create({
        data: { userId: playerId, campaignId: otherCampaignId, name: 'Other table', expression: '1d4' },
      });

      const agent = await login(emails.player);
      const here = await agent.get(`/api/campaigns/${campaignId}/macros`);
      expect(here.body.macros.map((m: { name: string }) => m.name)).toEqual(['Player only']);

      // And the id from one campaign is not reachable through the other.
      const crossed = await agent.get(`/api/campaigns/${otherCampaignId}/macros/${playerMacroId}`);
      expect(crossed.status).toBe(404);
    });
  });

  describe('editing and deleting', () => {
    let macroId: string;

    beforeEach(async () => {
      const macro = await prisma.diceMacro.create({
        data: { userId: playerId, campaignId, name: 'Original', expression: '1d20' },
      });
      macroId = macro.id;
    });

    it('renames without touching the expression', async () => {
      const agent = await login(emails.player);
      const res = await agent.put(`/api/campaigns/${campaignId}/macros/${macroId}`).send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.macro.name).toBe('Renamed');
      expect(res.body.macro.expression).toBe('1d20');
    });

    it('corrects the expression without touching the name', async () => {
      const agent = await login(emails.player);
      const res = await agent.put(`/api/campaigns/${campaignId}/macros/${macroId}`).send({ expression: '2d6+3' });

      expect(res.status).toBe(200);
      expect(res.body.macro.name).toBe('Original');
      expect(res.body.macro.expression).toBe('2d6+3');
    });

    it('will not let an edit make it unrollable', async () => {
      const agent = await login(emails.player);
      const res = await agent.put(`/api/campaigns/${campaignId}/macros/${macroId}`).send({ expression: '2d6+' });

      expect(res.status).toBe(400);
      const unchanged = await prisma.diceMacro.findUnique({ where: { id: macroId } });
      expect(unchanged?.expression).toBe('1d20');
    });

    it('refuses an edit that changes nothing', async () => {
      const agent = await login(emails.player);
      const res = await agent.put(`/api/campaigns/${campaignId}/macros/${macroId}`).send({});
      expect(res.status).toBe(400);
    });

    it('deletes', async () => {
      const agent = await login(emails.player);
      expect((await agent.delete(`/api/campaigns/${campaignId}/macros/${macroId}`)).status).toBe(200);
      expect(await prisma.diceMacro.findUnique({ where: { id: macroId } })).toBeNull();
    });

    it('404s on a macro that does not exist', async () => {
      const agent = await login(emails.player);
      const missing = '00000000-0000-4000-8000-000000000000';
      expect((await agent.get(`/api/campaigns/${campaignId}/macros/${missing}`)).status).toBe(404);
      expect((await agent.delete(`/api/campaigns/${campaignId}/macros/${missing}`)).status).toBe(404);
    });
  });

  describe('ordering', () => {
    it('lists oldest first, and an edit does not move one', async () => {
      const agent = await login(emails.player);
      for (const name of ['First', 'Second', 'Third']) {
        const res = await create(agent, { name, expression: '1d20' });
        expect(res.status).toBe(201);
      }

      const before = await agent.get(`/api/campaigns/${campaignId}/macros`);
      expect(before.body.macros.map((m: { name: string }) => m.name)).toEqual(['First', 'Second', 'Third']);

      // Editing the first must not send it to the end, or to the front. These
      // are buttons people aim at without looking.
      const firstId = before.body.macros[0].id;
      await agent.put(`/api/campaigns/${campaignId}/macros/${firstId}`).send({ name: 'First edited' });

      const after = await agent.get(`/api/campaigns/${campaignId}/macros`);
      expect(after.body.macros.map((m: { name: string }) => m.name)).toEqual(['First edited', 'Second', 'Third']);
    });
  });

  describe('cascade', () => {
    it('a macro goes with the campaign it belongs to', async () => {
      const stamp = Date.now();
      const doomed = await createTestCampaign(dmId, { name: `Doomed ${stamp}` });
      await prisma.campaignMembership.create({
        data: { userId: playerId, campaignId: doomed.id, role: 'PLAYER', characterIds: [] },
      });
      const macro = await prisma.diceMacro.create({
        data: { userId: playerId, campaignId: doomed.id, name: 'Goes away', expression: '1d20' },
      });

      await prisma.campaign.delete({ where: { id: doomed.id } });

      expect(await prisma.diceMacro.findUnique({ where: { id: macro.id } })).toBeNull();
    });
  });
});

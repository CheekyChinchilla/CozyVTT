/**
 * Creature Template Routes — End-to-End Tests
 *
 * These routes previously had no test coverage and no request validation: the
 * only checks were that `name` was a string and `statBlock` was an object,
 * after which the entire stat block went to JSONB unread. That is how a saving
 * throw of +30 could be stored against a commoner and rolled as 1d20+30.
 *
 * Requires PostgreSQL at DATABASE_URL (same as the other route e2e tests).
 */

import request from 'supertest';
import { GameSystem } from '@prisma/client';
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

/** A minimal valid stat block: a commoner with Wisdom 14. */
const commonerStatBlock = {
  ac: 10,
  hpMax: 4,
  speed: '30 ft.',
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 },
  challengeRating: '0',
};

describe('Creature template routes', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let dmAgent: ReturnType<typeof request.agent>;
  let playerAgent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  beforeAll(async () => {
    const dmEmail = `test_creature_dm_${Date.now()}@test.invalid`;
    const playerEmail = `test_creature_player_${Date.now()}@test.invalid`;

    const dm = await createTestUser({ email: dmEmail, isApproved: true });
    const player = await createTestUser({ email: playerEmail, isApproved: true });
    dmId = dm.id;
    playerId = player.id;

    const campaign = await createTestCampaign(dmId, { gameSystem: GameSystem.DND_5E });
    campaignId = campaign.id;

    await prisma.campaignMembership.createMany({
      data: [
        { campaignId, userId: dmId, role: 'DM' },
        { campaignId, userId: playerId, role: 'PLAYER' },
      ],
    });

    dmAgent = await login(dmEmail);
    playerAgent = await login(playerEmail);
  });

  afterAll(async () => {
    await prisma.creatureTemplate.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId]);
    await prisma.$disconnect();
  });

  describe('POST / — create', () => {
    it('creates a creature with a valid stat block', async () => {
      const res = await dmAgent
        .post(`/api/campaigns/${campaignId}/creatures`)
        .send({ name: 'Old Lady', statBlock: commonerStatBlock });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Old Lady');
      expect(res.body.source).toBe('custom');
      expect(res.body.statBlock.abilities.wis).toBe(14);
    });

    // The reported bug, at the layer that has to be authoritative: even if a
    // client bypasses the editor entirely, the API must not store this.
    it('rejects an absurd saving throw', async () => {
      const res = await dmAgent.post(`/api/campaigns/${campaignId}/creatures`).send({
        name: 'Cheating Commoner',
        statBlock: { ...commonerStatBlock, savingThrows: { wis: 30000 } },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('rejects an absurd skill bonus', async () => {
      const res = await dmAgent.post(`/api/campaigns/${campaignId}/creatures`).send({
        name: 'Cheating Commoner',
        statBlock: { ...commonerStatBlock, skills: { perception: 999 } },
      });

      expect(res.status).toBe(400);
    });

    it('accepts a plausible derived bonus', async () => {
      // Wisdom 14 (+2) with proficiency at CR 0 (+2) is +4 Perception.
      const res = await dmAgent.post(`/api/campaigns/${campaignId}/creatures`).send({
        name: 'Perceptive Commoner',
        statBlock: {
          ...commonerStatBlock,
          skills: { perception: 4 },
          proficiencies: { skills: { perception: 'proficient' } },
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.statBlock.skills.perception).toBe(4);
      expect(res.body.statBlock.proficiencies.skills.perception).toBe('proficient');
    });

    it('rejects a missing name', async () => {
      const res = await dmAgent
        .post(`/api/campaigns/${campaignId}/creatures`)
        .send({ statBlock: commonerStatBlock });

      expect(res.status).toBe(400);
    });

    it('rejects a missing stat block', async () => {
      const res = await dmAgent
        .post(`/api/campaigns/${campaignId}/creatures`)
        .send({ name: 'Shapeless' });

      expect(res.status).toBe(400);
    });

    it('rejects an out-of-range ability score', async () => {
      const res = await dmAgent.post(`/api/campaigns/${campaignId}/creatures`).send({
        name: 'Impossible',
        statBlock: { ...commonerStatBlock, abilities: { ...commonerStatBlock.abilities, str: 99 } },
      });

      expect(res.status).toBe(400);
    });

    it('refuses a player who is not the DM', async () => {
      const res = await playerAgent
        .post(`/api/campaigns/${campaignId}/creatures`)
        .send({ name: 'Player Made', statBlock: commonerStatBlock });

      expect(res.status).toBe(403);
    });

    it('refuses an unauthenticated request', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaignId}/creatures`)
        .send({ name: 'Anonymous', statBlock: commonerStatBlock });

      expect([401, 403]).toContain(res.status);
    });
  });

  describe('PUT /:creatureId — update', () => {
    let creatureId: string;

    beforeEach(async () => {
      const res = await dmAgent
        .post(`/api/campaigns/${campaignId}/creatures`)
        .send({ name: 'Editable', statBlock: { ...commonerStatBlock, skills: { stealth: 2 } } });
      creatureId = res.body.id;
    });

    it('updates a creature', async () => {
      const res = await dmAgent
        .put(`/api/campaigns/${campaignId}/creatures/${creatureId}`)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
    });

    it('leaves skills intact when only the name changes', async () => {
      await dmAgent
        .put(`/api/campaigns/${campaignId}/creatures/${creatureId}`)
        .send({ name: 'Renamed Again' });

      const res = await dmAgent.get(`/api/campaigns/${campaignId}/creatures/${creatureId}`);
      expect(res.body.statBlock.skills).toEqual({ stealth: 2 });
    });

    it('rejects an absurd bonus on update', async () => {
      const res = await dmAgent
        .put(`/api/campaigns/${campaignId}/creatures/${creatureId}`)
        .send({ statBlock: { ...commonerStatBlock, savingThrows: { wis: 500 } } });

      expect(res.status).toBe(400);
    });

    it('rejects an empty body', async () => {
      const res = await dmAgent
        .put(`/api/campaigns/${campaignId}/creatures/${creatureId}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('refuses a player who is not the DM', async () => {
      const res = await playerAgent
        .put(`/api/campaigns/${campaignId}/creatures/${creatureId}`)
        .send({ name: 'Hijacked' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET / — game system filtering', () => {
    // A Call of Cthulhu table has no use for D&D monsters in its browse list,
    // but the filter has to let system-agnostic creatures through or a campaign
    // could lose sight of its own content.
    let dndId: string;
    let cocId: string;
    let agnosticId: string;

    beforeAll(async () => {
      const made = await prisma.creatureTemplate.createMany({
        data: [
          {
            name: 'Filter Test Dragon',
            source: 'srd',
            gameSystem: GameSystem.DND_5E,
            statBlock: commonerStatBlock,
            campaignId: null,
          },
          {
            name: 'Filter Test Deep One',
            source: 'custom',
            gameSystem: GameSystem.CALL_OF_CTHULHU_7E,
            statBlock: commonerStatBlock,
            campaignId: null,
          },
          {
            name: 'Filter Test Anything',
            source: 'custom',
            gameSystem: null,
            statBlock: commonerStatBlock,
            campaignId: null,
          },
        ],
      });
      expect(made.count).toBe(3);

      const rows = await prisma.creatureTemplate.findMany({
        where: { name: { startsWith: 'Filter Test ' } },
        select: { id: true, name: true },
      });
      dndId = rows.find((r) => r.name.endsWith('Dragon'))!.id;
      cocId = rows.find((r) => r.name.endsWith('Deep One'))!.id;
      agnosticId = rows.find((r) => r.name.endsWith('Anything'))!.id;
    });

    afterAll(async () => {
      await prisma.creatureTemplate.deleteMany({
        where: { id: { in: [dndId, cocId, agnosticId] } },
      });
    });

    async function listNames(query: string): Promise<string[]> {
      const res = await dmAgent.get(
        `/api/campaigns/${campaignId}/creatures?limit=100&search=Filter Test ${query}`
      );
      expect(res.status).toBe(200);
      return res.body.creatures.map((c: { name: string }) => c.name);
    }

    it('returns every system when no filter is given', async () => {
      const names = await listNames('');
      expect(names).toEqual(
        expect.arrayContaining([
          'Filter Test Dragon',
          'Filter Test Deep One',
          'Filter Test Anything',
        ])
      );
    });

    it('excludes other systems when filtered', async () => {
      const res = await dmAgent.get(
        `/api/campaigns/${campaignId}/creatures?limit=100&search=Filter Test &gameSystem=DND_5E`
      );
      const names = res.body.creatures.map((c: { name: string }) => c.name);

      expect(names).toContain('Filter Test Dragon');
      expect(names).not.toContain('Filter Test Deep One');
    });

    it('always includes creatures with no system recorded', async () => {
      const res = await dmAgent.get(
        `/api/campaigns/${campaignId}/creatures?limit=100&search=Filter Test &gameSystem=DND_5E`
      );
      const names = res.body.creatures.map((c: { name: string }) => c.name);

      expect(names).toContain('Filter Test Anything');
    });

    it('filters to a non-5e system correctly', async () => {
      const res = await dmAgent.get(
        `/api/campaigns/${campaignId}/creatures?limit=100&search=Filter Test &gameSystem=CALL_OF_CTHULHU_7E`
      );
      const names = res.body.creatures.map((c: { name: string }) => c.name);

      expect(names).toContain('Filter Test Deep One');
      expect(names).toContain('Filter Test Anything');
      expect(names).not.toContain('Filter Test Dragon');
    });

    it('still applies the campaign visibility scope alongside the system filter', async () => {
      // A creature belonging to another campaign must not appear even when its
      // system matches — the two scopes are ANDed, not merged into one OR.
      const otherCampaign = await createTestCampaign(dmId, { gameSystem: GameSystem.DND_5E });
      const hidden = await prisma.creatureTemplate.create({
        data: {
          name: 'Filter Test Hidden',
          source: 'custom',
          gameSystem: GameSystem.DND_5E,
          statBlock: commonerStatBlock,
          campaignId: otherCampaign.id,
        },
      });

      const res = await dmAgent.get(
        `/api/campaigns/${campaignId}/creatures?limit=100&search=Filter Test &gameSystem=DND_5E`
      );
      const names = res.body.creatures.map((c: { name: string }) => c.name);

      expect(names).not.toContain('Filter Test Hidden');

      await prisma.creatureTemplate.delete({ where: { id: hidden.id } });
      await cleanupCampaigns([otherCampaign.id]);
    });
  });

  describe('SRD creatures stay read-only', () => {
    let srdId: string;

    beforeAll(async () => {
      const srd = await prisma.creatureTemplate.create({
        data: {
          name: 'SRD Test Goblin',
          source: 'srd',
          gameSystem: GameSystem.DND_5E,
          challengeRating: '1/4',
          statBlock: { ...commonerStatBlock, skills: { stealth: 6 } },
          campaignId: null,
        },
      });
      srdId = srd.id;
    });

    afterAll(async () => {
      await prisma.creatureTemplate.deleteMany({ where: { id: srdId } });
    });

    it('cannot be edited', async () => {
      const res = await dmAgent
        .put(`/api/campaigns/${campaignId}/creatures/${srdId}`)
        .send({ name: 'Tampered' });

      expect(res.status).toBe(403);
    });

    it('cannot be deleted', async () => {
      const res = await dmAgent.delete(`/api/campaigns/${campaignId}/creatures/${srdId}`);
      expect(res.status).toBe(403);
    });
  });

  // The library is the DM's: a template holds a stat block and the DM's
  // homebrew, and the client shows the library to the DM alone. Reading it was
  // open to every member, which handed a player what the map keeps from them.
  describe('reading the library as a player', () => {
    it('cannot list creatures', async () => {
      const res = await playerAgent.get(`/api/campaigns/${campaignId}/creatures`);
      expect(res.status).toBe(403);
    });

    it('cannot read one creature', async () => {
      const list = await dmAgent.get(`/api/campaigns/${campaignId}/creatures?limit=1`);
      expect(list.status).toBe(200);
      const id = list.body.creatures[0]?.id;
      expect(id).toBeDefined();
      const res = await playerAgent.get(`/api/campaigns/${campaignId}/creatures/${id}`);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('statBlock');
    });

    it('cannot list or set favourites', async () => {
      const list = await dmAgent.get(`/api/campaigns/${campaignId}/creatures?limit=1`);
      const id = list.body.creatures[0]?.id;
      expect((await playerAgent.get(`/api/campaigns/${campaignId}/creatures/favorites/list`)).status).toBe(403);
      expect((await playerAgent.post(`/api/campaigns/${campaignId}/creatures/${id}/favorite`)).status).toBe(403);
    });
  });
});

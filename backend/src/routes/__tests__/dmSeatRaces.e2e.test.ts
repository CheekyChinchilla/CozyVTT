/**
 * A campaign keeps exactly one DM, whatever happens at the same moment.
 *
 * Handing the DM seat over, changing a member's role, removing a member and
 * deleting an account each read who sits as DM and then wrote, as separate
 * steps. A hand-over landing between the two left the write acting on what
 * had been true: two hand-overs to different members made two DMs, a role
 * change or a removal of the member just handed the seat left none, and an
 * account deleted while the seat was handed to it took the seat with it.
 * Each read and its write are now one serializable transaction, and deleting
 * the account of anyone who sits as DM, owner or not, is refused.
 *
 * To make the overlap happen every time, the read a request decides on is
 * held back while the competing request runs from start to finish: the
 * first request then writes on what it read before the other one committed.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type express from 'express';
import { createPrismaClient } from '../../config/prismaClient';

// The test helpers import config/database, so they are imported once the
// app's client is set below; otherwise the app would use a client of its own.
type Helpers = typeof import('../../__tests__/helpers/db');
let helpers: Helpers;
const TEST_PASSWORD = 'TestPass1!Cozy';

jest.setTimeout(30000);

/** A read to hold back once, and what runs while it is held. */
interface Hold {
  model: string;
  operations: string[];
  matches: (args: unknown) => boolean;
  meanwhile: () => Promise<unknown>;
}
let hold: Hold | null = null;

let app: express.Express;
const appClient = createPrismaClient();

beforeAll(async () => {
  // The app's client, which config/database.ts takes from here when it is set.
  (global as unknown as { prisma?: unknown }).prisma = appClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const answer = await query(args);
          const held = hold;
          if (held && held.model === model && held.operations.includes(operation) && held.matches(args)) {
            hold = null;
            await held.meanwhile();
          }
          return answer;
        },
      },
    },
  });
  helpers = require('../../__tests__/helpers/db') as Helpers;
  expect(helpers.TEST_PASSWORD).toBe(TEST_PASSWORD);
  const { createTestApp } = require('../../__tests__/helpers/test-app') as typeof import('../../__tests__/helpers/test-app');
  app = createTestApp();
});

const users: string[] = [];
const campaigns: string[] = [];

afterAll(async () => {
  await helpers.cleanupCampaigns(campaigns);
  await helpers.cleanupUsers(users);
  await helpers.prisma.$disconnect();
  await appClient.$disconnect();
});

afterEach(() => {
  hold = null;
});

/** The JSON of a query's arguments, to look for an id in. */
const mentions = (args: unknown, id: string) => JSON.stringify(args ?? null).includes(id);

/** A campaign owned by Alice, who sits as a player, run by Dan, with Bob and Cara as players. */
async function table() {
  const make = async (name: string) => {
    const u = await helpers.createTestUser({ displayName: name });
    users.push(u.id);
    return u;
  };
  const [alice, dan, bob, cara] = [await make('Alice'), await make('Dan'), await make('Bob'), await make('Cara')];
  const campaign = await helpers.createTestCampaign(alice.id, { name: `DM seat ${Date.now()}` });
  campaigns.push(campaign.id);
  await helpers.prisma.campaignMembership.createMany({
    data: [
      { campaignId: campaign.id, userId: alice.id, role: 'PLAYER' },
      { campaignId: campaign.id, userId: dan.id, role: 'DM' },
      { campaignId: campaign.id, userId: bob.id, role: 'PLAYER' },
      { campaignId: campaign.id, userId: cara.id, role: 'PLAYER' },
    ],
  });
  const signIn = async (email: string) => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
    return agent;
  };
  return {
    campaignId: campaign.id,
    alice, dan, bob, cara,
    asAlice: await signIn(alice.email),
    asDan: await signIn(dan.email),
  };
}

const dms = (campaignId: string) =>
  helpers.prisma.campaignMembership.findMany({ where: { campaignId, role: 'DM' }, select: { userId: true } });

describe('two hand-overs at the same moment', () => {
  it('leave one DM', async () => {
    const t = await table();
    let second: request.Response | undefined;
    // Dan hands the seat to Bob; while his request has read that he is the
    // DM, Alice (the owner) hands it to Cara.
    hold = {
      model: 'CampaignMembership',
      operations: ['findFirst', 'findMany'],
      matches: (args) => mentions(args, t.campaignId) && mentions(args, '"DM"'),
      meanwhile: async () => { second = await t.asAlice.put(`/api/campaigns/${t.campaignId}/dm`).send({ userId: t.cara.id }); },
    };

    const first = await t.asDan.put(`/api/campaigns/${t.campaignId}/dm`).send({ userId: t.bob.id });

    expect(second?.status).toBe(200);
    expect(await dms(t.campaignId)).toHaveLength(1);
    // Dan no longer held the seat once Alice had handed it on.
    expect(first.status).toBe(403);
    expect(await dms(t.campaignId)).toEqual([{ userId: t.cara.id }]);
  });
});

describe('a role change racing a hand-over', () => {
  it('cannot take the seat from the member just handed it', async () => {
    const t = await table();
    let handover: request.Response | undefined;
    hold = {
      model: 'CampaignMembership',
      operations: ['findUnique'],
      matches: (args) => mentions(args, t.bob.id),
      meanwhile: async () => { handover = await t.asAlice.put(`/api/campaigns/${t.campaignId}/dm`).send({ userId: t.bob.id }); },
    };

    const roleChange = await t.asDan.put(`/api/campaigns/${t.campaignId}/members/${t.bob.id}/role`).send({ role: 'SPECTATOR' });

    expect(handover?.status).toBe(200);
    expect(roleChange.status).toBe(400);
    expect(await dms(t.campaignId)).toEqual([{ userId: t.bob.id }]);
  });
});

describe('a removal racing a hand-over', () => {
  it('cannot remove the member just handed the seat', async () => {
    const t = await table();
    let handover: request.Response | undefined;
    hold = {
      model: 'CampaignMembership',
      operations: ['findUnique'],
      matches: (args) => mentions(args, t.bob.id),
      meanwhile: async () => { handover = await t.asAlice.put(`/api/campaigns/${t.campaignId}/dm`).send({ userId: t.bob.id }); },
    };

    const removal = await t.asDan.delete(`/api/campaigns/${t.campaignId}/members/${t.bob.id}`);

    expect(handover?.status).toBe(200);
    expect(removal.status).toBe(400);
    expect(await dms(t.campaignId)).toEqual([{ userId: t.bob.id }]);
  });
});

describe('a leave racing a hand-over', () => {
  it('cannot take out the member just handed the seat', async () => {
    const t = await table();
    const asBob = request.agent(app);
    expect((await asBob.post('/api/auth/login').send({ email: t.bob.email, password: TEST_PASSWORD })).status).toBe(200);
    let handover: request.Response | undefined;
    // Bob leaves; while his leave has read that he is a player, Alice (the
    // owner) hands him the seat. The read held is the leave's own, which
    // selects the role; the guard's before it does not.
    hold = {
      model: 'CampaignMembership',
      operations: ['findUnique'],
      matches: (args) => mentions(args, t.bob.id) && mentions(args, '"select"'),
      meanwhile: async () => { handover = await t.asAlice.put(`/api/campaigns/${t.campaignId}/dm`).send({ userId: t.bob.id }); },
    };

    const leave = await asBob.post(`/api/campaigns/${t.campaignId}/leave`);

    expect(handover?.status).toBe(200);
    expect(leave.status).toBe(409);
    expect(leave.body.message).toMatch(/Hand the DM seat/);
    expect(await dms(t.campaignId)).toEqual([{ userId: t.bob.id }]);
  });
});

describe('a leave racing a removal', () => {
  it('answers as for someone who is not a member', async () => {
    const t = await table();
    const asBob = request.agent(app);
    expect((await asBob.post('/api/auth/login').send({ email: t.bob.email, password: TEST_PASSWORD })).status).toBe(200);
    let removal: request.Response | undefined;
    // The guard has let Bob through as a member; Dan removes him before the
    // leave's own read.
    hold = {
      model: 'CampaignMembership',
      operations: ['findUnique'],
      matches: (args) => mentions(args, t.bob.id),
      meanwhile: async () => { removal = await t.asDan.delete(`/api/campaigns/${t.campaignId}/members/${t.bob.id}`); },
    };

    const leave = await asBob.post(`/api/campaigns/${t.campaignId}/leave`);

    expect(removal?.status).toBe(200);
    expect(leave.status).toBe(403);
    expect(leave.body.message).toBe('You are not a member of this campaign');
    expect(await dms(t.campaignId)).toEqual([{ userId: t.dan.id }]);
  });
});

describe('deleting an account', () => {
  it('is refused for a DM who does not own the campaign, naming it', async () => {
    const t = await table();
    const admin = await helpers.createTestUser({ role: 'ADMIN' });
    users.push(admin.id);
    const asAdmin = request.agent(app);
    expect((await asAdmin.post('/api/auth/login').send({ email: admin.email, password: TEST_PASSWORD })).status).toBe(200);

    const res = await asAdmin.delete(`/api/users/${t.dan.id}`);

    expect(res.status).toBe(409);
    expect(res.body.campaigns.map((c: { id: string }) => c.id)).toEqual([t.campaignId]);
    expect(await helpers.prisma.user.findUnique({ where: { id: t.dan.id } })).not.toBeNull();
    expect(await dms(t.campaignId)).toEqual([{ userId: t.dan.id }]);
  });

  it('is refused when that DM deletes their own account', async () => {
    const t = await table();

    const res = await t.asDan.delete('/api/auth/account').send({ password: TEST_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Hand the DM seat/);
    expect(await dms(t.campaignId)).toEqual([{ userId: t.dan.id }]);
  });

  it('cannot take the seat with it when the seat is handed to the account meanwhile', async () => {
    const t = await table();
    let handover: request.Response | undefined;
    // Alice owns the campaign and sits as a player; while her deletion has
    // read that Dan is the DM, Dan hands the seat to her.
    hold = {
      model: 'Campaign',
      operations: ['findMany'],
      matches: (args) => mentions(args, t.alice.id),
      meanwhile: async () => { handover = await t.asDan.put(`/api/campaigns/${t.campaignId}/dm`).send({ userId: t.alice.id }); },
    };

    const deletion = await t.asAlice.delete('/api/auth/account').send({ password: TEST_PASSWORD });

    expect(handover?.status).toBe(200);
    expect(deletion.status).toBe(409);
    expect(await dms(t.campaignId)).toEqual([{ userId: t.alice.id }]);
  });
});

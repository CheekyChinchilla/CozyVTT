/**
 * The invite picker searches by name, and never hands a DM the whole user
 * directory.
 *
 * Any signed-in user can create a campaign and so become its DM, and the
 * picker used to answer with every account on the instance that was not
 * already in or invited to the campaign: id, display name and avatar, accounts
 * still waiting for an administrator's approval included, unpaged. It now
 * answers only a search: at least two characters find names that contain
 * them, and one character finds names that are exactly that character, so
 * nobody is out of reach. It gives at most 20 matches and leaves out accounts
 * that are not approved.
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
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
/** A name part no other test's users share, so searches see only this file's accounts. */
const tag = `Zq${stamp.slice(-6)}`;

let dmId: string;
let campaignId: string;
let dm: request.Agent;
const users: string[] = [];

async function account(displayName: string, isApproved = true): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `invitable-${users.length}-${stamp}@test.invalid`,
      passwordHash: 'not-used',
      displayName,
      isApproved,
    },
  });
  users.push(user.id);
  return user.id;
}

let memberId: string;
let invitedId: string;
let pendingApprovalId: string;
let aliceId: string;
let percentId: string;
let underscoreId: string;
let backslashId: string;
let oneLetterId: string;
let percentOnlyId: string;
let accentedId: string;

beforeAll(async () => {
  const owner = await createTestUser({ email: `invitable-dm-${stamp}@test.invalid`, displayName: `DM ${tag}` });
  dmId = owner.id;
  campaignId = (await createTestCampaign(dmId, { name: `Invitable ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { campaignId, userId: dmId, role: 'DM', characterIds: [] } });

  aliceId = await account(`Alice ${tag}`);
  memberId = await account(`Member ${tag}`);
  invitedId = await account(`Invited ${tag}`);
  pendingApprovalId = await account(`Waiting ${tag}`, false);
  for (let i = 0; i < 25; i += 1) await account(`Crowd ${tag} ${String(i).padStart(2, '0')}`);
  percentId = await account(`Rate 50%% ${tag}`);
  underscoreId = await account(`Under__score ${tag}`);
  backslashId = await account(`Back\\slash ${tag}`);
  oneLetterId = await account('Q');
  percentOnlyId = await account('%');
  accentedId = await account('\u00c9');

  await prisma.campaignMembership.create({ data: { campaignId, userId: memberId, role: 'PLAYER', characterIds: [] } });
  await prisma.campaignInvitation.create({ data: { campaignId, userId: invitedId, status: 'PENDING' } });

  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: owner.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, ...users]);
  await prisma.$disconnect();
});

const search = (term?: string) =>
  dm.get(`/api/campaigns/${campaignId}/invitable-users`).query(term === undefined ? {} : { search: term });

describe('GET /api/campaigns/:campaignId/invitable-users', () => {
  it('returns nobody without a search', async () => {
    const res = await search();
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('returns nobody for a search of spaces', async () => {
    const res = await search('   ');
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('finds a one-character name from that character, ignoring case, and lists no longer name', async () => {
    const exactly = async (term: string, expected: string): Promise<string[]> => {
      const res = await search(term);
      expect(res.status).toBe(200);
      const found = res.body.users as Array<{ id: string; displayName: string }>;
      for (const user of found) expect(user.displayName.toLowerCase()).toBe(expected.toLowerCase());
      return found.map((u) => u.id);
    };
    // Every name this file made contains a q, and none of them is listed.
    expect(await exactly(' q ', 'Q')).toContain(oneLetterId);
    expect(await exactly('%', '%')).toContain(percentOnlyId);
    // An accented letter typed as a letter plus an accent mark is the same name.
    expect(await exactly('E\u0301', '\u00c9')).toContain(accentedId);
  });

  it('finds people by part of their display name, ignoring case', async () => {
    const res = await search(`alice ${tag.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([{ id: aliceId, displayName: `Alice ${tag}`, avatarUrl: null }]);
    expect(res.body.hasMore).toBe(false);
  });

  it('returns at most 20, and says there are more', async () => {
    const res = await search(`Crowd ${tag}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(20);
    expect(res.body.hasMore).toBe(true);
    // Ordered by name, so the first page is always the same one.
    expect(res.body.users[0].displayName).toBe(`Crowd ${tag} 00`);
  });

  it('leaves out members, people already invited, and accounts waiting for approval', async () => {
    const res = await search(tag);
    const ids = (res.body.users as Array<{ id: string }>).map((u) => u.id);
    expect(ids).not.toContain(memberId);
    expect(ids).not.toContain(invitedId);
    expect(ids).not.toContain(pendingApprovalId);
    expect(ids).not.toContain(dmId);
    expect(ids).toContain(aliceId);
  });

  it('matches %, _ and \\ as themselves, so a search of symbols cannot list everyone', async () => {
    const containing = async (term: string): Promise<string[]> => {
      const res = await search(term);
      expect(res.status).toBe(200);
      const found = res.body.users as Array<{ id: string; displayName: string }>;
      for (const user of found) expect(user.displayName.toLowerCase()).toContain(term.toLowerCase());
      return found.map((u) => u.id);
    };
    expect(await containing('%%')).toContain(percentId);
    expect(await containing('__')).toContain(underscoreId);
    expect(await containing('k\\s')).toContain(backslashId);
  });

  it('never sends an email address', async () => {
    const res = await search(`Alice ${tag}`);
    expect(Object.keys(res.body.users[0]).sort()).toEqual(['avatarUrl', 'displayName', 'id']);
  });

  it('refuses a search sent twice, or longer than a display name can be', async () => {
    const twice = await dm.get(`/api/campaigns/${campaignId}/invitable-users?search=al&search=ic`);
    expect(twice.status).toBe(400);
    const long = await search('x'.repeat(51));
    expect(long.status).toBe(400);
    expect(long.body.message).toMatch(/50 characters/);
  });
});

describe('POST /api/campaigns/:campaignId/invite', () => {
  it('will not invite an account still waiting for approval, answering as for no account', async () => {
    const res = await dm.post(`/api/campaigns/${campaignId}/invite`).send({ userId: pendingApprovalId });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
    expect(await prisma.campaignInvitation.count({ where: { campaignId, userId: pendingApprovalId } })).toBe(0);
  });
});

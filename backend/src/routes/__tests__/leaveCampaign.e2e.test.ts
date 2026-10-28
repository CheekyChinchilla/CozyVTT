/**
 * A player or a spectator leaves a campaign on their own.
 *
 * Only the DM could take a member out, so a spectator who no longer wanted
 * to watch had to ask for it. Leaving does what the DM's Remove does,
 * started by the member: their characters go back to their own list, their
 * open connections leave the table, told why, and the table hears they have
 * gone. The DM must hand the seat over first, and the campaign's owner
 * cannot leave the campaign they own.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { CampaignRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
const users: string[] = [];
const campaigns: string[] = [];

interface Person {
  id: string;
  agent: ReturnType<typeof request.agent>;
}

/** A user, signed in. One at a time: one address may have only two sign-ins checked at once. */
async function person(label: string): Promise<Person> {
  const user = await createTestUser({ displayName: label });
  users.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

/** A campaign owned by `ownerId` with these members. */
async function campaignOf(ownerId: string, members: Array<[string, CampaignRole]>): Promise<string> {
  const campaign = await createTestCampaign(ownerId, { name: `Leave ${randomUUID().slice(0, 8)}` });
  campaigns.push(campaign.id);
  await prisma.campaignMembership.createMany({
    data: members.map(([userId, role]) => ({ userId, campaignId: campaign.id, role, characterIds: [] })),
  });
  return campaign.id;
}

const membership = (userId: string, campaignId: string) =>
  prisma.campaignMembership.findUnique({ where: { userId_campaignId: { userId, campaignId } }, select: { role: true } });

const leave = (who: Person, campaignId: string) => who.agent.post(`/api/campaigns/${campaignId}/leave`);

/** The first `event` on `client` that `matches`, within `ms`. */
function eventMatching<T>(client: ClientSocket, event: string, matches: (data: T) => boolean, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, onEvent);
      reject(new Error(`no matching "${event}" within ${ms}ms`));
    }, ms);
    const onEvent = (data: T) => {
      if (!matches(data)) return;
      clearTimeout(timer);
      client.off(event, onEvent);
      resolve(data);
    };
    client.on(event, onEvent);
  });
}

let dm: Person;
let stranger: Person;

beforeAll(async () => {
  dm = await person('Leave DM');
  stranger = await person('Leave stranger');
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.character.deleteMany({ where: { userId: { in: users } } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

describe('a player', () => {
  it('leaves, and their characters go back to their own list', async () => {
    const player = await person('Leaving player');
    const stayer = await person('Staying player');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [player.id, 'PLAYER'], [stayer.id, 'PLAYER']]);
    const character = await prisma.character.create({ data: { userId: player.id, campaignId, name: 'Leaving Hero', data: {} } });
    await prisma.campaignMembership.update({
      where: { userId_campaignId: { userId: player.id, campaignId } },
      data: { characterIds: [character.id] },
    });
    expect((await stayer.agent.get(`/api/characters/${character.id}`)).status).toBe(200);

    const res = await leave(player, campaignId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'You left this campaign.' });
    expect(await membership(player.id, campaignId)).toBeNull();
    expect((await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).campaignId).toBeNull();
    expect((await stayer.agent.get(`/api/characters/${character.id}`)).status).toBe(404);
    expect((await dm.agent.put(`/api/characters/${character.id}`).send({ name: 'Renamed' })).status).toBe(404);
    // Still theirs, on their own list.
    expect((await player.agent.get(`/api/characters/${character.id}`)).status).toBe(200);
  });

  it('keeps their notes and macros, listed under the campaigns they have left', async () => {
    const player = await person('Note keeper');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [player.id, 'PLAYER']]);
    expect((await player.agent.post(`/api/campaigns/${campaignId}/notes`).send({ title: 'Suspects', content: 'The baron.' })).status).toBe(201);
    expect((await player.agent.post(`/api/campaigns/${campaignId}/macros`).send({ name: 'Sneak attack', expression: '3d6' })).status).toBe(201);

    expect((await leave(player, campaignId)).status).toBe(200);

    const left = await player.agent.get('/api/campaigns/left');
    expect(left.status).toBe(200);
    const listed = (left.body.campaigns as Array<{ id: string; notes: Array<{ title: string }>; macros: Array<{ name: string }> }>)
      .find((c) => c.id === campaignId);
    expect(listed?.notes.map((n) => n.title)).toEqual(['Suspects']);
    expect(listed?.macros.map((m) => m.name)).toEqual(['Sneak attack']);
  });
});

describe('a spectator', () => {
  it('leaves', async () => {
    const watcher = await person('Leaving spectator');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [watcher.id, 'SPECTATOR']]);

    const res = await leave(watcher, campaignId);

    expect(res.status).toBe(200);
    expect(await membership(watcher.id, campaignId)).toBeNull();
  });

  // As the owner of the character: the server has allowed it whatever their
  // role, and the guides say so; nothing pinned it for a spectator.
  it('takes their own character out of the campaign, and the table hears it', async () => {
    const watcher = await person('Spectator owner');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [watcher.id, 'SPECTATOR']]);
    const character = await prisma.character.create({ data: { userId: watcher.id, campaignId, name: 'Onlooker', data: {} } });
    await prisma.campaignMembership.update({
      where: { userId_campaignId: { userId: watcher.id, campaignId } },
      data: { characterIds: [character.id] },
    });
    const table = await server.connectAndAuth(await server.loginAs(dm.id), campaignId);
    const heard = eventMatching<{ action: string }>(table, 'roster.updated', (e) => e.action === 'character.unassigned');

    const res = await watcher.agent.post(`/api/characters/${character.id}/assign`).send({ campaignId: null });

    expect(res.status).toBe(200);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).campaignId).toBeNull();
    expect(await heard).toMatchObject({ action: 'character.unassigned', characterId: character.id, userId: watcher.id, campaignId });
    expect(await membership(watcher.id, campaignId)).toEqual({ role: 'SPECTATOR' });
    table.disconnect();
  });
});

describe('who may not leave', () => {
  it('refuses the DM, who must hand the seat over first', async () => {
    const owner = await person('Owner at the table');
    const runner = await person('Sitting DM');
    const campaignId = await campaignOf(owner.id, [[owner.id, 'PLAYER'], [runner.id, 'DM']]);

    const res = await leave(runner, campaignId);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Conflict',
      message: "You run this campaign. Hand the DM seat to someone else in the campaign's settings, then leave it.",
    });
    expect(await membership(runner.id, campaignId)).toEqual({ role: 'DM' });
  });

  it('refuses the owner sitting as a player', async () => {
    const owner = await person('Owner as player');
    const runner = await person('Their DM');
    const campaignId = await campaignOf(owner.id, [[owner.id, 'PLAYER'], [runner.id, 'DM']]);

    const res = await leave(owner, campaignId);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Conflict',
      message: "You own this campaign, so you cannot leave it. If you no longer want it, delete it in the campaign's settings.",
    });
    expect(await membership(owner.id, campaignId)).toEqual({ role: 'PLAYER' });
  });

  // Handing the seat over and asking again would only be refused for owning it.
  it('tells an owner in the DM seat that they own the campaign', async () => {
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM']]);

    const res = await leave(dm, campaignId);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/^You own this campaign/);
    expect(await membership(dm.id, campaignId)).toEqual({ role: 'DM' });
  });

  it('answers 401 to a caller who is not signed in', async () => {
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM']]);
    expect((await request(app).post(`/api/campaigns/${campaignId}/leave`)).status).toBe(401);
  });

  it('answers 403 to someone who is not a member', async () => {
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM']]);

    const res = await leave(stranger, campaignId);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You are not a member of this campaign');
  });

  it('answers 403 to a member who has just been removed', async () => {
    const player = await person('Removed already');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [player.id, 'PLAYER']]);
    expect((await dm.agent.delete(`/api/campaigns/${campaignId}/members/${player.id}`)).status).toBe(200);

    const res = await leave(player, campaignId);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You are not a member of this campaign');
  });
});

describe('what everyone is told', () => {
  it("tells the leaver's open connection why, and leaves their connection to another campaign alone", async () => {
    const player = await person('Leaver with tabs');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [player.id, 'PLAYER']]);
    const elsewhereId = await campaignOf(player.id, [[player.id, 'DM']]);
    const cookie = await server.loginAs(player.id);
    const here = await server.connectAndAuth(cookie, campaignId);
    const elsewhere = await server.connectAndAuth(cookie, elsewhereId);
    const table = await server.connectAndAuth(await server.loginAs(dm.id), campaignId);

    const told = waitForEvent(here, 'campaign.access.revoked');
    const notTold = expectNoEvent(elsewhere, 'campaign.access.revoked', 500);
    expect((await leave(player, campaignId)).status).toBe(200);

    expect(await told).toEqual({ campaignId, reason: 'left', message: 'You left this campaign.' });
    await notTold;

    // The same connection, never reconnected, hears the table no more and
    // may not speak to it.
    const silence = expectNoEvent(here, 'chat.message', 500);
    table.emit('chat.message', { content: 'after they left', type: 'DM' });
    await silence;
    const refused = waitForEvent(here, 'error');
    here.emit('chat.message', { content: 'still here?', type: 'PLAYER' });
    await refused;

    here.disconnect();
    elsewhere.disconnect();
    table.disconnect();
  });

  it('tells the table they have gone, and who is online now', async () => {
    const player = await person('Leaver online');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [player.id, 'PLAYER']]);
    const table = await server.connectAndAuth(await server.loginAs(dm.id), campaignId);
    const leaverSocket = await server.connectAndAuth(await server.loginAs(player.id), campaignId);

    const gone = waitForEvent(table, 'roster.updated');
    const online = eventMatching<{ onlineUserIds: string[] }>(table, 'presence.state', (e) => !e.onlineUserIds.includes(player.id));
    expect((await leave(player, campaignId)).status).toBe(200);

    expect(await gone).toEqual({ action: 'member.left', userId: player.id, campaignId });
    expect(await online).toEqual({ campaignId, onlineUserIds: [dm.id] });
    leaverSocket.disconnect();
    table.disconnect();
  });

  // The DM's Remove shares the notices, and gained the same presence.state.
  it('tells the table who is online after the DM removes someone', async () => {
    const player = await person('Removed online');
    const campaignId = await campaignOf(dm.id, [[dm.id, 'DM'], [player.id, 'PLAYER']]);
    const table = await server.connectAndAuth(await server.loginAs(dm.id), campaignId);
    const removedSocket = await server.connectAndAuth(await server.loginAs(player.id), campaignId);

    const online = eventMatching<{ onlineUserIds: string[] }>(table, 'presence.state', (e) => !e.onlineUserIds.includes(player.id));
    expect((await dm.agent.delete(`/api/campaigns/${campaignId}/members/${player.id}`)).status).toBe(200);

    expect(await online).toEqual({ campaignId, onlineUserIds: [dm.id] });
    removedSocket.disconnect();
    table.disconnect();
  });
});

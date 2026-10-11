/**
 * Keeper's Notes on a Call of Cthulhu sheet are the Keeper's alone.
 *
 * The box is labelled for the Keeper's notes about an investigator, but it
 * was an ordinary sheet field: the investigator's player and every other
 * member of the campaign were sent it, and the player could rewrite or
 * delete it. Only the DM of the character's campaign is now sent it, on
 * every read and every live update, and only they can change it. A save by
 * anyone else keeps the notes as they are. Moving a character into a
 * different campaign clears them, since they were that campaign's Keeper's:
 * otherwise a player could move their investigator into a campaign they run
 * and read them there.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { GameSystem } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createWsTestServer, waitForEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import { getBlankTemplate } from '../../utils/character-templates';
import { toJson } from '../../utils/prisma-json';

const app = createTestApp();
const SECRET = 'Secretly a cultist of Nyarlathotep, reveal in session 4';

const sheet = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...(getBlankTemplate(GameSystem.CALL_OF_CTHULHU_7E).data as Record<string, unknown>),
  investigatorName: 'Harvey Walters',
  ...extra,
});

let server: WsTestServer;
const userIds: string[] = [];
const campaignIds: string[] = [];
let dm: { id: string; agent: ReturnType<typeof request.agent> };
let player: { id: string; agent: ReturnType<typeof request.agent> };
let other: { id: string; agent: ReturnType<typeof request.agent> };
let campaignId: string;

async function signedIn(displayName: string) {
  const user = await createTestUser({ displayName });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

/** The player's investigator in the campaign, with the Keeper's note written in. */
async function investigator() {
  const character = await prisma.character.create({
    data: { userId: player.id, campaignId, name: 'Harvey Walters', gameSystem: 'CALL_OF_CTHULHU_7E', data: toJson(sheet({ notes: SECRET })) },
  });
  await prisma.campaignMembership.update({
    where: { userId_campaignId: { userId: player.id, campaignId } },
    data: { characterIds: { push: character.id } },
  });
  return character.id;
}

const storedNotes = async (id: string) =>
  ((await prisma.character.findUniqueOrThrow({ where: { id } })).data as { notes?: string }).notes;

beforeAll(async () => {
  dm = await signedIn('Keeper');
  player = await signedIn('Investigator Player');
  other = await signedIn('Other Player');
  const campaign = await createTestCampaign(dm.id, { gameSystem: 'CALL_OF_CTHULHU_7E' });
  campaignId = campaign.id;
  campaignIds.push(campaignId);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dm.id, campaignId, role: 'DM', characterIds: [] },
      { userId: player.id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: other.id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
});

afterAll(async () => {
  await server?.close();
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

describe('reading a sheet', () => {
  it('sends the notes to the Keeper and to nobody else', async () => {
    const id = await investigator();

    const asPlayer = await player.agent.get(`/api/characters/${id}`);
    expect(asPlayer.status).toBe(200);
    expect(asPlayer.body.character.data).not.toHaveProperty('notes');

    const asOther = await other.agent.get(`/api/characters/${id}`);
    expect(asOther.status).toBe(200);
    expect(asOther.body.character.data).not.toHaveProperty('notes');

    const asKeeper = await dm.agent.get(`/api/characters/${id}`);
    expect(asKeeper.body.character.data.notes).toBe(SECRET);
  });

  it('leaves them out of the owner\'s character list', async () => {
    const id = await investigator();
    const list = await player.agent.get('/api/characters');
    const mine = (list.body.characters as Array<{ id: string; data: Record<string, unknown> }>).find((c) => c.id === id);
    expect(mine?.data).not.toHaveProperty('notes');
  });

  it('gives the Keeper an empty box on a sheet with no notes yet, so there is somewhere to write them', async () => {
    const id = await investigator();
    await prisma.character.update({ where: { id }, data: { data: toJson(sheet()) } });
    const asKeeper = await dm.agent.get(`/api/characters/${id}`);
    expect(asKeeper.body.character.data.notes).toBe('');
  });
});

describe('saving a sheet', () => {
  it('keeps the notes when the player saves without them, or tries to change them', async () => {
    const id = await investigator();

    const without = await player.agent.put(`/api/characters/${id}`).send({ data: sheet() });
    expect(without.status).toBe(200);
    expect(without.body.character.data).not.toHaveProperty('notes');
    expect(await storedNotes(id)).toBe(SECRET);

    const overwrite = await player.agent.put(`/api/characters/${id}`).send({ data: sheet({ notes: 'Nothing to see here' }) });
    expect(overwrite.status).toBe(200);
    expect(await storedNotes(id)).toBe(SECRET);
  });

  it('lets the Keeper change them', async () => {
    const id = await investigator();
    const res = await dm.agent.put(`/api/characters/${id}`).send({ data: sheet({ notes: 'Revealed in session 4' }) });
    expect(res.status).toBe(200);
    expect(res.body.character.data.notes).toBe('Revealed in session 4');
    expect(await storedNotes(id)).toBe('Revealed in session 4');
  });

  it('sends the live update with the notes to the Keeper only', async () => {
    const id = await investigator();
    const [dmCookie, playerCookie] = await Promise.all([server.loginAs(dm.id), server.loginAs(player.id)]);
    const dmSocket = await server.connectAndAuth(dmCookie, campaignId);
    const playerSocket = await server.connectAndAuth(playerCookie, campaignId);

    type Update = { characterId: string; character?: { data: Record<string, unknown> } };
    const toKeeper = waitForEvent<Update>(dmSocket, 'character.updated');
    const toPlayer = waitForEvent<Update>(playerSocket, 'character.updated');
    expect((await player.agent.put(`/api/characters/${id}`).send({ data: sheet({ occupation: 'Professor' }) })).status).toBe(200);

    expect((await toKeeper).character?.data.notes).toBe(SECRET);
    expect((await toPlayer).character?.data).not.toHaveProperty('notes');

    dmSocket.disconnect();
    playerSocket.disconnect();
  });
});

describe('a sheet leaving the Keeper\'s campaign', () => {
  it('loses the notes when its player moves it into a campaign they run', async () => {
    const id = await investigator();
    const theirs = await createTestCampaign(player.id, { gameSystem: 'CALL_OF_CTHULHU_7E' });
    campaignIds.push(theirs.id);
    await prisma.campaignMembership.create({ data: { userId: player.id, campaignId: theirs.id, role: 'DM', characterIds: [] } });

    const moved = await player.agent.post(`/api/characters/${id}/assign`).send({ campaignId: theirs.id });
    expect(moved.status).toBe(200);

    const read = await player.agent.get(`/api/characters/${id}`);
    expect(read.body.character.data.notes ?? '').toBe('');
    expect(await storedNotes(id)).toBeUndefined();
  });

  it('loses the notes when it is brought into a campaign by accepting an invitation', async () => {
    // Taken out of the Keeper's campaign: the notes stay stored, read by nobody.
    const id = await investigator();
    await prisma.character.update({ where: { id }, data: { campaignId: null } });
    const theirs = await createTestCampaign(other.id, { gameSystem: 'CALL_OF_CTHULHU_7E' });
    campaignIds.push(theirs.id);
    await prisma.campaignMembership.create({ data: { userId: other.id, campaignId: theirs.id, role: 'DM', characterIds: [] } });
    const invitation = await prisma.campaignInvitation.create({ data: { campaignId: theirs.id, userId: player.id } });

    const accepted = await player.agent.post(`/api/invitations/${invitation.id}/accept`).send({ characterIds: [id] });
    expect(accepted.status).toBe(200);

    expect(await storedNotes(id)).toBeUndefined();
  });

  it('is not copied with them', async () => {
    const id = await investigator();
    const copy = await player.agent.post(`/api/characters/${id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.body.character.data).not.toHaveProperty('notes');
    expect(await storedNotes(copy.body.character.id)).toBeUndefined();
  });
});

describe('creating a sheet', () => {
  it('drops notes sent by someone who is not the Keeper', async () => {
    const res = await player.agent.post('/api/characters').send({ name: 'New Investigator', gameSystem: 'CALL_OF_CTHULHU_7E', data: sheet({ notes: 'I wrote this myself' }) });
    expect(res.status).toBe(201);
    expect(await storedNotes(res.body.character.id)).toBeUndefined();
  });
});

describe('other systems', () => {
  it('leave a sheet\'s own notes alone', async () => {
    const dnd = { ...(getBlankTemplate(GameSystem.DND_5E).data as Record<string, unknown>), characterName: 'Aldra' };
    const created = await player.agent.post('/api/characters').send({ name: 'Aldra', gameSystem: 'DND_5E', data: dnd });
    expect(created.status).toBe(201);
    const read = await player.agent.get(`/api/characters/${created.body.character.id}`);
    expect(read.body.character.data).toEqual(created.body.character.data);
  });
});

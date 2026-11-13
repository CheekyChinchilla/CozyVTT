/**
 * GM's Notes on a Horror d100 sheet are the GM's alone.
 *
 * The box is labelled for the GM's notes about a character, but it
 * was an ordinary sheet field: the character's player and every other
 * member of the campaign were sent it, and the player could rewrite or
 * delete it. Only the GM of the character's campaign is now sent it, on
 * every read and every live update, and only they can change it. A save by
 * anyone else keeps the notes as they are. Moving a character into a
 * different campaign clears them, since they were that campaign's GM's:
 * otherwise a player could move their character into a campaign they run
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
const SECRET = 'Secretly sworn to the Grey Lantern, reveal in session 4';

const sheet = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...(getBlankTemplate(GameSystem.HORROR_D100).data as Record<string, unknown>),
  characterName: 'Mara Quill',
  ...extra,
});

let server: WsTestServer;
const userIds: string[] = [];
const campaignIds: string[] = [];
let gm: { id: string; agent: ReturnType<typeof request.agent> };
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

/** The player's character in the campaign, with the GM's note written in. */
async function horrorCharacter() {
  const character = await prisma.character.create({
    data: { userId: player.id, campaignId, name: 'Mara Quill', gameSystem: 'HORROR_D100', data: toJson(sheet({ notes: SECRET })) },
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
  gm = await signedIn('GM');
  player = await signedIn('Character Player');
  other = await signedIn('Other Player');
  const campaign = await createTestCampaign(gm.id, { gameSystem: 'HORROR_D100' });
  campaignId = campaign.id;
  campaignIds.push(campaignId);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gm.id, campaignId, role: 'GM', characterIds: [] },
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
  it('sends the notes to the GM and to nobody else', async () => {
    const id = await horrorCharacter();

    const asPlayer = await player.agent.get(`/api/characters/${id}`);
    expect(asPlayer.status).toBe(200);
    expect(asPlayer.body.character.data).not.toHaveProperty('notes');

    const asOther = await other.agent.get(`/api/characters/${id}`);
    expect(asOther.status).toBe(200);
    expect(asOther.body.character.data).not.toHaveProperty('notes');

    const asGm = await gm.agent.get(`/api/characters/${id}`);
    expect(asGm.body.character.data.notes).toBe(SECRET);
  });

  it('leaves them out of the owner\'s character list, which carries no sheets', async () => {
    const id = await horrorCharacter();
    const list = await player.agent.get('/api/characters');
    const mine = (list.body.characters as Array<{ id: string }>).find((c) => c.id === id);
    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty('data');
  });

  it('gives the GM an empty box on a sheet with no notes yet, so there is somewhere to write them', async () => {
    const id = await horrorCharacter();
    await prisma.character.update({ where: { id }, data: { data: toJson(sheet()) } });
    const asGm = await gm.agent.get(`/api/characters/${id}`);
    expect(asGm.body.character.data.notes).toBe('');
  });
});

describe('saving a sheet', () => {
  it('keeps the notes when the player saves without them, or tries to change them', async () => {
    const id = await horrorCharacter();

    const without = await player.agent.put(`/api/characters/${id}`).send({ data: sheet() });
    expect(without.status).toBe(200);
    expect(without.body.character.data).not.toHaveProperty('notes');
    expect(await storedNotes(id)).toBe(SECRET);

    const overwrite = await player.agent.put(`/api/characters/${id}`).send({ data: sheet({ notes: 'Nothing to see here' }) });
    expect(overwrite.status).toBe(200);
    expect(await storedNotes(id)).toBe(SECRET);
  });

  it('lets the GM change them', async () => {
    const id = await horrorCharacter();
    const res = await gm.agent.put(`/api/characters/${id}`).send({ data: sheet({ notes: 'Revealed in session 4' }) });
    expect(res.status).toBe(200);
    expect(res.body.character.data.notes).toBe('Revealed in session 4');
    expect(await storedNotes(id)).toBe('Revealed in session 4');
  });

  it('sends the live update with the notes to the GM only', async () => {
    const id = await horrorCharacter();
    const [gmCookie, playerCookie] = await Promise.all([server.loginAs(gm.id), server.loginAs(player.id)]);
    const gmSocket = await server.connectAndAuth(gmCookie, campaignId);
    const playerSocket = await server.connectAndAuth(playerCookie, campaignId);

    type Update = { characterId: string; character?: { data: Record<string, unknown> } };
    const toGm = waitForEvent<Update>(gmSocket, 'character.updated');
    const toPlayer = waitForEvent<Update>(playerSocket, 'character.updated');
    expect((await player.agent.put(`/api/characters/${id}`).send({ data: sheet({ profession: 'Professor' }) })).status).toBe(200);

    expect((await toGm).character?.data.notes).toBe(SECRET);
    expect((await toPlayer).character?.data).not.toHaveProperty('notes');

    gmSocket.disconnect();
    playerSocket.disconnect();
  });
});

describe('a sheet leaving the GM\'s campaign', () => {
  it('loses the notes when its player moves it into a campaign they run', async () => {
    const id = await horrorCharacter();
    const theirs = await createTestCampaign(player.id, { gameSystem: 'HORROR_D100' });
    campaignIds.push(theirs.id);
    await prisma.campaignMembership.create({ data: { userId: player.id, campaignId: theirs.id, role: 'GM', characterIds: [] } });

    const moved = await player.agent.post(`/api/characters/${id}/assign`).send({ campaignId: theirs.id });
    expect(moved.status).toBe(200);

    const read = await player.agent.get(`/api/characters/${id}`);
    expect(read.body.character.data.notes ?? '').toBe('');
    expect(await storedNotes(id)).toBeUndefined();
  });

  it('loses the notes when it is brought into a campaign by accepting an invitation', async () => {
    // Taken out of the GM's campaign: the notes stay stored, read by nobody.
    const id = await horrorCharacter();
    await prisma.character.update({ where: { id }, data: { campaignId: null } });
    const theirs = await createTestCampaign(other.id, { gameSystem: 'HORROR_D100' });
    campaignIds.push(theirs.id);
    await prisma.campaignMembership.create({ data: { userId: other.id, campaignId: theirs.id, role: 'GM', characterIds: [] } });
    const invitation = await prisma.campaignInvitation.create({ data: { campaignId: theirs.id, userId: player.id } });

    const accepted = await player.agent.post(`/api/invitations/${invitation.id}/accept`).send({ characterIds: [id] });
    expect(accepted.status).toBe(200);

    expect(await storedNotes(id)).toBeUndefined();
  });

  it('is not copied with them', async () => {
    const id = await horrorCharacter();
    const copy = await player.agent.post(`/api/characters/${id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.body.character.data).not.toHaveProperty('notes');
    expect(await storedNotes(copy.body.character.id)).toBeUndefined();
  });
});

describe('creating a sheet', () => {
  it('drops notes sent by someone who is not the GM', async () => {
    const res = await player.agent.post('/api/characters').send({ name: 'New Character', gameSystem: 'HORROR_D100', data: sheet({ notes: 'I wrote this myself' }) });
    expect(res.status).toBe(201);
    expect(await storedNotes(res.body.character.id)).toBeUndefined();
  });
});

describe('other systems', () => {
  it('leave a sheet\'s own notes alone', async () => {
    const fifthEdition = { ...(getBlankTemplate(GameSystem.FIFTH_EDITION).data as Record<string, unknown>), characterName: 'Aldra' };
    const created = await player.agent.post('/api/characters').send({ name: 'Aldra', gameSystem: 'FIFTH_EDITION', data: fifthEdition });
    expect(created.status).toBe(201);
    const read = await player.agent.get(`/api/characters/${created.body.character.id}`);
    expect(read.body.character.data).toEqual(created.body.character.data);
  });
});

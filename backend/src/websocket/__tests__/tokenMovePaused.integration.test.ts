/**
 * A player cannot move a token while the session is paused or has ended.
 *
 * The guides said so, and the shipped client greyed the drag out, but only
 * the client checked the campaign's status: the three move events and the
 * REST update took a player's move whatever the status was, so a scripted
 * client moved its token freely through a pause. The DM moves tokens at any
 * time, which is how a scene is set up between sessions.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { readTokens } from '../../utils/prisma-json';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `paused-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

const OWN = 'own-token';
const NPC = 'npc-token';

const token = (id: string, controlledBy: string | null) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true,
  controlledBy, rotation: 0, conditions: [], metadata: {},
});

const setStatus = (status: 'ACTIVE' | 'PAUSED' | 'INACTIVE') =>
  prisma.campaign.update({ where: { id: campaignId }, data: { status } });
const positionOf = async (id: string) => {
  const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
  return readTokens(row.tokens).find((t) => t.id === id)?.position;
};

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Paused ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Paused ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Paused Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, gridSize: 50, annotations: [], tokens: [token(OWN, playerId), token(NPC, null)],
    },
  });
  mapId = map.id;
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

beforeEach(async () => {
  await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, playerId), token(NPC, null)] } });
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe.each(['PAUSED', 'INACTIVE'] as const)('while the campaign is %s', (status) => {
  beforeAll(() => setStatus(status));
  afterAll(() => setStatus('ACTIVE'));

  it('refuses a player finishing a move, and the token stays put', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 5, y: 5 });
    expect((await denial).message).toMatch(/paused|session/i);
    expect(await positionOf(OWN)).toEqual({ x: 1, y: 1 });
    player.disconnect();
  });

  it('refuses a player starting a move', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    const silence = expectNoEvent(dm, 'token.move.start');
    player.emit('token.move.start', { tokenId: OWN, mapId });
    expect((await denial).message).toMatch(/paused|session/i);
    await silence;
    player.disconnect();
    dm.disconnect();
  });

  it('drops a player\'s drag frames, so nobody sees the token move', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const silence = expectNoEvent(dm, 'token.moved');
    player.emit('token.move', { tokenId: OWN, mapId, x: 6, y: 6 });
    await silence;
    player.disconnect();
    dm.disconnect();
  });

  it('still lets the DM move a token, to set the scene', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const done = waitForEvent<{ tokenId: string }>(dm, 'token.moved');
    dm.emit('token.move.end', { tokenId: NPC, mapId, x: 7, y: 7 });
    expect((await done).tokenId).toBe(NPC);
    expect(await positionOf(NPC)).toEqual({ x: 7, y: 7 });
    dm.disconnect();
  });
});

describe('while the campaign is ACTIVE', () => {
  it('lets a player move their token', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const done = waitForEvent<{ tokenId: string }>(player, 'token.moved');
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 3, y: 3 });
    expect((await done).tokenId).toBe(OWN);
    expect(await positionOf(OWN)).toEqual({ x: 3, y: 3 });
    player.disconnect();
  });
});

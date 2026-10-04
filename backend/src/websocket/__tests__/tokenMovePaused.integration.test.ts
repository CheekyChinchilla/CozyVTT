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
let otherId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;
let otherCookie: string;

const OWN = 'own-token';
const NPC = 'npc-token';

const token = (id: string, controlledBy: string | null, changes: Record<string, unknown> = {}) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true,
  controlledBy, rotation: 0, conditions: [], metadata: {}, ...changes,
});

const setStatus = (status: 'ACTIVE' | 'PAUSED' | 'INACTIVE') =>
  prisma.campaign.update({ where: { id: campaignId }, data: { status } });
const positionOf = async (id: string) => {
  const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
  return readTokens(row.tokens).find((t) => t.id === id)?.position;
};

beforeAll(async () => {
  const [dm, player, other] = await Promise.all(
    ['dm', 'player', 'other'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Paused ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  otherId = other.id;
  const campaign = await prisma.campaign.create({ data: { name: `Paused ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Paused Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, gridSize: 50, annotations: [], tokens: [token(OWN, playerId), token(NPC, null)],
    },
  });
  mapId = map.id;
  // Players are told of moves on the map the campaign is showing.
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie, otherCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId), server.loginAs(otherId)]);
});

beforeEach(async () => {
  await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, playerId), token(NPC, null)] } });
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId, otherId] } } });
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

  // A pause can land after the player picked the token up. Their screen has
  // already drawn the drop, so the refusal also tells it where the token is.
  it('sends the refused mover the token\'s stored position, so their screen puts it back', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const back = waitForEvent<{ tokenId: string; x: number; y: number }>(player, 'token.moved');
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 5, y: 5 });
    expect(await back).toMatchObject({ tokenId: OWN, x: 1, y: 1 });
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

// The pause lands mid-drag: the frames sent before it reached the table, so
// the refused drop has to put the token back on every screen that saw them,
// not only the mover's. The correction names no mover, so a client that
// ignores its own moves still applies it.
describe('a pause landing in the middle of a drag', () => {
  afterAll(() => setStatus('ACTIVE'));

  it('puts the token back for everyone who saw the drag', async () => {
    await setStatus('ACTIVE');
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const framed = waitForEvent<{ x: number }>(dm, 'token.moved');
    player.emit('token.move.start', { tokenId: OWN, mapId });
    player.emit('token.move', { tokenId: OWN, mapId, x: 4, y: 4 });
    expect((await framed).x).toBe(4);

    await setStatus('PAUSED');
    const toDm = waitForEvent<{ tokenId: string; x: number; y: number; movedBy: string | null }>(dm, 'token.moved');
    const toMover = waitForEvent<{ movedBy: string | null }>(player, 'token.moved');
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 5, y: 5 });
    expect(await toDm).toEqual({ tokenId: OWN, mapId, x: 1, y: 1, movedBy: null });
    expect((await toMover).movedBy).toBeNull();
    player.disconnect();
    dm.disconnect();
  });
});


// Any refusal of a drop after the drag began leaves the same mismatch: the
// DM taking the token back mid-drag, say, refuses the drop for want of
// control. Every screen that saw the frames is told where the token is.
describe('control taken away in the middle of a drag', () => {
  afterAll(async () => {
    await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, playerId), token(NPC, null)] } });
  });

  it('puts the token back for the mover and everyone who saw the drag', async () => {
    await setStatus('ACTIVE');
    await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, playerId), token(NPC, null)] } });
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const framed = waitForEvent<{ x: number }>(dm, 'token.moved');
    player.emit('token.move.start', { tokenId: OWN, mapId });
    player.emit('token.move', { tokenId: OWN, mapId, x: 4, y: 4 });
    expect((await framed).x).toBe(4);

    await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, null), token(NPC, null)] } });
    const toDm = waitForEvent<{ tokenId: string; x: number; y: number; movedBy: string | null }>(dm, 'token.moved');
    const toMover = waitForEvent<{ x: number; movedBy: string | null }>(player, 'token.moved');
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 5, y: 5 });
    expect(await toDm).toEqual({ tokenId: OWN, mapId, x: 1, y: 1, movedBy: null });
    expect(await toMover).toMatchObject({ x: 1, movedBy: null });
    expect(await positionOf(OWN)).toEqual({ x: 1, y: 1 });
    player.disconnect();
    dm.disconnect();
  });

  it('sends a drop that never began as a drag nothing but the refusal', async () => {
    await setStatus('ACTIVE');
    await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, playerId), token(NPC, null)] } });
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    const quiet = expectNoEvent(player, 'token.moved', 600);
    player.emit('token.move.end', { tokenId: NPC, mapId, x: 5, y: 5 });
    expect((await refused).message).toMatch(/permission/i);
    await quiet;
    player.disconnect();
  });
});

// The put-back tells a screen where the token stands, so it goes only to a
// screen the map fetch would give the token to now. A drag entry outlives a
// drag the client abandons without a drop (a cancelled hold sends one frame
// back to the start and no token.move.end), and by the time a drop names the
// token again the DM may have hidden it and moved it somewhere secret.
describe('a drop long after a drag, once the token is hidden', () => {
  afterAll(async () => {
    await setStatus('ACTIVE');
    await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, playerId), token(NPC, null)] } });
  });

  const abandonedDrag = async () => {
    await setStatus('ACTIVE');
    await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, playerId), token(NPC, null)] } });
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const other = await server.connectAndAuth(otherCookie, campaignId);
    const framed = waitForEvent<{ x: number }>(other, 'token.moved');
    player.emit('token.move.start', { tokenId: OWN, mapId });
    player.emit('token.move', { tokenId: OWN, mapId, x: 4, y: 4 });
    expect((await framed).x).toBe(4);
    return { player, other };
  };

  it('tells neither the sender nor the drag\'s watchers where it went, when control is gone', async () => {
    const { player, other } = await abandonedDrag();
    await prisma.map.update({
      where: { id: mapId },
      data: { tokens: [token(OWN, null, { visible: false, position: { x: 9, y: 9 } }), token(NPC, null)] },
    });
    const refused = waitForEvent<{ message: string }>(player, 'error');
    const quietSender = expectNoEvent(player, 'token.moved', 600);
    const quietWatcher = expectNoEvent(other, 'token.moved', 600);
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 0, y: 0 });
    expect((await refused).message).toMatch(/permission/i);
    await quietSender;
    await quietWatcher;
    player.disconnect();
    other.disconnect();
  });

  it('tells neither the sender nor the drag\'s watchers where it went, when the session is paused', async () => {
    const { player, other } = await abandonedDrag();
    await prisma.map.update({
      where: { id: mapId },
      data: { tokens: [token(OWN, playerId, { visible: false, position: { x: 9, y: 9 } }), token(NPC, null)] },
    });
    await setStatus('PAUSED');
    const refused = waitForEvent<{ message: string }>(player, 'error');
    const quietSender = expectNoEvent(player, 'token.moved', 600);
    const quietWatcher = expectNoEvent(other, 'token.moved', 600);
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 0, y: 0 });
    expect((await refused).message).toMatch(/paused|session/i);
    await quietSender;
    await quietWatcher;
    player.disconnect();
    other.disconnect();
  });
});

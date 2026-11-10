/**
 * A drop sent right behind its pick-up, as an arrow key sends the two, is
 * judged after the pick-up.
 *
 * One connection's `token.move.start` and `token.move.end` were handled side
 * by side, each awaiting its own reads, so the drop could be judged before
 * the pick-up had recorded the drag. A drop refused then was not put back on
 * the mover's screen, or on the screens the pick-up went to, and the pick-up
 * went on to record a drag that no drop ended. A drop refused after a
 * pick-up that was refused too was never put back on the mover's screen at
 * all. The two now take turns per token, and the mover is told where a
 * refused drop's token stands whenever they may see it. Two tokens still
 * move side by side.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import * as spiritLayer from '../../utils/spirit-layer';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let moverId: string;
let otherId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let moverCookie: string;

type Client = Awaited<ReturnType<WsTestServer['connectAndAuth']>>;
type Moved = { tokenId: string; x: number; y: number; movedBy: string | null };
type Heard = { event: string; tokenId?: string; x?: number; y?: number; movedBy?: string | null; message?: string };

const LANTERN = 'lantern-bearer';
const SCOUT = 'scout';

function token(id: string, controlledBy: string | null, x: number) {
  return {
    id, name: id, imageUrl: '/api/assets/tokens/none', position: { x, y: 1 }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, controlledBy, rotation: 0, conditions: [], metadata: {},
  };
}

const placeTokens = (lanternBy: string | null) => prisma.map.update({
  where: { id: mapId },
  data: { tokens: [token(LANTERN, lanternBy, 1), token(SCOUT, moverId, 3)] },
});

async function storedAt(tokenId: string): Promise<{ x: number; y: number } | undefined> {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
  return (map.tokens as unknown as { id: string; position: { x: number; y: number } }[]).find((t) => t.id === tokenId)?.position;
}

/** Everything a client is told about tokens moving, and every error, in the order it arrives. */
function listen(client: Client): Heard[] {
  const heard: Heard[] = [];
  client.on('error', (data: { message: string }) => heard.push({ event: 'error', message: data.message }));
  client.on('token.move.start', (data: { tokenId: string; movedBy: string | null }) =>
    heard.push({ event: 'token.move.start', tokenId: data.tokenId, movedBy: data.movedBy }));
  client.on('token.moved', (data: Moved) =>
    heard.push({ event: 'token.moved', tokenId: data.tokenId, x: data.x, y: data.y, movedBy: data.movedBy }));
  return heard;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hold the next pick-up at its plane check, the last read before it records
 * the drag, until `release` is called; `reached` resolves once it is held.
 */
function holdTheNextPickUp() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let arrived!: () => void;
  const reached = new Promise<void>((resolve) => { arrived = resolve; });
  const check = spiritLayer.canActOnTokenPlane;
  const spy = jest.spyOn(spiritLayer, 'canActOnTokenPlane').mockImplementationOnce(async (role, held, campaign, user) => {
    arrived();
    await gate;
    return check(role, held, campaign, user);
  });
  return { release, reached, restore: () => spy.mockRestore() };
}

beforeAll(async () => {
  const [dm, mover, other] = await Promise.all(['dm', 'mover', 'other'].map((name) =>
    prisma.user.create({ data: { email: `droppickup-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Drop ${name}` } })));
  dmId = dm.id;
  moverId = mover.id;
  otherId = other.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Drop after pick-up ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: moverId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Drop after pick-up', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, annotations: [], lightingEnabled: false, tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [dmCookie, moverCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(moverId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, moverId, otherId] } } });
  await prisma.$disconnect();
});

describe('a drop sent right behind its pick-up', () => {
  it('puts the token back on the mover\'s screen when both are refused', async () => {
    // The mover's screen still thinks the token is theirs; control has moved on.
    await placeTokens(otherId);
    const mover = await server.connectAndAuth(moverCookie, campaignId);
    const heard = listen(mover);

    const back = waitForEvent<Moved>(mover, 'token.moved');
    mover.emit('token.move.start', { tokenId: LANTERN, mapId });
    mover.emit('token.move.end', { tokenId: LANTERN, mapId, x: 5, y: 1 });
    await expect(back).resolves.toEqual({ tokenId: LANTERN, mapId, x: 1, y: 1, movedBy: null });
    await pause(300);

    expect(heard.filter((h) => h.event === 'error').map((h) => h.message)).toEqual([
      'You do not have permission to move this token',
      'You do not have permission to move this token',
    ]);
    expect(heard[heard.length - 1]).toEqual({ event: 'token.moved', tokenId: LANTERN, x: 1, y: 1, movedBy: null });
    expect(await storedAt(LANTERN)).toEqual({ x: 1, y: 1 });
    mover.disconnect();
  });

  it('is judged after the pick-up, so a refused drop is put back wherever the pick-up went', async () => {
    await placeTokens(moverId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const mover = await server.connectAndAuth(moverCookie, campaignId);
    const dmHeard = listen(dm);
    const moverHeard = listen(mover);
    const slow = holdTheNextPickUp();
    try {
      mover.emit('token.move.start', { tokenId: LANTERN, mapId });
      await slow.reached;
      // The DM hands the token to someone else while the pick-up is under way.
      await placeTokens(otherId);
      mover.emit('token.move.end', { tokenId: LANTERN, mapId, x: 5, y: 1 });
      await pause(300);
      slow.release();
      await pause(700);
    } finally {
      slow.restore();
    }

    expect(dmHeard).toEqual([
      { event: 'token.move.start', tokenId: LANTERN, movedBy: moverId },
      { event: 'token.moved', tokenId: LANTERN, x: 1, y: 1, movedBy: null },
    ]);
    expect(moverHeard).toEqual([
      { event: 'error', message: 'You do not have permission to move this token' },
      { event: 'token.moved', tokenId: LANTERN, x: 1, y: 1, movedBy: null },
    ]);
    expect(await storedAt(LANTERN)).toEqual({ x: 1, y: 1 });
    dm.disconnect();
    mover.disconnect();
  });

  it('that is allowed leaves no drag behind for the mover\'s leaving to undo', async () => {
    await placeTokens(moverId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const mover = await server.connectAndAuth(moverCookie, campaignId);
    const dmHeard = listen(dm);
    const slow = holdTheNextPickUp();
    try {
      mover.emit('token.move.start', { tokenId: LANTERN, mapId });
      await slow.reached;
      mover.emit('token.move.end', { tokenId: LANTERN, mapId, x: 5, y: 1 });
      await pause(300);
      slow.release();
      await pause(700);
    } finally {
      slow.restore();
    }

    expect(dmHeard).toEqual([
      { event: 'token.move.start', tokenId: LANTERN, movedBy: moverId },
      { event: 'token.moved', tokenId: LANTERN, x: 5, y: 1, movedBy: moverId },
    ]);
    const nothingMore = expectNoEvent(dm, 'token.moved', 500);
    mover.disconnect();
    await expect(nothingMore).resolves.toBeUndefined();
    dm.disconnect();
  });
});

describe('two tokens moved by one connection', () => {
  it('are not held up behind each other', async () => {
    await placeTokens(moverId);
    const mover = await server.connectAndAuth(moverCookie, campaignId);
    const slow = holdTheNextPickUp();
    try {
      mover.emit('token.move.start', { tokenId: LANTERN, mapId });
      await slow.reached;
      // The lantern bearer's pick-up is still being judged; the scout's drop goes ahead.
      const scoutDropped = waitForEvent<Moved>(mover, 'token.moved', 2000);
      mover.emit('token.move.end', { tokenId: SCOUT, mapId, x: 6, y: 1 });
      await expect(scoutDropped).resolves.toMatchObject({ tokenId: SCOUT, x: 6, y: 1, movedBy: moverId });
    } finally {
      slow.release();
      slow.restore();
    }
    expect(await storedAt(SCOUT)).toEqual({ x: 6, y: 1 });
    // Let the lantern bearer's pick-up finish before the connection goes.
    await pause(300);
    mover.disconnect();
  });
});

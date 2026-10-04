/**
 * Who may move a token, checked on every move event and not just the first.
 *
 * A drag sends `token.move.start`, then `token.move` up to sixty times a
 * second, then `token.move.end`. Only the first and last checked who was
 * dragging. `token.move` validated the map and the coordinates and broadcast
 * whatever it was given, so any member could make any token on the map jump
 * about on everyone else's screen. Nothing server-side ties a start to the
 * moves that follow it, so the check on the start event cannot stand in for
 * one here.
 *
 * `token.move.end`, which is the one that writes to the database, checked
 * `controlledBy` but was missing the explicit spectator check its sibling
 * carries. `controlledBy` is set once and is not cleared when someone is
 * demoted, so a spectator who still held a token could move it for real.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import {
  createWsTestServer,
  expectNoEvent,
  waitForEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `tokenmove-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let ownerId: string;
let otherId: string;
let spectatorId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let ownerCookie: string;
let otherCookie: string;
let spectatorCookie: string;

const OWNED_TOKEN = 'token-owned';
const DM_TOKEN = 'token-dm';

function token(id: string, controlledBy: string | null) {
  return {
    id,
    name: id,
    imageUrl: '/api/assets/tokens/none',
    position: { x: 1, y: 1 },
    size: { width: 1, height: 1 },
    layer: 'token',
    visible: true,
    controlledBy,
    rotation: 0,
    conditions: [],
    metadata: {},
  };
}

async function resetTokens() {
  await prisma.map.update({
    where: { id: mapId },
    data: { tokens: [token(OWNED_TOKEN, ownerId), token(DM_TOKEN, null)] },
  });
}

beforeAll(async () => {
  const [dm, owner, other, spectator] = await Promise.all(
    ['dm', 'owner', 'other', 'spectator'].map((name) =>
      prisma.user.create({
        data: {
          email: email(name),
          passwordHash: 'not-used-by-socket-auth',
          displayName: `Tokenmove ${name}`,
        },
      })
    )
  );
  dmId = dm.id;
  ownerId = owner.id;
  otherId = other.id;
  spectatorId = spectator.id;

  const campaign = await prisma.campaign.create({
    data: { name: `Token Move ${runId}`, ownerId: dmId, vibeSettings: {} },
  });
  campaignId = campaign.id;

  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });

  const map = await prisma.map.create({
    data: {
      campaignId,
      name: 'Move Test Map',
      imageUrl: '/api/assets/maps/none',
      baseLayerUrl: '/api/assets/maps/none',
      width: 20,
      height: 20,
      tokens: [token(OWNED_TOKEN, ownerId), token(DM_TOKEN, null)],
      annotations: [],
    },
  });
  mapId = map.id;
  // Players are told of moves on the map the campaign is showing.
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });

  server = await createWsTestServer();
  [dmCookie, ownerCookie, otherCookie, spectatorCookie] = await Promise.all([
    server.loginAs(dmId),
    server.loginAs(ownerId),
    server.loginAs(otherId),
    server.loginAs(spectatorId),
  ]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, ownerId, otherId, spectatorId] } } });
  await prisma.$disconnect();
});

beforeEach(resetTokens);

describe('token.move, the per-frame event', () => {
  it('does not move a token the sender does not control', async () => {
    const other = await server.connectAndAuth(otherCookie, campaignId);
    const watcher = await server.connectAndAuth(dmCookie, campaignId);

    const silence = expectNoEvent(watcher, 'token.moved', 500);
    other.emit('token.move', { tokenId: OWNED_TOKEN, mapId, x: 9, y: 9 });
    await expect(silence).resolves.toBeUndefined();

    other.disconnect();
    watcher.disconnect();
  });

  it('does not let a spectator move anything', async () => {
    const spectator = await server.connectAndAuth(spectatorCookie, campaignId);
    const watcher = await server.connectAndAuth(dmCookie, campaignId);

    const silence = expectNoEvent(watcher, 'token.moved', 500);
    spectator.emit('token.move', { tokenId: DM_TOKEN, mapId, x: 8, y: 8 });
    await expect(silence).resolves.toBeUndefined();

    spectator.disconnect();
    watcher.disconnect();
  });

  it('still moves a token for the player who controls it', async () => {
    const owner = await server.connectAndAuth(ownerCookie, campaignId);
    const watcher = await server.connectAndAuth(dmCookie, campaignId);

    const moved = waitForEvent(watcher, 'token.moved');
    owner.emit('token.move', { tokenId: OWNED_TOKEN, mapId, x: 5, y: 5 });
    await expect(moved).resolves.toMatchObject({ tokenId: OWNED_TOKEN, x: 5, y: 5 });

    owner.disconnect();
    watcher.disconnect();
  });

  it('still moves any token for the DM', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const watcher = await server.connectAndAuth(ownerCookie, campaignId);

    const moved = waitForEvent(watcher, 'token.moved');
    dm.emit('token.move', { tokenId: OWNED_TOKEN, mapId, x: 6, y: 6 });
    await expect(moved).resolves.toMatchObject({ tokenId: OWNED_TOKEN, x: 6, y: 6 });

    dm.disconnect();
    watcher.disconnect();
  });
});

describe('token.move.end, the event that saves', () => {
  it('refuses a spectator who still holds a token', async () => {
    // Being demoted does not clear controlledBy, so the ownership check alone
    // would let this through.
    await prisma.map.update({
      where: { id: mapId },
      data: { tokens: [token(OWNED_TOKEN, spectatorId), token(DM_TOKEN, null)] },
    });

    const spectator = await server.connectAndAuth(spectatorCookie, campaignId);
    const refused = waitForEvent(spectator, 'error');
    spectator.emit('token.move.end', { tokenId: OWNED_TOKEN, mapId, x: 12, y: 12 });
    await expect(refused).resolves.toBeDefined();

    const saved = await prisma.map.findUnique({ where: { id: mapId }, select: { tokens: true } });
    const stored = (saved!.tokens as unknown as { id: string; position: { x: number } }[])
      .find((t) => t.id === OWNED_TOKEN);
    expect(stored?.position.x).toBe(1);

    spectator.disconnect();
  });

  it('still saves a move by the player who controls the token', async () => {
    const owner = await server.connectAndAuth(ownerCookie, campaignId);
    owner.emit('token.move.end', { tokenId: OWNED_TOKEN, mapId, x: 7, y: 7 });

    await waitForEvent(owner, 'token.moved').catch(() => undefined);
    // Poll the row, because the broadcast excludes the sender in some paths.
    let stored: { position: { x: number } } | undefined;
    for (let i = 0; i < 20 && stored?.position.x !== 7; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const saved = await prisma.map.findUnique({ where: { id: mapId }, select: { tokens: true } });
      stored = (saved!.tokens as unknown as { id: string; position: { x: number } }[])
        .find((t) => t.id === OWNED_TOKEN);
    }
    expect(stored?.position.x).toBe(7);

    owner.disconnect();
  });
});

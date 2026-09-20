/**
 * What a token move tells each player.
 *
 * The move fan-out on a lit map filtered by line of sight alone. It never
 * applied the role filter that the map fetch applies, so a DM-hidden token
 * standing in a player's line of sight was sent to them, complete with the
 * DM's notes, the moment the DM moved it; and a player in the spirit realm
 * was sent material-plane tokens. On an unlit map a hidden token's every
 * move was broadcast to the whole room. The map fetch was right; the move
 * paths now apply the same rules before line of sight.
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
const email = (name: string) => `tokenleak-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

const OWN = 'token-own';
const HIDDEN = 'token-hidden';
const SHOWN = 'token-shown';

function token(id: string, x: number, controlledBy: string | null, visible: boolean, notes: string | undefined) {
  return {
    id, name: id, imageUrl: '/api/assets/tokens/none',
    position: { x, y: 5 }, size: { width: 1, height: 1 },
    layer: 'token', visible, controlledBy, rotation: 0, conditions: [], metadata: {},
    ...(notes !== undefined ? { notes } : {}),
  };
}

async function resetMap(lightingEnabled: boolean) {
  await prisma.map.update({
    where: { id: mapId },
    data: {
      lightingEnabled,
      tokens: [token(OWN, 5, playerId, true, undefined), token(HIDDEN, 6, null, false, 'ambush here'), token(SHOWN, 7, null, true, 'dm eyes only')],
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Leak ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Token Leak ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Leak Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, tokens: [], annotations: [], lightingEnabled: true,
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('on a lit map, in the player\'s line of sight', () => {
  beforeEach(() => resetMap(true));

  it('a hidden token the DM moves is not sent to the player', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const noAppear = expectNoEvent(player, 'token:appeared', 500);
    const noMove = expectNoEvent(player, 'token.moved', 500);
    // Not even its id: a hidden token is the DM's secret, name included.
    const noVanish = expectNoEvent(player, 'token:disappeared', 500);
    dm.emit('token.move.end', { tokenId: HIDDEN, mapId, x: 8, y: 5 });
    await Promise.all([noAppear, noMove, noVanish]);

    dm.disconnect();
    player.disconnect();
  });

  it('a player moving their own token is not told the ids of tokens they may not see', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    // The re-sync after an own move names only tokens the player may have.
    const noVanish = expectNoEvent(player, 'token:disappeared', 500);
    player.emit('token.move.end', { tokenId: OWN, mapId, x: 4, y: 5 });
    await noVanish;

    dm.disconnect();
    player.disconnect();
  });

  it('a visible token the DM moves arrives without the DM\'s notes', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const appeared = waitForEvent<{ token: { id: string; notes?: string; position: { x: number } } }>(player, 'token:appeared');
    dm.emit('token.move.end', { tokenId: SHOWN, mapId, x: 8, y: 5 });
    const payload = await appeared;
    expect(payload.token.id).toBe(SHOWN);
    expect(payload.token.position.x).toBe(8);
    expect(payload.token).not.toHaveProperty('notes');

    dm.disconnect();
    player.disconnect();
  });

  it('a player in the spirit realm is not sent material-plane tokens', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: true } });
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const nothing = expectNoEvent(player, 'token:appeared', 500);
    dm.emit('token.move.end', { tokenId: SHOWN, mapId, x: 8, y: 5 });
    await nothing;

    dm.disconnect();
    player.disconnect();
  });
});

describe('on an unlit map', () => {
  beforeEach(() => resetMap(false));

  it('a hidden token\'s final position is not broadcast to players', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const nothing = expectNoEvent(player, 'token.moved', 500);
    dm.emit('token.move.end', { tokenId: HIDDEN, mapId, x: 8, y: 5 });
    await nothing;

    dm.disconnect();
    player.disconnect();
  });

  it('a hidden token\'s drag frames are not broadcast to players', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const nothing = expectNoEvent(player, 'token.moved', 500);
    dm.emit('token.move', { tokenId: HIDDEN, mapId, x: 8, y: 5 });
    await nothing;

    dm.disconnect();
    player.disconnect();
  });

  it('a visible token\'s move still reaches players', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const moved = waitForEvent<{ tokenId: string; x: number }>(player, 'token.moved');
    dm.emit('token.move.end', { tokenId: SHOWN, mapId, x: 8, y: 5 });
    expect((await moved).tokenId).toBe(SHOWN);

    dm.disconnect();
    player.disconnect();
  });
});

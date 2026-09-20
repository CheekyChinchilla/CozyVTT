/**
 * Who is sent a token's drag frames.
 *
 * `token.move.end` decides per player whether the final position is sent,
 * but the frames before it (`token.move`, up to sixty a second) went to the
 * whole room for any visible material token, so on a lit map a player
 * received the exact path of a monster in the dark or behind a wall. The
 * frames now go to the DM's sockets and to the players whose tokens could
 * see the token where its drag began, decided once per drag; the end event
 * still decides who is sent where it stopped.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import {
  createWsTestServer,
  expectNoEvent,
  waitForEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `dragframes-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

const OWN = 'token-own';
const FAR = 'token-far';

function token(id: string, x: number, controlledBy: string | null, visible = true) {
  return {
    id, name: id, imageUrl: '/api/assets/tokens/none',
    position: { x, y: 5 }, size: { width: 1, height: 1 },
    layer: 'token', visible, controlledBy, rotation: 0, conditions: [], metadata: {},
  };
}

/** The player's token at x=5; a visible token twelve squares away in the dark. */
async function resetMap(lightingEnabled: boolean, globalIllumination: boolean) {
  await prisma.map.update({
    where: { id: mapId },
    data: { lightingEnabled, globalIllumination, lights: [], tokens: [token(OWN, 5, playerId), token(FAR, 17, null)] },
  });
}

/** A drag as the client sends it: a start event, then frames. */
function drag(dm: ClientSocket, tokenId: string, xs: number[]) {
  dm.emit('token.move.start', { tokenId, mapId });
  for (const x of xs) dm.emit('token.move', { tokenId, mapId, x, y: 5 });
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Frames ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Drag Frames ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Frames Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
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

describe('drag frames on a lit map', () => {
  it('do not reach a player whose tokens cannot see the token', async () => {
    await resetMap(true, false);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const dmToo = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const noStart = expectNoEvent(player, 'token.move.start', 600);
    const noFrames = expectNoEvent(player, 'token.moved', 600);
    const dmFrame = waitForEvent<{ tokenId: string; x: number }>(dmToo, 'token.moved');
    drag(dm, FAR, [16, 15, 14]);
    await Promise.all([noStart, noFrames]);
    expect((await dmFrame).tokenId).toBe(FAR);

    dm.disconnect();
    dmToo.disconnect();
    player.disconnect();
  });

  it('reach a player whose tokens can see it', async () => {
    await resetMap(true, true);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const frame = waitForEvent<{ tokenId: string; x: number }>(player, 'token.moved');
    drag(dm, FAR, [16]);
    expect(await frame).toMatchObject({ tokenId: FAR, x: 16 });

    dm.disconnect();
    player.disconnect();
  });

  it('are decided again for the next drag once the last one ends', async () => {
    await resetMap(true, false);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const dark = expectNoEvent(player, 'token.moved', 500);
    drag(dm, FAR, [16]);
    await dark;
    dm.emit('token.move.end', { tokenId: FAR, mapId, x: 16, y: 5 });
    await waitForEvent(dm, 'token.moved');

    // Lit now: the next drag is decided afresh.
    await prisma.map.update({ where: { id: mapId }, data: { globalIllumination: true } });
    const frame = waitForEvent<{ tokenId: string; x: number }>(player, 'token.moved');
    drag(dm, FAR, [15]);
    expect(await frame).toMatchObject({ tokenId: FAR, x: 15 });

    dm.disconnect();
    player.disconnect();
  });
});

describe('drag frames on an unlit map', () => {
  it('still reach every player, as the map fetch sends every visible token', async () => {
    await resetMap(false, false);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const frame = waitForEvent<{ tokenId: string; x: number }>(player, 'token.moved');
    drag(dm, FAR, [16]);
    expect(await frame).toMatchObject({ tokenId: FAR, x: 16 });

    dm.disconnect();
    player.disconnect();
  });
});

/**
 * A token carried by someone whose connection drops goes back where it
 * stands on every other screen.
 *
 * Other screens draw a carried token at the last drag frame until the
 * carrier puts it down or lets it go, and both of those come from the
 * carrier. A carrier whose tab closed or whose connection dropped mid-hold
 * sent neither, so everyone else saw the token where it was not until it
 * next moved or the map was reloaded, while sight and the ruler used where
 * it stands. Their disconnect now sends it back.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let watcherId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;
let watcherCookie: string;

type Moved = { tokenId: string; x: number; y: number; dragging?: boolean };

beforeAll(async () => {
  const [dm, player, watcher] = await Promise.all(['dm', 'player', 'watcher'].map((name) =>
    prisma.user.create({ data: { email: `carriergone-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Carrier ${name}` } })));
  dmId = dm.id;
  playerId = player.id;
  watcherId = watcher.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Carrier gone ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: watcherId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Carrier', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, annotations: [], lightingEnabled: false,
      tokens: [{ id: 'hero', name: 'Hero', imageUrl: '', position: { x: 2, y: 3 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {} }],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie, watcherCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId), server.loginAs(watcherId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId, watcherId] } } });
  await prisma.$disconnect();
});

const placeHero = (extra: Record<string, unknown> = {}) => prisma.map.update({
  where: { id: mapId },
  data: { tokens: [{ id: 'hero', name: 'Hero', imageUrl: '', position: { x: 2, y: 3 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {}, ...extra }] },
});

beforeEach(async () => {
  await placeHero();
});

it('sends the token back where it stands when its carrier disconnects', async () => {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const player = await server.connectAndAuth(playerCookie, campaignId);

  const frame = waitForEvent<Moved>(dm, 'token.moved');
  player.emit('token.move.start', { tokenId: 'hero', mapId });
  player.emit('token.move', { tokenId: 'hero', mapId, x: 9, y: 9 });
  expect(await frame).toMatchObject({ tokenId: 'hero', x: 9, y: 9, dragging: true });

  const back = waitForEvent<Moved>(dm, 'token.moved', 5000);
  player.disconnect();

  const moved = await back;
  expect(moved).toMatchObject({ tokenId: 'hero', x: 2, y: 3 });
  expect(moved.dragging).toBeFalsy();
});

// The carrier let go without putting it down (Esc), so its drag was never
// closed; the DM then hid the token and moved it somewhere secret. The
// release on the carrier's disconnect must not send that place to players.
it('sends a token the DM has since hidden to no player', async () => {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const watcher = await server.connectAndAuth(watcherCookie, campaignId);
  const player = await server.connectAndAuth(playerCookie, campaignId);

  const frame = waitForEvent<Moved>(watcher, 'token.moved');
  player.emit('token.move.start', { tokenId: 'hero', mapId });
  player.emit('token.move', { tokenId: 'hero', mapId, x: 9, y: 9 });
  await frame;
  await placeHero({ visible: false, position: { x: 15, y: 15 } });

  const leaked: Moved[] = [];
  watcher.on('token.moved', (data: Moved) => leaked.push(data));
  const toDm = waitForEvent<Moved>(dm, 'token.moved', 5000);
  player.disconnect();

  expect(await toDm).toMatchObject({ tokenId: 'hero', x: 15, y: 15 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(leaked).toEqual([]);
});

// On a lit map the carrier took the token past a wall, out of another
// player's sight: that player was told it had gone. Only screens still
// holding it were told on the disconnect, so it never came back for them,
// though it stands in their view.
it('gives the token back to a player it was carried out of sight of', async () => {
  await prisma.map.update({
    where: { id: mapId },
    data: {
      lightingEnabled: true, globalIllumination: true, lights: [],
      wallSegments: [{ id: 'split', x1: 500, y1: 0, x2: 500, y2: 1000, type: 'wall' }],
      tokens: [
        { id: 'hero', name: 'Hero', imageUrl: '', position: { x: 3, y: 3 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {} },
        { id: 'scout', name: 'Scout', imageUrl: '', position: { x: 2, y: 3 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: watcherId, rotation: 0, conditions: [], metadata: {} },
      ],
    },
  });
  try {
    const watcher = await server.connectAndAuth(watcherCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const gone = waitForEvent(watcher, 'token:disappeared');
    player.emit('token.move.start', { tokenId: 'hero', mapId });
    player.emit('token.move', { tokenId: 'hero', mapId, x: 15, y: 3 });
    expect(await gone).toEqual({ tokenId: 'hero', mapId });

    const appeared = waitForEvent<{ token: { id: string; position: { x: number; y: number } } }>(watcher, 'token:appeared', 5000);
    const back = waitForEvent<Moved>(watcher, 'token.moved', 5000);
    player.disconnect();

    expect((await appeared).token).toMatchObject({ id: 'hero', position: { x: 3, y: 3 } });
    expect(await back).toMatchObject({ tokenId: 'hero', x: 3, y: 3 });
    watcher.disconnect();
  } finally {
    await prisma.map.update({ where: { id: mapId }, data: { lightingEnabled: false, globalIllumination: false, wallSegments: [] } });
  }
});

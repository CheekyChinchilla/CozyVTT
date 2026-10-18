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
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

type Moved = { tokenId: string; x: number; y: number; dragging?: boolean };

beforeAll(async () => {
  const [dm, player] = await Promise.all(['dm', 'player'].map((name) =>
    prisma.user.create({ data: { email: `carriergone-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Carrier ${name}` } })));
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Carrier gone ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
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

/**
 * On a lit map, a player is sent the tokens they can see. Placing or
 * removing a light, or opening a door, changes that, and players were told
 * only about the light or the wall: a creature the new light showed stayed
 * missing until something moved, and one whose light went out stayed in
 * their browser. Each such change now sends every player the map as they
 * can now see it; the DM, who is sent everything, is left alone.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;

const token = (id: string, x: number, y: number, controlledBy: string | null) => ({
  id, name: id, imageUrl: '', position: { x, y }, size: { width: 1, height: 1 }, layer: 'token', visible: true,
  controlledBy, rotation: 0, conditions: [], metadata: {}, type: controlledBy ? 'player' : 'npc', sightRadius: 0,
});

/** Resolves with the next map.changed the socket gets whose tokens pass `test`. */
function mapWhere(client: Socket, test: (ids: string[]) => boolean, ms = 4000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.off('map.changed', handler); reject(new Error('no matching map.changed')); }, ms);
    const handler = (e: { mapData: { tokens: { id: string }[] } }) => {
      const ids = e.mapData.tokens.map((t) => t.id);
      if (!test(ids)) return;
      clearTimeout(timer);
      client.off('map.changed', handler);
      resolve(ids);
    };
    client.on('map.changed', handler);
  });
}

async function litMap(name: string, globalIllumination: boolean, walls: unknown[] = []) {
  const map = await prisma.map.create({
    data: {
      campaignId, name, imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, annotations: [], lightingEnabled: true, globalIllumination,
      tokens: toJson([token('hero', 2, 2, playerId), token('goblin', 8, 2, null)]), wallSegments: toJson(walls), lights: toJson([]),
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(['dm', 'player'].map((n) =>
    prisma.user.create({ data: { email: `sight-${n}-${runId}@test.cozyvtt.local`, passwordHash: 'unused', displayName: `Sight ${n}` } })));
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Sight ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

it('shows a creature to a player when a light is placed on it, and hides it when the light goes', async () => {
  const mapId = await litMap('Dark field', false);
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const lightId = randomUUID();

  const shown = mapWhere(player, (ids) => ids.includes('goblin'));
  const dmLeftAlone = expectNoEvent(dm, 'map.changed', 1500);
  // On the goblin's square: token rows count up from the bottom of the map,
  // so (8, 2) on a 20-square map is centred at (425, 875) in pixels.
  dm.emit('light:add', { mapId, light: { id: lightId, x: 425, y: 875, brightRadius: 2, dimRadius: 4, color: '#ffaa33', enabled: true } });
  expect(await shown).toEqual(expect.arrayContaining(['hero', 'goblin']));
  await dmLeftAlone;

  const hidden = mapWhere(player, (ids) => !ids.includes('goblin'));
  dm.emit('light:remove', { mapId, lightId });
  expect(await hidden).toEqual(['hero']);
  player.disconnect();
  dm.disconnect();
});

it('shows a creature behind a door once the door opens', async () => {
  const doorId = randomUUID();
  const door = { id: doorId, x1: 250, y1: 0, x2: 250, y2: 1000, type: 'door-closed' };
  const mapId = await litMap('Door', true, [door]);
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);

  const shown = mapWhere(player, (ids) => ids.includes('goblin'));
  dm.emit('wall:update', { mapId, segment: { ...door, type: 'door-open' } });
  expect(await shown).toEqual(expect.arrayContaining(['hero', 'goblin']));
  player.disconnect();
  dm.disconnect();
});

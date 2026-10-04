/**
 * What revealing or hiding a token from the Spirit Layer panel tells a player.
 *
 * The toggle handler sent every player the whole token, DM notes included,
 * filtered by plane only: a player was handed the position and notes of a
 * token the map fetch would never have sent them, and their client did not
 * even use it (it only flips a flag on a token it already holds). The
 * handler now re-sends each member the map as they may see it, the same
 * path a map switch and a lighting change use; only the DM still gets the
 * toggle event with the token.
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
const email = (name: string) => `toggleleak-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

const OWN = 'token-own';
const TARGET = 'token-target';

type MapChanged = { mapId: string; mapData: { tokens: Array<{ id: string; notes?: string }> } };

function token(id: string, x: number, controlledBy: string | null, visible: boolean, notes?: string) {
  return {
    id, name: id, imageUrl: '/api/assets/tokens/none',
    position: { x, y: 5 }, size: { width: 1, height: 1 },
    layer: 'token', visible, controlledBy, rotation: 0, conditions: [], metadata: {},
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** The player's token at x=5 and a hidden one beside it at x=6, with DM notes. */
async function resetMap(lightingEnabled: boolean) {
  await prisma.map.update({
    where: { id: mapId },
    data: {
      lightingEnabled,
      globalIllumination: false,
      lights: [],
      tokens: [token(OWN, 5, playerId, true), token(TARGET, 6, null, false, 'dm eyes only')],
    },
  });
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Toggle ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Toggle Leak ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Toggle Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
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

describe('spirit_layer.token.toggle', () => {
  it('revealing a token the player cannot see sends them nothing of it', async () => {
    await resetMap(true);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const quiet = expectNoEvent(player, 'spirit_layer.token.toggled', 600);
    const resync = waitForEvent<MapChanged>(player, 'map.changed');
    dm.emit('spirit_layer.token.toggle', { mapId, tokenId: TARGET, visible: true });
    await quiet;
    // In the dark one square away with no light and no darkvision: not sent.
    expect((await resync).mapData.tokens.map((t) => t.id)).toEqual([OWN]);

    dm.disconnect();
    player.disconnect();
  });

  it('revealing a token the player can see sends it without the DM\'s notes', async () => {
    await resetMap(false);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const resync = waitForEvent<MapChanged>(player, 'map.changed');
    dm.emit('spirit_layer.token.toggle', { mapId, tokenId: TARGET, visible: true });
    const tokens = (await resync).mapData.tokens;
    const target = tokens.find((t) => t.id === TARGET);
    expect(target).toBeDefined();
    expect(target).not.toHaveProperty('notes');

    dm.disconnect();
    player.disconnect();
  });

  it('hiding a token the player had takes it away from them', async () => {
    await resetMap(false);
    await prisma.map.update({ where: { id: mapId }, data: { tokens: [token(OWN, 5, playerId, true), token(TARGET, 6, null, true, 'dm eyes only')] } });
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const resync = waitForEvent<MapChanged>(player, 'map.changed');
    dm.emit('spirit_layer.token.toggle', { mapId, tokenId: TARGET, visible: false });
    expect((await resync).mapData.tokens.map((t) => t.id)).toEqual([OWN]);

    dm.disconnect();
    player.disconnect();
  });

  it('the DM still gets the toggle event with the token', async () => {
    await resetMap(true);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const seen = waitForEvent<{ tokenId: string; visible: boolean; token: { id: string; notes?: string } }>(dm, 'spirit_layer.token.toggled');
    dm.emit('spirit_layer.token.toggle', { mapId, tokenId: TARGET, visible: true });
    const payload = await seen;
    expect(payload.tokenId).toBe(TARGET);
    expect(payload.visible).toBe(true);
    expect(payload.token.notes).toBe('dm eyes only');

    dm.disconnect();
  });
});

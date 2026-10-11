/**
 * A player opens or closes only a door they can see.
 *
 * A door toggle was checked against the player's role and the door's lock,
 * never against sight, so on a lit map a player could open a door none of
 * their tokens could see, and a click in the dark answered "That door is
 * locked", telling them a door was there. On a lit map a player's toggle is
 * now refused unless one of their tokens can see the door, by the rule the
 * map uses to show it, and that is checked before the lock.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import * as mapTokens from '../../utils/mapTokens';
import * as spiritLayer from '../../utils/spirit-layer';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let playerCookie: string;

type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; type: string };

// 50 px squares on a 20 by 20 map. The player's token stands at square (2, 10),
// centre (125, 475). A wall from top to bottom at x = 500 cuts the map in two.
const SPLIT: Wall = { id: randomUUID(), x1: 500, y1: 0, x2: 500, y2: 1000, type: 'wall' };
const NEAR: Wall = { id: randomUUID(), x1: 300, y1: 400, x2: 300, y2: 450, type: 'door-closed' };
const FAR: Wall = { id: randomUUID(), x1: 800, y1: 400, x2: 800, y2: 450, type: 'door-closed' };
const FAR_LOCKED: Wall = { id: randomUUID(), x1: 800, y1: 600, x2: 800, y2: 650, type: 'door-locked' };

async function newMap(lightingEnabled: boolean): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Doors', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, annotations: [], lightingEnabled, globalIllumination: true,
      wallSegments: toJson([SPLIT, NEAR, FAR, FAR_LOCKED]), lights: toJson([]),
      tokens: toJson([{
        id: 'player-token', name: 'Hero', imageUrl: '', position: { x: 2, y: 10 }, size: { width: 1, height: 1 },
        layer: 'token', visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {},
      }]),
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}

beforeAll(async () => {
  const dm = await prisma.user.create({ data: { email: `doors-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Door DM' } });
  const player = await prisma.user.create({ data: { email: `doors-pl-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Door Player' } });
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Doors ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  playerCookie = await server.loginAs(playerId);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

const stored = async (mapId: string, id: string) =>
  ((await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).wallSegments as unknown as Wall[]).find((w) => w.id === id)?.type;

describe('on a lit map', () => {
  it('opens a door one of the player\'s tokens can see', async () => {
    const mapId = await newMap(true);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const opened = waitForEvent<{ segment: Wall }>(player, 'wall:updated');
    player.emit('wall:update', { mapId, segment: { ...NEAR, type: 'door-open' } });
    expect((await opened).segment.type).toBe('door-open');
    expect(await stored(mapId, NEAR.id)).toBe('door-open');
    player.disconnect();
  });

  it('refuses a door none of them can see, and puts the door back on the player\'s page', async () => {
    const mapId = await newMap(true);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    const back = waitForEvent<{ segment: Wall }>(player, 'wall:updated');
    player.emit('wall:update', { mapId, segment: { ...FAR, type: 'door-open' } });
    expect((await refused).message).toBe('You cannot see that door');
    expect((await back).segment).toEqual(FAR);
    expect(await stored(mapId, FAR.id)).toBe('door-closed');
    player.disconnect();
  });

  it('says nothing of a lock on a door the player cannot see', async () => {
    const mapId = await newMap(true);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    player.emit('wall:update', { mapId, segment: { ...FAR_LOCKED, type: 'door-open' } });
    expect((await refused).message).toBe('You cannot see that door');
    player.disconnect();
  });
});

/**
 * The map's lock and the player's sight. Working out what a player's tokens
 * can see reads the database (their plane) and casts rays from each token,
 * and a player may send forty toggles a second. Done under the map's lock,
 * every wall, light and token edit on the map waited for it, and the plane
 * was read on a second connection while the lock's transaction held one. The
 * sight is now worked out before the lock is taken, and the door, read again
 * under the lock, is judged on where it is and what it is then.
 */
describe('the sight check and the map\'s lock', () => {
  /** Run `during` while the player's sight is being worked out. */
  function whileSightIsWorkedOut(during: () => Promise<void>) {
    const original = spiritLayer.getSpiritVisibility;
    return jest.spyOn(spiritLayer, 'getSpiritVisibility').mockImplementation(async (campaign, user) => {
      await during();
      return original(campaign, user);
    });
  }

  const moveDoor = (mapId: string, door: Wall) => async () => {
    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId } });
    const walls = (map.wallSegments as unknown as Wall[]).map((w) => (w.id === door.id ? door : w));
    await prisma.map.update({ where: { id: mapId }, data: { wallSegments: toJson(walls) } });
  };

  it('works out the player\'s sight before taking the lock', async () => {
    const mapId = await newMap(true);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const underLock: string[] = [];
    let locked = false;
    const withLock = mapTokens.withMapsLocked;
    const lock = jest.spyOn(mapTokens, 'withMapsLocked').mockImplementation((ids, fn) =>
      withLock(ids, async (tx) => {
        locked = true;
        try {
          return await fn(tx);
        } finally {
          locked = false;
        }
      })
    );
    const plane = spiritLayer.getSpiritVisibility;
    const visibility = jest.spyOn(spiritLayer, 'getSpiritVisibility').mockImplementation((campaign, user) => {
      if (locked) underLock.push('the player\'s plane');
      return plane(campaign, user);
    });
    const raycast = spiritLayer.playerSightOnLitMap;
    const sight = jest.spyOn(spiritLayer, 'playerSightOnLitMap').mockImplementation((...args) => {
      if (locked) underLock.push('line of sight');
      return raycast(...args);
    });
    try {
      const opened = waitForEvent<{ segment: Wall }>(player, 'wall:updated');
      player.emit('wall:update', { mapId, segment: { ...NEAR, type: 'door-open' } });
      expect((await opened).segment.type).toBe('door-open');
      expect(sight).toHaveBeenCalled();
      expect(underLock).toEqual([]);
    } finally {
      lock.mockRestore();
      visibility.mockRestore();
      sight.mockRestore();
    }
    player.disconnect();
  });

  it('refuses a door the DM moves out of the player\'s sight meanwhile, judged where it is now', async () => {
    const mapId = await newMap(true);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const beyond = { ...NEAR, x1: 800, x2: 800 };
    const meanwhile = whileSightIsWorkedOut(moveDoor(mapId, beyond));
    try {
      const refused = waitForEvent<{ message: string }>(player, 'error');
      const back = waitForEvent<{ segment: Wall }>(player, 'wall:updated');
      player.emit('wall:update', { mapId, segment: { ...NEAR, type: 'door-open' } });
      expect((await refused).message).toBe('You cannot see that door');
      expect((await back).segment).toEqual(beyond);
    } finally {
      meanwhile.mockRestore();
    }
    const stored = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).wallSegments as unknown as Wall[];
    expect(stored.find((w) => w.id === NEAR.id)).toEqual(beyond);
    player.disconnect();
  });

  it('refuses a door the DM locks meanwhile, judged on what it is now', async () => {
    const mapId = await newMap(true);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const meanwhile = whileSightIsWorkedOut(moveDoor(mapId, { ...NEAR, type: 'door-locked' }));
    try {
      const refused = waitForEvent<{ message: string }>(player, 'error');
      player.emit('wall:update', { mapId, segment: { ...NEAR, type: 'door-open' } });
      expect((await refused).message).toBe('That door is locked');
    } finally {
      meanwhile.mockRestore();
    }
    expect(await stored(mapId, NEAR.id)).toBe('door-locked');
    player.disconnect();
  });
});

describe('on a map without dynamic lighting', () => {
  it('lets a player open any door, as before', async () => {
    const mapId = await newMap(false);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const opened = waitForEvent<{ segment: Wall }>(player, 'wall:updated');
    player.emit('wall:update', { mapId, segment: { ...FAR, type: 'door-open' } });
    expect((await opened).segment.type).toBe('door-open');
    player.disconnect();
  });
});

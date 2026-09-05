/**
 * WebSocket Integration Tests
 *
 * Boots the real Socket.io server with production event handlers and real
 * socket.io-client connections against the test database. These tests assert
 * the WIRE CONTRACT — event names, payload shapes, permission errors, and
 * persistence side effects — NOT handler internals, so they stay stable
 * regardless of how the handler modules are internally organized.
 *
 * Requires PostgreSQL at DATABASE_URL (same as the route e2e tests).
 */

import { randomUUID } from 'crypto';
import { io as ioc } from 'socket.io-client';
import { prisma } from '../../config/database';
import { clearState as clearCombatState } from '../initiativeState';
import {
  createWsTestServer,
  waitForEvent,
  expectNoEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

// ── Seed data ────────────────────────────────────────────────────────────────

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `ws-${name}-${runId}@test.cozyvtt.local`;

const PLAYER_TOKEN_ID = randomUUID();
const DM_TOKEN_ID = randomUUID();
const SPIRIT_TOKEN_ID = randomUUID();
const WALL_ID = randomUUID();
const DOOR_CLOSED_ID = randomUUID();
const DOOR_LOCKED_ID = randomUUID();

let server: WsTestServer;
let dmId: string;
let player1Id: string;
let player2Id: string;
let outsiderId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let player1Cookie: string;
let player2Cookie: string;
let outsiderCookie: string;

function seedTokens() {
  const base = {
    imageUrl: '/api/assets/tokens/placeholder',
    size: { width: 1, height: 1 },
    visible: true,
    rotation: 0,
    conditions: [] as string[],
    metadata: {} as Record<string, unknown>,
  };
  return [
    { ...base, id: PLAYER_TOKEN_ID, name: 'Hero', position: { x: 5, y: 5 }, layer: 'token', controlledBy: player1Id },
    { ...base, id: DM_TOKEN_ID, name: 'Goblin', position: { x: 10, y: 10 }, layer: 'token', controlledBy: null },
    { ...base, id: SPIRIT_TOKEN_ID, name: 'Ghost', position: { x: 15, y: 15 }, layer: 'spirit', controlledBy: null },
  ];
}

function seedWalls() {
  return [
    { id: WALL_ID, x1: 0, y1: 0, x2: 5, y2: 0, type: 'wall' },
    { id: DOOR_CLOSED_ID, x1: 5, y1: 0, x2: 6, y2: 0, type: 'door-closed' },
    { id: DOOR_LOCKED_ID, x1: 6, y1: 0, x2: 7, y2: 0, type: 'door-locked' },
  ];
}

/** Reset all mutable map state and combat state between tests. */
async function resetGameState() {
  await prisma.map.update({
    where: { id: mapId },
    data: {
      tokens: seedTokens() as any,
      wallSegments: seedWalls() as any,
      fogData: null as any,
      lights: [] as any,
    },
  });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { spiritLayerEnabled: false, chatCooldownEnabled: false },
  });
  clearCombatState(campaignId);
}

beforeAll(async () => {
  // Seed users
  const [dm, player1, player2, outsider] = await Promise.all(
    ['dm', 'player1', 'player2', 'outsider'].map((name) =>
      prisma.user.create({
        data: {
          email: email(name),
          passwordHash: 'not-used-by-socket-auth',
          displayName: `WS ${name}`,
        },
      })
    )
  );
  dmId = dm.id;
  player1Id = player1.id;
  player2Id = player2.id;
  outsiderId = outsider.id;

  // Seed campaign + map + memberships
  const campaign = await prisma.campaign.create({
    data: {
      name: `WS Test Campaign ${runId}`,
      ownerId: dmId,
      vibeSettings: {},
    },
  });
  campaignId = campaign.id;

  const map = await prisma.map.create({
    data: {
      campaignId,
      name: 'WS Test Map',
      imageUrl: '/api/assets/maps/placeholder',
      baseLayerUrl: '/api/assets/maps/placeholder',
      width: 30,
      height: 30,
      gridSize: 50,
      tokens: seedTokens() as any,
      annotations: [] as any,
      wallSegments: seedWalls() as any,
    },
  });
  mapId = map.id;

  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });

  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: player1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: player2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  server = await createWsTestServer();
  [dmCookie, player1Cookie, player2Cookie, outsiderCookie] = await Promise.all([
    server.loginAs(dmId),
    server.loginAs(player1Id),
    server.loginAs(player2Id),
    server.loginAs(outsiderId),
  ]);
});

afterAll(async () => {
  await server?.close();
  // Campaign cascade removes memberships, maps, messages, dice rolls
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, player1Id, player2Id, outsiderId] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetGameState();
});

// ── 1. Connection & campaign authentication ─────────────────────────────────

describe('connection & authentication', () => {
  it('rejects a socket with no session', async () => {
    const rejection = await new Promise<{ message: string }>((resolve, reject) => {
      const client = ioc(server.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      const timer = setTimeout(() => reject(new Error('no rejection received')), 5000);
      client.on('error', (err: { message: string }) => {
        clearTimeout(timer);
        client.disconnect();
        resolve(err);
      });
      client.on('connected', () => {
        clearTimeout(timer);
        client.disconnect();
        reject(new Error('unauthenticated socket received "connected"'));
      });
    });
    expect(rejection.message).toBe('Unauthorized');
  });

  it('rejects campaign authentication for a non-member', async () => {
    const client = await server.connectClient(outsiderCookie);
    const error = waitForEvent<{ message: string }>(client, 'error');
    client.emit('authenticate', { campaignId });
    expect((await error).message).toBe('You are not a member of this campaign');
    client.disconnect();
  });

  it('authenticates a member and reports their role', async () => {
    const client = await server.connectClient(player1Cookie);
    const authed = waitForEvent<{ userId: string; campaignId: string; role: string }>(client, 'authenticated');
    client.emit('authenticate', { campaignId });
    const payload = await authed;
    expect(payload.userId).toBe(player1Id);
    expect(payload.campaignId).toBe(campaignId);
    expect(payload.role).toBe('PLAYER');
    client.disconnect();
  });
});

// ── 2. Token movement ────────────────────────────────────────────────────────

describe('token movement', () => {
  it('broadcasts and persists a player moving their own token', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const dmSees = waitForEvent<{ tokenId: string; x: number; y: number }>(dm, 'token.moved');
    player.emit('token.move.end', { tokenId: PLAYER_TOKEN_ID, mapId, x: 8, y: 9 });

    const moved = await dmSees;
    expect(moved.tokenId).toBe(PLAYER_TOKEN_ID);
    expect(moved.x).toBe(8);
    expect(moved.y).toBe(9);

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const token = (map.tokens as any[]).find((t) => t.id === PLAYER_TOKEN_ID);
    expect(token.position).toEqual({ x: 8, y: 9 });

    player.disconnect();
    dm.disconnect();
  });

  it('denies a player moving a token they do not control, without broadcasting', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const denial = waitForEvent<{ message: string }>(player, 'error');
    const silence = expectNoEvent(dm, 'token.moved');
    player.emit('token.move.end', { tokenId: DM_TOKEN_ID, mapId, x: 12, y: 12 });

    expect((await denial).message).toBe('You do not have permission to move this token');
    await silence;

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const token = (map.tokens as any[]).find((t) => t.id === DM_TOKEN_ID);
    expect(token.position).toEqual({ x: 10, y: 10 });

    player.disconnect();
    dm.disconnect();
  });

  it('rejects out-of-bounds positions', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('token.move.end', { tokenId: PLAYER_TOKEN_ID, mapId, x: 999, y: 5 });
    expect((await denial).message).toBe('Token position out of bounds');
    player.disconnect();
  });
});

// ── 3. Walls & doors ─────────────────────────────────────────────────────────

describe('walls & doors', () => {
  it('DM can add a wall segment: broadcast + persisted', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    const segment = { id: randomUUID(), x1: 1, y1: 1, x2: 2, y2: 2, type: 'wall' };
    const playerSees = waitForEvent<{ mapId: string; segment: any }>(player, 'wall:added');
    dm.emit('wall:add', { mapId, segment });

    expect((await playerSees).segment).toEqual(segment);

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true } });
    expect((map.wallSegments as any[]).some((s) => s.id === segment.id)).toBe(true);

    dm.disconnect();
    player.disconnect();
  });

  it('rejects a Zod-invalid wall segment without persisting', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const denial = waitForEvent<{ message: string }>(dm, 'error');
    dm.emit('wall:add', { mapId, segment: { id: randomUUID(), x1: 1, y1: 1, x2: 2, y2: 2, type: 'force-field' } });
    expect((await denial).message).toBeTruthy();

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true } });
    expect(map.wallSegments as any[]).toHaveLength(seedWalls().length);
    dm.disconnect();
  });

  it('denies wall:add from a PLAYER', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('wall:add', { mapId, segment: { id: randomUUID(), x1: 1, y1: 1, x2: 2, y2: 2, type: 'wall' } });
    expect((await denial).message).toBe('Only DMs can add wall segments');
    player.disconnect();
  });

  it('a player can toggle an unlocked door', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const opened = { ...seedWalls()[1], type: 'door-open' };
    const dmSees = waitForEvent<{ segment: any }>(dm, 'wall:updated');
    player.emit('wall:update', { mapId, segment: opened });

    expect((await dmSees).segment.type).toBe('door-open');
    player.disconnect();
    dm.disconnect();
  });

  it('a player cannot open a locked door', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('wall:update', { mapId, segment: { ...seedWalls()[2], type: 'door-open' } });
    expect((await denial).message).toBe('That door is locked');
    player.disconnect();
  });

  it('a player cannot convert a plain wall into a door', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('wall:update', { mapId, segment: { ...seedWalls()[0], type: 'door-open' } });
    expect((await denial).message).toBe('Players may only toggle doors');
    player.disconnect();
  });
});

// ── 4. Fog of war ────────────────────────────────────────────────────────────

describe('fog of war', () => {
  it('DM fog reveal: DM gets full state, player gets revealed cells, state persists', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    const dmSees = waitForEvent<{ mapId: string; fogState: any }>(dm, 'fog:updated');
    const playerSees = waitForEvent<{ revealedCells: number[]; fogCols: number; fogRows: number }>(player, 'fog:cells');
    dm.emit('fog:operation', { mapId, operation: { op: 'reveal', cells: [0, 1, 2] } });

    const dmPayload = await dmSees;
    expect(dmPayload.fogState.revealed[0]).toBe(true);

    const playerPayload = await playerSees;
    expect(playerPayload.revealedCells).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(playerPayload.fogCols).toBe(30);

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { fogData: true } });
    expect((map.fogData as any).revealed[1]).toBe(true);

    dm.disconnect();
    player.disconnect();
  });

  it('denies fog operations from a PLAYER', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('fog:operation', { mapId, operation: { op: 'reveal_all' } });
    expect((await denial).message).toBe('Only DMs can modify fog of war');
    player.disconnect();
  });
});

// ── 5. Lights ────────────────────────────────────────────────────────────────

describe('lights', () => {
  const validLight = () => ({
    id: randomUUID(),
    x: 10,
    y: 10,
    brightRadius: 4,
    dimRadius: 8,
    color: '#ffcc88',
    enabled: true,
  });

  it('DM can add a light: broadcast + persisted', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    const light = validLight();
    const playerSees = waitForEvent<{ light: any }>(player, 'light:added');
    dm.emit('light:add', { mapId, light });
    expect((await playerSees).light).toEqual(light);

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { lights: true } });
    expect((map.lights as any[]).some((l) => l.id === light.id)).toBe(true);

    dm.disconnect();
    player.disconnect();
  });

  it('rejects a light with dimRadius < brightRadius', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const denial = waitForEvent<{ message: string }>(dm, 'error');
    dm.emit('light:add', { mapId, light: { ...validLight(), brightRadius: 10, dimRadius: 5 } });
    expect((await denial).message).toContain('dimRadius');
    dm.disconnect();
  });

  it('denies light:add from a PLAYER', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('light:add', { mapId, light: validLight() });
    expect((await denial).message).toBe('Only DMs can add light sources');
    player.disconnect();
  });
});

// ── 6. Initiative ────────────────────────────────────────────────────────────

describe('initiative', () => {
  it('denies initiative mutations from a PLAYER', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('initiative.add', { tokenId: PLAYER_TOKEN_ID, mapId });
    expect((await denial).message).toBe('Only the DM can modify initiative');
    player.disconnect();
  });

  it('DM adds a combatant and sets initiative: state broadcast + token persisted', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    const playerSeesAdd = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
    dm.emit('initiative.add', { tokenId: PLAYER_TOKEN_ID, mapId });
    const stateAfterAdd = await playerSeesAdd;
    expect(stateAfterAdd.combatants).toHaveLength(1);
    expect(stateAfterAdd.combatants[0].tokenId).toBe(PLAYER_TOKEN_ID);

    const playerSeesSet = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
    dm.emit('initiative.set', { tokenId: PLAYER_TOKEN_ID, mapId, value: 17 });
    const stateAfterSet = await playerSeesSet;
    expect(stateAfterSet.combatants[0].initiative).toBe(17);

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const token = (map.tokens as any[]).find((t) => t.id === PLAYER_TOKEN_ID);
    expect(token.initiative).toBe(17);

    dm.disconnect();
    player.disconnect();
  });

  // A rolled value is persisted onto the map token and survives the fight it was
  // rolled for — ending combat clears only the in-memory order. Adding a token
  // to a new fight must therefore not seed from it, or the token arrives already
  // placed in the order carrying last fight's result.
  it('adds a token with no initiative, even when it still carries one from a previous fight', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    // First fight: roll for the Goblin, which persists the value on the token.
    const firstAdd = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: DM_TOKEN_ID, mapId });
    await firstAdd;

    const firstRoll = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
    dm.emit('initiative.roll', { tokenId: DM_TOKEN_ID, mapId, expression: '1d20' });
    await firstRoll;

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const stored = (map.tokens as any[]).find((t) => t.id === DM_TOKEN_ID);
    expect(typeof stored.initiative).toBe('number');   // the value that used to leak

    // The fight ends, and the same token is added to the next one.
    dm.emit('initiative.end');
    await waitForEvent<{ active: boolean }>(dm, 'initiative.state');

    const secondAdd = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: DM_TOKEN_ID, mapId });
    const state = await secondAdd;

    const entry = state.combatants.find((c) => c.tokenId === DM_TOKEN_ID);
    expect(entry.initiative).toBeNull();

    dm.disconnect();
  });

  // Rolling is the one initiative action a player may take, and only for their
  // own token, and only once the DM has put it in the order. Everything else —
  // who is in the fight, the order, whose turn it is — stays with the DM.
  describe('a player rolling their own initiative', () => {
    it('is allowed once the DM has added their token', async () => {
      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const player = await server.connectAndAuth(player1Cookie, campaignId);

      const added = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
      dm.emit('initiative.add', { tokenId: PLAYER_TOKEN_ID, mapId });
      await added;

      const rolled = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
      const diceLogged = waitForEvent<{ purpose: string; userId: string }>(dm, 'dice.rolled');
      player.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId, expression: '1d20' });

      const state = await rolled;
      const entry = state.combatants.find((c) => c.tokenId === PLAYER_TOKEN_ID);
      expect(entry.initiative).toBeGreaterThanOrEqual(1);
      expect(entry.initiative).toBeLessThanOrEqual(20);

      // The roll is public — it reaches the DM's dice log, attributed to the
      // player rather than to the DM.
      const roll = await diceLogged;
      expect(roll.purpose).toBe('Hero Initiative');
      expect(roll.userId).toBe(player1Id);

      // And it is persisted on the token, not just held in memory.
      const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      const token = (map.tokens as any[]).find((t) => t.id === PLAYER_TOKEN_ID);
      expect(token.initiative).toBe(entry.initiative);

      dm.disconnect();
      player.disconnect();
    });

    it('is refused before the DM has added their token', async () => {
      const player = await server.connectAndAuth(player1Cookie, campaignId);
      const denial = waitForEvent<{ message: string }>(player, 'error');
      player.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId, expression: '1d20' });
      expect((await denial).message).toBe('That token is not in the initiative order yet');
      player.disconnect();
    });

    it("is refused for a token they do not control, even when it is in the order", async () => {
      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const player = await server.connectAndAuth(player1Cookie, campaignId);

      const added = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
      dm.emit('initiative.add', { tokenId: DM_TOKEN_ID, mapId });   // the Goblin
      await added;

      const denial = waitForEvent<{ message: string }>(player, 'error');
      player.emit('initiative.roll', { tokenId: DM_TOKEN_ID, mapId, expression: '1d20' });
      expect((await denial).message).toBe('You can only roll initiative for your own token');

      // Nothing was rolled for it.
      const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      const token = (map.tokens as any[]).find((t) => t.id === DM_TOKEN_ID);
      expect(token.initiative ?? null).toBeNull();

      dm.disconnect();
      player.disconnect();
    });

    it('is refused for another player\'s token', async () => {
      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const player2 = await server.connectAndAuth(player2Cookie, campaignId);

      const added = waitForEvent<{ combatants: any[] }>(player2, 'initiative.state');
      dm.emit('initiative.add', { tokenId: PLAYER_TOKEN_ID, mapId });   // player1's Hero
      await added;

      const denial = waitForEvent<{ message: string }>(player2, 'error');
      player2.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId, expression: '1d20' });
      expect((await denial).message).toBe('You can only roll initiative for your own token');

      dm.disconnect();
      player2.disconnect();
    });

    it('is refused once combat has started', async () => {
      // Re-rolling re-sorts the order, and the turn pointer walks it by
      // position, so a player who rolls above the current combatant would end
      // the round early and skip whoever was in between.
      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const player = await server.connectAndAuth(player1Cookie, campaignId);

      const added = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
      dm.emit('initiative.add', { tokenId: PLAYER_TOKEN_ID, mapId });
      await added;

      const started = waitForEvent<{ active: boolean }>(player, 'initiative.state');
      dm.emit('initiative.start');
      expect((await started).active).toBe(true);

      const denial = waitForEvent<{ message: string }>(player, 'error');
      player.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId });
      expect((await denial).message).toMatch(/Combat has started/);

      dm.disconnect();
      player.disconnect();
    });

    it('is refused for a spectator, even on a token still marked as theirs', async () => {
      // `controlledBy` survives a demotion, so an ex-player would otherwise keep
      // the ability to reorder a fight after losing the ability to move a token.
      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const added = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
      dm.emit('initiative.add', { tokenId: PLAYER_TOKEN_ID, mapId });
      await added;

      await prisma.campaignMembership.updateMany({
        where: { userId: player1Id, campaignId },
        data: { role: 'SPECTATOR' },
      });
      try {
        const spectator = await server.connectAndAuth(player1Cookie, campaignId);
        const denial = waitForEvent<{ message: string }>(spectator, 'error');
        spectator.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId });
        expect((await denial).message).toBe('Spectators cannot roll initiative');
        spectator.disconnect();
      } finally {
        await prisma.campaignMembership.updateMany({
          where: { userId: player1Id, campaignId },
          data: { role: 'PLAYER' },
        });
      }

      dm.disconnect();
    });

    // A player's roll must never be a back door into the combatant list.
    it('does not let a player add a combatant by rolling for it', async () => {
      const player = await server.connectAndAuth(player1Cookie, campaignId);
      const denial = waitForEvent<{ message: string }>(player, 'error');
      player.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId, expression: '1d20' });
      await denial;

      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const state = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
      dm.emit('initiative.request_state');
      expect((await state).combatants).toHaveLength(0);

      dm.disconnect();
      player.disconnect();
    });

    it('still lets the DM roll for any token, including one not yet in the order', async () => {
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      const rolled = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
      dm.emit('initiative.roll', { tokenId: DM_TOKEN_ID, mapId, expression: '1d20' });

      const state = await rolled;
      const entry = state.combatants.find((c) => c.tokenId === DM_TOKEN_ID);
      expect(entry).toBeDefined();
      expect(entry.initiative).toBeGreaterThanOrEqual(1);

      dm.disconnect();
    });
  });

  // The server decides what initiative means, from the combatant's sheet. Every
  // roll used to be a flat 1d20 whatever the character or the system.
  describe('deriving the roll from the character', () => {
    /** Attach a character to the player's token so the server can find it. */
    async function linkCharacter(gameSystem: string, data: unknown) {
      const character = await prisma.character.create({
        data: { userId: player1Id, campaignId, name: 'Initiative Test', gameSystem: gameSystem as any, data: data as any },
      });
      const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      const tokens = (map.tokens as any[]).map((t) =>
        t.id === PLAYER_TOKEN_ID ? { ...t, characterId: character.id } : t
      );
      await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens as any } });
      return character.id;
    }

    const dnd5eSheet = (dexScore: number, initiativeBonus = 0) => ({
      stats: {
        strength: { score: 10, modifier: 0 },
        dexterity: { score: dexScore, modifier: Math.floor((dexScore - 10) / 2) },
        constitution: { score: 10, modifier: 0 },
        intelligence: { score: 10, modifier: 0 },
        wisdom: { score: 10, modifier: 0 },
        charisma: { score: 10, modifier: 0 },
      },
      initiativeBonus,
    });

    it('uses a D&D 5e character\'s Dexterity modifier', async () => {
      // Dexterity 20 is +5, so every result must land in [6, 25]. A flat d20
      // could return 1..5, which this rejects.
      await linkCharacter('DND_5E', dnd5eSheet(20));
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      for (let i = 0; i < 12; i++) {
        const rolled = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
        dm.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId });
        const state = await rolled;
        const entry = state.combatants.find((c) => c.tokenId === PLAYER_TOKEN_ID);
        expect(entry.initiative).toBeGreaterThanOrEqual(6);
        expect(entry.initiative).toBeLessThanOrEqual(25);
      }

      dm.disconnect();
    });

    it('adds the manual bonus for feats like Alert', async () => {
      // Dexterity 14 (+2) with Alert (+5) is +7, so results land in [8, 27].
      await linkCharacter('DND_5E', dnd5eSheet(14, 5));
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      const logged = waitForEvent<{ expression: string }>(dm, 'dice.rolled');
      const rolled = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
      dm.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId });

      expect((await logged).expression).toBe('1d20+7');
      const entry = (await rolled).combatants.find((c) => c.tokenId === PLAYER_TOKEN_ID);
      expect(entry.initiative).toBeGreaterThanOrEqual(8);
      expect(entry.initiative).toBeLessThanOrEqual(27);

      dm.disconnect();
    });

    it('ignores a dice expression the client tries to supply', async () => {
      // The server derives its own, so a client cannot roll d100 for initiative.
      await linkCharacter('DND_5E', dnd5eSheet(14));
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      const logged = waitForEvent<{ expression: string }>(dm, 'dice.rolled');
      dm.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId, expression: '1d100+99' });

      expect((await logged).expression).toBe('1d20+2');
      dm.disconnect();
    });

    it('takes a Call of Cthulhu investigator\'s DEX without rolling', async () => {
      // Call of Cthulhu ranks combatants in DEX order; there is no roll.
      await linkCharacter('CALL_OF_CTHULHU_7E', {
        characteristics: { DEX: { regular: 65, half: 32, fifth: 13 } },
      });
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      const rolled = waitForEvent<{ combatants: any[] }>(dm, 'initiative.state');
      const noDice = expectNoEvent(dm, 'dice.rolled', 600);
      dm.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId });

      const entry = (await rolled).combatants.find((c) => c.tokenId === PLAYER_TOKEN_ID);
      expect(entry.initiative).toBe(65);   // exactly DEX, every time
      await noDice;                        // and nothing claimed dice were thrown

      dm.disconnect();
    });

    it('uses a Pathfinder 2e character\'s Perception, or the skill they switch to', async () => {
      await linkCharacter('PATHFINDER_2E', {
        initiative: { usedStat: 'stealth', bonus: 0 },
        perception: { bonus: 9 },
        skills: { stealth: { bonus: 4 } },
      });
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      const logged = waitForEvent<{ expression: string }>(dm, 'dice.rolled');
      dm.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId });
      expect((await logged).expression).toBe('1d20+4');

      dm.disconnect();
    });

    it('falls back to a plain d20 for a token with nothing to derive from', async () => {
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      const logged = waitForEvent<{ expression: string }>(dm, 'dice.rolled');
      dm.emit('initiative.roll', { tokenId: DM_TOKEN_ID, mapId });   // plain NPC, no stat block
      expect((await logged).expression).toBe('1d20');

      dm.disconnect();
    });

    // A player may control a token with no sheet and no stat block — a DM can
    // assign them one — which is the one path where a client expression would
    // otherwise be used. It must not be, or a player could name their own dice.
    it('ignores a player\'s dice expression even when nothing can be derived', async () => {
      const dm = await server.connectAndAuth(dmCookie, campaignId);
      const player = await server.connectAndAuth(player1Cookie, campaignId);

      const added = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
      dm.emit('initiative.add', { tokenId: PLAYER_TOKEN_ID, mapId });
      await added;

      const logged = waitForEvent<{ expression: string }>(dm, 'dice.rolled');
      const rolled = waitForEvent<{ combatants: any[] }>(player, 'initiative.state');
      // The seeded Hero token has no characterId and no statBlock.
      player.emit('initiative.roll', { tokenId: PLAYER_TOKEN_ID, mapId, expression: '1d20+9999' });

      expect((await logged).expression).toBe('1d20');
      const entry = (await rolled).combatants.find((c) => c.tokenId === PLAYER_TOKEN_ID);
      expect(entry.initiative).toBeLessThanOrEqual(20);

      dm.disconnect();
      player.disconnect();
    });

    // The DM keeps the fallback: they can type any initiative value in by hand
    // anyway, so there is nothing to gain by restricting them.
    it('still honours the DM\'s own expression on the fallback path', async () => {
      const dm = await server.connectAndAuth(dmCookie, campaignId);

      const logged = waitForEvent<{ expression: string }>(dm, 'dice.rolled');
      dm.emit('initiative.roll', { tokenId: DM_TOKEN_ID, mapId, expression: '1d20+3' });
      expect((await logged).expression).toBe('1d20+3');

      dm.disconnect();
    });
  });
});

// ── 6b. Map pings ────────────────────────────────────────────────────────────

describe('map pings', () => {
  it('a PLAYER can ping, and every member including the sender receives it', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    const dmSees = waitForEvent<{ mapId: string; x: number; y: number; userId: string }>(dm, 'map.pinged');
    const senderSees = waitForEvent<{ x: number; y: number }>(player, 'map.pinged');

    player.emit('map.ping', { mapId, x: 123.5, y: 456.25 });

    const received = await dmSees;
    expect(received.mapId).toBe(mapId);
    expect(received.x).toBeCloseTo(123.5);
    expect(received.y).toBeCloseTo(456.25);
    // Only the id travels — clients resolve the name and colour locally
    expect(received.userId).toBeTruthy();
    expect(received).not.toHaveProperty('name');

    // io.to (not socket.to) — the sender sees their own ping
    expect((await senderSees).x).toBeCloseTo(123.5);

    dm.disconnect();
    player.disconnect();
  });

  it('ignores a ping with non-finite coordinates', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    let seen = false;
    dm.on('map.pinged', () => { seen = true; });

    player.emit('map.ping', { mapId, x: Number.NaN, y: 10 });
    player.emit('map.ping', { mapId, x: 10, y: Number.POSITIVE_INFINITY });
    player.emit('map.ping', { mapId, x: '5' as unknown as number, y: 10 });

    // A valid ping afterwards proves the socket is still live and that the
    // three above were dropped rather than merely slow.
    const valid = waitForEvent<{ x: number }>(dm, 'map.pinged');
    player.emit('map.ping', { mapId, x: 7, y: 8 });
    expect((await valid).x).toBe(7);
    expect(seen).toBe(true); // only from the valid one

    dm.disconnect();
    player.disconnect();
  });
});

// ── 7. Chat ──────────────────────────────────────────────────────────────────

describe('chat', () => {
  it('broadcasts and persists a chat message', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const dmSees = waitForEvent<{ id: string; userId: string; userName: string; content: string; type: string }>(dm, 'chat.message');
    player.emit('chat.message', { content: 'Hello from the integration test', type: 'PLAYER' });

    const msg = await dmSees;
    expect(msg.userId).toBe(player1Id);
    expect(msg.content).toBe('Hello from the integration test');
    expect(msg.type).toBe('PLAYER');

    const row = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(row?.content).toBe('Hello from the integration test');

    player.disconnect();
    dm.disconnect();
  });

  it('rejects an invalid message type', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('chat.message', { content: 'hi', type: 'SYSTEM' });
    expect((await denial).message).toBe('Invalid message type. Must be PLAYER or DM.');
    player.disconnect();
  });

  it('enforces the campaign chat cooldown', async () => {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { chatCooldownEnabled: true, chatCooldownSeconds: 30 },
    });

    const player = await server.connectAndAuth(player2Cookie, campaignId);
    const first = waitForEvent(player, 'chat.message');
    player.emit('chat.message', { content: 'first', type: 'PLAYER' });
    await first;

    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('chat.message', { content: 'second too fast', type: 'PLAYER' });
    expect((await denial).message).toContain('Rate limit');
    player.disconnect();
  });
});

// ── 8. Dice ──────────────────────────────────────────────────────────────────

describe('dice', () => {
  it('broadcasts and persists a dice roll', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const dmSees = waitForEvent<{ userId: string; expression: string; result: number }>(dm, 'dice.rolled');
    player.emit('dice.roll', { expression: '1d20' });

    const roll = await dmSees;
    expect(roll.userId).toBe(player1Id);
    expect(roll.expression).toBe('1d20');
    expect(roll.result).toBeGreaterThanOrEqual(1);
    expect(roll.result).toBeLessThanOrEqual(20);

    const rows = await prisma.diceRoll.findMany({ where: { campaignId, userId: player1Id, expression: '1d20' } });
    expect(rows.length).toBeGreaterThanOrEqual(1);

    player.disconnect();
    dm.disconnect();
  });

  it('rejects an invalid dice expression', async () => {
    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('dice.roll', { expression: 'not-dice' });
    expect((await denial).message).toContain('Invalid dice expression');
    player.disconnect();
  });
});

// ── 9. Spirit layer filtering ────────────────────────────────────────────────

describe('spirit layer filtering', () => {
  it('spirit token movement is hidden from players without spirit visibility', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    // DM (sender) receives the spirit-branch broadcast; the player must not.
    const dmSees = waitForEvent<{ tokenId: string }>(dm, 'token.moved');
    const playerBlind = expectNoEvent(player, 'token.moved');
    dm.emit('token.move.end', { tokenId: SPIRIT_TOKEN_ID, mapId, x: 16, y: 16 });

    expect((await dmSees).tokenId).toBe(SPIRIT_TOKEN_ID);
    await playerBlind;

    dm.disconnect();
    player.disconnect();
  });

  it('spirit token movement reaches players once the spirit layer is enabled', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: true } });

    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(player1Cookie, campaignId);

    const playerSees = waitForEvent<{ tokenId: string; x: number }>(player, 'token.moved');
    dm.emit('token.move.end', { tokenId: SPIRIT_TOKEN_ID, mapId, x: 17, y: 17 });

    const moved = await playerSees;
    expect(moved.tokenId).toBe(SPIRIT_TOKEN_ID);
    expect(moved.x).toBe(17);

    dm.disconnect();
    player.disconnect();
  });

  it('a player controlling a spirit token has crossed over and can move it', async () => {
    // A player whose own token sits on the spirit layer of the
    // current map has personally crossed over — spirit visibility is granted
    // even while the campaign-wide toggle is off.
    const tokens = seedTokens();
    tokens[2].controlledBy = player1Id;
    await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens as any } });

    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const dmSees = waitForEvent<{ tokenId: string; x: number }>(dm, 'token.moved');
    player.emit('token.move.end', { tokenId: SPIRIT_TOKEN_ID, mapId, x: 18, y: 18 });

    const moved = await dmSees;
    expect(moved.tokenId).toBe(SPIRIT_TOKEN_ID);
    expect(moved.x).toBe(18);

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const token = (map.tokens as any[]).find((t) => t.id === SPIRIT_TOKEN_ID);
    expect(token.position).toEqual({ x: 18, y: 18 });

    player.disconnect();
    dm.disconnect();
  });

  it('a player without control cannot move a spirit token', async () => {
    // Spirit layer globally enabled (so the player can SEE it), but the token
    // is not theirs — the controlledBy permission check still applies.
    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: true } });

    const player = await server.connectAndAuth(player1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(player, 'error');
    player.emit('token.move.end', { tokenId: SPIRIT_TOKEN_ID, mapId, x: 19, y: 19 });
    expect((await denial).message).toBe('You do not have permission to move this token');
    player.disconnect();
  });
});
